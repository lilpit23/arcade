// USA releases only. All changes are applied to private in-memory copies.
export const chapters = [
  {title:'The Legacy of Goku', code:'ALGE', hash:'3ba9919e26704b0f5fdc2bfabc7f7a0404c71413761d38abcd94224c3bd4b1b9'},
  {title:'The Legacy of Goku II', code:'ALFE', hash:'6e6c370c339ec9171cb1956adf837a0d342a197f78964882ef46c3086656ff75'},
  {title:'Buu’s Fury', code:'BG3E', hash:'15df2fbbe072cc5d28a699ae9af9c56657e290cdb47c92e57d6ce14a01be4b64'}
];
const stub = 0x7ff800; // verified unused padding in both pinned USA images
const base = 0x08000000;
const signature = 0x31595254;

export function chapterImage(chapter, buffer) {
  const bytes = new Uint8Array(buffer.slice(0));
  if (chapter === 2) return bytes;
  if (bytes.length !== 0x800000 || !bytes.subarray(stub,stub+0x500).every(b=>b===255))
    throw new Error('Unsupported cartridge layout.');
  const view = new DataView(bytes.buffer);
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
