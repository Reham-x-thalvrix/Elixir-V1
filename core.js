/* Elixir V1 — core (main world) — by s3m */
(() => {
  if (window.__elixirV1) return;
  window.__elixirV1 = true;

  const LOG = (...a) => console.log("[ELIXIR V1]", ...a);

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    // MAIN
    preamp: 1, gain: 1.2, rage: 0, distortion: 0, bitrate: 320, exciter: 0,
    // SPATIAL
    stereo: false, wider: false, haas: false, inHead: false, behind: false, spatial360: false,
    // VOICE
    presence: 0, clarity: 0, smooth: 0, voiceBoost: 0, deEsser: false,
    // FX
    reverb: 0, repeater: false, blackHole: false, echo: false, pitch: 0,
    // 20 uncommon features (all toggles, default off)
    f_deEsser: false, f_adaptiveNoise: false, f_transient: false, f_formant: false,
    f_breath: false, f_plosive: false, f_clickRemove: false, f_roomTone: false,
    f_ducking: false, f_autoEQ: false, f_lufsLock: false, f_doubler: false,
    f_subOctave: false, f_telephone: false, f_underwater: false, f_robot: false,
    f_stutter: false, f_reverseReverb: false, f_autoGain: false, f_spatialRotate: false
  };

  // ============================================================
  // AUDIO CHAIN (Step 1 = pass-through; DSP comes in Step 2)
  // ============================================================
  let ctx = null, src = null, outDest = null;
  let anL = null, anR = null;
  let workletReady = null;

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

  // ============================================================
  // applyState (stub for Step 1)
  // ============================================================
  function applyState() {
    // DSP wiring comes in Step 2.
  }

  function updateStatus() {
    const live = !!(outDest && outDest.stream.getAudioTracks().some(t => t.readyState === "live"));
    const el = document.getElementById("ex-status-text");
    const led = document.getElementById("ex-led-status");
    const sr = document.getElementById("ex-sr");
    if (el) el.textContent = live ? "LIVE" : "IDLE";
    if (led) led.className = "ex-led " + (live ? "live" : "");
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
        <button class="ex-btn" id="ex-load">LOAD</button>
        <button class="ex-btn primary" id="ex-save">SAVE</button>
        <button class="ex-btn" id="ex-copy">COPY</button>
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

    // ---- KNOB ----
    function knob(opt) {
      const wrap = document.createElement("div");
      wrap.className = "ex-knob";
      const initial = state[opt.key] ?? opt.min;
      const norm = (initial - opt.min) / (opt.max - opt.min);

      const R = 26, CX = 32, CY = 32;
      const startAngle = -135, endAngle = 135;
      const angle = startAngle + norm * (endAngle - startAngle);

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
      const fillD  = arcPath(R, startAngle, angle);

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
        dragging = true;
        startY = e.clientY;
        startVal = state[opt.key];
        dial.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      dial.addEventListener("pointermove", e => {
        if (!dragging) return;
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
    }

    // ---- METERS ----
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
        </div>`;
      container.appendChild(sec);
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

      const freqBuf = new Uint8Array(anL ? anL.frequencyBinCount : 512);
      const tL = new Float32Array(1024), tR = new Float32Array(1024);
      const lufsHist = new Array(120).fill(-70);

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

        // LUFS
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

        // Readouts
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
      }
      frame();
    }

    // ---- TOPBAR / FOOTER ----
    const showPanel = v => {
      panel.classList.toggle("open", v);
      trigger.classList.toggle("show", !v);
    };
    panel.querySelector("#ex-close").onclick = () => showPanel(false);
    trigger.onclick = () => showPanel(true);

    panel.querySelector("#ex-save").onclick = () => {
      localStorage.setItem("elixir_v1_state", JSON.stringify(state));
      statusText.textContent = "SAVED";
      setTimeout(updateStatus, 1200);
    };
    panel.querySelector("#ex-load").onclick = () => {
      try {
        const s = JSON.parse(localStorage.getItem("elixir_v1_state") || "null");
        if (s) { Object.assign(state, s); render(); applyState(); }
      } catch {}
    };
    panel.querySelector("#ex-copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
        statusText.textContent = "COPIED";
        setTimeout(updateStatus, 1200);
      } catch {}
    };
    panel.querySelector("#ex-reset").onclick = () => {
      localStorage.removeItem("elixir_v1_state");
      location.reload();
    };

    window.addEventListener("keydown", e => {
      if (!panel.classList.contains("open")) return;
      if (e.ctrlKey && e.key === "s") { e.preventDefault(); panel.querySelector("#ex-save").click(); }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault(); panel.querySelector("#ex-reset").click();
      }
    });

    // Drag
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

  // ============================================================
  // INIT
  // ============================================================
  if (document.body) buildUI();
  else document.addEventListener("DOMContentLoaded", buildUI, { once: true });
})();
