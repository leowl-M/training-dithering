// Retro Image Processor – p5.js (instance mode)
// Render "on-demand" (no loop pesante). Palette estese + testi UI snelli.

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

    // Inquadratura
    uiZoom: document.getElementById('uiZoom'),
    uiZoomVal: document.getElementById('uiZoomVal'),
    btnResetView: document.getElementById('btnResetView'),
    btnFitW: document.getElementById('btnFitW'),
    btnFitH: document.getElementById('btnFitH'),
    uiOverlay: document.getElementById('uiOverlay'),

    // Export rapidi
    btn1080: document.getElementById('btn1080'),
    btn2160: document.getElementById('btn2160'),
  };

  // Stato e parametri
  let originalImg = null, processedImg = null;

  let colorModeIdx = 1; // EGA 16 (default)
  let blockSize = 1;
  let ditherType = 0;
  let scanlines = true;
  let temporalDither = false;
  let contrastBoost = 1.4;

  let scanlineIntensity = 0.7;
  let colorBleed = 0.3;
  let overlayOn = false;

  // Vista (pan/zoom)
  const view = {
    scale: 1,
    minScale: 1, // cover
    posX: 0,
    posY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  // Offscreen
  let viewBuffer = null;      // p5.Graphics grande quanto il canvas
  let lowBuffer = null;       // p5.Graphics ridotto per processing

  // Error diffusion buffers
  let errW = 0, errH = 0;
  let errR = null, errG = null, errB = null;

  // Render scheduling
  let dirty = true;
  let working = false;

  // ======== PALETTE ========
  // Ogni palette è un array di hex. Aggiunte: NES16, Apple II 6, Amiga 12,
  // Teletext 8, Solarized 16, Vaporwave 8 (pazza), Neon Pop 8 (pazza).
  const palettes = [
    // 0 CGA 8
    ['#000000','#FF0000','#00FF00','#FFFF00','#0000FF','#FF00FF','#00FFFF','#FFFFFF'],
    // 1 EGA 16
    ['#000000','#0000AA','#00AA00','#00AAAA','#AA0000','#AA00AA','#AA5500','#AAAAAA','#555555','#5555FF','#55FF55','#55FFFF','#FF5555','#FF55FF','#FFFF55','#FFFFFF'],
    // 2 ZX Spectrum 8
    ['#000000','#0000D7','#D70000','#D700D7','#00D700','#00D7D7','#D7D700','#D7D7D7'],
    // 3 Game Boy 4
    ['#0F380F','#306230','#8BAC0F','#9BBC0F'],
    // 4 C64 16
    ['#000000','#FFFFFF','#880000','#AAFFEE','#CC44CC','#00CC55','#0000AA','#EEEE77','#DD8855','#664400','#FF7777','#333333','#777777','#AAFF66','#0088FF','#BBBBBB'],
    // 5 NES 16 (selezione compatta)
    ['#7C7C7C','#0000FC','#0000BC','#4428BC','#940084','#A80020','#A81000','#881400','#503000','#007800','#006800','#005800','#004058','#000000','#BCBCBC','#F8F8F8'],
    // 6 Apple II 6 (classico)
    ['#000000','#FFFFFF','#00FF00','#FF00FF','#00FFFF','#FF8000'],
    // 7 Amiga 12 (mix)
    ['#000000','#1E1E1E','#3AA241','#41BEE8','#1F6FBE','#8E44AD','#E74C3C','#F39C12','#F1C40F','#2ECC71','#ECF0F1','#FFFFFF'],
    // 8 Teletext 8 (BBC)
    ['#000000','#FF0000','#00FF00','#FFFF00','#0000FF','#FF00FF','#00FFFF','#FFFFFF'],
    // 9 Solarized 16
    ['#002B36','#073642','#586E75','#657B83','#839496','#93A1A1','#EEE8D5','#FDF6E3','#B58900','#CB4B16','#DC322F','#D33682','#6C71C4','#268BD2','#2AA198','#859900'],
    // 10 Vaporwave 8 (pazza)
    ['#2D1E2F','#E84393','#6C5CE7','#00B894','#55EFC4','#FD79A8','#A29BFE','#FFEAA7'],
    // 11 Neon Pop 8 (pazza)
    ['#000000','#00FFD1','#FF2079','#00A3FF','#FFEA00','#FF6B00','#B300FF','#FFFFFF'],
  ];
  let currentPalette = palettes[colorModeIdx];
  let paletteRGB = hexPaletteToRGB(currentPalette);
  // ======== /PALETTE ========

  // Bayer 8×8
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
    let cnv;

    p.setup = () => {
      const { w, h } = getCanvasSize4x5();
      cnv = p.createCanvas(w, h);
      cnv.parent(els.canvasWrap);
      p.pixelDensity(1);
      p.noSmooth();
      p.frameRate(30);
      p.background(getStageBg());
      createOrResizeBuffers(p);
      bindUI(p);
      bindPointer(p, cnv);
      bindHotkeys(p);
      bindDnD(p);
    };

    p.windowResized = () => {
      const { w, h } = getCanvasSize4x5();
      p.resizeCanvas(w, h, true);
      p.background(getStageBg());
      createOrResizeBuffers(p);
      recalcMinScale(p);
      markDirty();
    };

    p.draw = () => {
      if (processedImg) p.image(processedImg, 0, 0);
      else p.background(getStageBg());

      if (overlayOn) drawOverlay(p);

      if (dirty && !working) {
        working = true;
        try {
          renderViewToBuffer(p);
          processedImg = processOnce(p);
        } catch (err) {
          console.error('Processing error:', err);
        } finally {
          working = false;
          dirty = false;
        }
      }

      updateFPS(p);
    };

    // Helpers dimensioni / stile
    function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    function getStageBg(){ return cssVar('--stage') || '#0b0f16'; }
    function updateFPS(p){
      const now = performance.now();
      if (!els.infoFps) return;
      if (!p._lastFpsUpdate || now - p._lastFpsUpdate > 250) {
        els.infoFps.textContent = `FPS: ${Math.round(p.frameRate())}`;
        p._lastFpsUpdate = now;
      }
    }

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

    function createOrResizeBuffers(p){
      if (viewBuffer) viewBuffer.remove();
      viewBuffer = p.createGraphics(p.width, p.height);
      viewBuffer.pixelDensity(1);
      viewBuffer.noSmooth();

      if (lowBuffer) { lowBuffer.remove(); lowBuffer = null; }
    }

    function ensureLowBuffer(p, W, H){
      if (!lowBuffer || lowBuffer.width !== W || lowBuffer.height !== H) {
        if (lowBuffer) lowBuffer.remove();
        lowBuffer = p.createGraphics(W, H);
        lowBuffer.pixelDensity(1);
        lowBuffer.noSmooth();
        ensureErrBuffers(W, H);
      }
    }

    function ensureErrBuffers(W, H){
      if (errW !== W || errH !== H || !errR) {
        errW = W; errH = H;
        errR = new Float32Array(W*H);
        errG = new Float32Array(W*H);
        errB = new Float32Array(W*H);
      } else {
        errR.fill(0); errG.fill(0); errB.fill(0);
      }
    }

    function bindUI(p){
      // File
      els.fileImg?.addEventListener('change', (evt)=>{
        const file = evt.target.files && evt.target.files[0]; if (!file) return;
        loadImageFromFile(p, file);
      });

      // Export
      els.btnPng?.addEventListener('click', ()=>{
        const scale = Number(els.pngScale?.value||'1')||1;
        savePNGScaled(p, scale);
      });
      els.btn1080?.addEventListener('click', ()=> exportTarget(p, 1080, 1350));
      els.btn2160?.addEventListener('click', ()=> exportTarget(p, 2160, 2700));

      // Parametri
      els.uiPalette?.addEventListener('change', (e)=>{
        colorModeIdx = Number(e.target.value)||0;
        currentPalette = palettes[colorModeIdx];
        paletteRGB = hexPaletteToRGB(currentPalette);
        markDirty();
      });

      els.uiContrast?.addEventListener('input', (e)=>{
        contrastBoost = Number(e.target.value);
        els.uiContrastVal.textContent = contrastBoost.toFixed(1);
        markDirty();
      });

      els.uiDither?.addEventListener('change', (e)=>{
        ditherType = Number(e.target.value)||0;
        markDirty();
      });

      els.uiBlock?.addEventListener('input', (e)=>{
        blockSize = Number(e.target.value)||1;
        els.uiBlockVal.textContent = String(blockSize);
        markDirty();
      });

      els.uiTemporal?.addEventListener('change', (e)=>{
        temporalDither = !!e.target.checked;
        markDirty();
      });

      els.uiScanlines?.addEventListener('change', (e)=>{
        scanlines = !!e.target.checked;
        markDirty();
      });

      els.uiScanInt?.addEventListener('input', (e)=>{
        scanlineIntensity = Number(e.target.value);
        els.uiScanIntVal.textContent = scanlineIntensity.toFixed(1);
        markDirty();
      });

      els.uiBleed?.addEventListener('input', (e)=>{
        colorBleed = Number(e.target.value);
        els.uiBleedVal.textContent = colorBleed.toFixed(2);
        markDirty();
      });

      // Inquadratura
      els.uiZoom?.addEventListener('input', (e)=>{
        const val = Number(e.target.value)||view.minScale;
        setScale(p, val);
        markDirty();
      });
      els.btnResetView?.addEventListener('click', ()=>{
        centerView(); setScale(p, view.minScale); markDirty();
      });
      els.btnFitW?.addEventListener('click', ()=>{ fitWidth(p); markDirty(); });
      els.btnFitH?.addEventListener('click', ()=>{ fitHeight(p); markDirty(); });
      els.uiOverlay?.addEventListener('change', (e)=> overlayOn = !!e.target.checked);
    }

    function bindPointer(p, cnv){
      cnv.mousePressed(()=>{
        if (!originalImg) return;
        view.dragging = true;
        els.canvasWrap?.classList.add('dragging');
        view.lastX = p.mouseX; view.lastY = p.mouseY;
      });
      p.mouseDragged = ()=>{
        if (!view.dragging || !originalImg) return;
        const dx = p.mouseX - view.lastX;
        const dy = p.mouseY - view.lastY;
        view.lastX = p.mouseX; view.lastY = p.mouseY;
        view.posX += dx; view.posY += dy;
        clampPosition(p); markDirty();
      };
      p.mouseReleased = ()=>{ view.dragging = false; els.canvasWrap?.classList.remove('dragging'); };
      p.doubleClicked = ()=>{
        if (!originalImg) return;
        if (p.keyIsDown(p.SHIFT)) {
          const s1 = p.width / originalImg.width;
          const s2 = p.height / originalImg.height;
          if (Math.abs(view.scale - Math.max(s1,s2)) < 1e-3) { (s1 >= s2) ? fitHeight(p) : fitWidth(p); }
          else { setScale(p, Math.max(s1,s2)); centerView(); }
        } else {
          centerView(); setScale(p, view.minScale);
        }
        markDirty();
      };
      cnv.mouseWheel((evt)=>{
        if (!originalImg) return;
        const factor = Math.exp(-evt.deltaY * 0.0015);
        zoomAtPoint(p, view.scale * factor, p.mouseX, p.mouseY);
        markDirty();
        return false;
      });
    }

    function bindHotkeys(p){
      window.addEventListener('keydown', (e)=>{
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (!originalImg) return;

        const step = e.shiftKey ? 10 : 1;
        let used = false;

        switch(e.key){
          case 'ArrowLeft':  view.posX -= step; used = true; break;
          case 'ArrowRight': view.posX += step; used = true; break;
          case 'ArrowUp':    view.posY -= step; used = true; break;
          case 'ArrowDown':  view.posY += step; used = true; break;
          case '0':          centerView(); setScale(p, view.minScale); used = true; break;
        }
        if (used){ clampPosition(p); markDirty(); e.preventDefault(); }
      });
    }

    function bindDnD(p){
      if (!els.canvasWrap) return;
      ['dragenter','dragover'].forEach(ev=>
        els.canvasWrap.addEventListener(ev, (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; })
      );
      els.canvasWrap.addEventListener('drop', (e)=>{
        e.preventDefault();
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadImageFromFile(p, file);
      });
    }

    function loadImageFromFile(p, file){
      const url = URL.createObjectURL(file);
      p.loadImage(url, (img)=>{
        originalImg = img;
        els.infoSource.textContent = `Sorgente: ${file.name || 'File'}`;
        els.canvasWrap?.classList.add('can-pan');
        recalcMinScale(p);
        centerView();
        markDirty();
        URL.revokeObjectURL(url);
      });
    }

    // ---------- Inquadratura & rendering ----------
    function recalcMinScale(p){
      if (!originalImg){ view.minScale = 1; setScale(p, 1); return; }
      const s1 = p.width  / originalImg.width;   // fit width
      const s2 = p.height / originalImg.height;  // fit height
      view.minScale = Math.max(s1, s2);          // cover
      if (view.scale < view.minScale) setScale(p, view.minScale);

      if (els.uiZoom){
        els.uiZoom.min = (Math.round(view.minScale*1000)/1000).toString();
        els.uiZoom.max = (Math.round(view.minScale*3000)/1000).toString();
        els.uiZoom.value = String(view.scale);
      }
      clampPosition(p);
    }

    function centerView(){ view.posX = 0; view.posY = 0; }

    function setScale(p, v){
      view.scale = Math.max(view.minScale, v);
      if (els.uiZoomVal) els.uiZoomVal.textContent = `${view.scale.toFixed(2)}×`;
      if (els.uiZoom && els.uiZoom.value !== String(view.scale)) els.uiZoom.value = String(view.scale);
      clampPosition(p);
    }

    function zoomAtPoint(p, newScale, mx, my){
      newScale = Math.max(view.minScale, newScale);
      const cx = p.width/2, cy = p.height/2;
      const X = (mx - cx - view.posX) / view.scale;
      const Y = (my - cy - view.posY) / view.scale;
      view.scale = newScale;
      view.posX = mx - cx - newScale * X;
      view.posY = my - cy - newScale * Y;
      if (els.uiZoom){ els.uiZoom.value = String(view.scale); }
      if (els.uiZoomVal){ els.uiZoomVal.textContent = `${view.scale.toFixed(2)}×`; }
      clampPosition(p);
    }

    function clampPosition(p){
      if (!originalImg) return;
      const sw = originalImg.width * view.scale;
      const sh = originalImg.height * view.scale;
      const maxX = Math.max(0, (sw - p.width)  / 2);
      const maxY = Math.max(0, (sh - p.height) / 2);
      view.posX = Math.min(maxX, Math.max(-maxX, view.posX));
      view.posY = Math.min(maxY, Math.max(-maxY, view.posY));
    }

    function fitWidth(p){
      if (!originalImg) return;
      const s1 = p.width / originalImg.width;
      setScale(p, Math.max(s1, view.minScale));
      centerView();
    }

    function fitHeight(p){
      if (!originalImg) return;
      const s2 = p.height / originalImg.height;
      setScale(p, Math.max(s2, view.minScale));
      centerView();
    }

    function renderViewToBuffer(p){
      if (!originalImg || !viewBuffer) return;
      viewBuffer.background(getStageBg());
      viewBuffer.push();
      viewBuffer.translate(p.width/2 + view.posX, p.height/2 + view.posY);
      viewBuffer.scale(view.scale);
      viewBuffer.image(originalImg, -originalImg.width/2, -originalImg.height/2);
      viewBuffer.pop();
    }

    // ---------- Processing UNA VOLTA ----------
    function processOnce(p){
      const newW = Math.max(1, Math.floor(p.width/(blockSize*2)));
      const newH = Math.max(1, Math.floor(p.height/(blockSize*2)));

      ensureLowBuffer(p, newW, newH);
      lowBuffer.clear();
      lowBuffer.image(viewBuffer, 0, 0, newW, newH);
      const src = lowBuffer.get();

      errR.fill(0); errG.fill(0); errB.fill(0);

      src.loadPixels();
      const out = p.createImage(newW, newH);
      out.loadPixels();

      const randJitter = temporalDither ? 8 : 0;

      for (let y=0; y<newH; y++){
        for (let x=0; x<newW; x++){
          const idx = (x + y*newW)*4;
          let r = src.pixels[idx+0];
          let g = src.pixels[idx+1];
          let b = src.pixels[idx+2];

          const eIndex = x + y*newW;
          r = clamp((r-128)*contrastBoost + 128 + errR[eIndex], 0, 255);
          g = clamp((g-128)*contrastBoost + 128 + errG[eIndex], 0, 255);
          b = clamp((b-128)*contrastBoost + 128 + errB[eIndex], 0, 255);

          let [qr,qg,qb] = quantizeColor(r, g, b);

          switch(ditherType){
            case 0: ditherFloyd(x,y, r,g,b, qr,qg,qb, newW,newH); break;
            case 1: {
              const th = bayer8x8[x&7][y&7]*(255/64) + randJitter;
              if (avgBrightness(r,g,b) <= th){ const k = paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
              break;
            }
            case 2: {
              const rt = Math.random()*255 + randJitter;
              if (avgBrightness(r,g,b) <= rt){ const k = paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; }
              break;
            }
            case 3: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'jarvis'); break;
            case 4: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'atkinson'); break;
            case 5: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'albie'); break;
            case 6: {
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
      applyRetroEffectsTo(out);
      return out;
    }

    // Dithering helpers
    function ditherFloyd(x,y, r,g,b, qr,qg,qb, W,H){
      const er = r-qr, eg = g-qg, eb = b-qb;
      diffuse(x+1,y,   er,eg,eb, 7/16, W,H);
      diffuse(x-1,y+1, er,eg,eb, 3/16, W,H);
      diffuse(x,  y+1, er,eg,eb, 5/16, W,H);
      diffuse(x+1,y+1, er,eg,eb, 1/16, W,H);
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
    }
    function diffuse(x,y, er,eg,eb, w, W,H){
      if (x>=0 && x<W && y>=0 && y<H){
        const i = x + y*W;
        errR[i]+=er*w; errG[i]+=eg*w; errB[i]+=eb*w;
      }
    }

    function applyRetroEffectsTo(img){
      if (!img) return;
      img.loadPixels();
      const w = img.width, h = img.height, pix = img.pixels;

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
      img.updatePixels();
    }

    // Overlay (solo visuale)
    function drawOverlay(p){
      p.push();
      p.noFill();
      p.stroke(255, 128);
      p.strokeWeight(1);
      const a = p.width/3;
      p.line(a, 0, a, p.height);
      p.line(2*a, 0, 2*a, p.height);
      const b = p.height/3;
      p.line(0, b, p.width, b);
      p.line(0, 2*b, p.width, 2*b);
      p.line(p.width/2, 0, p.width/2, p.height);
      p.line(0, p.height/2, p.width, p.height/2);
      p.pop();
    }

    // Export
    function savePNGScaled(p, scale=1){
      const w = Math.round(p.width*scale), h = Math.round(p.height*scale);
      const g = p.createGraphics(w,h); g.pixelDensity(1); g.noSmooth();
      g.background(getStageBg());
      if (processedImg){ g.image(processedImg, 0,0, w,h); }
      g.save('retro_export.png'); g.remove();
    }
    function exportTarget(p, W, H){
      const scale = W / p.width; // canvas è 4:5
      savePNGScaled(p, scale);
    }

    function markDirty(){ dirty = true; }
  };

  new p5(s);

  // Utils palette
  function hexPaletteToRGB(arr){ return arr.map(h=>hexToRgb(h)); }
  function hexToRgb(hex){
    const c = hex.replace('#','');
    const n = parseInt(c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c, 16);
    return [ (n>>16)&255, (n>>8)&255, n&255 ];
  }

  // Quantizzazione: nearest color
  function quantizeColor(r,g,b){
    let minDist = 1e12, idx = 0;
    const pal = paletteRGB;
    for (let i=0;i<pal.length;i++){
      const pr=pal[i][0], pg=pal[i][1], pb=pal[i][2];
      const dr=r-pr, dg=g-pg, db=b-pb; const d = dr*dr + dg*dg + db*db;
      if (d<minDist){ minDist=d; idx=i; }
    }
    return pal[idx];
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
  function clamp(v, lo, hi){ return v<lo?lo:(v>hi?hi:v); }
})();
