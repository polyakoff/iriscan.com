/*
 * bc.c — browser build of the Iriscan Biometric Converter.
 *
 * Wraps NIST NBIS (WSQ codec, MINDTCT minutiae extractor) and NIST BiomDI
 * (finger minutiae records) behind a small C API compiled to WebAssembly.
 * Pipeline mirrors biometric-technologies/biometric-converter:
 *   image (WSQ, or raw 8-bit grayscale decoded in the browser)
 *     -> MINDTCT minutiae -> ANSI INCITS 378-2004 FMR
 *     -> BiomDI conversion -> ISO/IEC 19794-2:2005 FMR
 * and FMR <-> FMR between ANSI 378 and ISO 19794-2.
 *
 * All outputs are malloc'ed; free them with bc_free().
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <sys/queue.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define API EMSCRIPTEN_KEEPALIVE
#else
#define API
#endif

#include <wsq.h>
#include <lfs.h>
#include <biomdi.h>
#include <biomdimacro.h>
#include <fmr.h>

/* NBIS globals normally defined by its CLI tools */
int debug = 0;

#include "fmrcopy.inc"

static char last_err[256];
API const char *bc_last_error(void) { return last_err; }
API void *bc_malloc(int n) { return malloc(n); }
API void bc_free(void *p) { free(p); }

static int fail(int code, const char *msg) {
    snprintf(last_err, sizeof last_err, "%s (code %d)", msg, code);
    return code ? code : -1;
}

/* ---- WSQ <-> raw grayscale ---------------------------------------- */

API int bc_wsq_decode(unsigned char *in, int len, unsigned char **out,
                      int *w, int *h, int *ppi) {
    int d, lossy, ret;
    last_err[0] = 0;
    ret = wsq_decode_mem(out, w, h, &d, ppi, &lossy, in, len);
    if (ret) return fail(ret, "WSQ decode failed");
    if (d != 8) { free(*out); return fail(-2, "WSQ depth is not 8 bit"); }
    return 0;
}

API int bc_wsq_encode(unsigned char *raw, int w, int h, int ppi, float bitrate,
                      unsigned char **out, int *olen) {
    int ret;
    last_err[0] = 0;
    ret = wsq_encode_mem(out, olen, bitrate, raw, w, h, 8, ppi > 0 ? ppi : -1,
                         (char *)NULL);
    if (ret) return fail(ret, "WSQ encode failed");
    return 0;
}

/* ---- serialisation ------------------------------------------------- */

static int push(FMR *fmr, unsigned char **out, int *olen) {
    BDB bdb;
    uint8_t *buf = (uint8_t *)malloc(fmr->record_length);
    if (!buf) return fail(-1, "out of memory");
    INIT_BDB(&bdb, buf, fmr->record_length);
    if (push_fmr(&bdb, fmr) != WRITE_OK) {
        free(buf);
        return fail(-1, "could not serialise minutiae record");
    }
    *out = buf;
    *olen = (int)(bdb.bdb_current - bdb.bdb_start);
    return 0;
}

static int std_from_str(const char *s) {
    if (!strcmp(s, "ANSI")) return FMR_STD_ANSI;
    if (!strcmp(s, "ISO")) return FMR_STD_ISO;
    return -1;
}

/* ---- raw grayscale -> minutiae record -------------------------------- */

