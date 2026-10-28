# BDI demo — WebAssembly build

Browser build of the Iriscan Biometric Converter used by `/biometric-data-interchange`.
Output: `assets/bdi/bc.js` + `assets/bdi/bc.wasm`.

- `bc.c` — C API: `bc_wsq_decode`, `bc_wsq_encode`, `bc_raw2fmr` (MINDTCT → ANSI INCITS 378-2004 / ISO/IEC 19794-2:2005), `bc_fmr2fmr` (ANSI ⇄ ISO).
- `fmrcopy.inc` — `copy_with_conversion` / `copy_without_conversion` taken verbatim from BiomDI `fmr2fmr.c`.
- `compat/sys/queue.h` — BSD queue macros (not shipped with Emscripten).

Differences from `biometric-technologies/biometric-converter` `lib/converter.c`: it passes the
still-compressed input to MINDTCT in `img2fmr`, leaves `ifmr`/`ofmr` uninitialised in
`fmr2fmr_iso_card`, and writes image size / resolution as 0, so minutiae coordinates come out as 0.
`bc.c` builds the record from MINDTCT output directly (`lfs2m1_minutia_XYT`, resolution in px/cm).

Build (Emscripten 3.1.x):

    git clone https://github.com/biometric-technologies/nist-biometric-image-software-nbis nbis
    git clone https://github.com/usnistgov/biomdi
    sed 's,SED_INSTALL_DATA_DIR_STRING,/nbis,' nbis/an2k/include/an2k.h.src > an2k.h
    # compile every file listed in srcs.sh (except image/imgdecod.c, image/imgtype.c) with
    #   emcc -c -O2 -D__NBISLE__ $INC -Icompat  into wobj/, then:
    bash build_wasm.sh

Verified: WASM output is byte-identical to the native build on `sample.wsq`; records pass BiomDI `fmrv`.
