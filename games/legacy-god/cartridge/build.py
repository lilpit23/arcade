"""Rebuild our Thumb-1 scene hook with keystone-engine. No cartridge is required."""
from pathlib import Path
from keystone import Ks, KS_ARCH_ARM, KS_MODE_THUMB
root = Path(__file__).parent
source = '\n'.join(line.split('//')[0] for line in (root/'scene.s').read_text().splitlines())
code, _ = Ks(KS_ARCH_ARM, KS_MODE_THUMB).asm(source, 0x087b1000)
(root/'scene.bin').write_bytes(bytes(code))