API int bc_raw2fmr(unsigned char *raw, int w, int h, int ppi, const char *otype,
                   unsigned char **out, int *olen, int *nmin) {
    MINUTIAE *minutiae;
    int *direction_map, *low_contrast_map, *low_flow_map, *high_curve_map,
        *quality_map, map_w, map_h, bw, bh, bd, i, n, ret, out_std;
    unsigned char *bdata;
    double ppmm;
    FMR *afmr = NULL, *ofmr = NULL;
    FVMR *fvmr = NULL;
    FMD *fmd;
    unsigned int qsum = 0;

    last_err[0] = 0;
    out_std = std_from_str(otype);
    if (out_std < 0) return fail(-1, "unknown output format");
    if (ppi <= 0) ppi = 500;
    ppmm = ppi / 25.4;

    ret = get_minutiae(&minutiae, &quality_map, &direction_map,
                       &low_contrast_map, &low_flow_map, &high_curve_map,
                       &map_w, &map_h, &bdata, &bw, &bh, &bd,
                       raw, w, h, 8, ppmm, &lfsparms_V2);
    if (ret) return fail(ret, "minutiae detection failed");
    free(direction_map); free(low_contrast_map); free(low_flow_map);
    free(high_curve_map); free(quality_map); free(bdata);

    /* Build an ANSI INCITS 378-2004 record (BiomDI reference structures). */
    if (new_fmr(FMR_STD_ANSI, &afmr) || new_fvmr(FMR_STD_ANSI, &fvmr)) {
        free_minutiae(minutiae);
        return fail(-1, "out of memory");
    }
    strcpy(afmr->format_id, FMR_FORMAT_ID);
    strcpy(afmr->spec_version, FMR_ANSI_SPEC_VERSION);
    afmr->record_length_type = FMR_ANSI_SMALL_HEADER_TYPE;
    afmr->product_identifier_owner = 1;
    afmr->product_identifier_type = 1;
    afmr->scanner_id = 0;
    afmr->compliance = 0;
    afmr->x_image_size = (unsigned short)w;
    afmr->y_image_size = (unsigned short)h;
    afmr->x_resolution = (unsigned short)(ppi / 2.54 + 0.5);  /* px/cm */
    afmr->y_resolution = afmr->x_resolution;
    afmr->num_views = 1;

    fvmr->finger_number = 0;      /* unknown finger */
    fvmr->view_number = 0;
    fvmr->impression_type = 0;    /* live-scan plain */

    n = minutiae->num;
    if (n > FMR_MAX_NUM_MINUTIAE) n = FMR_MAX_NUM_MINUTIAE;
    for (i = 0; i < n; i++) {
        MINUTIA *m = minutiae->list[i];
        int x, y, t;
        lfs2m1_minutia_XYT(&x, &y, &t, m);   /* M1 / INCITS 378 convention */
        if (new_fmd(FMR_STD_ANSI, &fmd, i)) { free_minutiae(minutiae); return fail(-1, "out of memory"); }
        fmd->x_coord = (unsigned short)x;
        fmd->y_coord = (unsigned short)y;
        fmd->angle = (unsigned char)t;
        fmd->quality = (unsigned char)(m->reliability * 100 + 0.5);
        fmd->type = (m->type == RIDGE_ENDING) ? FMD_MINUTIA_TYPE_RIDGE_ENDING
                                               : FMD_MINUTIA_TYPE_BIFURCATION;
        qsum += fmd->quality;
        add_fmd_to_fvmr(fmd, fvmr);
    }
    fvmr->number_of_minutiae = (unsigned char)n;
    fvmr->finger_quality = n ? (unsigned char)(qsum / n) : 0;
    add_fvmr_to_fmr(fvmr, afmr);
    afmr->record_length = FMR_ANSI_SMALL_HEADER_LENGTH + FVMR_HEADER_LENGTH +
                          n * FMD_DATA_LENGTH + FEDB_HEADER_LENGTH;
    free_minutiae(minutiae);
    *nmin = n;

    if (out_std == FMR_STD_ANSI) {
        ret = push(afmr, out, olen);
        free_fmr(afmr);
        return ret;
    }
    if (new_fmr(out_std, &ofmr)) { free_fmr(afmr); return fail(-1, "out of memory"); }
    if (copy_with_conversion(afmr, ofmr, FMR_STD_ANSI, out_std) != 0) {
        free_fmr(afmr); free_fmr(ofmr);
        return fail(-1, "ANSI to ISO conversion failed");
    }
    ret = push(ofmr, out, olen);
    free_fmr(afmr); free_fmr(ofmr);
    return ret;
}

/* ---- minutiae record -> minutiae record ----------------------------- */

API int bc_fmr2fmr(unsigned char *in, int len, const char *itype,
                   const char *otype, unsigned char **out, int *olen) {
    BDB bdb;
    FMR *ifmr = NULL, *ofmr = NULL;
    int in_std = std_from_str(itype), out_std = std_from_str(otype), ret;

    last_err[0] = 0;
    if (in_std < 0 || out_std < 0) return fail(-1, "unknown format");
    if (new_fmr(in_std, &ifmr) || new_fmr(out_std, &ofmr)) return fail(-1, "out of memory");
    INIT_BDB(&bdb, in, len);
    if (scan_fmr(&bdb, ifmr) != READ_OK) {
        free_fmr(ifmr); free_fmr(ofmr);
        return fail(-1, "input is not a valid minutiae record of the selected format");
    }
    ret = (in_std == out_std) ? copy_without_conversion(ifmr, ofmr, in_std)
                              : copy_with_conversion(ifmr, ofmr, in_std, out_std);
    if (ret != 0) {
        free_fmr(ifmr); free_fmr(ofmr);
        return fail(-1, "conversion failed");
    }
    ret = push(ofmr, out, olen);
    free_fmr(ifmr); free_fmr(ofmr);
    return ret;
}

#ifndef __EMSCRIPTEN__
/* Native test driver: bc in.wsq ISO|ANSI out.fmr */
int main(int argc, char **argv) {
    FILE *f; long n; unsigned char *buf, *raw, *o; int w, h, ppi, olen, nm;
    if (argc < 4) { fprintf(stderr, "usage: %s in.wsq ISO|ANSI out\n", argv[0]); return 2; }
    f = fopen(argv[1], "rb"); fseek(f, 0, SEEK_END); n = ftell(f); rewind(f);
    buf = malloc(n); fread(buf, 1, n, f); fclose(f);
    if (bc_wsq_decode(buf, n, &raw, &w, &h, &ppi)) { fprintf(stderr, "%s\n", last_err); return 1; }
    fprintf(stderr, "image %dx%d ppi=%d\n", w, h, ppi);
    if (bc_raw2fmr(raw, w, h, ppi, argv[2], &o, &olen, &nm)) { fprintf(stderr, "%s\n", last_err); return 1; }
    fprintf(stderr, "minutiae=%d bytes=%d\n", nm, olen);
    f = fopen(argv[3], "wb"); fwrite(o, 1, olen, f); fclose(f);
    return 0;
}
#endif
