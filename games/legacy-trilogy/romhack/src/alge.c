// Point-and-click for The Legacy of Goku (USA, ALGE).
// Replaces the game's keypad reader. Each frame it plans and follows a path
// to the spot, person or enemy the player clicked, using the game's own
// walkability map, and feeds the resulting button presses to the game.
typedef unsigned char u8; typedef signed char s8;
typedef unsigned short u16; typedef signed short s16;
typedef unsigned int u32; typedef signed int s32;
#define R8(a)  (*(volatile u8*)(a))
#define R16(a) (*(volatile u16*)(a))
#define S16(a) (*(volatile s16*)(a))
#define R32(a) (*(volatile u32*)(a))

enum { KA=1, KB=2, KSEL=4, KSTART=8, KRIGHT=16, KLEFT=32, KUP=64, KDOWN=128 };
enum { NONE=0, WALK=1, TALK=2, ATTACK=3 };

// Game memory (USA ALGE).
#define KEYS      0x03003d10u   // u8 idx, u16 held@2, pressed@4, released@6, u32 resetOk@8, u8 hist[8]@12
#define HERO_POS  0x030007c0u   // s16 x, y in 1/16 px (top-left of the 16x8 feet box)
#define HERO_SPD  0x030007b2u   // u16 step per frame in 1/16 px
#define HERO_OBJ  0x030007b8u
#define MAPHDR    0x03000600u   // -> map header: s16 width@4, height@6 in 8px tiles
#define WALKBITS  0x02005040u   // 1 bit per tile, set = walkable
#define OBJLIST   0x03000610u   // s32 count, then object pointers
#define TALKING1  0x030009ccu
#define TALKING2  0x03003b60u

// Our RAM (unused by the game).
#define BOX 0x03001000u
typedef struct {
  // Written by the player page.
  u8  seq, kind, pad0, pad1;
  s16 tx, ty;            // walk: map px of the clicked spot
  u32 target;            // talk/attack: object pointer
  // Ours.
  u8  seen, active, phase, tries;
  u16 timer, still, replans, pathLen, pathAt, pad2;
  s16 lastX, lastY, ox, oy;
  u32 magic;             // "PNC1" once the hook has run
  u16 inject, pad3;      // buttons pressed as if by the player (debug/tests)
  u16 frame, result;     // result: 1 arrived, 2 talked, 3 gave up, 4 enemy down, 5 cancelled
  u16 path[256];         // cell indices inside the planning window
} Box;
#define B ((Box*)BOX)
#define WIN 64
#define DIRS ((u8*)(BOX+0x240))            // WIN*WIN
#define QUEUE ((u16*)(BOX+0x240+WIN*WIN))  // ring of QN entries
#define QN 1024

static int mapW(void){ return S16(R32(MAPHDR)+4); }
static int mapH(void){ return S16(R32(MAPHDR)+6); }
static int tileOk(int tx,int ty){
  int w=mapW();
  if (tx<0||ty<0||tx>=w||ty>=mapH()) return 0;
  int i=ty*w+tx;
  return R8(WALKBITS+(i>>3)) & (1<<(i&7));
}
// Same test the game uses for a 16x8 box with its top-left at px (x,y).
static int boxOk(int x,int y){
  if (x<0||y<0) return 0;
  for (int ty=y>>3; ty<(y+15)>>3; ty++)
    for (int tx=x>>3; tx<(x+23)>>3; tx++)
      if (!tileOk(tx,ty)) return 0;
  return 1;
}
static int heroX(void){ return S16(HERO_POS)>>4; }
static int heroY(void){ return S16(HERO_POS+2)>>4; }
static int step(void){ int s=R16(HERO_SPD)>>4; return s<1?1:s; }
static int talking(void){ return R8(TALKING1)||R8(TALKING2); }
static int iabs(int v){ return v<0?-v:v; }
static int validObj(u32 p){ return p>=0x02000000u && p<0x0203fd00u && !(p&3); }

static int enemyHp(u32 p){
  u32 c=R32(p+0x3c);
  if (c<0x02013224u||c>=0x02030000u) return -1;
  if (S16(c+0x9a)!=2) return 0;
  return (s32)R32(c+0x4c);
}

