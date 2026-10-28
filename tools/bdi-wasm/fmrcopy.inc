static int
copy_without_conversion(FMR *ifmr, FMR *ofmr, int fmr_type)
{
	FVMR *ofvmr;
	FVMR **ifvmrs = NULL;
	FMD **ifmds = NULL;
	FMD *ofmd;
	int r, rcount, m, mcount;
	int retval;

	retval = -1;			/* Assume failure, for now */

	COPY_FMR(ifmr, ofmr);

	/* Get all of the finger view records */
	rcount = get_fvmr_count(ifmr);
	if (rcount > 0) {
		ifvmrs = (FVMR **) malloc(rcount * sizeof(FVMR *));
		if (ifvmrs == NULL)
			ALLOC_ERR_OUT("FVMR Array");
		if (get_fvmrs(ifmr, ifvmrs) != rcount)
			ERR_OUT("getting FVMRs from FMR");

		for (r = 0; r < rcount; r++) {
			if (new_fvmr(fmr_type, &ofvmr) < 0)
	                        ALLOC_ERR_RETURN("Output FVMR");

			COPY_FVMR(ifvmrs[r], ofvmr);
			mcount = get_fmd_count(ifvmrs[r]);
			if (mcount != 0) {
				ifmds = (FMD **)malloc(mcount * sizeof(FMD *));
				if (ifmds == NULL)
					ALLOC_ERR_RETURN("FMD array");
				if (get_fmds(ifvmrs[r], ifmds) != mcount)
					ERR_OUT("getting FMDs from FVMR");

				for (m = 0; m < mcount; m++) {
					if (new_fmd(FMR_STD_ISO, &ofmd, m) != 0)
						ALLOC_ERR_RETURN("Output FMD");
					COPY_FMD(ifmds[m], ofmd);
					add_fmd_to_fvmr(ofmd, ofvmr);
				}
			}

			/* Subtract off the length of the extended data block,
			 * if present, because we don't copy extended data yet.
			 */
			if (ifvmrs[r]->extended != NULL) {
				ofmr->record_length -=
				    ifvmrs[r]->extended->block_length;
				
			}
			add_fvmr_to_fmr(ofvmr, ofmr);
			// XXX Copy the FEDB to the output fmr
		}

	} else {
		if (rcount == 0)
			ERR_OUT("there are no FVMRs in the input FMR");
		else
			ERR_OUT("retrieving FVMRs from input FMR");
	}
	retval = 0;

err_out:
	if (ifvmrs != NULL)
		free (ifvmrs);
	if (ifmds != NULL)
		free (ifmds);
	return (retval);
}

static int
copy_with_conversion(FMR *ifmr, FMR *ofmr, int in_type, int out_type)
{
	FVMR *ofvmr;
	FVMR **ifvmrs = NULL;
	int r, rcount;
	unsigned int fmr_len, fvmr_len;
	int rc, retval;
	char *ver;

	retval = -1;			/* Assume failure, for now */

	if (in_type == out_type)
		return (-1);

	COPY_FMR(ifmr, ofmr);
	switch (out_type) {
	case FMR_STD_ANSI:
		fmr_len = FMR_ANSI_SMALL_HEADER_LENGTH;
		ver = FMR_ANSI_SPEC_VERSION;
		break;
	case FMR_STD_ANSI07:
		fmr_len = FMR_ANSI07_HEADER_LENGTH;
		ver = FMR_ANSI07_SPEC_VERSION;
		break;
	case FMR_STD_ISO:
		fmr_len = FMR_ISO_HEADER_LENGTH;
		ver = FMR_ISO_SPEC_VERSION;
		break;
	}

	/* Fix up the output FMR header for those input types that don't
	 * have all the needed information.
	 */
	
	if ((out_type == FMR_STD_ANSI) || (out_type == FMR_STD_ISO) ||
	    (out_type == FMR_STD_ANSI07))
		if ((in_type == FMR_STD_ISO_NORMAL_CARD) ||
		    (in_type == FMR_STD_ISO_COMPACT_CARD)) {
			strncpy(ofmr->format_id, FMR_FORMAT_ID,
			    FMR_FORMAT_ID_LEN);
			strncpy(ofmr->spec_version, ver,
			    FMR_SPEC_VERSION_LEN);
		}

	/* Get all of the finger view records */
	rcount = get_fvmr_count(ifmr);
	if (rcount > 0) {
		ifvmrs = (FVMR **) malloc(rcount * sizeof(FVMR *));
		if (ifvmrs == NULL)
			ALLOC_ERR_OUT("FVMR Array");
		if (get_fvmrs(ifmr, ifvmrs) != rcount)
			ERR_OUT("getting FVMRs from FMR");

		for (r = 0; r < rcount; r++) {
			if (new_fvmr(out_type, &ofvmr) < 0)
	                        ALLOC_ERR_RETURN("Output FVMR");

			rc = -1;
			switch (in_type) {
			    case FMR_STD_ANSI07:
				/* The coord and resolution info is stored
				 * in the FVMR; copy it to the FMR header,
				 * using the first FVMR as the canonical set.
				 */
				ofmr->x_image_size = ifvmrs[0]->x_image_size;
				ofmr->y_image_size = ifvmrs[0]->y_image_size;
				ofmr->x_resolution = ifvmrs[0]->x_resolution;
				ofmr->y_resolution = ifvmrs[0]->y_resolution;
			    case FMR_STD_ANSI:
				switch (out_type) {
				case FMR_STD_ISO:
				case FMR_STD_ISO_NORMAL_CARD:
					rc = ansi2iso_fvmr(ifvmrs[r], ofvmr,
					    &fvmr_len, ifmr->x_resolution,
					    ifmr->y_resolution);
					break;
				case FMR_STD_ISO_COMPACT_CARD:
					rc = ansi2isocc_fvmr(ifvmrs[r], ofvmr,
					    &fvmr_len, ifmr->x_resolution,
					    ifmr->y_resolution);
					break;
				default:
					ERR_OUT("Invalid output type");
				}
				break;

			    /* XXX Eventually handle ISO->ISO conversions */
			    case FMR_STD_ISO:
				/* For ANSI07, the coord and resolution info
				 * is copied by iso2ansi_fvmr().
				 */
			    case FMR_STD_ISO_NORMAL_CARD:
				rc = iso2ansi_fvmr(ifvmrs[r], ofvmr, &fvmr_len,
				    ifmr->x_resolution, ifmr->y_resolution);
				break;
			    case FMR_STD_ISO_COMPACT_CARD:
				rc = isocc2ansi_fvmr(ifvmrs[r], ofvmr,
				    &fvmr_len, ifmr->x_resolution,
				    ifmr->y_resolution);
				break;
			}
			if (rc != 0)
				ERR_OUT("Modifying FVMR");

			fmr_len += fvmr_len;
			// XXX Copy the FEDB to the output fmr
			ofvmr->extended = NULL;
			add_fvmr_to_fmr(ofvmr, ofmr);

			fmr_len += FEDB_HEADER_LENGTH;
		}

	} else {
		if (rcount == 0)
			ERR_OUT("there are no FVMRs in the input FMR");
		else
			ERR_OUT("retrieving FVMRs from input FMR");
	}

	ofmr->record_length = fmr_len;
	retval = 0;
err_out:
	if (ifvmrs != NULL)
		free (ifvmrs);
	return (retval);
}
