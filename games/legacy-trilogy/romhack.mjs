// Point-and-click ROM hacks: IPS patches with our own hook code, applied to the
// player's own cartridge in memory before it boots. Nothing is stored or uploaded.
const patched = new Set(['ALGE']);

export async function patchRom(code, bytes) {
  if (!patched.has(code)) return {bytes, hacked:false};
  try {
    const response = await fetch(`./romhack/${code}.ips`);
    if (!response.ok) return {bytes, hacked:false};
    return {bytes: applyIps(bytes, new Uint8Array(await response.arrayBuffer())), hacked:true};
  } catch { return {bytes, hacked:false}; }
}

export function applyIps(rom, ips) {
  const tag = String.fromCharCode(...ips.subarray(0, 5));
  if (tag !== 'PATCH') throw new Error('not an IPS patch');
  const out = new Uint8Array(rom);           // a copy; the original stays as loaded
  let at = 5;
  while (at + 3 <= ips.length) {
    const offset = ips[at]<<16 | ips[at+1]<<8 | ips[at+2];
    if (offset === 0x454f46) break;           // "EOF"
    let size = ips[at+3]<<8 | ips[at+4]; at += 5;
    if (size) { out.set(ips.subarray(at, at+size), offset); at += size; }
    else {                                    // run-length record
      size = ips[at]<<8 | ips[at+1];
      out.fill(ips[at+2], offset, offset+size); at += 3;
    }
  }
  return out;
}
