#!/bin/sh
# Rebuild the point-and-click patches. Needs arm-none-eabi-gcc and your own ROMs:
#   ./build.sh path/to/legacy-of-goku-1.gba
set -e
cd "$(dirname "$0")"
ROM1=${1:?first game ROM}
mkdir -p build
CFLAGS="-mthumb -mcpu=arm7tdmi -mthumb-interwork -Os -ffreestanding -fno-builtin -nostdlib -Wall"
arm-none-eabi-gcc $CFLAGS -c src/alge.c -o build/alge.o
arm-none-eabi-gcc -mthumb -mcpu=arm7tdmi -nostdlib -T src/link.ld -Wl,--defsym=BASE=0x087b0000 build/alge.o -lgcc -o build/alge.elf
arm-none-eabi-objcopy -O binary -j .text build/alge.elf build/alge.bin
python3 src/mkpatch.py "$ROM1" build/alge.bin 0x7b0000 0xa664 ALGE.ips
