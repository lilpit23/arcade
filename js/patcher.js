// ROM patcher: applies IPS, UPS and BPS patches entirely in the browser.
// Usage: const { data, warnings } = RomPatcher.apply(romUint8Array, patchUint8Array)
(function () {
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf, start = 0, end = buf.length) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  const hex = (n) => n.toString(16).toUpperCase().padStart(8, "0");

  // Variable-length number used by UPS and BPS
  function reader(patch, start) {
    let pos = start;
    return {
      get pos() { return pos; },
      byte() {
        if (pos >= patch.length) throw new Error("Patch file is cut off or corrupted.");
        return patch[pos++];
      },
      num() {
        let value = 0, shift = 1;
        for (;;) {
          const x = this.byte();
          value += (x & 0x7f) * shift;
          if (x & 0x80) break;
          shift *= 128;
          value += shift;
        }
        return value;
      },
    };
  }

  function magic(p, str) {
    for (let i = 0; i < str.length; i++) if (p[i] !== str.charCodeAt(i)) return false;
    return true;
  }

  // ---------- IPS ----------
  function applyIPS(rom, patch) {
    let size = rom.length;
    const writes = [];
    let i = 5;
    for (;;) {
      if (i + 3 > patch.length) throw new Error("IPS patch is missing its EOF marker.");
      if (patch[i] === 0x45 && patch[i + 1] === 0x4f && patch[i + 2] === 0x46) { i += 3; break; } // "EOF"
      const off = (patch[i] << 16) | (patch[i + 1] << 8) | patch[i + 2];
      let len = (patch[i + 3] << 8) | patch[i + 4];
      i += 5;
      if (len === 0) { // RLE
        len = (patch[i] << 8) | patch[i + 1];
        writes.push({ off, rle: patch[i + 2], len });
        i += 3;
      } else {
        writes.push({ off, data: patch.subarray(i, i + len) });
        i += len;
      }
      size = Math.max(size, off + len);
    }
    let truncate = null;
    if (i + 3 <= patch.length) truncate = (patch[i] << 16) | (patch[i + 1] << 8) | patch[i + 2];

    const out = new Uint8Array(truncate ?? size);
    out.set(truncate != null ? rom.subarray(0, truncate) : rom);
    for (const w of writes) {
      if (w.data) out.set(w.data.subarray(0, Math.max(0, out.length - w.off)), w.off);
      else out.fill(w.rle, w.off, Math.min(out.length, w.off + w.len));
    }
    return { data: out, warnings: [] };
  }

  // ---------- UPS ----------
  function applyUPS(rom, patch) {
    const warnings = [];
    const r = reader(patch, 4);
    const inSize = r.num();
    const outSize = r.num();
    const srcCrc = u32le(patch, patch.length - 12);
    const dstCrc = u32le(patch, patch.length - 8);

    let source = rom, target = outSize;
    // UPS works both ways: if this looks like the patched ROM, go back to the original
    if (rom.length !== inSize && rom.length === outSize) target = inSize;
    if (rom.length !== inSize && rom.length !== outSize)
      warnings.push(`ROM size is ${rom.length} bytes, the patch expects ${inSize}. This is probably the wrong base ROM.`);
    if (crc32(rom) !== srcCrc && crc32(rom) !== dstCrc)
      warnings.push(`ROM checksum ${hex(crc32(rom))} doesn't match what the patch expects (${hex(srcCrc)}). This is probably the wrong ROM version.`);

    const out = new Uint8Array(target);
    out.set(source.subarray(0, Math.min(source.length, target)));
    let ptr = 0;
    const end = patch.length - 12;
    while (r.pos < end) {
      ptr += r.num();
      for (;;) {
        const b = r.byte();
        if (ptr < out.length) out[ptr] = (ptr < source.length ? source[ptr] : 0) ^ b;
        ptr++;
        if (b === 0) break;
      }
    }
    return { data: out, warnings };
  }

  // ---------- BPS ----------
  function applyBPS(rom, patch) {
    const warnings = [];
    const r = reader(patch, 4);
    const srcSize = r.num();
    const dstSize = r.num();
    const metaSize = r.num();
    for (let k = 0; k < metaSize; k++) r.byte();

    const srcCrc = u32le(patch, patch.length - 12);
    const romCrc = crc32(rom);
    if (rom.length !== srcSize)
      warnings.push(`ROM size is ${rom.length} bytes, the patch expects ${srcSize}. This is probably the wrong base ROM.`);
    else if (romCrc !== srcCrc)
      warnings.push(`ROM checksum ${hex(romCrc)} doesn't match what the patch expects (${hex(srcCrc)}). This is probably the wrong ROM version (for example v1.1 instead of v1.0).`);

    const out = new Uint8Array(dstSize);
    let op = 0, srcRel = 0, dstRel = 0;
    const end = patch.length - 12;
    while (r.pos < end) {
      const data = r.num();
      const cmd = data % 4;
      const len = Math.floor(data / 4) + 1;
      if (op + len > dstSize) throw new Error("Patch writes past the end of the output. The file is corrupted.");
      if (cmd === 0) { // SourceRead
        for (let k = 0; k < len; k++, op++) out[op] = op < rom.length ? rom[op] : 0;
      } else if (cmd === 1) { // TargetRead
        for (let k = 0; k < len; k++) out[op++] = r.byte();
      } else if (cmd === 2) { // SourceCopy
        const d = r.num();
        srcRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
        for (let k = 0; k < len; k++) out[op++] = rom[srcRel++] ?? 0;
      } else { // TargetCopy
        const d = r.num();
        dstRel += (d & 1 ? -1 : 1) * Math.floor(d / 2);
        for (let k = 0; k < len; k++) out[op++] = out[dstRel++];
      }
    }
    const dstCrc = u32le(patch, patch.length - 8);
    if (crc32(out) !== dstCrc && !warnings.length)
      warnings.push("The patched ROM's checksum is off. The game may not work properly.");
    return { data: out, warnings };
  }

  function apply(rom, patch) {
    if (magic(patch, "PATCH")) return applyIPS(rom, patch);
    if (magic(patch, "UPS1")) return applyUPS(rom, patch);
    if (magic(patch, "BPS1")) return applyBPS(rom, patch);
    throw new Error("Unknown patch format. Supported formats: .ips, .ups, .bps");
  }

  window.RomPatcher = { apply, crc32 };
})();
