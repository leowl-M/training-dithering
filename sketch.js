// Retro Image Processor – p5.js
// Step 1–4–5: sorgenti (image/video/camera) • registrazione WebM • performance+worker
// • selezione camera + torcia + stato + timer REC
// • export MP4/GIF (beta) con ffmpeg.wasm opzionale

(function(){
  // --- Util immediate (ordine corretto) ---
  function hexToRgb(hex){
    const c = String(hex).replace('#','');
    const n = parseInt(c.length===3 ? c.split('').map(ch=>ch+ch).join('') : c, 16);
    return [ (n>>16)&255, (n>>8)&255, n&255 ];
  }
  function hexPaletteToRGB(arr){ return arr.map(h => hexToRgb(h)); }
  function clamp(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }
  function avgBrightness(r,g,b){ return (r + g + b) / 3; }
  function hhmmss(ms){ const s=Math.floor(ms/1000), m=Math.floor(s/60); const ss=String(s%60).padStart(2,'0'); return `${String(m).padStart(2,'0')}:${ss}`; }

  // ==== Riferimenti DOM ====
  const els = {
    canvasWrap: document.getElementById('canvasWrap'),
    infoSource: document.getElementById('infoSource'),
    infoFps: document.getElementById('infoFps'),

    // Input file / camera
    fileImg: document.getElementById('fileImg'),
    fileVideo: document.getElementById('fileVideo'),
    btnCamStart: document.getElementById('btnCamStart'),
    btnCamStop: document.getElementById('btnCamStop'),
    btnSnap: document.getElementById('btnSnap'),
    capturePhoto: document.getElementById('capturePhoto'),
    captureVideo: document.getElementById('captureVideo'),

    // Camera UX
    camSelect: document.getElementById('camSelect'),
    btnCamRefresh: document.getElementById('btnCamRefresh'),
    btnTorch: document.getElementById('btnTorch'),
    camInfo: document.getElementById('camInfo'),

    // Registrazione
    btnRec: document.getElementById('btnRec'),
    btnStopRec: document.getElementById('btnStopRec'),
    recMic: document.getElementById('recMic'),
    recFps: document.getElementById('recFps'),
    recDot: document.getElementById('recDot'),
    recDownload: document.getElementById('recDownload'),
    micSelect: document.getElementById('micSelect'),
    recTimer: document.getElementById('recTimer'),

    // Prestazioni
    liveQuality: document.getElementById('liveQuality'),
    liveQualityVal: document.getElementById('liveQualityVal'),
    procEvery: document.getElementById('procEvery'),
    liveFps: document.getElementById('liveFps'),
    useWorker: document.getElementById('useWorker'),
    exportHQ: document.getElementById('exportHQ'),
    perfInfo: document.getElementById('perfInfo'),

    // Export
    btnPng: document.getElementById('btnPng'),
    pngScale: document.getElementById('pngScale'),
    btn1080: document.getElementById('btn1080'),
    btn2160: document.getElementById('btn2160'),

    // Export video (beta)
    btnToMp4: document.getElementById('btnToMp4'),
    btnToGif: document.getElementById('btnToGif'),
    vidDownload: document.getElementById('vidDownload'),
    ffmpegStatus: document.getElementById('ffmpegStatus'),

    // Tema
    themeToggle: document.getElementById('themeToggle'),

    // Parametri immagine
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
  };

  // ==== Stato sorgenti ====
  let originalImg = null, processedImg = null;
  let sourceKind = 'none'; // 'none' | 'image' | 'video' | 'camera'
  let video = null;        // p5.MediaElement (file video)
  let videoURL = null;
  let cam = null;          // p5.MediaElement (camera live)
  let camTrack = null;     // MediaStreamTrack video corrente (per torcia)
  let selectedCamId = null;
  let selectedMicId = null;
  let continuous = false;  // re-render continuo (video/camera)

  // ==== Registrazione ====
  let canvasEl = null;
  let recorder = null, recStream = null, micStream = null, recChunks = [];
  let isRecording = false, recT0 = 0, recTimerHandle = null;
  let lastRecordingBlob = null;

  // ==== Prestazioni ====
  let qualityLive = 0.85;        // 0.5..1.0 (solo live)
  let processEvery = 2;          // elabora ogni N frame in live
  let frameCounter = 0;
  let liveFpsVal = 30;
  let lastProcMs = 0;

  // ==== Worker ====
  let worker = null;
  let workerActive = false;
  let working = false;           // c'è un processamento in corso (main o worker)
  let dirty = true;              // richiede un nuovo processamento

  // ==== Parametri immagine ====
  const palettes = [
    ['#000000','#FF0000','#00FF00','#FFFF00','#0000FF','#FF00FF','#00FFFF','#FFFFFF'],
    ['#000000','#0000AA','#00AA00','#00AAAA','#AA0000','#AA00AA','#AA5500','#AAAAAA','#555555','#5555FF','#55FF55','#55FFFF','#FF5555','#FF55FF','#FFFF55','#FFFFFF'],
    ['#000000','#0000D7','#D70000','#D700D7','#00D700','#00D7D7','#D7D700','#D7D7D7'],
    ['#0F380F','#306230','#8BAC0F','#9BBC0F'],
    ['#000000','#FFFFFF','#880000','#AAFFEE','#CC44CC','#00CC55','#0000AA','#EEEE77','#DD8855','#664400','#FF7777','#333333','#777777','#AAFF66','#0088FF','#BBBBBB'],
    ['#7C7C7C','#0000FC','#0000BC','#4428BC','#940084','#A80020','#A81000','#881400','#503000','#007800','#006800','#005800','#004058','#000000','#BCBCBC','#F8F8F8'],
    ['#000000','#FFFFFF','#00FF00','#FF00FF','#00FFFF','#FF8000'],
    ['#000000','#1E1E1E','#3AA241','#41BEE8','#1F6FBE','#8E44AD','#E74C3C','#F39C12','#F1C40F','#2ECC71','#ECF0F1','#FFFFFF'],
    ['#000000','#FF0000','#00FF00','#FFFF00','#0000FF','#FF00FF','#00FFFF','#FFFFFF'],
    ['#002B36','#073642','#586E75','#657B83','#839496','#93A1A1','#EEE8D5','#FDF6E3','#B58900','#CB4B16','#DC322F','#D33682','#6C71C4','#268BD2','#2AA198','#859900'],
    ['#2D1E2F','#E84393','#6C5CE7','#00B894','#55EFC4','#FD79A8','#A29BFE','#FFEAA7'],
    ['#000000','#00FFD1','#FF2079','#00A3FF','#FFEA00','#FF6B00','#B300FF','#FFFFFF'],
  ];
  let colorModeIdx = 1; // EGA 16
  let currentPalette = palettes[colorModeIdx];
  let paletteRGB = hexPaletteToRGB(currentPalette);

  let blockSize = 1;
  let ditherType = 0;
  let scanlines = true;
  let temporalDither = false;
  let contrastBoost = 1.4;
  let scanlineIntensity = 0.7;
  let colorBleed = 0.3;
  let overlayOn = false;

  // ==== Vista ====
  const view = { scale:1, minScale:1, posX:0, posY:0, dragging:false, lastX:0, lastY:0 };

  // Offscreen / error diffusion buffers (per processing in main)
  let viewBuffer=null, lowBuffer=null;
  let errW=0, errH=0, errR=null, errG=null, errB=null;

  // ==== Tema ====
  initTheme();
  function initTheme(){
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(saved || (prefersDark ? 'dark' : 'light'));
    els.themeToggle?.addEventListener('click', ()=> setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
  }
  function setTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); }

  // ==== p5 instance ====
  const s = (p) => {
    let cnv;

    p.setup = () => {
      const { w, h } = getCanvasSize4x5();
      cnv = p.createCanvas(w, h);
      canvasEl = cnv.elt;
      cnv.parent(els.canvasWrap);
      p.pixelDensity(1);
      p.noSmooth();
      p.frameRate(liveFpsVal);
      p.background(getStageBg());
      createOrResizeBuffers(p);
      bindUI(p);
      bindPointer(p, cnv);
      bindHotkeys(p);
      bindDnD(p);
      updateRecUI(false);
      updatePerfInfo();
      // prime elenco device (non tutti i browser mostrano i label prima del consenso)
      safeEnumerateDevices();
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

      // Live: chiede re-render, ma con skip
      if (continuous){
        frameCounter++;
        if (frameCounter % processEvery === 0) dirty = true;
      }

      if (dirty && !working){
        working = true;
        try {
          renderViewToBuffer(p);
          const t0 = performance.now();
          if (workerActive) {
            processWithWorker(p).then(img=>{
              processedImg = img;
              lastProcMs = performance.now() - t0;
              working = false; dirty = false;
              updatePerfInfo();
            }).catch(err=>{
              console.error('Worker error:', err);
              working = false; dirty = false;
              updatePerfInfo('errore worker');
            });
          } else {
            processedImg = processOnce(p, getCurrentQuality());
            lastProcMs = performance.now() - t0;
            working = false; dirty = false;
            updatePerfInfo();
          }
        } catch (err) {
          console.error('Processing error:', err);
          working = false; dirty = false;
          updatePerfInfo('errore');
        }
      }
      updateFPS(p);
    };

    // === Helpers UI/canvas ===
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
    function updatePerfInfo(extra){
      if (!els.perfInfo) return;
      const w = workerActive ? 'on' : 'off';
      const ms = lastProcMs ? `${lastProcMs.toFixed(1)} ms` : '— ms';
      els.perfInfo.textContent = `proc: ${ms} • worker: ${w}${extra?` • ${extra}`:''}`;
    }
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

    // === Bindings ===
    function bindUI(p){
      // File immagine
      els.fileImg?.addEventListener('change', (evt)=>{
        const file = evt.target.files && evt.target.files[0]; if (!file) return;
        loadImageFromFile(p, file);
        evt.target.value = '';
      });
      // File video (p5.createVideo per evitare frame neri)
      els.fileVideo?.addEventListener('change', (evt)=>{
        const file = evt.target.files && evt.target.files[0]; if (!file) return;
        loadVideoFromFile(p, file);
        evt.target.value = '';
      });

      // Input nativi mobile
      els.capturePhoto?.addEventListener('change', (evt)=>{
        const file = evt.target.files && evt.target.files[0]; if (!file) return;
        loadImageFromFile(p, file);
        evt.target.value = '';
      });
      els.captureVideo?.addEventListener('change', (evt)=>{
        const file = evt.target.files && evt.target.files[0]; if (!file) return;
        loadVideoFromFile(p, file);
        evt.target.value = '';
      });

      // Camera
      els.btnCamStart?.addEventListener('click', ()=> startCamera(p, selectedCamId));
      els.btnCamStop?.addEventListener('click', ()=> stopCamera());
      els.btnSnap?.addEventListener('click', ()=> snapFromLive(p));
      els.camSelect?.addEventListener('change', (e)=>{ selectedCamId = e.target.value || null; });
      els.btnCamRefresh?.addEventListener('click', ()=> safeEnumerateDevices().catch(()=>{}));
      els.btnTorch?.addEventListener('click', ()=> toggleTorch());

      // Registrazione
      els.btnRec?.addEventListener('click', ()=> startRecording());
      els.btnStopRec?.addEventListener('click', ()=> stopRecording());
      els.micSelect?.addEventListener('change', (e)=>{ selectedMicId = e.target.value || null; });

      // Prestazioni
      els.liveQuality?.addEventListener('input', (e)=>{
        qualityLive = Number(e.target.value)||0.85;
        els.liveQualityVal && (els.liveQualityVal.textContent = qualityLive.toFixed(2));
        markDirty();
      });
      els.procEvery?.addEventListener('change', (e)=>{ processEvery = Math.max(1, Number(e.target.value)||2); });
      els.liveFps?.addEventListener('change', (e)=>{ liveFpsVal = Number(e.target.value)||30; p.frameRate(liveFpsVal); });
      els.useWorker?.addEventListener('change', (e)=>{ if (e.target.checked) initWorker(); else killWorker(); });
      els.exportHQ?.addEventListener('change', ()=>{}); // letto in export

      // Export immagini
      els.btnPng?.addEventListener('click', ()=>{ const scale = Number(els.pngScale?.value||'1')||1; savePNGScaled(p, scale); });
      els.btn1080?.addEventListener('click', ()=> exportTarget(p, 1080, 1350));
      els.btn2160?.addEventListener('click', ()=> exportTarget(p, 2160, 2700));

      // Export video (ffmpeg)
      els.btnToMp4?.addEventListener('click', ()=> convertLastRecording('mp4').catch(err=> alert('Conversione MP4 fallita: ' + err)));
      els.btnToGif?.addEventListener('click', ()=> convertLastRecording('gif').catch(err=> alert('Conversione GIF fallita: ' + err)));

      // Parametri immagine
      els.uiPalette?.addEventListener('change', (e)=>{ colorModeIdx = Number(e.target.value)||0; currentPalette = palettes[colorModeIdx]; paletteRGB = hexPaletteToRGB(currentPalette); markDirty(); });
      els.uiContrast?.addEventListener('input', (e)=>{ contrastBoost = Number(e.target.value); els.uiContrastVal.textContent = contrastBoost.toFixed(1); markDirty(); });
      els.uiDither?.addEventListener('change', (e)=>{ ditherType = Number(e.target.value)||0; markDirty(); });
      els.uiBlock?.addEventListener('input', (e)=>{ blockSize = Number(e.target.value)||1; els.uiBlockVal.textContent = String(blockSize); markDirty(); });
      els.uiTemporal?.addEventListener('change', (e)=>{ temporalDither = !!e.target.checked; markDirty(); });
      els.uiScanlines?.addEventListener('change', (e)=>{ scanlines = !!e.target.checked; markDirty(); });
      els.uiScanInt?.addEventListener('input', (e)=>{ scanlineIntensity = Number(e.target.value); els.uiScanIntVal.textContent = scanlineIntensity.toFixed(1); markDirty(); });
      els.uiBleed?.addEventListener('input', (e)=>{ colorBleed = Number(e.target.value); els.uiBleedVal.textContent = colorBleed.toFixed(2); markDirty(); });

      // Inquadratura
      els.uiZoom?.addEventListener('input', (e)=>{ const val = Number(e.target.value)||view.minScale; setScale(p, val); markDirty(); });
      els.btnResetView?.addEventListener('click', ()=>{ centerView(); setScale(p, view.minScale); markDirty(); });
      els.btnFitW?.addEventListener('click', ()=>{ fitWidth(p); markDirty(); });
      els.btnFitH?.addEventListener('click', ()=>{ fitHeight(p); markDirty(); });
    }

    function bindPointer(p, cnv){
      cnv.mousePressed(()=>{ if (!hasSource()) return; view.dragging=true; els.canvasWrap?.classList.add('dragging'); view.lastX=p.mouseX; view.lastY=p.mouseY; });
      p.mouseDragged = ()=>{ if (!view.dragging || !hasSource()) return; const dx=p.mouseX-view.lastX, dy=p.mouseY-view.lastY; view.lastX=p.mouseX; view.lastY=p.mouseY; view.posX+=dx; view.posY+=dy; clampPosition(p); markDirty(); };
      p.mouseReleased = ()=>{ view.dragging=false; els.canvasWrap?.classList.remove('dragging'); };
      p.doubleClicked = ()=>{
        if (!hasSource()) return;
        const dims = getSourceDims(); if (!dims) return;
        const s1 = p.width / dims.w, s2 = p.height / dims.h;
        if (p.keyIsDown(p.SHIFT)) { if (Math.abs(view.scale - Math.max(s1,s2)) < 1e-3) { (s1 >= s2) ? fitHeight(p) : fitWidth(p); } else { setScale(p, Math.max(s1,s2)); centerView(); } }
        else { centerView(); setScale(p, view.minScale); }
        markDirty();
      };
      cnv.mouseWheel((evt)=>{ if (!hasSource()) return false; const factor = Math.exp(-evt.deltaY * 0.0015); zoomAtPoint(p, view.scale*factor, p.mouseX, p.mouseY); markDirty(); return false; });
    }

    function bindHotkeys(p){
      window.addEventListener('keydown', (e)=>{
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag==='input'||tag==='select'||tag==='textarea') return;
        if (!hasSource()) return;
        const step = e.shiftKey ? 10 : 1;
        let used=false;
        switch(e.key){
          case 'ArrowLeft':  view.posX -= step; used=true; break;
          case 'ArrowRight': view.posX += step; used=true; break;
          case 'ArrowUp':    view.posY -= step; used=true; break;
          case 'ArrowDown':  view.posY += step; used=true; break;
          case '0':          centerView(); setScale(p, view.minScale); used=true; break;
        }
        if (used){ clampPosition(p); markDirty(); e.preventDefault(); }
      });
    }

    function bindDnD(p){
      if (!els.canvasWrap) return;
      ['dragenter','dragover'].forEach(ev=> els.canvasWrap.addEventListener(ev, (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; }));
      els.canvasWrap.addEventListener('drop', (e)=>{
        e.preventDefault();
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file){ if (file.type.startsWith('video/')) loadVideoFromFile(p, file); else loadImageFromFile(p, file); }
      });
    }

    // === Sorgenti ===
    function setSourceKind(k){
      sourceKind = k;
      continuous = (k==='video' || k==='camera');
      els.btnSnap && (els.btnSnap.disabled = !(k==='video' || k==='camera'));
      if (continuous) markDirty();
    }
    function hasSource(){
      if (originalImg) return true;
      if (sourceKind==='video' && video && video.elt && video.elt.readyState >= 2) return true;
      if (sourceKind==='camera' && cam && cam.elt && cam.elt.readyState >= 2) return true;
      return false;
    }
    function getSourceDims(){
      if (originalImg) return { w: originalImg.width, h: originalImg.height };
      if (sourceKind==='video' && video && video.elt) return { w: video.elt.videoWidth||640, h: video.elt.videoHeight||480 };
      if (sourceKind==='camera' && cam && cam.elt) return { w: cam.elt.videoWidth||cam.width||640, h: cam.elt.videoHeight||cam.height||480 };
      return null;
    }

    function loadImageFromFile(p, file){
      const url = URL.createObjectURL(file);
      p.loadImage(url, (img)=>{
        stopVideoFile();
        originalImg = img;
        setSourceKind('image');
        els.infoSource.textContent = `Sorgente: ${file.name || 'Immagine'}`;
        els.canvasWrap?.classList.add('can-pan');
        recalcMinScale(p);
        centerView();
        markDirty();
        URL.revokeObjectURL(url);
      });
    }

    function loadVideoFromFile(p, file){
      stopVideoFile();
      originalImg = null;
      videoURL = URL.createObjectURL(file);
      video = p.createVideo([videoURL], ()=>{});
      video.attribute('playsinline', '');
      video.volume(0);  // niente blocchi autoplay
      video.loop();
      video.hide();
      const onReady = ()=>{
        video.play();
        setSourceKind('video');
        els.infoSource.textContent = `Sorgente: ${file.name || 'Video'}`;
        els.canvasWrap?.classList.add('can-pan');
        recalcMinScale(p);
        centerView();
        markDirty();
        updateCamInfo(); // mostra info anche per video file
      };
      video.elt.addEventListener('loadeddata', onReady, { once:true });
      video.elt.addEventListener('canplay', onReady, { once:true });
    }

    function stopVideoFile(){
      if (video){ try{ video.stop(); }catch{} try{ video.remove(); }catch{} }
      video = null;
      if (videoURL){ URL.revokeObjectURL(videoURL); videoURL = null; }
      if (sourceKind==='video') setSourceKind('none');
    }

    async function startCamera(p, deviceId=null){
      if (cam) stopCamera();
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } :
                (isMobile() ? { facingMode: { exact:'environment' } } : { facingMode: 'user' }),
        audio: false
      };
      try{
        cam = p.createCapture(constraints, ()=>{
          cam.elt.setAttribute('playsinline',''); cam.elt.muted = true; cam.hide();
          originalImg = null; setSourceKind('camera');
          els.infoSource.textContent = 'Sorgente: Camera (live)'; els.canvasWrap?.classList.add('can-pan');
          if (cam.elt){
            cam.elt.onloadedmetadata = ()=>{
              recalcMinScale(p); centerView(); markDirty();
              bindCamTrack(); // torcia + info
              safeEnumerateDevices(); // ora i label sono noti
            };
          }
          updateCamButtons(true);
        });
      } catch(err){
        console.error(err);
        alert('Impossibile accedere alla fotocamera. Verifica i permessi e HTTPS.');
      }
    }
    function stopCamera(){
      if (cam){
        try { cam.remove(); } catch {}
        cam = null;
      }
      camTrack = null;
      if (sourceKind==='camera') setSourceKind('none');
      updateCamButtons(false);
      els.infoSource.textContent = 'Sorgente: —';
      updateTorchBtn(false);
      updateCamInfo();
      markDirty();
    }
    function updateCamButtons(active){
      els.btnCamStart && (els.btnCamStart.disabled = !!active);
      els.btnCamStop && (els.btnCamStop.disabled = !active);
      els.btnSnap && (els.btnSnap.disabled = !(active || sourceKind==='video'));
    }

    // === Torcia / info camera ===
    function isMobile(){ return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
    function bindCamTrack(){
      try{
        const stream = cam?.elt?.srcObject;
        camTrack = stream ? stream.getVideoTracks()[0] : null;
        const caps = camTrack?.getCapabilities ? camTrack.getCapabilities() : {};
        const canTorch = !!caps?.torch;
        updateTorchBtn(canTorch);
      } catch{ updateTorchBtn(false); }
      updateCamInfo();
    }
    function updateTorchBtn(enabled){
      if (!els.btnTorch) return;
      els.btnTorch.disabled = !enabled;
      els.btnTorch.textContent = enabled ? 'Torcia' : 'Torcia (n/d)';
    }
    async function toggleTorch(){
      if (!camTrack) return;
      const caps = camTrack.getCapabilities ? camTrack.getCapabilities() : {};
      if (!caps.torch) return;
      try{
        const settings = camTrack.getSettings ? camTrack.getSettings() : {};
        const current = !!settings.torch;
        await camTrack.applyConstraints({ advanced: [{ torch: !current }] });
      } catch(e){
        console.warn('Torch toggle failed:', e);
        alert('La torcia non è supportata o è bloccata dal dispositivo.');
      }
    }
    function updateCamInfo(){
      if (!els.camInfo) return;
      if (sourceKind==='camera' && cam?.elt){
        const s = cam.elt.srcObject;
        const vt = s ? s.getVideoTracks()[0] : null;
        const set = vt?.getSettings ? vt.getSettings() : {};
        const label = vt?.label || 'Camera';
        const res = (set.width && set.height) ? `${set.width}×${set.height}` : '—';
        els.camInfo.textContent = `${label} • ${res}`;
      } else if (sourceKind==='video' && video?.elt){
        const w = video.elt.videoWidth, h = video.elt.videoHeight;
        els.camInfo.textContent = `File video • ${w||'—'}×${h||'—'}`;
      } else {
        els.camInfo.textContent = '—';
      }
    }

    // === Device enumeration (cam/mic) ===
    async function safeEnumerateDevices(){
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try{
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d=> d.kind==='videoinput');
        const mics = devices.filter(d=> d.kind==='audioinput');

        // Camera select
        if (els.camSelect){
          const prev = els.camSelect.value;
          els.camSelect.innerHTML = '';
          cams.forEach((d,i)=>{
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Camera ${i+1}`;
            els.camSelect.appendChild(opt);
          });
          if (cams.length){
            const toSelect = cams.find(c=> c.deviceId===prev) ? prev : cams[0].deviceId;
            els.camSelect.value = toSelect;
            selectedCamId = toSelect;
          }
        }

        // Mic select
        if (els.micSelect){
          const prev = els.micSelect.value;
          els.micSelect.innerHTML = '';
          const none = document.createElement('option');
          none.value = ''; none.textContent = '— nessuno —';
          els.micSelect.appendChild(none);
          mics.forEach((d,i)=>{
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || `Microfono ${i+1}`;
            els.micSelect.appendChild(opt);
          });
          if (mics.length){
            const toSelect = mics.find(m=> m.deviceId===prev) ? prev : '';
            els.micSelect.value = toSelect;
            selectedMicId = toSelect || null;
          }
        }
      } catch(e){ /* ignora */ }
    }

    function snapFromLive(p){
      if (!(sourceKind==='video' || sourceKind==='camera')) return;
      const dims = getSourceDims(); if (!dims) return;
      const g = p.createGraphics(dims.w, dims.h);
      g.pixelDensity(1); g.noSmooth();
      if (sourceKind==='video' && video) g.image(video, 0, 0, dims.w, dims.h);
      else if (sourceKind==='camera' && cam) g.image(cam, 0, 0, dims.w, dims.h);
      const img = g.get(); g.remove();
      originalImg = img; setSourceKind('image');
      els.infoSource.textContent = 'Sorgente: Snapshot';
      recalcMinScale(p); centerView(); markDirty();
    }

    // === Inquadratura & rendering ===
    function recalcMinScale(p){
      const dims = getSourceDims();
      if (!dims){ view.minScale=1; setScale(p,1); return; }
      const s1 = p.width/dims.w, s2 = p.height/dims.h;
      view.minScale = Math.max(s1,s2);
      if (view.scale < view.minScale) setScale(p, view.minScale);
      if (els.uiZoom){
        els.uiZoom.min = (Math.round(view.minScale*1000)/1000).toString();
        els.uiZoom.max = (Math.round(view.minScale*3000)/1000).toString();
        els.uiZoom.value = String(view.scale);
      }
      clampPosition(p);
    }
    function centerView(){ view.posX=0; view.posY=0; }
    function setScale(p,v){ view.scale=Math.max(view.minScale,v); els.uiZoomVal && (els.uiZoomVal.textContent = `${view.scale.toFixed(2)}×`); els.uiZoom && (els.uiZoom.value=String(view.scale)); clampPosition(p); }
    function zoomAtPoint(p,newScale,mx,my){
      newScale = Math.max(view.minScale, newScale);
      const cx=p.width/2, cy=p.height/2;
      const X = (mx - cx - view.posX) / view.scale;
      const Y = (my - cy - view.posY) / view.scale;
      view.scale = newScale;
      view.posX = mx - cx - newScale * X;
      view.posY = my - cy - newScale * Y;
      els.uiZoom && (els.uiZoom.value=String(view.scale));
      els.uiZoomVal && (els.uiZoomVal.textContent = `${view.scale.toFixed(2)}×`);
      clampPosition(p);
    }
    function clampPosition(p){
      const dims = getSourceDims(); if (!dims) return;
      const sw = dims.w * view.scale, sh = dims.h * view.scale;
      const maxX = Math.max(0, (sw - p.width)/2), maxY = Math.max(0, (sh - p.height)/2);
      view.posX = Math.min(maxX, Math.max(-maxX, view.posX));
      view.posY = Math.min(maxY, Math.max(-maxY, view.posY));
    }
    function fitWidth(p){ const d=getSourceDims(); if(!d) return; const s1=p.width/d.w; setScale(p, Math.max(s1, view.minScale)); centerView(); }
    function fitHeight(p){ const d=getSourceDims(); if(!d) return; const s2=p.height/d.h; setScale(p, Math.max(s2, view.minScale)); centerView(); }

    function renderViewToBuffer(p){
      if (!hasSource() || !viewBuffer) return;
      const dims = getSourceDims(); if (!dims) return;
      viewBuffer.background(getStageBg());
      viewBuffer.push();
      viewBuffer.translate(p.width/2 + view.posX, p.height/2 + view.posY);
      viewBuffer.scale(view.scale);
      if (sourceKind==='video' && video){ viewBuffer.image(video, -dims.w/2, -dims.h/2, dims.w, dims.h); }
      else if (sourceKind==='camera' && cam){ viewBuffer.image(cam, -dims.w/2, -dims.h/2, dims.w, dims.h); }
      else if (originalImg){ viewBuffer.image(originalImg, -originalImg.width/2, -originalImg.height/2); }
      viewBuffer.pop();
    }

    function getCurrentQuality(){ return continuous ? qualityLive : 1.0; }

    // === Processing (main thread) ===
    function processOnce(p, quality=1.0){
      const newW = Math.max(1, Math.floor(p.width /(blockSize*2) * quality));
      const newH = Math.max(1, Math.floor(p.height/(blockSize*2) * quality));
      ensureLowBuffer(p, newW, newH);
      lowBuffer.clear();
      lowBuffer.image(viewBuffer, 0, 0, newW, newH);
      const src = lowBuffer.get();

      ensureErrBuffers(newW, newH);
      errR.fill(0); errG.fill(0); errB.fill(0);

      src.loadPixels();
      const out = p.createImage(newW, newH);
      out.loadPixels();
      const randJitter = temporalDither ? 8 : 0;

      for (let y=0; y<newH; y++){
        for (let x=0; x<newW; x++){
          const idx = (x + y*newW)*4;
          let r=src.pixels[idx], g=src.pixels[idx+1], b=src.pixels[idx+2];
          const eIndex = x + y*newW;
          r = clamp((r-128)*contrastBoost + 128 + errR[eIndex], 0, 255);
          g = clamp((g-128)*contrastBoost + 128 + errG[eIndex], 0, 255);
          b = clamp((b-128)*contrastBoost + 128 + errB[eIndex], 0, 255);
          let [qr,qg,qb] = quantizeColor(r,g,b);
          switch(ditherType){
            case 0: ditherFloyd(x,y, r,g,b, qr,qg,qb, newW,newH); break;
            case 1: { const th=bayer8x8[x&7][y&7]*(255/64) + randJitter; if (avgBrightness(r,g,b) <= th){ const k=paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; } break; }
            case 2: { const rt=Math.random()*255 + randJitter; if (avgBrightness(r,g,b) <= rt){ const k=paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; } break; }
            case 3: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'jarvis'); break;
            case 4: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'atkinson'); break;
            case 5: ditherKernel(x,y, r,g,b, qr,qg,qb, newW,newH, 'albie'); break;
            case 6: { const avg = neighborhoodAvg(src, x,y,newW,newH); if (avgBrightness(r,g,b) <= avg){ const k=paletteRGB[0]; qr=k[0]; qg=k[1]; qb=k[2]; } break; }
          }
          out.pixels[idx]=qr; out.pixels[idx+1]=qg; out.pixels[idx+2]=qb; out.pixels[idx+3]=255;
        }
      }

      out.updatePixels();
      out.resize(p.width, p.height);
      applyRetroEffectsTo(out);
      return out;
    }

    function ensureLowBuffer(p, W,H){
      if (!lowBuffer || lowBuffer.width!==W || lowBuffer.height!==H){
        if (lowBuffer) lowBuffer.remove();
        lowBuffer = p.createGraphics(W, H);
        lowBuffer.pixelDensity(1); lowBuffer.noSmooth();
      }
    }
    function ensureErrBuffers(W,H){
      if (errW!==W || errH!==H || !errR){
        errW=W; errH=H;
        errR=new Float32Array(W*H); errG=new Float32Array(W*H); errB=new Float32Array(W*H);
      } else { errR.fill(0); errG.fill(0); errB.fill(0); }
    }

    // === Processing (worker) ===
    function initWorker(){
      try{
        worker = new Worker('worker.js', { type:'classic' });
        worker.onmessage = (ev)=>{
          const { width, height, data } = ev.data || {};
          if (!width || !height || !data) { working=false; dirty=false; updatePerfInfo('bad msg'); return; }
          const img = p.createImage(width, height);
          img.loadPixels();
          img.pixels.set(new Uint8ClampedArray(data));
          img.updatePixels();
          img.resize(p.width, p.height);
          applyRetroEffectsTo(img);
          processedImg = img;
          working=false; dirty=false;
          updatePerfInfo();
        };
        worker.onerror = (e)=>{ console.error('Worker error', e); killWorker(); updatePerfInfo('worker off'); };
        workerActive = true;
        updatePerfInfo();
      } catch(e){
        console.warn('Worker non disponibile:', e);
        workerActive = false;
        worker = null;
        els.useWorker && (els.useWorker.checked = false);
        updatePerfInfo('worker non supportato');
      }
    }
    function killWorker(){
      if (worker){ try{ worker.terminate(); }catch{} }
      worker = null;
      workerActive = false;
    }
    function processWithWorker(p){
      if (!workerActive || !worker) return Promise.reject('worker non attivo');
      const quality = getCurrentQuality();
      const newW = Math.max(1, Math.floor(p.width /(blockSize*2) * quality));
      const newH = Math.max(1, Math.floor(p.height/(blockSize*2) * quality));
      ensureLowBuffer(p, newW, newH);
      lowBuffer.clear();
      lowBuffer.image(viewBuffer, 0, 0, newW, newH);
      const src = lowBuffer.get(); src.loadPixels();
      const data = new Uint8ClampedArray(src.pixels); // copia
      const pal = new Uint8Array(paletteRGB.flat());
      return new Promise((resolve, reject)=>{
        const onMsg = (ev)=>{
          worker.removeEventListener('message', onMsg);
          try {
            const { width, height, data } = ev.data || {};
            const img = p.createImage(width, height);
            img.loadPixels();
            img.pixels.set(new Uint8ClampedArray(data));
            img.updatePixels();
            img.resize(p.width, p.height);
            applyRetroEffectsTo(img);
            resolve(img);
          } catch(err){ reject(err); }
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ cmd:'process', width:newW, height:newH, data, params:{ palette:pal, blockSize, ditherType, temporalDither, contrastBoost } }, [data.buffer, pal.buffer]);
      });
    }

    // === Dithering helpers (main) ===
    const bayer8x8=[[0,32,8,40,2,34,10,42],[48,16,56,24,50,18,58,26],[12,44,4,36,14,46,6,38],[60,28,52,20,62,30,54,22],[3,35,11,43,1,33,9,41],[51,19,59,27,49,17,57,25],[15,47,7,39,13,45,5,37],[63,31,55,23,61,29,53,21]];
    function ditherFloyd(x,y, r,g,b, qr,qg,qb, W,H){ const er=r-qr, eg=g-qg, eb=b-qb; diffuse(x+1,y,er,eg,eb,7/16,W,H); diffuse(x-1,y+1,er,eg,eb,3/16,W,H); diffuse(x,y+1,er,eg,eb,5/16,W,H); diffuse(x+1,y+1,er,eg,eb,1/16,W,H); }
    function ditherKernel(x,y, r,g,b, qr,qg,qb, W,H, mode){
      const er=r-qr, eg=g-qg, eb=b-qb;
      if (mode==='jarvis'){
        const wts=[{dx:-2,dy:0,w:5/48},{dx:-1,dy:0,w:7/48},{dx:1,dy:0,w:7/48},{dx:2,dy:0,w:5/48},{dx:-2,dy:1,w:3/48},{dx:-1,dy:1,w:5/48},{dx:0,dy:1,w:7/48},{dx:1,dy:1,w:5/48},{dx:2,dy:1,w:3/48},{dx:-2,dy:2,w:1/48},{dx:-1,dy:2,w:3/48},{dx:0,dy:2,w:5/48},{dx:1,dy:2,w:3/48},{dx:2,dy:2,w:1/48}];
        for (const it of wts) diffuse(x+it.dx,y+it.dy, er,eg,eb, it.w, W,H);
      } else if (mode==='atkinson'){
        const w=1/8; const pts=[{dx:1,dy:0},{dx:2,dy:0},{dx:-1,dy:1},{dx:0,dy:1},{dx:1,dy:1},{dx:0,dy:2}];
        for (const it of pts) diffuse(x+it.dx,y+it.dy, er,eg,eb, w, W,H);
      } else { const left=(y%2)!==0; const sgn=left?-1:1; diffuse(x+1*sgn,y, er,eg,eb, 0.5, W,H); diffuse(x, y+1, er,eg,eb, 0.25, W,H); diffuse(x+1*sgn, y+1, er,eg,eb, 0.25, W,H); }
    }
    function diffuse(x,y, er,eg,eb, w, W,H){ if (x>=0 && x<W && y>=0 && y<H){ const i=x+y*W; errR[i]+=er*w; errG[i]+=eg*w; errB[i]+=eb*w; } }

    function applyRetroEffectsTo(img){
      if (!img) return;
      img.loadPixels();
      const w=img.width, h=img.height, pix=img.pixels;
      if (scanlines){
        for (let y=0;y<h;y+=2){
          for (let x=0;x<w;x++){
            const i=(x+y*w)*4;
            pix[i]*=scanlineIntensity; pix[i+1]*=scanlineIntensity; pix[i+2]*=scanlineIntensity;
          }
        }
      }
      if (colorBleed>0){
        const clone=new Uint8ClampedArray(pix);
        for (let y=0;y<h;y++){
          for (let x=1;x<w-1;x++){
            const i=(x+y*w)*4, il=(x-1+y*w)*4, ir=(x+1+y*w)*4;
            pix[i  ] = clone[i  ]*(1-colorBleed) + (clone[il]+clone[ir])*0.5*colorBleed;
            pix[i+1] = clone[i+1]*(1-colorBleed) + (clone[il+1]+clone[ir+1])*0.5*colorBleed;
            pix[i+2] = clone[i+2]*(1-colorBleed) + (clone[il+2]+clone[ir+2])*0.5*colorBleed;
          }
        }
      }
      img.updatePixels();
    }

    // Export immagini
    function savePNGScaled(p, scale=1){
      const forceHQ = !!(els.exportHQ && els.exportHQ.checked) && hasSource();
      const w = Math.round(p.width*scale), h = Math.round(p.height*scale);
      const g = p.createGraphics(w,h); g.pixelDensity(1); g.noSmooth();
      g.background(getStageBg());
      if (forceHQ){
        const imgHQ = processOnce(p, 1.0);
        g.image(imgHQ, 0,0, w,h);
      } else {
        if (processedImg){ g.image(processedImg, 0,0, w,h); }
      }
      g.save('retro_export.png'); g.remove();
    }
    function exportTarget(p, W,H){ const scale = W / p.width; savePNGScaled(p, scale); }

    function markDirty(){ dirty=true; }
  };

  new p5(s);

  // ==== Registrazione ====
  function updateRecUI(active){
    isRecording = !!active;
    els.btnRec && (els.btnRec.disabled = active);
    els.btnStopRec && (els.btnStopRec.disabled = !active);
    els.recDot && (els.recDot.style.opacity = active ? '1' : '0.25');
  }
  function pickMimeType(){
    const prefs = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    for (const t of prefs){ if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; }
    return undefined;
  }
  async function startRecording(){
    if (!canvasEl){ alert('Canvas non pronto.'); return; }
    if (!window.MediaRecorder){ alert('MediaRecorder non supportato su questo browser.'); return; }

    const fps = Number(els.recFps?.value || 30) || 30;
    const canvasStream = canvasEl.captureStream(fps);

    // Audio dal microfono (se spuntato) e/o selezionato
    if (els.recMic?.checked){
      try{
        const audioConstr = selectedMicId ? { deviceId: { exact: selectedMicId } } : true;
        micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstr });
      } catch(e){
        console.warn('Audio microfono non disponibile:', e);
        micStream = null;
      }
    } else micStream = null;

    const tracks = [...canvasStream.getVideoTracks(), ...(micStream ? micStream.getAudioTracks() : [])];
    recStream = new MediaStream(tracks);

    const mimeType = pickMimeType();
    try{
      recorder = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);
    } catch(e){
      console.error(e);
      alert('Impossibile iniziare la registrazione. Prova senza audio o con un altro browser.');
      return;
    }

    recChunks = [];
    recorder.ondataavailable = (ev)=>{ if (ev.data && ev.data.size) recChunks.push(ev.data); };
    recorder.onstop = ()=>{
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'video/webm' });
      lastRecordingBlob = blob;
      const url = URL.createObjectURL(blob);
      if (els.recDownload){
        els.recDownload.href = url;
        els.recDownload.download = 'retro_recording.webm';
        els.recDownload.style.display = 'inline';
      }
      if (micStream){ micStream.getTracks().forEach(t=>t.stop()); micStream=null; }
      stopRecTimer();
    };

    recorder.start(250);
    updateRecUI(true);
    startRecTimer();
  }
  function stopRecording(){
    if (recorder && recorder.state !== 'inactive'){ recorder.stop(); }
    if (recStream){ recStream.getTracks().forEach(t=>t.stop()); recStream = null; }
    updateRecUI(false);
  }
  function startRecTimer(){
    recT0 = Date.now();
    if (els.recTimer) els.recTimer.textContent = '00:00';
    if (recTimerHandle) clearInterval(recTimerHandle);
    recTimerHandle = setInterval(()=>{ if (els.recTimer) els.recTimer.textContent = hhmmss(Date.now()-recT0); }, 250);
  }
  function stopRecTimer(){
    if (recTimerHandle){ clearInterval(recTimerHandle); recTimerHandle = null; }
  }

  // ==== ffmpeg.wasm (beta) ====

// carica uno script e dà un errore leggibile se fallisce
function loadScript(src){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = (e) => reject(new Error(`Impossibile caricare script: ${src}`));
    document.head.appendChild(s);
  });
}
function setFfmpegStatus(msg){
  if (els.ffmpegStatus) els.ffmpegStatus.textContent = `ffmpeg: ${msg}`;
}

// Base possibili (CDN + locale). Se crei /libs, verrà usata come fallback.
const FF_VERSION = '0.12.10';
const BASES = [
  `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FF_VERSION}/dist/`,
  `https://unpkg.com/@ffmpeg/ffmpeg@${FF_VERSION}/dist/`,
  '/libs/' // <-- locale
];

// cache globale per non ricaricare due volte
let __ffmpegCache = null;

async function ensureFFmpeg(){
  if (__ffmpegCache) return __ffmpegCache;

  let baseOk = null;
  let lastErr = null;

  for (const base of BASES){
    try {
      setFfmpegStatus(`caricamento libreria… (${base})`);
      // se FFmpeg non è già presente, prova a caricare ffmpeg.min.js da questo base
      if (!window.FFmpeg || !window.FFmpeg.createFFmpeg) {
        // se è base locale, il file deve chiamarsi esattamente "ffmpeg.min.js"
        await loadScript(new URL('ffmpeg.min.js', base).toString());
      }
      if (window.FFmpeg && window.FFmpeg.createFFmpeg){
        baseOk = base;
        break;
      }
    } catch (e){
      lastErr = e;
      // passa al prossimo base
    }
  }

  if (!baseOk) {
    setFfmpegStatus('errore nel caricare la libreria');
    throw lastErr || new Error('FFmpeg non disponibile su nessun CDN / locale');
  }

  const { createFFmpeg, fetchFile } = window.FFmpeg;

  // se COOP/COEP attivi → multi-thread; altrimenti single-thread
  const CORE_FILE = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
    ? 'ffmpeg-core.js'      // per @ffmpeg/core-mt il file si chiama comunque ffmpeg-core.js (carica .worker/.wasm da sé)
    : 'ffmpeg-core.js';

  const corePath = new URL(CORE_FILE, baseOk).toString();

  const ffmpeg = createFFmpeg({
    log: true,
    corePath
  });

  ffmpeg.setProgress(({ ratio })=>{
    if (ratio > 0 && ratio <= 1) setFfmpegStatus(`conversione… ${Math.round(ratio*100)}%`);
  });

  setFfmpegStatus('inizializzazione…');
  await ffmpeg.load();
  setFfmpegStatus('pronto');

  __ffmpegCache = { ffmpeg, fetchFile, baseOk };
  return __ffmpegCache;
}

async function convertLastRecording(kind){
  if (!lastRecordingBlob){
    alert('Non c’è nessuna registrazione. Premi REC → Stop prima.');
    return;
  }

  setFfmpegStatus('preparazione input…');
  const { ffmpeg, fetchFile } = await ensureFFmpeg();

  // pulizia FS virtuale
  for (const f of ['input.webm','palette.png','output.mp4','output.gif']){
    try { ffmpeg.FS('unlink', f); } catch {}
  }

  ffmpeg.FS('writeFile', 'input.webm', await fetchFile(lastRecordingBlob));

  try{
    if (kind === 'mp4'){
      setFfmpegStatus('codifica MP4…');

      // 1) tenta H.264 (libx264)
      try{
        await ffmpeg.run(
          '-y',
          '-i','input.webm',
          '-c:v','libx264',
          '-pix_fmt','yuv420p',
          '-preset','veryfast',
          '-movflags','+faststart',
          'output.mp4'
        );
      } catch(e1){
        // 2) fallback mpeg4
        console.warn('libx264 non disponibile, fallback mpeg4:', e1);
        setFfmpegStatus('fallback MPEG-4…');
        await ffmpeg.run(
          '-y',
          '-i','input.webm',
          '-c:v','mpeg4',
          '-q:v','4',
          '-pix_fmt','yuv420p',
          'output.mp4'
        );
      }

      const data = ffmpeg.FS('readFile', 'output.mp4');
      const url = URL.createObjectURL(new Blob([data.buffer], { type:'video/mp4' }));
      if (els.vidDownload){
        els.vidDownload.href = url;
        els.vidDownload.download = 'output.mp4';
        els.vidDownload.style.display = 'inline';
      }
      setFfmpegStatus(`ok • ${(data.length/1e6).toFixed(2)} MB`);
    } else {
      // GIF con palette (qualità migliore)
      setFfmpegStatus('palette GIF…');
      await ffmpeg.run(
        '-y',
        '-i','input.webm',
        '-vf','fps=12,scale=540:-1:flags=lanczos,palettegen=stats_mode=full',
        'palette.png'
      );
      setFfmpegStatus('codifica GIF…');
      await ffmpeg.run(
        '-y',
        '-i','input.webm',
        '-i','palette.png',
        '-lavfi','fps=12,scale=540:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5',
        '-loop','0',
        'output.gif'
      );

      const data = ffmpeg.FS('readFile', 'output.gif');
      const url = URL.createObjectURL(new Blob([data.buffer], { type:'image/gif' }));
      if (els.vidDownload){
        els.vidDownload.href = url;
        els.vidDownload.download = 'output.gif';
        els.vidDownload.style.display = 'inline';
      }
      setFfmpegStatus(`ok • ${(data.length/1e6).toFixed(2)} MB`);
    }
  } catch(err){
    console.error('FFmpeg error:', err);
    setFfmpegStatus('errore');
    // errore leggibile in alert
    throw new Error(err?.message || String(err));
  } finally {
    // pulizia
    for (const f of ['input.webm','palette.png','output.mp4','output.gif']){
      try { ffmpeg.FS('unlink', f); } catch {}
    }
  }
}


  // ==== Utils palette/quant ====
  function quantizeColor(r,g,b){
    let min=1e12, idx=0;
    for (let i=0;i<paletteRGB.length;i++){
      const pr=paletteRGB[i][0],pg=paletteRGB[i][1],pb=paletteRGB[i][2];
      const dr=r-pr,dg=g-pg,db=b-pb;
      const d=dr*dr+dg*dg+db*db;
      if (d<min){min=d;idx=i;}
    }
    return paletteRGB[idx];
  }
  function neighborhoodAvg(src,x,y,W,H){
    let sum=0,c=0;
    for (let dy=-1; dy<=1; dy++){
      for(let dx=-1; dx<=1; dx++){
        const xx=x+dx, yy=y+dy;
        if(xx>=0&&xx<W&&yy>=0&&yy<H){
          const i=(xx+yy*W)*4;
          sum+=(src.pixels[i]+src.pixels[i+1]+src.pixels[i+2])/3; c++;
        }
      }
    }
    return sum/(c||1);
  }
})();
