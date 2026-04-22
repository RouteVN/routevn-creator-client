import initFastCdcWasm from "@dstanesc/wasm-chunking-fastcdc-webpack/chunking_bg.wasm?init";

const textDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});

let wasmExports;
let wasmExportsPromise;
let wasmVectorLength = 0;
let cachedUint8Memory;
let cachedInt32Memory;
let cachedUint32Memory;

const heap = Array.from({ length: 32 });
heap.push(undefined, null, true, false);
let heapNext = heap.length;

const getWasmExports = async () => {
  if (!wasmExportsPromise) {
    wasmExportsPromise = initFastCdcWasm({
      __wbindgen_placeholder__: {
        __wbg_new_bec064441604955e,
        __wbindgen_throw,
      },
    }).then((exports) => {
      wasmExports = exports;
      return wasmExports;
    });
  }

  return wasmExportsPromise;
};

const getUint8Memory = () => {
  if (
    !cachedUint8Memory ||
    cachedUint8Memory.buffer !== wasmExports.memory.buffer
  ) {
    cachedUint8Memory = new Uint8Array(wasmExports.memory.buffer);
  }
  return cachedUint8Memory;
};

const getInt32Memory = () => {
  if (
    !cachedInt32Memory ||
    cachedInt32Memory.buffer !== wasmExports.memory.buffer
  ) {
    cachedInt32Memory = new Int32Array(wasmExports.memory.buffer);
  }
  return cachedInt32Memory;
};

const getUint32Memory = () => {
  if (
    !cachedUint32Memory ||
    cachedUint32Memory.buffer !== wasmExports.memory.buffer
  ) {
    cachedUint32Memory = new Uint32Array(wasmExports.memory.buffer);
  }
  return cachedUint32Memory;
};

const getStringFromWasm = (ptr, len) => {
  return textDecoder.decode(getUint8Memory().subarray(ptr, ptr + len));
};

const passArray8ToWasm = (arg) => {
  const ptr = wasmExports.__wbindgen_malloc(arg.length);
  getUint8Memory().set(arg, ptr);
  wasmVectorLength = arg.length;
  return ptr;
};

const getObject = (index) => heap[index];

const dropObject = (index) => {
  if (index < 36) {
    return;
  }
  heap[index] = heapNext;
  heapNext = index;
};

const takeObject = (index) => {
  const value = getObject(index);
  dropObject(index);
  return value;
};

const addHeapObject = (value) => {
  if (heapNext === heap.length) {
    heap.push(heap.length + 1);
  }
  const index = heapNext;
  heapNext = heap[index];
  heap[index] = value;
  return index;
};

export const __wbg_new_bec064441604955e = (arg0, arg1) => {
  return addHeapObject(new RangeError(getStringFromWasm(arg0, arg1)));
};

export const __wbindgen_throw = (arg0, arg1) => {
  throw new Error(getStringFromWasm(arg0, arg1));
};

export const computeChunks = async (source, minSize, avgSize, maxSize) => {
  await getWasmExports();

  try {
    const retptr = wasmExports.__wbindgen_add_to_stack_pointer(-16);
    const ptr0 = passArray8ToWasm(source);
    const len0 = wasmVectorLength;
    wasmExports.compute_chunks(retptr, ptr0, len0, minSize, avgSize, maxSize);
    const int32Memory = getInt32Memory();
    const r0 = int32Memory[retptr / 4 + 0];
    const r1 = int32Memory[retptr / 4 + 1];
    const r2 = int32Memory[retptr / 4 + 2];
    const r3 = int32Memory[retptr / 4 + 3];
    if (r3) {
      throw takeObject(r2);
    }
    const value = getUint32Memory()
      .subarray(r0 / 4, r0 / 4 + r1)
      .slice();
    wasmExports.__wbindgen_free(r0, r1 * 4);
    return value;
  } finally {
    wasmExports.__wbindgen_add_to_stack_pointer(16);
  }
};