// Mark planning cells where another object stands as blocked.
static void markObjects(u32 except){
  u32 hero=R32(HERO_OBJ); s32 n=(s32)R32(OBJLIST);
  if (n<0||n>64) n=0;
  for (int i=0;i<n;i++){
    u32 p=R32(OBJLIST+4+4*i);
    if (!validObj(p)||p==hero||p==except) continue;
    int ox=S16(p+0x20), oy=S16(p+0x22);
    if (!ox&&!oy) continue;
    for (int cy=((oy-6)>>3); cy<=((oy+6)>>3); cy++)
      for (int cx=((ox-13)>>3); cx<=((ox+13)>>3); cx++){
        int x=cx*8, y=cy*8;
        if (!(x<ox+14 && ox<x+14 && y<oy+7 && oy<y+7)) continue;
        int wx=cx-B->ox, wy=cy-B->oy;
        if (wx>=0&&wy>=0&&wx<WIN&&wy<WIN) DIRS[wy*WIN+wx]=6;
      }
  }
}

// Goal cells. For people and enemies: the four spots right next to them.
static int goal(int cx,int cy,int *score){
  int x=cx*8, y=cy*8;
  if (B->kind==WALK){
    int d=iabs(x+8-B->tx)+iabs(y+4-B->ty);
    *score=d; return d<6;
  }
  u32 p=B->target; int nx=S16(p+0x20), ny=S16(p+0x22);
  int dx=x-nx, dy=y-ny;
  *score=iabs(dx)+iabs(dy);
  return (iabs(dx)<=4 && dy>=6 && dy<=13) || (iabs(dx)<=4 && dy<=-6 && dy>=-13) ||
         (iabs(dy)<=4 && dx>=14 && dx<=21) || (iabs(dy)<=4 && dx<=-14 && dx>=-21);
}

static void plan(void){
  int hx=heroX(), hy=heroY();
  int sx=(hx+4)>>3, sy=(hy+4)>>3;
  B->ox=sx-WIN/2; B->oy=sy-WIN/2;
  for (int i=0;i<WIN*WIN;i++) DIRS[i]=0;
  u32 except = B->kind==WALK ? 0 : B->target;
  markObjects(except);
  int start=(WIN/2)*WIN+WIN/2, head=0, tail=0, best=start, bestScore=0x7fff, found=0;
  DIRS[start]=5; QUEUE[(tail++)&(QN-1)]=start;
  static const s8 ddx[4]={1,-1,0,0}, ddy[4]={0,0,1,-1};
  while (head<tail && tail-head<QN){
    int c=QUEUE[(head++)&(QN-1)], cx=c&(WIN-1), cy=c>>6, sc;
    if (goal(cx+B->ox,cy+B->oy,&sc)){ best=c; found=1; break; }
    if (sc<bestScore){ bestScore=sc; best=c; }
    for (int d=0;d<4;d++){
      int nx=cx+ddx[d], ny=cy+ddy[d];
      if (nx<0||ny<0||nx>=WIN||ny>=WIN) continue;
      int n=ny*WIN+nx;
      if (DIRS[n]) continue;
      int px=(nx+B->ox)*8, py=(ny+B->oy)*8;
      if (!boxOk(px,py)) { DIRS[n]=6; continue; }
      DIRS[n]=d+1; QUEUE[(tail++)&(QN-1)]=n;
    }
  }
  (void)found;
  // Walk back from the best cell to the start.
  int len=0, c=best;
  while (c!=start && len<QN){
    QUEUE[len++]=c;
    int d=DIRS[c]-1; c-= ddy[d]*WIN+ddx[d];
  }
  int keep = len>256?256:len;
  for (int i=0;i<keep;i++) B->path[i]=QUEUE[len-1-i];
  B->pathLen=keep; B->pathAt=0; B->still=0;
}

static void finish(int result){ B->active=0; B->result=result; B->phase=0; }

// Face the target and press A; try the other side once if nothing opens.
static int faceKeys(int toward){
  u32 p=B->target; int dx=S16(p+0x20)-heroX(), dy=S16(p+0x22)-heroY();
  int horiz = iabs(dx) > iabs(dy)*2;
  if (toward) horiz=!horiz;
  if (horiz) return dx<0?KLEFT:KRIGHT;
  return dy<0?KUP:KDOWN;
}

// Standing right next to the target (any side)?
static int beside(void){
  u32 p=B->target; int dx=S16(p+0x20)-heroX(), dy=S16(p+0x22)-heroY();
  return (iabs(dx)<=6 && iabs(dy)>=5 && iabs(dy)<=14) || (iabs(dy)<=5 && iabs(dx)>=12 && iabs(dx)<=22);
}

