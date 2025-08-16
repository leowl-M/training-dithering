// Retro Image Processor – p5.js (instance mode)
// Canvas fisso 4:5, ingresso solo da file input, controlli via UI (nessun overlay)
(function(){
    const els = {
      canvasWrap: document.getElementById('canvasWrap'),
      infoSource: document.getElementById('infoSource'),
      infoFps: document.getElementById('infoFps'),
      fileImg: document.getElementById('fileImg'),
      btnPng: document.getElementById('btnPng'),
      pngScale: document.getElementById('pngScale'),
      overlayOnly: document.getElementById('overlayOnly'),
      themeToggle: document.getElementById('themeToggle'),
  
      // UI parametri
      uiPalette: document.getElementById('uiPalette'),
      uiContrast: document.getElementById('uiContrast'),
      uiContrastVal: document.getElementById('uiContrastVal'),
      uiDither: document.getElementById('uiDither'),
      uiBlock: document.getElementById('uiBlock'),
      uiBlockVal: document.getElementById('uiBlockVal'),
      uiTemporal: document.getElementById('uiTemporal'),
      uiScanlines: document.getElementById('uiScanlines'),
      uiScanInt: document.getElementById('uiScanInt'),
      uiScanIntVal: document.getElementById('uiScanIntVal'),
      uiBleed: document.getElementById('uiBleed'),
      uiBleedVal: document.getElementById('uiBleedVal'),
    };
  
    // Stato e parametri
    let originalImg = null, processedImg = null;
  
    let colorModeIdx = 1; // EGA16
    let blockSize = 1;
    let ditherType = 0;
    let scanlines = true;
    let temporalDither = false;
    let contrastBoost = 1.4;
  
    let scanlineIntensity = 0.7;
    let colorBleed = 0.3;
    let frameCounter = 0;
    let errR = [], errG = [], errB = [];
  
    let lastFPSUpdate = 0;
  
    // Palette (hex)
    const palettes = [
      ['#000000','#FF0000','#00FF00','#FFFF00','#0000FF','#FF00FF','#00FFFF','#FFFFFF'], // CGA8
      ['#000000','#0000AA','#00AA00','#00AAAA','#AA0000','#AA00AA','#AA5500','#AAAAAA','#555555','#5555FF','#55FF55','#55FFFF','#FF5555','#FF55FF','#FFFF55','#FFFFFF'], // EGA16
      ['#000000','#0000D7','#D70000','#D700D7','#00D700','#00D7D7','#D7D700','#D7D7D7'], // ZX
      ['#0F380F','#306230','#8BAC0F','#9BBC0F'], // GameBoy
      ['#000000','#FFFFFF','#880000','#AAFFEE','#CC44CC','#00CC55','#0000AA','#EEEE77','#DD8855','#664400','#FF7777','#333333','#777777','#AAFF66','#0088FF','#BBBBBB'] // C64
    ];
    let currentPalette = palettes[colorModeIdx];
    let paletteRGB = hexPaletteToRGB(currentPalette);
  
    // Bayer 8x8
    const bayer8x8 = [
      [0,32,8,40,2,34,10,42],
      [48,16,56,24,50,18,58,26],
      [12,44,4,36,14,46,6,38],
      [60,28,52,20,62,30,54,22],
      [3,35,11,43,1,33,9,41],
      [51,19,59,27,49,17,57,25],
      [15,47,7,39,13,45,5,37],
      [63,31,55,23,61,29,53,21]
    ];
  
    // Tema
    initTheme();
    function initTheme(){
      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(saved || (prefersDark ? 'dark' : 'light'));
      els.themeToggle?.addEventListener('click', ()=> setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
    }
    function setTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); }
  
    // p5 instance
    const s = (p) => {
      let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      let cnv;
  
      p.setup = () => {
        const { w, h } = getCanvasSize4x5();
        cnv = p.createCanvas(w, h);
        cnv.parent(els.canvasWrap);
        p.pixelDensity(dpr);
        p.noSmooth();
        p.frameRate(30);
        p.background(getStageBg());
        bindUI(p);
      };
  
      p.windowResized = () => {
        const { w, h } = getCanvasSize4x5();
        p.resizeCanvas(w, h, true);
        p.background(getStageBg());
        if (originalImg) resizeOriginalToCanvas(p);
      };
  
      p.draw = () => {
        if (!originalImg){
          p.background(getStageBg());
          updateFPS(p);
          return;
        }
  
        frameCounter++;
        processImage(p);
        applyRetroEffects(p);
        p.image(processedImg, 0, 0);
  
        updateFPS(p);
      };
  
      // Helpers dimensioni / stile
      function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
      function getStageBg(){ return cssVar('--stage') || '#0b0f16'; }
      function updateFPS(p){ const now = performance.now(); if (now - lastFPSUpdate > 250) { els.infoFps.textContent = `FPS: ${Math.round(p.frameRate())}`; lastFPSUpdate = now; } }
  
      // Canvas 4:5 che entra nel canvasWrap
      function getCanvasSize4x5(){
        const wrap = els.canvasWrap;
        const cw = Math.max(200, wrap.clientWidth || 200);
        const ch = Math.max(200, wrap.clientHeight || 200);
        const targetR = 4/5;
        let w = cw, h = Math.round(cw / targetR);
        if (h > ch) { h = ch; w = Math.round(ch * targetR); }
        return { w, h };
      }
  
      function bindUI(p){
        // File input → immagine sorgente
        els.fileImg?.addEventListener('change', (evt)=>{
          const file = evt.target.files && evt.target.files[0]; if (!file) return;
          const url = URL.createObjectURL(file);
          p.loadImage(url, (img)=>{
            originalImg = img; resizeOriginalToCanvas(p);
            updateInfoSource(file.name||'File'); URL.revokeObjectURL(url);
          });
        });
  
        // Export PNG
        els.btnPng?.addEventListener('click', ()=>{
          const scale = Number(els.pngScale?.value||'1')||1;
          const overlay = !!els.overlayOnly?.checked; // preparato
          savePNGScaled(p, scale, overlay);
        });
  
        // ---- UI parametri ----
        els.uiPalette?.addEventListener('change', (e)=>{
          colorModeIdx = Number(e.target.value)||0;
          currentPalette = palettes[colorModeIdx];
          paletteRGB = hexPaletteToRGB(currentPalette);
        });
  
        els.uiContrast?.addEventListener('input', (e)=>{
          contrastBoost = Number(e.target.value);
          if (els.uiContrastVal) els.uiContrastVal.textContent = contrastBoost.toFixed(1);
        });
  
        els.uiDither?.addEventListener('change', (e)=>{
          ditherType = Number(e.target.value)||0;
        });
  
        els.uiBlock?.addEventListener('input', (e)=>{
          blockSize = Number(e.target.value)||1;
          if (els.uiBlockVal) els.uiBlockVal.textContent = String(blockSize);
        });
  
        els.uiTemporal?.addEventListener('change', (e)=>{
          temporalDither = !!e.target.checked;
        });
  
        els.uiScanlines?.addEventListener('change', (e)=>{
          scanlines = !!e.target.checked;
        });
  
        els.uiScanInt?.addEventListener('input', (e)=>{
          scanlineIntensity = Number(e.target.value);
          if (els.uiScanIntVal) els.uiScanIntVal.textContent = scanlineIntensity.toFixed(1);
        });
  
        els.uiBleed?.addEventListener('input', (e)=>{
          colorBleed = Number(e.target.value);
          if (els.uiBleedVal) els.uiBleedVal.textContent = colorBleed.toFixed(2);
        });
      }
  
      function updateInfoSource(txt){ if (els.infoSource) els.infoSource.textContent = `Sorgente: ${txt}`; }
      function resizeOriginalToCanvas(p){ if (!originalImg) return; originalImg.resize(p.width, p.height); }
  
      // ---------- Core processing ----------
      function processImage(p){
        if (!originalImg) return;
  
        const newW = Math.max(1, Math.floor(p.width/(blockSize*2)));
        const newH = Math.max(1, Math.floor(p.height/(blockSize*2)));
        const low = p.createGraphics(newW, newH);
        low.image(originalImg, 0, 0, newW, newH);
        const src = low.get();
  
        // reset error buffers
        errR = Array.from({length:newW}, ()=> new Float32Array(newH));
        errG = Array.from({length:newW}, ()=> new Float32Array(newH));
        errB = Array.from({length:newW}, ()=> new Float32Array(newH));
  
        src.loadPixels();
        const out = p.createImage(newW, newH);
        out.loadPixels();
  
        const randJitter = temporalDither ? ((frameCounter % 2) ? 8 : -8) : 0;
  
        for (let y=0; y<newH; y++){
          for (let x=0; x<newW; x++){
            const idx = (x + y*newW)*4;
            let r = src.pixels[idx+0];
            let g = src.pixels[idx+1];
            let b = src.pixels[idx+2];
  
            // contrasto + error accumulation
            r = clamp((r-128)*contrastBoost + 128 + errR[x][y], 0, 255);
            g = clamp((g-128)*contrastBoost + 128 + errG[x][y], 0, 255);
            b = clamp((b-128)*contrastBoost + 128 + errB[x][y], 0, 255);
  
            // quantizzazione
            let [qr,qg,qb] = quantizeColor(r, g, b);
  
            // dithering
            switch(ditherType){
              case 0: // Floyd–Steinberg
                ({qr,qg,qb} = ditherFloyd(x,y, r,g,b, qr,qg,qb, newW,newH));
                break;
              case 1: { // Ordered (Bayer 8×8)
                const th = bayer8x8[x&7][y&7]*(255/64) + randJitter;
                if (avgBrightness(r,g,b) <= th){ const k = paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
                break;
              }
              case 2: { // Random
                const rt = Math.random()*255 + randJitter;
                if (avgBrightness(r,g,b) <= rt){ const k = paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
                break;
              }
              case 3: // Jarvis (semplificato)
                ({qr,qg,qb} = ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'jarvis'));
                break;
              case 4: // Atkinson
                ({qr,qg,qb} = ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'atkinson'));
                break;
              case 5: // Albie
                ({qr,qg,qb} = ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'albie'));
                break;
              case 6: { // Average
                const avg = neighborhoodAvg(src, x,y,newW,newH);
                if (avgBrightness(r,g,b) <= avg) { const k = paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
                break;
              }
            }
  
            out.pixels[idx+0] = qr; out.pixels[idx+1] = qg; out.pixels[idx+2] = qb; out.pixels[idx+3] = 255;
          }
        }
  
        out.updatePixels();
        out.resize(p.width, p.height);
        processedImg = out;
      }
  
      function applyRetroEffects(p){
        if (!processedImg) return;
        processedImg.loadPixels();
        const w = processedImg.width, h = processedImg.height, pix = processedImg.pixels;
  
        // Scanlines
        if (scanlines){
          for (let y=0; y<h; y+=2){
            for (let x=0; x<w; x++){
              const i = (x + y*w)*4;
              pix[i  ] *= scanlineIntensity;
              pix[i+1] *= scanlineIntensity;
              pix[i+2] *= scanlineIntensity;
            }
          }
        }
  
        // Color bleed (orizzontale)
        if (colorBleed>0){
          const clone = new Uint8ClampedArray(pix);
          for (let y=0; y<h; y++){
            for (let x=1; x<w-1; x++){
              const i = (x + y*w)*4; const il=(x-1 + y*w)*4; const ir=(x+1 + y*w)*4;
              pix[i  ] = clone[i  ]*(1-colorBleed) + (clone[il] + clone[ir])*0.5*colorBleed;
              pix[i+1] = clone[i+1]*(1-colorBleed) + (clone[il+1] + clone[ir+1])*0.5*colorBleed;
              pix[i+2] = clone[i+2]*(1-colorBleed) + (clone[il+2] + clone[ir+2])*0.5*colorBleed;
            }
          }
        }
        processedImg.updatePixels();
      }
  
      // Dithering helpers
      function ditherFloyd(x,y, r,g,b, qr,qg,qb, W,H){
        const er = r-qr, eg = g-qg, eb = b-qb;
        diffuse(x+1,y,   er,eg,eb, 7/16, W,H);
        diffuse(x-1,y+1, er,eg,eb, 3/16, W,H);
        diffuse(x,  y+1, er,eg,eb, 5/16, W,H);
        diffuse(x+1,y+1, er,eg,eb, 1/16, W,H);
        return {qr,qg,qb};
      }
  
      function ditherKernel(x,y, r,g,b, qr,qg,qb, W,H, mode){
        const er = r-qr, eg = g-qg, eb = b-qb;
        if (mode==='jarvis'){
          const weights = [
            {dx:-2,dy:0,w:5/48},{dx:-1,dy:0,w:7/48},{dx:1,dy:0,w:7/48},{dx:2,dy:0,w:5/48},
            {dx:-2,dy:1,w:3/48},{dx:-1,dy:1,w:5/48},{dx:0,dy:1,w:7/48},{dx:1,dy:1,w:5/48},{dx:2,dy:1,w:3/48},
            {dx:-2,dy:2,w:1/48},{dx:-1,dy:2,w:3/48},{dx:0,dy:2,w:5/48},{dx:1,dy:2,w:3/48},{dx:2,dy:2,w:1/48}
          ];
          for (const it of weights) diffuse(x+it.dx,y+it.dy, er,eg,eb, it.w, W,H);
        } else if (mode==='atkinson'){
          const w = 1/8; const pts = [
            {dx:1,dy:0},{dx:2,dy:0},{dx:-1,dy:1},{dx:0,dy:1},{dx:1,dy:1},{dx:0,dy:2}
          ];
          for (const it of pts) diffuse(x+it.dx,y+it.dy, er,eg,eb, w, W,H);
        } else if (mode==='albie'){
          const left = (y%2)!==0; const sgn = left?-1:1;
          diffuse(x+1*sgn,y, er,eg,eb, 0.5, W,H);
          diffuse(x, y+1, er,eg,eb, 0.25, W,H);
          diffuse(x+1*sgn, y+1, er,eg,eb, 0.25, W,H);
        }
        return {qr,qg,qb};
      }
  
      function diffuse(x,y, er,eg,eb, w, W,H){
        if (x>=0 && x<W && y>=0 && y<H){
          errR[x][y]+=er*w; errG[x][y]+=eg*w; errB[x][y]+=eb*w;
        }
      }
  
      function quantizeColor(r,g,b){
        let minDist = 1e12, idx = 0;
        for (let i=0;i<paletteRGB.length;i++){
          const pr=paletteRGB[i][0], pg=paletteRGB[i][1], pb=paletteRGB[i][2];
          const dr=r-pr, dg=g-pg, db=b-pb; const d = dr*dr + dg*dg + db*db;
          if (d<minDist){ minDist=d; idx=i; }
        }
        return paletteRGB[idx];
      }
  
      function neighborhoodAvg(src, x,y,W,H){
        let sum=0, count=0;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=1; dx++){
            const xx=x+dx, yy=y+dy;
            if (xx>=0&&xx<W&&yy>=0&&yy<H){
              const i=(xx+yy*W)*4; sum += (src.pixels[i]+src.pixels[i+1]+src.pixels[i+2])/3; count++;
            }
          }
        }
        return sum/(count||1);
      }
  
      function avgBrightness(r,g,b){ return (r+g+b)/3; }
  
      // Export PNG scalato
      function savePNGScaled(p, scale=1, overlayOnly=false){
        const w = Math.round(p.width*scale), h = Math.round(p.height*scale);
        const g = p.createGraphics(w,h); g.pixelDensity(1);
        if (!overlayOnly) g.background(getStageBg());
        if (processedImg){ g.image(processedImg, 0,0, w,h); }
        g.save('retro_export.png'); g.remove();
      }
    };
  
    new p5(s);
  
    // Utils palette
    function hexPaletteToRGB(arr){ return arr.map(h=>hexToRgb(h)); }
    function hexToRgb(hex){
      const c = hex.replace('#','');
      const n = parseInt(c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c, 16);
      return [ (n>>16)&255, (n>>8)&255, n&255 ];
    }
  
    // clamp util
    function clamp(v, lo, hi){ return v<lo?lo:(v>hi?hi:v); }
  })();
  