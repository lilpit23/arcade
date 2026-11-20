"""Build an IPS patch: compiled hook code placed in the ROM's free space, plus a
jump to it at the routine it replaces. Only our own bytes go into the patch."""
import sys, struct
rom, blob, at, hook, out = sys.argv[1], sys.argv[2], int(sys.argv[3], 16), int(sys.argv[4], 16), sys.argv[5]
d = bytearray(open(rom, 'rb').read()); b = open(blob, 'rb').read()
assert all(x in (0, 0xff) for x in d[at:at+len(b)]), 'target area is not free space'
assert hook % 4 == 0
records = [(at, b), (hook, struct.pack('<HHI', 0x4b00, 0x4718, 0x08000000 + at + 1))]  # ldr r3,[pc]; bx r3; .word code|1
ips = bytearray(b'PATCH')
for off, data in records:
    for i in range(0, len(data), 0xffff):
        chunk = data[i:i+0xffff]
        ips += struct.pack('>I', off + i)[1:] + struct.pack('>H', len(chunk)) + chunk
ips += b'EOF'
open(out, 'wb').write(ips)
print(out, len(ips), 'bytes')
