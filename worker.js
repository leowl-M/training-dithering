// worker.js — Dithering/quant fuori dal main thread
self.onmessage = (e) => {
    const { cmd } = e.data || {};
    if (cmd !== 'process') return;
  
    const { width: W, height: H, data, params } = e.data;
    const {
      palette, // Uint8Array [r,g,b, r,g,b, ...]
      blockSize, ditherType, temporalDither, contrastBoost
    } = params;
  
    const pal = [];
    for (let i = 0; i < palette.length; i += 3) {
      pal.push([palette[i], palette[i+1], palette[i+2]]);
    }
  
    // Error buffers
    const errR = new Float32Array(W*H);
    const errG = new Float32Array(W*H);
    const errB = new Float32Array(W*H);
  
    const out = new Uint8ClampedArray(W*H*4);
    const randJitter = temporalDither ? 8 : 0;
  
    // Bayer 8x8
    const bayer = [
      [0,32,8,40,2,34,10,42],
      [48,16,56,24,50,18,58,26],
      [12,44,4,36,14,46,6,38],
      [60,28,52,20,62,30,54,22],
      [3,35,11,43,1,33,9,41],
      [51,19,59,27,49,17,57,25],
      [15,47,7,39,13,45,5,37],
      [63,31,55,23,61,29,53,21]
    ];
  
    function clamp(v, lo, hi){ return v<lo?lo:(v>hi?hi:v); }
    function avg(r,g,b){ return (r+g+b)/3; }
  
    function nearest(r,g,b){
      let min = 1e12, ir = 0;
      for (let i=0;i<pal.length;i++){
        const pr=pal[i][0], pg=pal[i][1], pb=pal[i][2];
        const dr=r-pr, dg=g-pg, db=b-pb;
        const d=dr*dr+dg*dg+db*db;
        if (d<min){min=d; ir=i;}
      }
      return pal[ir];
    }
  
    function diffuse(x,y, er,eg,eb, w){
      if (x>=0 && x<W && y>=0 && y<H){
        const i = x + y*W;
        errR[i]+=er*w; errG[i]+=eg*w; errB[i]+=eb*w;
      }
    }
  
    function ditherFloyd(x,y, r,g,b, qr,qg,qb){
      const er=r-qr, eg=g-qg, eb=b-qb;
      diffuse(x+1,y,   er,eg,eb, 7/16);
      diffuse(x-1,y+1, er,eg,eb, 3/16);
      diffuse(x,  y+1, er,eg,eb, 5/16);
      diffuse(x+1,y+1, er,eg,eb, 1/16);
    }
    function ditherKernel(x,y, r,g,b, qr,qg,qb, mode){
      const er=r-qr, eg=g-qg, eb=b-qb;
      if (mode==='jarvis'){
        const w=[{dx:-2,dy:0,w:5/48},{dx:-1,dy:0,w:7/48},{dx:1,dy:0,w:7/48},{dx:2,dy:0,w:5/48},
                 {dx:-2,dy:1,w:3/48},{dx:-1,dy:1,w:5/48},{dx:0,dy:1,w:7/48},{dx:1,dy:1,w:5/48},{dx:2,dy:1,w:3/48},
                 {dx:-2,dy:2,w:1/48},{dx:-1,dy:2,w:3/48},{dx:0,dy:2,w:5/48},{dx:1,dy:2,w:3/48},{dx:2,dy:2,w:1/48}];
        for (const it of w) diffuse(x+it.dx,y+it.dy,er,eg,eb,it.w);
      } else if (mode==='atkinson'){
        const Wt=1/8, pts=[{dx:1,dy:0},{dx:2,dy:0},{dx:-1,dy:1},{dx:0,dy:1},{dx:1,dy:1},{dx:0,dy:2}];
        for (const it of pts) diffuse(x+it.dx,y+it.dy, er,eg,eb, Wt);
      } else { // 'albie'
        const left=(y%2)!==0; const s=left?-1:1;
        diffuse(x+1*s,y, er,eg,eb, 0.5);
        diffuse(x, y+1,  er,eg,eb, 0.25);
        diffuse(x+1*s, y+1, er,eg,eb, 0.25);
      }
    }
  
    // Core loop
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const idx = (x + y*W)*4;
        let r=data[idx], g=data[idx+1], b=data[idx+2];
  
        const eIndex = x + y*W;
        r = clamp((r-128)*contrastBoost + 128 + errR[eIndex], 0, 255);
        g = clamp((g-128)*contrastBoost + 128 + errG[eIndex], 0, 255);
        b = clamp((b-128)*contrastBoost + 128 + errB[eIndex], 0, 255);
  
        let q = nearest(r,g,b);
        let qr=q[0], qg=q[1], qb=q[2];
  
        switch(ditherType){
          case 0: ditherFloyd(x,y, r,g,b, qr,qg,qb); break;
          case 1: { const th=bayer[x&7][y&7]*(255/64)+(temporalDither?randJitter:0); if (avg(r,g,b)<=th){ const k=pal[0]; qr=k[0]; qg=k[1]; qb=k[2]; } break; }
          case 2: { const rt=Math.random()*255+(temporalDither?randJitter:0); if (avg(r,g,b)<=rt){ const k=pal[0]; qr=k[0]; qg=k[1]; qb=k[2]; } break; }
          case 3: ditherKernel(x,y, r,g,b, qr,qg,qb, 'jarvis'); break;
          case 4: ditherKernel(x,y, r,g,b, qr,qg,qb, 'atkinson'); break;
          case 5: ditherKernel(x,y, r,g,b, qr,qg,qb, 'albie'); break;
          case 6: { // average neighborhood (3x3)
            let sum=0, c=0;
            for (let dy=-1; dy<=1; dy++){
              for (let dx=-1; dx<=1; dx++){
                const xx=x+dx, yy=y+dy;
                if (xx>=0&&xx<W&&yy>=0&&yy<H){
                  const i=(xx+yy*W)*4; sum+=(data[i]+data[i+1]+data[i+2])/3; c++;
                }
              }
            }
            const th=sum/(c||1);
            if (avg(r,g,b)<=th){ const k=pal[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
            break;
          }
        }
  
        out[idx]   = qr;
        out[idx+1] = qg;
        out[idx+2] = qb;
        out[idx+3] = 255;
      }
    }
  
    // ritorna i pixel elaborati
    self.postMessage({ width: W, height: H, data: out }, [out.buffer]);
  };
  