N=../nbis
B=../biomdi
INC="-I. -I$N/commonnbis/include -I$N/imgtools/include -I$N/mindtct/include -I$N/an2k/include -I$B/common/src/include -I$B/fingerminutia/src/include"
SRCS="$(ls $N/imgtools/src/lib/wsq/*.c) $(ls $N/mindtct/src/lib/mindtct/*.c) $(ls $N/commonnbis/src/lib/util/*.c) $(ls $N/commonnbis/src/lib/ioutil/*.c) $(ls $N/commonnbis/src/lib/fet/*.c) $(ls $N/imgtools/src/lib/jpegl/*.c) $(ls $N/imgtools/src/lib/image/*.c) $B/common/src/libbiomdi/biomdi.c $(ls $B/fingerminutia/src/libfmr/*.c)"
