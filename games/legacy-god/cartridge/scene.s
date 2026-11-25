// Thumb-1. Runs after the trilogy keypad reader. All gameplay is on the GBA.
push {r4,r5,r6,r7,lr}
ldr r3, =0x087b0001
bl invoke
ldr r4, =0x03001230
ldr r0, =0x03000600
ldr r0, [r0]
ldr r1, =0x081c7eec
cmp r0,r1
beq in_map
b finish
in_map:
ldr r0, =0x030007b8
ldr r5,[r0]
cmp r5, #0
bne dispatch
b finish
dispatch:
ldr r6, =0x03003d10
ldrb r1,[r6,#2]
ldrb r2,[r4,#2]
strb r1,[r4,#2]
bics r1,r2
strb r1,[r4,#3]
ldrb r0,[r4]
cmp r0,#0
bne not_init
movs r0,#1
strb r0,[r4]
b block
not_init:
cmp r0,#1
beq dialog
cmp r0,#2
beq walk
cmp r0,#3
beq practice
cmp r0,#4
beq ki
cmp r0,#5
beq dialog
cmp r0,#6
beq dialog
cmp r0,#7
beq duel
cmp r0,#8
beq counter
b block
dialog:
ldrb r1,[r4,#3]
movs r2,#9
tst r1,r2
beq block
adds r0,#1
strb r0,[r4]
b block
walk:
ldrh r1,[r5,#32]
subs r1,#224
cmp r1,#48
bhi finish
ldrh r1,[r5,#34]
subs r1,#170
cmp r1,#46
bhi finish
movs r0,#3
strb r0,[r4]
b finish
practice:
bl anim
cmp r0,#3
beq punched
cmp r0,#4
bne finish
punched:
movs r0,#4
strb r0,[r4]
b finish
ki:
bl anim
cmp r0,#5
bne finish
ldrh r1,[r6,#2]
movs r2,#2
tst r1,r2
bne finish
ldr r0, =0x087b1c00
ldr r3, =0x080058d7
bl invoke
str r0,[r4,#4]
movs r0,#5
strb r0,[r4]
b block
duel:
ldrb r0,[r4,#3]
movs r1,#3
tst r0,r1
beq needs_attack
movs r0,#1
strb r0,[r4,#8]
needs_attack:
ldrb r0,[r4,#8]
cmp r0,#0
beq finish
ldr r7,[r4,#4]
bl anim
cmp r0,#3
beq melee
cmp r0,#4
beq melee
// Look for a native ki projectile whose feet overlap Beerus.
ldr r1, =0x03000610
ldr r2,[r1]
scan:
cmp r2,#0
beq finish
subs r2,#1
adds r1,#4
ldr r0,[r1]
ldr r3,[r0,#24]
ldr r6, =0x08011e44
ldr r6,[r6]
cmp r3,r6
bne scan
bl near
cmp r0,#0
beq scan
b hit
melee:
movs r0,r5
bl near
cmp r0,#0
beq finish
hit:
movs r0,#8
strb r0,[r4]
movs r0,#28
strb r0,[r4,#1]
b finish
counter:
ldrb r0,[r4,#1]
subs r0,#1
strb r0,[r4,#1]
bne block
ldr r7,[r4,#4]
ldrh r1,[r5,#32]
adds r1,#12
strh r1,[r7,#32]
ldrh r1,[r5,#34]
strh r1,[r7,#34]
movs r2,#0
ldr r0,[r5,#60]
str r2,[r0,#76]
ldr r0, =0x030007d0
str r2,[r0]
movs r0,r5
movs r1,#2
ldr r3, =0x08002467
bl invoke
movs r0,#9
strb r0,[r4]
block:
movs r0,#0
strh r0,[r6,#2]
strh r0,[r6,#4]
finish:
pop {r4,r5,r6,r7,pc}
invoke:
bx r3
anim:
ldr r0,[r5,#52]
ldr r1,[r5,#24]
subs r0,r0,r1
// State rows are 20 bytes. Only states 3..5 are used here.
cmp r0,#60
beq three
cmp r0,#80
beq four
cmp r0,#100
beq five
movs r0,#0
bx lr
three:
movs r0,#3
bx lr
four:
movs r0,#4
bx lr
five:
movs r0,#5
bx lr
near:
ldrh r3,[r0,#32]
ldrh r6,[r7,#32]
subs r3,r3,r6
adds r3,#22
cmp r3,#44
bhi far
ldrh r3,[r0,#34]
ldrh r6,[r7,#34]
subs r3,r3,r6
adds r3,#20
cmp r3,#40
bhi far
movs r0,#1
bx lr
far:
movs r0,#0
bx lr