static int follow(void){
  int hx=heroX(), hy=heroY(), st=step(), tol=st>1?st-1:0;
  while (B->pathAt<B->pathLen){
    int c=B->path[B->pathAt];
    int wx=((c&(WIN-1))+B->ox)*8, wy=((c>>6)+B->oy)*8;
    if (iabs(wx-hx)<=tol && iabs(wy-hy)<=tol){ B->pathAt++; continue; }
    int dx=wx-hx, dy=wy-hy, keys=0;
    int kx=dx<0?KLEFT:KRIGHT, ky=dy<0?KUP:KDOWN;
    int sx=dx<0?-st:st, sy=dy<0?-st:st;
    int xFirst=iabs(dx)>=iabs(dy);
    if (xFirst){
      if (iabs(dx)>tol && boxOk(hx+sx,hy)) keys=kx;
      else if (iabs(dy)>tol && boxOk(hx,hy+sy)) keys=ky;
      else keys=iabs(dx)>tol?kx:ky;
    } else {
      if (iabs(dy)>tol && boxOk(hx,hy+sy)) keys=ky;
      else if (iabs(dx)>tol && boxOk(hx+sx,hy)) keys=kx;
      else keys=iabs(dy)>tol?ky:kx;
    }
    return keys;
  }
  return -1;   // path done
}

static int command(void){
  if (!B->active) return 0;
  B->timer++;
  int hx=heroX(), hy=heroY();
  if (hx==B->lastX && hy==B->lastY) B->still++; else B->still=0;
  B->lastX=hx; B->lastY=hy;

  if (B->kind!=WALK){
    u32 p=B->target;
    if (!validObj(p)){ finish(3); return 0; }
    if (B->kind==ATTACK && enemyHp(p)<=0){ finish(4); return 0; }
  }

  if (B->phase==0){                         // walking
    if (talking()){ finish(5); return 0; }
    if (B->kind==ATTACK){
      u32 p=B->target; int dx=S16(p+0x20)-hx, dy=S16(p+0x22)-hy;
      if (iabs(dx)<=22 && iabs(dy)<=14){ B->phase=3; B->timer=0; return 0; }
      if (B->timer%24==0) plan();
    } else if (B->kind==TALK && B->timer%30==0) plan();
    int keys=follow();
    if (keys<0){
      if (B->kind==WALK){ finish(1); return 0; }
      if (B->kind==ATTACK){ plan(); if (!B->pathLen){ B->phase=3; B->timer=0; } return 0; }
      if (!beside()){
        if (++B->replans>6){ finish(3); return 0; }
        plan(); return 0;
      }
      B->phase=1; B->timer=0; B->tries=0; return 0;
    }
    if (B->still>12){
      if (++B->replans>4){ finish(3); return 0; }
      plan(); return 0;
    }
    return keys;
  }
  if (B->phase==1){                         // turn to face, then press A
    if (B->timer<3) return faceKeys(B->tries);
    if (B->timer<5) return 0;
    if (B->timer<9) return KA;
    if (talking()){ finish(2); return 0; }
    if (B->timer<40) return 0;
    if (++B->tries>=2 || !beside()){
      if (++B->replans>6){ finish(3); return 0; }
      B->phase=0; B->timer=0; plan(); return 0;
    }
    B->timer=0; return 0;
  }
  if (B->phase==3){                         // attack while in reach
    u32 p=B->target; int dx=S16(p+0x20)-hx, dy=S16(p+0x22)-hy;
    if (iabs(dx)>32 || iabs(dy)>24){ B->phase=0; plan(); return 0; }
    if (B->timer>900){ finish(3); return 0; }
    int t=B->timer%14;
    if (t<2) return faceKeys(0);
    if (t<6) return KA;
    return 0;
  }
  return 0;
}

static u16 pnc(u16 real){
  if (B->magic!=0x31434e50){                // first frame after power-on
    B->magic=0x31434e50;
    R8(0x03000020)=2;                         // Text Speed: High
  }
  B->frame++;
  if (B->seq!=B->seen){                     // new click from the page
    B->seen=B->seq;
    B->active = B->kind!=NONE; B->phase=0; B->timer=0; B->replans=0; B->result=0;
    B->lastX=-1; B->lastY=-1;
    if (B->active) plan();
  }
  if (!B->active) return real;
  if (real){ finish(5); return real; }      // any real button takes over
  return command();
}

// Replacement for the game's keypad reader at 0x0800a664.
__attribute__((section(".text.entry"))) void readKeys(void){
  u16 held = ((~R16(0x04000130)) & 0x3ff) | B->inject;
  held = pnc(held);
  u16 old=R16(KEYS+2), changed=held^old;
  u16 pressed=held&changed, released=old&changed;
  R16(KEYS+4)=pressed; R16(KEYS+6)=released; R16(KEYS+2)=held;
  if (pressed){
    u8 i=R8(KEYS);
    R8(KEYS+12+i)=(u8)pressed;
    i++; if (i>=8) i=0;
    R8(KEYS)=i;
  }
  if (!(0x30b & ~held) && R32(KEYS+8)) ((void(*)(void))0x0800dbf9)();
}
