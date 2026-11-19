// USA releases only. All changes are applied to private in-memory copies.
export const chapters = [
  {title:'The Legacy of Goku', code:'ALGE', hash:'3ba9919e26704b0f5fdc2bfabc7f7a0404c71413761d38abcd94224c3bd4b1b9'},
  {title:'The Legacy of Goku II', code:'ALFE', hash:'6e6c370c339ec9171cb1956adf837a0d342a197f78964882ef46c3086656ff75'},
  {title:'Buu’s Fury', code:'BG3E', hash:'15df2fbbe072cc5d28a699ae9af9c56657e290cdb47c92e57d6ce14a01be4b64'}
];
const stub = 0x7ff800; // verified unused padding in both pinned USA images
const base = 0x08000000;
const signature = 0x31595254;

// Fresh boots enter the native title menu. Each edit is a Thumb halfword
// in a startup scene. Check the original instruction before changing it.
const openingEdits = [
  // Finish the legal screen timer, leave the logo loop, and skip the movie.
  [[0xe014,0xd308,0x46c0], [0x3b8,0x4911,0xe011], [0x3e2,0xf00c,0xe000]],
  // Bypass the splash modes and call the native title factory, which also
  // installs its own mode. Skip the redundant install in the boot loop.
  [[0x1b8,0x2000,0xe003], [0x1e4,0x2000,0xe003], [0x1f2,0xfda4,0xfdc1],
   [0x1f4,0xf01f,0x46c0], [0x1f6,0xf86b,0x46c0]],
  // Bypass the two splash modes before normal title initialization.
  [[0x41a6,0x2000,0xe003], [0x41d2,0x2000,0xe003]]
];

export function chapterImage(chapter, buffer) {
  const bytes = new Uint8Array(buffer.slice(0));
  const view = new DataView(bytes.buffer);
  for (const [offset, original, replacement] of openingEdits[chapter]) {
    if (view.getUint16(offset,true) !== original) throw new Error('Unexpected opening sequence.');
    view.setUint16(offset,replacement,true);
  }
  if (chapter === 2) return bytes;
  if (bytes.length !== 0x800000 || !bytes.subarray(stub,stub+0x500).every(b=>b===255))
    throw new Error('Unsupported cartridge layout.');
  const write = (offset, value) => view.setUint32(offset, value, true);
  // Ending callback: load two identifying values and wait for the browser
  // chapter transition. Interrupts and video frames continue during the wait.
  bytes.set([1,0x48,2,0x49,0xfe,0xe7,0xc0,0x46],stub);
  write(stub+8,signature);
  write(stub+12,0x43485031+chapter);
  if (chapter === 0) {
    // Unique script node immediately following the final narrated epilogue.
    if (view.getUint32(0x15afb8,true)!==0x0800cc75) throw new Error('Unexpected ending node.');
    write(0x15afb8,base+stub+1);
  } else {
    // The Future Trunks ending displays the final dialogue in script 083b8116.
    // Its follow-up at 083b813d transfers to the next chapter after dismissal.
    // Extend the interpreter table privately, preserving the original opcodes.
    if (view.getUint32(0x9320,true)!==0x083b5c00 || bytes[0x3b813d]!==2)
      throw new Error('Unexpected ending script.');
    const table = stub+0x20;
    bytes.copyWithin(table,0x3b5c00,0x3b5c00+0x400);
    write(table+4*255,base+stub+1);
    write(0x9320,base+table);
    bytes[0x3b813d]=255;
  }
  return bytes;
}

export function atHandoff(state, chapter) {
  if (chapter >= 2) return false;
  // The pinned libretro core writes a RetroArch RASTATE header followed by
  // a MEM chunk. mGBA serializes r0..r15 at byte 32 within that chunk.
  if (state.length < 112) return false;
  const view = new DataView(state.buffer,state.byteOffset,state.byteLength);
  if (view.getUint32(0)!==0x52415354 || view.getUint32(8)!==0x4d454d20 ||
      view.getUint32(16,true)!==0x01000007) return false;
  const registers = 16+32;
  const pc=view.getUint32(registers+60,true);
  return view.getUint32(registers,true)===signature &&
    view.getUint32(registers+4,true)===0x43485031+chapter &&
    pc>=base+stub+4 && pc<=base+stub+10;
}
