"""Exercise the Linux extraction shim using a generated ARM cartridge."""
import struct
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'upstream/buus-fury/tools/emu'))
from emu import Emu


def test_cartridge():
    image = bytearray(512 * 1024)  # Above the size of an EWRAM multiboot image.
    image[0xB2] = 0x96
    struct.pack_into('<I', image, 0, 0xEA00002E)  # branch past cartridge header
    # Load EWRAM address, write 42, then loop.
    struct.pack_into('<5I', image, 0xC0, 0xE59F0008, 0xE3A0102A, 0xE5801000, 0xEAFFFFFE, 0x02000000)
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp)/'test.gba'
        path.write_bytes(image)
        emulator = Emu(str(path))
        try:
            entry = emulator.breakpoint(0x080000C0)
            emulator.run(3)
            assert any(hit["addr"] == 0x080000C0 for hit in emulator.hits())
            emulator.clear(entry)
            assert emulator.frame >= 3 and emulator.r32(0x02000000) == 42
            state = emulator.save()
            emulator.w32(0x02000000, 99)
            assert emulator.r32(0x02000000) == 99
            emulator.load(state)
            assert emulator.r32(0x02000000) == 42
        finally:
            emulator.close()


if __name__ == '__main__':
    test_cartridge()
    print('Cartridge execution and save-state round trip passed.')
