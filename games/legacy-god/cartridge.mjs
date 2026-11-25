// USA ALGE, validated against its SHA-256 before patching. The world, actors,
// physics, camera, combat, audio, and HUD remain native GBA code and data.
const base = 0x08000000;
export function installScene(rom, hook) {
  const v = new DataView(rom.buffer,rom.byteOffset,rom.byteLength);
  const u32 = a => v.getUint32(a,true);
  const w32 = (a,n) => v.setUint32(a,n,true);
  const w16 = (a,n) => v.setUint16(a,n,true);
  if (u32(0xa668)!==0x087b0001 || hook.length>0x800 ||
      !rom.subarray(0x7b1000,0x7b2220).every(x=>x===255 || x===0))
    throw Error('Unsupported field engine layout.');
  rom.set(hook,0x7b1000);
  w32(0xa668,base+0x7b1001);
  // New Game calls load_map(13, entrance). Place Goku outside Kai’s house.
  w16(0x1024,0x200d);
  w16(0x2f18,0x46c0); // Allow the native ki moves on the training map.
  w16(0xfee0,216); w16(0xfee2,216);
  const content=0x1c9450;
  w32(content+8,1); // Keep King Kai. The encounter spawns Beerus later.
  w32(content+0x18,0); // Replace the original Snake Way quest triggers.
  w16(0x57a8,0x2000); w16(0x57aa,0x4770); // New dialogue replaces old NPC scripts.

  // Add Beerus as a native NPC, using a spare actor slot for this map.
  const actor=0x7b1c00, sprite=0x7b1c20, palette=0x7b1c50, anim=0x7b1c70;
  const strip=0x7b1e00, pixels=0x7b1e20;
  w16(actor,200);w16(actor+2,216);
  rom.set([108,0,0,0,1,0,0,0],actor+4);
  const slot=0x5c0c80+4*rom[0x15a709+108];
  const template=u32(slot)-base;
  rom.copyWithin(sprite,template,template+0x2c);
  w32(slot,base+sprite);w32(sprite+0x24,base+palette);w32(sprite+0x28,base+anim);
  const colors=['000000','2b1939','714989','ac72bb','d19bd9','f8ce61','142438','284961','467e9a','f6e7ba','b98136'];
  colors.forEach((c,i)=>{const n=parseInt(c,16);w16(palette+2*i,(n>>19&31)|(n>>6&992)|(n<<7&31744))});
  for(let i=0;i<17*4;i++)w32(anim+i*4,base+strip);
  w16(strip,0);w16(strip+2,-24);w16(strip+4,16);w16(strip+6,32);
  rom.set([8,0,2,2],strip+8);w32(strip+12,base+pixels);
  const rows=[
    '..1.......1.....','..31.....13.....','..321...123.....','..3421.1243.....','...3221223......','...2333332......',
    '..133333331.....','..122333221.....','...1533351......','...1332331......','....13331.......','.....232........',
    '...169591.......','..137686931.....','..3237873231....','..3216761231....','.13216761231....','.13116761231....',
    '..3115aa5131....','...16777811.....','...17768771.....','..167768771..21.','..177611671.131.','..1671.1671121..',
    '...271..27121...','...231..231.....','...231..231.....','..1331..231.....','..1551..151.....','.16771..1771....',
    '.17771..17771...','.11111..11111...'];
  rom.fill(0,pixels,pixels+8*32);
  rows.forEach((row,y)=>[...row].forEach((c,x)=>{if(c!=='.'){
    const tile=(y>>3)*2+(x>>3),at=pixels+tile*32+(y%8)*4+((x%8)>>1);
    rom[at]|=parseInt(c,16)<<((x&1)*4);
  }}));
  // Standing animation can index multiple frames.
  for(let i=1;i<4;i++)rom.copyWithin(pixels+i*256,pixels,pixels+256);
  return rom;
}
