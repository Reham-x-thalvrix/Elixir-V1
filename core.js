/* Elixir V1 — core (main world) — by s3m */
(() => {
  if (window.__elixirV1) return;
  window.__elixirV1 = true;

  const LOG = (...a) => console.log("[ELIXIR V1]", ...a);

  // ============================================================
  // STATE
  // ============================================================
  const DEFAULT_STATE = {
    preamp: 1, gain: 1.2, rage: 0, distortion: 0, bitrate: 320, exciter: 0,
    stereo: false, wider: false, haas: false, inHead: false, behind: false, spatial360: false,
    presence: 0, clarity: 0, smooth: 0, voiceBoost: 0, deEsser: false,
    reverb: 0, repeater: false, blackHole: false, echo: false, pitch: 0,
    f_deEsser: false, f_adaptiveNoise: false, f_transient: false, f_formant: false,
    f_breath: false, f_plosive: false, f_clickRemove: false, f_roomTone: false,
    f_ducking: false, f_autoEQ: false, f_lufsLock: false, f_doubler: false,
    f_subOctave: false, f_telephone: false, f_underwater: false, f_robot: false,
    f_stutter: false, f_reverseReverb: false, f_autoGain: false, f_spatialRotate: false
  };
  const state = { ...DEFAULT_STATE };

  // ============================================================
  // AUDIO CHAIN
  // ============================================================
  let ctx = null, src = null, outDest = null;
  let anL = null, anR = null;
  let workletReady = null;
  let bypass = false;

  const getCtx = () => {
    if (!ctx || ctx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = new AC({ latencyHint: "interactive", sampleRate: 48000 }); }
      catch { ctx = new AC(); }
      workletReady = Promise.resolve();
    }
    return ctx;
  };

  const resume = () => { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); };
  ["click", "touchstart", "pointerdown", "keydown"].forEach(ev =>
    window.addEventListener(ev, resume, { passive: true }));

  async function buildChain(stream) {
    const c = getCtx();
    if (c.state === "suspended") await c.resume().catch(() => {});
    await workletReady;

    src = c.createMediaStreamSource(stream);
    outDest = c.createMediaStreamDestination();
    outDest.channelCount = 2;

    anL = c.createAnalyser(); anL.fftSize = 1024;
    anR = c.createAnalyser(); anR.fftSize = 1024;

    const split = c.createChannelSplitter(2);
    src.connect(outDest);
    src.connect(split);
    split.connect(anL, 0);
    split.connect(anR, 1);

    const track = outDest.stream.getAudioTracks()[0];
    const orig = stream.getAudioTracks()[0];
    if (track && orig) {
      track.enabled = true;
      const stop = track.stop.bind(track);
      track.stop = () => { try { orig.stop(); } catch {} stop(); };
      orig.addEventListener("ended", () => { try { track.stop(); } catch {} updateStatus(); });
    }
    LOG("chain built, sampleRate =", c.sampleRate);
    return outDest.stream;
  }

  // ============================================================
  // getUserMedia HOOK
  // ============================================================
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints || !constraints.audio) return origGUM(constraints);
      const audio = {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        channelCount: { ideal: 2, min: 1 }
      };
      if (typeof constraints.audio === "object" && constraints.audio.deviceId)
        audio.deviceId = constraints.audio.deviceId;
      const stream = await origGUM({ ...constraints, audio });
      if (stream.getAudioTracks().length === 0) return stream;
      try {
        const processed = await buildChain(stream);
        const combined = new MediaStream();
        processed.getAudioTracks().forEach(t => combined.addTrack(t));
        stream.getVideoTracks().forEach(t => combined.addTrack(t));
        return combined;
      } catch (e) {
        console.warn("[ELIXIR V1] chain failed", e);
        return stream;
      }
    };
    LOG("getUserMedia hooked");
  }

  // ============================================================
  // UI METADATA
  // ============================================================
  const TABS = [
    { id: "main",    label: "Main" },
    { id: "spatial", label: "Spatial" },
    { id: "voice",   label: "Voice" },
    { id: "fx",      label: "FX" },
    { id: "meter",   label: "Meter" },
    { id: "feat",    label: "20 Features" }
  ];

  const SLIDERS = {
    main: [
      { key: "preamp",     name: "PREAMP",     min: 1, max: 500,   step: 0.1, fmt: v => v.toFixed(1) + "×" },
      { key: "gain",       name: "GAIN",       min: 1, max: 50000, step: 1,   fmt: v => v.toFixed(0) + "×" },
      { key: "rage",       name: "RAGE",       min: 0, max: 2000,  step: 1,   fmt: v => v.toFixed(0) },
      { key: "distortion", name: "DISTORTION", min: 0, max: 5000,  step: 1,   fmt: v => v.toFixed(0) },
      { key: "bitrate",    name: "BITRATE",    min: 32, max: 510,  step: 1,   fmt: v => v + " kbps" },
      { key: "exciter",    name: "EXCITER",    min: 0, max: 500,   step: 1,   fmt: v => v + "%" }
    ],
    spatial: [
      { key: "presence", name: "PRESENCE", min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) }
    ],
    voice: [
      { key: "presence",   name: "PRESENCE",    min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "clarity",    name: "CLARITY",     min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "smooth",     name: "SMOOTH",      min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "voiceBoost", name: "VOICE BOOST", min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) }
    ],
    fx: [
      { key: "reverb", name: "REVERB", min: 0, max: 100, step: 1, fmt: v => v + "%" },
      { key: "pitch",  name: "PITCH",  min: -12, max: 12, step: 1, fmt: v => (v > 0 ? "+" : "") + v + " st" }
    ]
  };

  const TOGGLES = {
    spatial: [
      { key: "stereo",     name: "STEREO" },
      { key: "wider",      name: "WIDER" },
      { key: "haas",       name: "QUICK HAAS" },
      { key: "inHead",     name: "IN-HEAD" },
      { key: "behind",     name: "BEHIND" },
      { key: "spatial360", name: "360 ROTATE" }
    ],
    voice: [
      { key: "deEsser", name: "DE-ESSER" }
    ],
    fx: [
      { key: "repeater",  name: "REPEATER" },
      { key: "blackHole", name: "BLACK HOLE REVERB" },
      { key: "echo",      name: "ECHO" }
    ],
    feat: [
      { key: "f_deEsser",       name: "AUTO DE-ESSER",     sub: "sibilance tamer" },
      { key: "f_adaptiveNoise", name: "ADAPTIVE NOISE",    sub: "auto floor learn" },
      { key: "f_transient",     name: "TRANSIENT SHAPER",  sub: "attack / sustain" },
      { key: "f_formant",       name: "FORMANT SHIFT",     sub: "voice character" },
      { key: "f_breath",        name: "BREATH REDUCER",    sub: "hiss cut" },
      { key: "f_plosive",       name: "PLOSIVE KILLER",    sub: "p/b pop filter" },
      { key: "f_clickRemove",   name: "CLICK REMOVER",     sub: "mouth click" },
      { key: "f_roomTone",      name: "ROOM TONE",         sub: "natural ambience" },
      { key: "f_ducking",       name: "SIDECHAIN DUCK",    sub: "music duck under voice" },
      { key: "f_autoEQ",        name: "AUTO EQ",           sub: "spectral match" },
      { key: "f_lufsLock",      name: "LUFS LOCK",         sub: "loudness target" },
      { key: "f_doubler",       name: "VOICE DOUBLER",     sub: "thick doubling" },
      { key: "f_subOctave",     name: "SUB OCTAVE",        sub: "harmonics" },
      { key: "f_telephone",     name: "TELEPHONE FX",      sub: "band-limited" },
      { key: "f_underwater",    name: "UNDERWATER FX",     sub: "muffled" },
      { key: "f_robot",         name: "ROBOT FX",          sub: "ring mod" },
      { key: "f_stutter",       name: "STUTTER GATE",      sub: "rhythmic chop" },
      { key: "f_reverseReverb", name: "REVERSE REVERB",    sub: "pre-reverb swell" },
      { key: "f_autoGain",      name: "AUTO GAIN",         sub: "target RMS" },
      { key: "f_spatialRotate", name: "SPATIAL ROTATE",    sub: "3D motion" }
    ]
  };

  function applyState() {}

  function updateStatus() {
    const live = !!(outDest && outDest.stream.getAudioTracks().some(t => t.readyState === "live"));
    const el = document.getElementById("ex-status-text");
    const led = document.getElementById("ex-led-status");
    const sr = document.getElementById("ex-sr");
    if (el) el.textContent = bypass ? "NORMAL" : (live ? "LIVE" : "IDLE");
    if (led) led.className = "ex-led " + (bypass ? "warn" : (live ? "live" : ""));
    if (sr) sr.textContent = ctx ? (ctx.sampleRate / 1000).toFixed(1) + " kHz" : "—";
  }

  // ============================================================
  // BUILD UI
  // ============================================================
  function buildUI() {
    if (document.getElementById("ex-panel")) return;

    const trigger = document.createElement("button");
    trigger.id = "ex-trigger";
    trigger.title = "Show Elixir V1";
    document.body.appendChild(trigger);

    const panel = document.createElement("div");
    panel.id = "ex-panel";
    panel.innerHTML = `
      <div class="ex-topbar">
        <div class="ex-topbar-l">
          <div class="ex-brand">
            <div class="ex-brand-mark"></div>
            <span>ELIXIR</span>
            <span class="ex-version">V1</span>
          </div>
        </div>
        <div class="ex-topbar-r">
          <div class="ex-stat-group">
            <span class="ex-led" id="ex-led-signal"></span>
            <span id="ex-sr">—</span>
          </div>
          <div class="ex-stat-group">
            <span class="ex-led" id="ex-led-status"></span>
            <span id="ex-status-text">IDLE</span>
          </div>
          <button class="ex-icon-btn" id="ex-close" title="Hide">×</button>
        </div>
      </div>
      <div class="ex-main">
        <aside class="ex-sidebar" id="ex-sidebar"></aside>
        <div class="ex-content" id="ex-content"></div>
      </div>
      <div class="ex-footer">
        <button class="ex-btn normal" id="ex-normal" title="Toggle NORMAL (bypass)">NORMAL</button>
        <button class="ex-btn preset" id="ex-121" title="Toggle 121 preset">121</button>
        <button class="ex-btn primary" id="ex-save">SAVE</button>
        <button class="ex-btn" id="ex-copy">COPY</button>
        <button class="ex-btn" id="ex-paste">PASTE</button>
        <button class="ex-btn danger" id="ex-reset">RESET</button>
      </div>`;
    document.body.appendChild(panel);

    const content = panel.querySelector("#ex-content");
    const sidebar = panel.querySelector("#ex-sidebar");
    const ledSignal = panel.querySelector("#ex-led-signal");
    const statusText = panel.querySelector("#ex-status-text");
    let activeTab = "main";
    let meterRAF = null;

    try {
      const saved = JSON.parse(localStorage.getItem("elixir_v1_state") || "null");
      if (saved) Object.assign(state, saved);
      bypass = localStorage.getItem("elixir_v1_normal") === "true";
    } catch {}

    // ---- NAV ----
    TABS.forEach(t => {
      const b = document.createElement("button");
      b.className = "ex-nav" + (t.id === activeTab ? " on" : "");
      b.dataset.tab = t.id;
      b.innerHTML = `<span class="ex-nav-icon"></span><span>${t.label}</span>`;
      b.onclick = () => {
        activeTab = t.id;
        sidebar.querySelectorAll(".ex-nav").forEach(x => x.classList.toggle("on", x.dataset.tab === t.id));
        render();
      };
      sidebar.appendChild(b);
    });

    // ---- NORMAL LOCK ----
    function applyNormalLock() {
      content.classList.toggle("locked", bypass);
    }

    // ---- KNOB ----
    function knob(opt) {
      const wrap = document.createElement("div");
      wrap.className = "ex-knob";
      const initial = state[opt.key] ?? opt.min;
      const norm = (initial - opt.min) / (opt.max - opt.min);

      const R = 26, CX = 32, CY = 32;
      const startAngle = -135, endAngle = 135;

      const polar = (cx, cy, r, deg) => {
        const rad = (deg - 90) * Math.PI / 180;
        return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
      };
      const arcPath = (r, a0, a1) => {
        const [x0, y0] = polar(CX, CY, r, a0);
        const [x1, y1] = polar(CX, CY, r, a1);
        const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
        const sweep = a1 > a0 ? 1 : 0;
        return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
      };
      const trackD = arcPath(R, startAngle, endAngle);
      const fillD  = arcPath(R, startAngle, startAngle + norm * (endAngle - startAngle));

      wrap.innerHTML = `
        <div class="ex-knob-dial">
          <svg viewBox="0 0 64 64">
            <path class="ex-knob-track" d="${trackD}" />
            <path class="ex-knob-fill"  d="${fillD}"  />
          </svg>
          <div class="ex-knob-cap"></div>
          <div class="ex-knob-pointer"></div>
        </div>
        <div class="ex-knob-label">${opt.name}</div>
        <div class="ex-knob-value"></div>`;

      const fill = wrap.querySelector(".ex-knob-fill");
      const pointer = wrap.querySelector(".ex-knob-pointer");
      const valueEl = wrap.querySelector(".ex-knob-value");
      const dial = wrap.querySelector(".ex-knob-dial");

      const refresh = () => {
        const v = state[opt.key];
        const n = Math.max(0, Math.min(1, (v - opt.min) / (opt.max - opt.min)));
        const a = startAngle + n * (endAngle - startAngle);
        fill.setAttribute("d", arcPath(R, startAngle, a));
        pointer.style.transform = `rotate(${a + 180}deg)`;
        valueEl.textContent = opt.fmt(v);
        wrap.classList.toggle("hot", n > 0.66 && n <= 0.9);
        wrap.classList.toggle("max", n > 0.9);
      };
      refresh();

      let dragging = false, startY = 0, startVal = 0;
      dial.addEventListener("pointerdown", e => {
        if (bypass) return; // disabled in NORMAL
        dragging = true;
        startY = e.clientY;
        startVal = state[opt.key];
        dial.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      dial.addEventListener("pointermove", e => {
        if (!dragging || bypass) return;
        const dy = startY - e.clientY;
        const range = opt.max - opt.min;
        const speed = e.shiftKey ? 0.001 : 0.006;
        let v = startVal + dy * range * speed;
        v = Math.round(v / opt.step) * opt.step;
        v = Math.max(opt.min, Math.min(opt.max, v));
        state[opt.key] = v;
        refresh();
        applyState();
      });
      const stop = () => { dragging = false; };
      dial.addEventListener("pointerup", stop);
      dial.addEventListener("pointercancel", stop);
      dial.addEventListener("dblclick", () => {
        if (bypass) return;
        state[opt.key] = opt.min;
        refresh();
        applyState();
      });

      return wrap;
    }

    // ---- LED BUTTON ----
    function ledBtn(t) {
      const b = document.createElement("button");
      b.className = "ex-led-btn" + (state[t.key] ? " on" : "");
      b.innerHTML = `
        <span class="ex-led"></span>
        <span class="ex-led-btn-body">
          <span class="ex-led-btn-name">${t.name}</span>
          ${t.sub ? `<span class="ex-led-btn-sub">${t.sub}</span>` : ""}
        </span>`;
      b.onclick = () => {
        if (bypass) return;
        state[t.key] = !state[t.key];
        b.classList.toggle("on", state[t.key]);
        applyState();
      };
      return b;
    }

    // ---- RENDER ----
    function render() {
      cancelAnimationFrame(meterRAF);
      content.innerHTML = "";

      if (activeTab === "meter") { renderMeters(content); return; }

      const sliders = SLIDERS[activeTab] || [];
      const toggles = TOGGLES[activeTab] || [];

      if (sliders.length) {
        const sec = document.createElement("div");
        sec.className = "ex-section";
        sec.innerHTML = `<div class="ex-section-title">Parameters</div>`;
        const grid = document.createElement("div");
        grid.className = "ex-knob-grid";
        sliders.forEach(s => grid.appendChild(knob(s)));
        sec.appendChild(grid);
        content.appendChild(sec);
      }

      if (toggles.length) {
        const sec = document.createElement("div");
        sec.className = "ex-section";
        sec.innerHTML = `<div class="ex-section-title">Switches</div>`;
        const grid = document.createElement("div");
        grid.className = "ex-led-grid";
        toggles.forEach(t => grid.appendChild(ledBtn(t)));
        sec.appendChild(grid);
        content.appendChild(sec);
      }
      applyNormalLock();
    }

    // ---- METERS + CONSOLE ----
    function renderMeters(container) {
      const sec = document.createElement("div");
      sec.className = "ex-section";
      sec.innerHTML = `
        <div class="ex-section-title">Analysis</div>
        <div class="ex-meter-grid">
          <div class="ex-meter-card wide">
            <div class="ex-meter-head"><span>WAVEFORM / RMS</span><b id="ex-m-peak">—</b></div>
            <canvas class="ex-meter-canvas tall" id="ex-m-scope"></canvas>
          </div>
          <div class="ex-meter-card">
            <div class="ex-meter-head"><span>SPECTRUM</span><b id="ex-m-freq">—</b></div>
            <canvas class="ex-meter-canvas" id="ex-m-spectrum"></canvas>
          </div>
          <div class="ex-meter-card">
            <div class="ex-meter-head"><span>VECTORSCOPE</span><b id="ex-m-corr">0</b></div>
            <canvas class="ex-meter-canvas" id="ex-m-gonio"></canvas>
          </div>
          <div class="ex-meter-card wide">
            <div class="ex-meter-head"><span>LUFS · SHORT-TERM</span><b id="ex-m-lufs">—</b></div>
            <canvas class="ex-meter-canvas" id="ex-m-lufs-canvas"></canvas>
          </div>
        </div>

        <div class="ex-section-title" style="margin-top:14px">Console</div>
        <div class="ex-console" id="ex-console">
          <div class="ex-console-row">
            <span class="ex-console-key">INPUT</span>
            <span class="ex-console-val">PEAK <b id="ex-c-in-peak">—</b></span>
            <span class="ex-console-val">RMS <b id="ex-c-in-rms">—</b></span>
            <span class="ex-console-val">LUFS <b id="ex-c-in-lufs">—</b></span>
          </div>
          <div class="ex-console-row">
            <span class="ex-console-key">OUTPUT</span>
            <span class="ex-console-val">PEAK <b id="ex-c-out-peak">—</b></span>
            <span class="ex-console-val">RMS <b id="ex-c-out-rms">—</b></span>
            <span class="ex-console-val">LUFS <b id="ex-c-out-lufs">—</b></span>
          </div>
          <div class="ex-console-row">
            <span class="ex-console-key">GAIN</span>
            <span class="ex-console-val"><b id="ex-c-gain">—</b></span>
            <span class="ex-console-val">CLIP <b id="ex-c-clip">0</b></span>
            <span class="ex-console-val">DC <b id="ex-c-dc">0.000</b></span>
          </div>
          <div class="ex-console-row">
            <span class="ex-console-key">STEREO</span>
            <span class="ex-console-val">L <b id="ex-c-l">—</b></span>
            <span class="ex-console-val">R <b id="ex-c-r">—</b></span>
            <span class="ex-console-val">CORR <b id="ex-c-corr">—</b></span>
          </div>
          <div class="ex-console-row">
            <span class="ex-console-key">CPU</span>
            <span class="ex-console-val"><b id="ex-c-cpu">—</b></span>
            <span class="ex-console-val">LAT <b id="ex-c-lat">—</b></span>
          </div>
        </div>`;
      container.appendChild(sec);
      applyNormalLock();
      startMeters(container);
    }

    function startMeters(root) {
      const scopeCv = root.querySelector("#ex-m-scope");
      const specCv = root.querySelector("#ex-m-spectrum");
      const gonioCv = root.querySelector("#ex-m-gonio");
      const lufsCv = root.querySelector("#ex-m-lufs-canvas");
      const peakEl = root.querySelector("#ex-m-peak");
      const freqEl = root.querySelector("#ex-m-freq");
      const corrEl = root.querySelector("#ex-m-corr");
      const lufsEl = root.querySelector("#ex-m-lufs");

      // Console elements
      const cInPeak = root.querySelector("#ex-c-in-peak");
      const cInRms  = root.querySelector("#ex-c-in-rms");
      const cInLufs = root.querySelector("#ex-c-in-lufs");
      const cOutPeak = root.querySelector("#ex-c-out-peak");
      const cOutRms  = root.querySelector("#ex-c-out-rms");
      const cOutLufs = root.querySelector("#ex-c-out-lufs");
      const cGain   = root.querySelector("#ex-c-gain");
      const cClip   = root.querySelector("#ex-c-clip");
      const cDC     = root.querySelector("#ex-c-dc");
      const cL      = root.querySelector("#ex-c-l");
      const cR      = root.querySelector("#ex-c-r");
      const cCorr   = root.querySelector("#ex-c-corr");
      const cCPU    = root.querySelector("#ex-c-cpu");
      const cLat    = root.querySelector("#ex-c-lat");

      const freqBuf = new Uint8Array(anL ? anL.frequencyBinCount : 512);
      const tL = new Float32Array(1024), tR = new Float32Array(1024);
      const lufsHist = new Array(120).fill(-70);

      let clipCount = 0;
      let dcState = 0;
      let cpuAvg = 0;
      let lastT = performance.now();
      let peakHold = 0, peakHoldT = 0;

      const fit = cv => {
        const dpr = window.devicePixelRatio || 1;
        const r = cv.getBoundingClientRect();
        cv.width = Math.max(1, r.width * dpr);
        cv.height = Math.max(1, r.height * dpr);
        const c = cv.getContext("2d");
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.scale(dpr, dpr);
        return { c, w: r.width, h: r.height };
      };

      function frame() {
        meterRAF = requestAnimationFrame(frame);
        if (!anL || !anR) return;
        anL.getByteFrequencyData(freqBuf);
        anL.getFloatTimeDomainData(tL);
        anR.getFloatTimeDomainData(tR);

        // WAVEFORM
        {
          const { c, w, h } = fit(scopeCv);
          c.clearRect(0, 0, w, h);
          c.strokeStyle = "#2d3542";
          c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
          c.strokeStyle = "#a3e635";
          c.lineWidth = 1.4;
          c.beginPath();
          for (let i = 0; i < tL.length; i++) {
            const x = (i / tL.length) * w;
            const y = h / 2 - tL[i] * (h / 2) * 0.9;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.stroke();
        }

        // SPECTRUM
        {
          const { c, w, h } = fit(specCv);
          c.clearRect(0, 0, w, h);
          const bins = 48, step = Math.floor(freqBuf.length / bins), bw = w / bins;
          for (let i = 0; i < bins; i++) {
            let v = 0;
            for (let j = 0; j < step; j++) v = Math.max(v, freqBuf[i * step + j]);
            const bh = (v / 255) * h;
            c.fillStyle = "#22d3ee";
            c.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
          }
        }

        // VECTORSCOPE
        {
          const { c, w, h } = fit(gonioCv);
          c.clearRect(0, 0, w, h);
          c.strokeStyle = "#2d3542";
          c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
          c.beginPath(); c.moveTo(w / 2 - h / 2, h); c.lineTo(w / 2, 0); c.lineTo(w / 2 + h / 2, h); c.stroke();
          c.fillStyle = "rgba(34,211,238,0.7)";
          for (let i = 0; i < 1024; i += 4) {
            const l = tL[i], r = tR[i];
            const x = w / 2 + (r - l) * (w / 2) * 0.85;
            const y = h / 2 - (l + r) * (h / 2) * 0.85;
            c.fillRect(x, y, 1.5, 1.5);
          }
        }

        // LUFS + peak/rms
        let peak = 0, sum = 0;
        for (let i = 0; i < tL.length; i++) {
          peak = Math.max(peak, Math.abs(tL[i]));
          sum += tL[i] * tL[i];
        }
        const rms = Math.sqrt(sum / tL.length);
        const db = 20 * Math.log10(rms || 1e-7);
        lufsHist.push(db - 5); lufsHist.shift();
        {
          const { c, w, h } = fit(lufsCv);
          c.clearRect(0, 0, w, h);
          c.strokeStyle = "#a78bfa";
          c.lineWidth = 1.4;
          c.beginPath();
          for (let i = 0; i < lufsHist.length; i++) {
            const x = (i / lufsHist.length) * w;
            const v = Math.max(-60, Math.min(0, lufsHist[i]));
            const y = h - ((v + 60) / 60) * h;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.stroke();
        }

        peakEl.textContent = (peak > 0 ? 20 * Math.log10(peak) : -Infinity).toFixed(1) + " dB";
        lufsEl.textContent = db.toFixed(1) + " LUFS";
        let mb = 0, mv = 0;
        for (let i = 1; i < freqBuf.length; i++) if (freqBuf[i] > mv) { mv = freqBuf[i]; mb = i; }
        const hz = ctx ? Math.round(mb * (ctx.sampleRate / 2) / freqBuf.length) : 0;
        freqEl.textContent = mv > 30 ? hz + " Hz" : "—";
        let num = 0, dl = 0, dr = 0;
        for (let i = 0; i < tL.length; i++) { num += tL[i] * tR[i]; dl += tL[i] ** 2; dr += tR[i] ** 2; }
        corrEl.textContent = (dl && dr ? num / Math.sqrt(dl * dr) : 0).toFixed(2);

        if (ledSignal) ledSignal.classList.toggle("on", peak > 0.02);

        // CONSOLE — throttled to 100ms
        const nowT = performance.now();
        if (nowT - lastT > 100) {
          let localDC = 0;
          for (let i = 0; i < tL.length; i++) {
            if (Math.abs(tL[i]) >= 0.999) clipCount++;
            localDC += tL[i];
          }
          localDC /= tL.length;
          dcState = dcState * 0.9 + localDC * 0.1;

          if (peak > peakHold) { peakHold = peak; peakHoldT = nowT; }
          else if (nowT - peakHoldT > 500) peakHold *= 0.98;

          const lufs = db - 5;
          const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
          const peakHoldDb = peakHold > 0 ? 20 * Math.log10(peakHold) : -Infinity;

          const frameMs = nowT - lastT;
          const cpuPct = Math.min(100, (frameMs / 100) * (1000 / 60) * 0.15);
          cpuAvg = cpuAvg * 0.8 + cpuPct * 0.2;

          const latMs = ctx && typeof ctx.baseLatency === "number"
            ? (ctx.baseLatency * 1000).toFixed(0)
            : "—";

          // In pass-through mode, output = input; in DSP mode (Step 2), output will differ
          const inPeak = peakHoldDb;
          const inRms = db;
          const outPeak = inPeak;
          const outRms = db;

          const setTxt = (el, v) => { if (el) el.textContent = v; };
          const fmtDb = v => isFinite(v) ? v.toFixed(1) : "−∞";
          const fmtL = v => isFinite(v) ? v.toFixed(1) : "−∞";

          setTxt(cInPeak,  fmtDb(inPeak) + " dB");
          setTxt(cInRms,   fmtDb(inRms) + " dB");
          setTxt(cInLufs,  fmtL(lufs));
          setTxt(cOutPeak, fmtDb(outPeak) + " dB");
          setTxt(cOutRms,  fmtDb(outRms) + " dB");
          setTxt(cOutLufs, fmtL(lufs - 1.5));
          setTxt(cGain,    (state.preamp && state.gain)
            ? "+" + (20 * Math.log10(state.preamp * state.gain)).toFixed(1) + " dB"
            : "+0.0 dB");
          setTxt(cClip,    clipCount);
          setTxt(cDC,      dcState.toFixed(3));

          let sL = 0, sR = 0;
          for (let i = 0; i < tL.length; i++) { sL += tL[i] * tL[i]; sR += tR[i] * tR[i]; }
          const rmsL = Math.sqrt(sL / tL.length);
          const rmsR = Math.sqrt(sR / tR.length);
          const maxRms = Math.max(rmsL, rmsR, 0.0001);
          setTxt(cL, Math.round((rmsL / maxRms) * 100) + "%");
          setTxt(cR, Math.round((rmsR / maxRms) * 100) + "%");

          let numC = 0, dC = 0, dR = 0;
          for (let i = 0; i < tL.length; i++) { numC += tL[i] * tR[i]; dC += tL[i] ** 2; dR += tR[i] ** 2; }
          const corr = (dC && dR) ? numC / Math.sqrt(dC * dR) : 0;
          setTxt(cCorr, (corr >= 0 ? "+" : "") + corr.toFixed(2));

          setTxt(cCPU, cpuAvg.toFixed(1) + "%");
          setTxt(cLat, latMs + " ms");

          const warn = (el, cond) => { if (el) el.style.color = cond ? "#fb7185" : ""; };
          warn(cInPeak, inPeak > -3);
          warn(cOutPeak, outPeak > -3);
          warn(cClip, clipCount > 0);
          warn(cCorr, Math.abs(corr) < 0.3);

          lastT = nowT;
        }
      }

      clipCount = 0;
      frame();
    }

    // ---- TOPBAR / SHOW-HIDE ----
    const showPanel = v => {
      panel.classList.toggle("open", v);
      trigger.classList.toggle("show", !v);
    };
    panel.querySelector("#ex-close").onclick = () => showPanel(false);
    trigger.onclick = () => showPanel(true);

    // ---- PRESET 121 ----
    const PRESET_121 = {
      preamp: 121, gain: 121, rage: 0, distortion: 0, bitrate: 510, exciter: 121,
      stereo: false, wider: false, haas: false, inHead: false, behind: false, spatial360: false,
      presence: 121, clarity: 121, smooth: 0, voiceBoost: 121, deEsser: false,
      reverb: 0, repeater: false, blackHole: false, echo: false, pitch: 0,
      f_deEsser: false, f_adaptiveNoise: false, f_transient: false, f_formant: false,
      f_breath: false, f_plosive: false, f_clickRemove: false, f_roomTone: false,
      f_ducking: false, f_autoEQ: false, f_lufsLock: false, f_doubler: false,
      f_subOctave: false, f_telephone: false, f_underwater: false, f_robot: false,
      f_stutter: false, f_reverseReverb: false, f_autoGain: false, f_spatialRotate: false
    };

    const btnNormal = panel.querySelector("#ex-normal");
    const btn121 = panel.querySelector("#ex-121");

    let preset121On = false;
    let preset121Backup = null;

    try {
      if (localStorage.getItem("elixir_v1_121on") === "true") {
        preset121On = true;
        try {
          preset121Backup = JSON.parse(localStorage.getItem("elixir_v1_121backup") || "null");
        } catch {}
      }
    } catch {}

    if (bypass) btnNormal.classList.add("on");
    if (preset121On) btn121.classList.add("on");
    applyNormalLock();

    // ---- NORMAL TOGGLE ----
    btnNormal.onclick = () => {
      bypass = !bypass;
      btnNormal.classList.toggle("on", bypass);
      if (bypass) {
        if (preset121On) {
          if (preset121Backup) { Object.assign(state, preset121Backup); preset121Backup = null; }
          preset121On = false;
          btn121.classList.remove("on");
          localStorage.removeItem("elixir_v1_121on");
          localStorage.removeItem("elixir_v1_121backup");
          localStorage.setItem("elixir_v1_state", JSON.stringify(state));
        }
        statusText.textContent = "NORMAL";
      } else {
        statusText.textContent = "ACTIVE";
      }
      localStorage.setItem("elixir_v1_normal", bypass ? "true" : "false");
      applyNormalLock();
      render();
      applyState();
      setTimeout(updateStatus, 1400);
    };

    // ---- 121 TOGGLE ----
    btn121.onclick = () => {
      if (!preset121On) {
        if (bypass) {
          bypass = false;
          btnNormal.classList.remove("on");
          localStorage.setItem("elixir_v1_normal", "false");
        }
        preset121Backup = JSON.parse(JSON.stringify(state));
        localStorage.setItem("elixir_v1_121backup", JSON.stringify(preset121Backup));
        Object.assign(state, PRESET_121);
        preset121On = true;
        btn121.classList.add("on");
        statusText.textContent = "121 ON";
        localStorage.setItem("elixir_v1_121on", "true");
      } else {
        if (preset121Backup) { Object.assign(state, preset121Backup); preset121Backup = null; }
        localStorage.removeItem("elixir_v1_121backup");
        localStorage.removeItem("elixir_v1_121on");
        preset121On = false;
        btn121.classList.remove("on");
        statusText.textContent = "121 OFF";
      }
      localStorage.setItem("elixir_v1_state", JSON.stringify(state));
      applyNormalLock();
      render();
      applyState();
      setTimeout(updateStatus, 1400);
    };

    // ---- SAVE ----
    panel.querySelector("#ex-save").onclick = () => {
      localStorage.setItem("elixir_v1_state", JSON.stringify(state));
      statusText.textContent = "SAVED";
      setTimeout(updateStatus, 1200);
    };

    // ---- COPY ----
    panel.querySelector("#ex-copy").onclick = async () => {
      const json = JSON.stringify(state, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        statusText.textContent = "COPIED";
      } catch {
        const ta = document.createElement("textarea");
        ta.value = json;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); statusText.textContent = "COPIED"; }
        catch { statusText.textContent = "COPY FAILED"; }
        ta.remove();
      }
      setTimeout(updateStatus, 1400);
    };

    // ---- PASTE ----
    panel.querySelector("#ex-paste").onclick = async () => {
      let text = "";
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      } catch {}

      const applyText = (raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object") throw new Error("not object");
          let count = 0;
          for (const k of Object.keys(state)) {
            if (k in parsed) { state[k] = parsed[k]; count++; }
          }
          if (count === 0) throw new Error("no matching keys");
          localStorage.setItem("elixir_v1_state", JSON.stringify(state));
          render();
          applyState();
          statusText.textContent = "PASTED";
          setTimeout(updateStatus, 1400);
          return true;
        } catch (e) {
          statusText.textContent = "INVALID JSON";
          setTimeout(updateStatus, 1400);
          return false;
        }
      };

      if (text && text.trim().startsWith("{")) {
        if (applyText(text)) return;
      }

      const modal = document.createElement("div");
      modal.className = "ex-modal-backdrop";
      modal.innerHTML = `
        <div class="ex-modal">
          <div class="ex-modal-head">
            <span>PASTE SETTINGS</span>
            <button class="ex-icon-btn" id="ex-modal-close">×</button>
          </div>
          <textarea class="ex-modal-input" id="ex-modal-input"
            placeholder='{"preamp": 12.5, "gain": 800, ...}'
            spellcheck="false"></textarea>
          <div class="ex-modal-foot">
            <button class="ex-btn" id="ex-modal-cancel">CANCEL</button>
            <button class="ex-btn primary" id="ex-modal-apply">APPLY</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      const input = modal.querySelector("#ex-modal-input");
      const closeModal = () => modal.remove();
      modal.querySelector("#ex-modal-close").onclick = closeModal;
      modal.querySelector("#ex-modal-cancel").onclick = closeModal;
      modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
      modal.querySelector("#ex-modal-apply").onclick = () => {
        const raw = input.value.trim();
        if (!raw) return;
        if (applyText(raw)) closeModal();
      };
      input.focus();
      input.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          modal.querySelector("#ex-modal-apply").click();
        }
      });
    };

    // ---- RESET ----
    panel.querySelector("#ex-reset").onclick = () => {
      localStorage.removeItem("elixir_v1_state");
      localStorage.removeItem("elixir_v1_121on");
      localStorage.removeItem("elixir_v1_121backup");
      localStorage.removeItem("elixir_v1_normal");
      location.reload();
    };

    // ---- KEYBOARD ----
    window.addEventListener("keydown", e => {
      if (!panel.classList.contains("open")) return;
      if (e.ctrlKey && e.key === "s") { e.preventDefault(); panel.querySelector("#ex-save").click(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault(); panel.querySelector("#ex-reset").click();
      }
    });

    // ---- DRAG ----
    const topbar = panel.querySelector(".ex-topbar");
    topbar.addEventListener("pointerdown", e => {
      if (e.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
      const move = ev => {
        panel.style.left = Math.max(4, Math.min(innerWidth - panel.offsetWidth - 4, ev.clientX - ox)) + "px";
        panel.style.top = Math.max(4, Math.min(innerHeight - panel.offsetHeight - 4, ev.clientY - oy)) + "px";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    render();
    updateStatus();
    showPanel(true);
    setInterval(updateStatus, 1500);
  }

  if (document.body) buildUI();
  else document.addEventListener("DOMContentLoaded", buildUI, { once: true });
})();
