. ./srcs.sh; INC="$INC -Icompat"
COMMON="-O2 -w -D__NBISLE__ $INC bc.c wobj/*.o -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_NAME=BiometricConverter -sEXPORTED_FUNCTIONS=['_bc_wsq_decode','_bc_wsq_encode','_bc_raw2fmr','_bc_fmr2fmr','_bc_last_error','_bc_malloc','_bc_free'] -sEXPORTED_RUNTIME_METHODS=['ccall','getValue','UTF8ToString','HEAPU8'] -sFILESYSTEM=0"
emcc $COMMON -sENVIRONMENT=node -sSINGLE_FILE=1 -o bc_node.js 2>&1 | grep -v warning
emcc $COMMON -sENVIRONMENT=web,worker -o bc.js 2>&1 | grep -v warning
