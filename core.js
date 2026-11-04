/* Elixir V1 — core (main world) — by s3m */
(() => {
  if (window.__elixirV1) return;
  window.__elixirV1 = true;

  const LOG = (...a) => console.log("[ELIXIR V1]", ...a);

  // ---------- STATE ----------
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

  // ---------- AUDIO CHAIN ----------
  let ctx = null, src = null, outDest = null;
  let anL, anR;  // analysers for meters
  let workletReady = null;

  const getCtx = () => {
    if (!ctx || ctx.state === "closed") {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = new AC({ latencyHint: "interactive", sampleRate: 48000 }); }
      catch { ctx = new AC(); }
      // Placeholder: worklet modules will be added in Step 2.
      workletReady = Promise.resolve();
    }
    return ctx;
  };

  const resume = () => { if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); };
  ["click","touchstart","pointerdown","keydown"].forEach(ev =>
    window.addEventListener(ev, resume, { passive: true }));

  async function buildChain(stream) {
    const c = getCtx();
    if (c.state === "suspended") await c.resume().catch(() => {});
    await workletReady;

    src = c.createMediaStreamSource(stream);
    outDest = c.createMediaStreamDestination();
    outDest.channelCount = 2;

    // For step 1, direct pass-through with analyser taps.
    anL = c.createAnalyser(); anL.fftSize = 1024;
    anR = c.createAnalyser(); anR.fftSize = 1024;

    const split = c.createChannelSplitter(2);
    src.connect(outDest);           // pass-through
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

  // ---------- getUserMedia HOOK ----------
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

  // ---------- UI ----------
  const TABS = [
    { id: "main",    label: "MAIN" },
    { id: "spatial", label: "SPATIAL" },
    { id: "voice",   label: "VOICE" },
    { id: "fx",      label: "FX" },
    { id: "meter",   label: "METER" },
    { id: "feat",    label: "20 FEATURES" }
  ];

  const SLIDERS = {
    main: [
      { key: "preamp",     name: "PREAMP",     min: 1, max: 500,  step: 0.1, fmt: v => v.toFixed(1) + "x" },
      { key: "gain",       name: "GAIN",       min: 1, max: 50000, step: 1,  fmt: v => v.toFixed(0) + "x" },
      { key: "rage",       name: "RAGE",       min: 0, max: 2000, step: 1,  fmt: v => v.toFixed(0) },
      { key: "distortion", name: "DISTORTION", min: 0, max: 5000, step: 1,  fmt: v => v.toFixed(0) },
      { key: "bitrate",    name: "BITRATE",    min: 32, max: 510, step: 1,  fmt: v => v + " kbps" },
      { key: "exciter",    name: "EXCITER",    min: 0, max: 500,  step: 1,  fmt: v => v + "%" }
    ],
    spatial: [
      { key: "presence", name: "PRESENCE", min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) }
    ],
    voice: [
      { key: "presence",  name: "PRESENCE",  min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "clarity",   name: "CLARITY",   min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "smooth",    name: "SMOOTH",    min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) },
      { key: "voiceBoost",name: "VOICE BOOST", min: 0, max: 5000, step: 1, fmt: v => v.toFixed(0) }
    ],
    fx: [
      { key: "reverb", name: "REVERB", min: 0, max: 100, step: 1, fmt: v => v + "%" },
      { key: "pitch",  name: "PITCH",  min: -12, max: 12, step: 1, fmt: v => (v > 0 ? "+" : "") + v + " st" }
    ]
  };

  const TOGGLES = {
    spatial: [
      { key: "stereo",   name: "STEREO" },
      { key: "wider",    name: "WIDER" },
      { key: "haas",     name: "QUICK HAAS" },
      { key: "inHead",   name: "IN-HEAD" },
      { key: "behind",   name: "BEHIND" },
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

  // ---------- BUILD UI ----------
  function buildUI() {
    const panel = document.createElement("div");
    panel.id = "ex-panel";
    panel.innerHTML = `
      <div class="ex-inner">
        <header class="ex-head">
          <div class="ex-brand">
            <div class="ex-logo"></div>
            <div>
              <div class="ex-title">ELIXIR V1</div>
              <div class="ex-sub">by s3m</div>
            </div>
          </div>
          <div class="ex-head-r">
            <div class="ex-status">STANDBY</div>
            <button class="ex-icon" id="ex-collapse" type="button">▼</button>
          </div>
        </header>
        <nav class="ex-tabs"></nav>
        <div class="ex-body"></div>
        <footer class="ex-foot">
          <button class="ex-btn alt" id="ex-save" type="button">SAVE</button>
          <button class="ex-btn" id="ex-reset" type="button">RESET</button>
        </footer>
      </div>`;
    document.body.appendChild(panel);

    const status = panel.querySelector(".ex-status");
    const tabsEl = panel.querySelector(".ex-tabs");
    const bodyEl = panel.querySelector(".ex-body");

    let activeTab = "main";

    // Collapse
    panel.querySelector("#ex-collapse").addEventListener("click", () => {
      panel.classList.toggle("collapsed");
      const c = panel.classList.contains("collapsed");
      panel.querySelector("#ex-collapse").textContent = c ? "▲" : "▼";
    });

    // Tabs
    TABS.forEach(t => {
      const b = document.createElement("button");
      b.className = "ex-tab" + (t.id === activeTab ? " on" : "");
      b.textContent = t.label;
      b.onclick = () => {
        activeTab = t.id;
        tabsEl.querySelectorAll(".ex-tab").forEach(x => x.classList.remove("on"));
        b.classList.add("on");
        render();
      };
      tabsEl.appendChild(b);
    });

    // Footer
    panel.querySelector("#ex-reset").addEventListener("click", () => {
      localStorage.removeItem("elixir_v1_state");
      location.reload();
    });
    panel.querySelector("#ex-save").addEventListener("click", () => {
      localStorage.setItem("elixir_v1_state", JSON.stringify(state));
      status.textContent = "SAVED";
      setTimeout(() => updateStatus(), 1200);
    });

    // Load saved
    try {
      const saved = JSON.parse(localStorage.getItem("elixir_v1_state") || "null");
      if (saved) Object.assign(state, saved);
    } catch {}

    function sliderRow(s) {
      const r = document.createElement("div");
      r.className = "ex-row";
      r.innerHTML = `
        <div class="ex-line"><span class="ex-name">${s.name}</span><span class="ex-val"></span></div>
        <input type="range" min="${s.min}" max="${s.max}" step="${s.step}">`;
      const input = r.querySelector("input");
      const val = r.querySelector(".ex-val");
      input.value = state[s.key];
      const paint = () => {
        val.textContent = s.fmt(Number(input.value));
        input.style.setProperty("--p", ((input.value - s.min) / (s.max - s.min) * 100) + "%");
      };
      paint();
      input.addEventListener("input", () => {
        state[s.key] = Number(input.value);
        paint();
        applyState();
      });
      return r;
    }

    function toggleRow(t) {
      const r = document.createElement("div");
      r.className = "ex-row ex-toggle-row";
      r.innerHTML = `
        <span class="ex-tname">
          <span class="ex-name">${t.name}</span>
          ${t.sub ? `<span class="ex-subname">${t.sub}</span>` : ""}
        </span>
        <button type="button" class="ex-switch" role="switch"><span class="ex-knob"></span></button>`;
      const sw = r.querySelector(".ex-switch");
      const sync = () => {
        sw.classList.toggle("on", !!state[t.key]);
        sw.setAttribute("aria-checked", !!state[t.key]);
      };
      sync();
      sw.onclick = () => { state[t.key] = !state[t.key]; sync(); applyState(); };
      return r;
    }

    function render() {
      bodyEl.innerHTML = "";
      if (activeTab === "meter") { renderMeters(bodyEl); return; }
      if (SLIDERS[activeTab]) SLIDERS[activeTab].forEach(s => bodyEl.appendChild(sliderRow(s)));
      if (TOGGLES[activeTab]) TOGGLES[activeTab].forEach(t => bodyEl.appendChild(toggleRow(t)));
    }

    function updateStatus() {
      const live = !!(outDest && outDest.stream.getAudioTracks().some(t => t.readyState === "live"));
      status.textContent = live ? "ACTIVE" : "STANDBY";
      status.classList.toggle("live", live);
    }

    // Drag
    const head = panel.querySelector(".ex-head");
    head.addEventListener("pointerdown", e => {
      if (e.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const ox = e.clientX - rect.left, oy = e.clientY - rect.top;
      panel.style.left = rect.left + "px";
      panel.style.top = rect.top + "px";
      panel.style.right = "auto"; panel.style.bottom = "auto";
      const move = ev => {
        panel.style.left = Math.max(4, Math.min(innerWidth - panel.offsetWidth - 4, ev.clientX - ox)) + "px";
        panel.style.top  = Math.max(4, Math.min(innerHeight - panel.offsetHeight - 4, ev.clientY - oy)) + "px";
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
    panel.classList.add("open");

    // ---------- METERS ----------
    function renderMeters(container) {
      container.innerHTML = `
        <div class="ex-meters">
          <div class="ex-meter-card wide">
            <div class="ex-meter-title">SPECTRUM</div>
            <canvas class="ex-meter-canvas tall" id="ex-spectrum"></canvas>
            <div class="ex-meter-readout"><span>PEAK <b id="ex-peak">-inf</b> dB</span><span>RMS <b id="ex-rms">-inf</b> dB</span></div>
          </div>
          <div class="ex-meter-card">
            <div class="ex-meter-title">OSCILLOSCOPE</div>
            <canvas class="ex-meter-canvas" id="ex-scope"></canvas>
            <div class="ex-meter-readout"><span>FREQ <b id="ex-freq">—</b></span></div>
          </div>
          <div class="ex-meter-card">
            <div class="ex-meter-title">STEREO / GONIO</div>
            <canvas class="ex-meter-canvas" id="ex-gonio"></canvas>
            <div class="ex-meter-readout"><span>CORR <b id="ex-corr">0</b></span></div>
          </div>
          <div class="ex-meter-card wide">
            <div class="ex-meter-title">LUFS (SHORT-TERM)</div>
            <canvas class="ex-meter-canvas" id="ex-lufs"></canvas>
            <div class="ex-meter-readout"><span>NOW <b id="ex-lufs-v">-inf</b></span><span>TARGET <b>-16</b></span></div>
          </div>
        </div>`;
      startMeters(container);
    }

    let meterRAF = null;
    function startMeters(root) {
      cancelAnimationFrame(meterRAF);
      const spec = root.querySelector("#ex-spectrum");
      const scope = root.querySelector("#ex-scope");
      const gonio = root.querySelector("#ex-gonio");
      const lufsCv = root.querySelector("#ex-lufs");
      const peakEl = root.querySelector("#ex-peak");
      const rmsEl = root.querySelector("#ex-rms");
      const freqEl = root.querySelector("#ex-freq");
      const corrEl = root.querySelector("#ex-corr");
      const lufsEl = root.querySelector("#ex-lufs-v");

      const freqBuf = new Uint8Array(anL ? anL.frequencyBinCount : 512);
      const timeBufL = new Float32Array(1024);
      const timeBufR = new Float32Array(1024);
      const lufsHistory = new Array(120).fill(-70);

      const setupCanvas = cv => {
        const dpr = window.devicePixelRatio || 1;
        const rect = cv.getBoundingClientRect();
        cv.width = rect.width * dpr;
        cv.height = rect.height * dpr;
        const c2 = cv.getContext("2d");
        c2.scale(dpr, dpr);
        return { c2, w: rect.width, h: rect.height };
      };

      function loop() {
        meterRAF = requestAnimationFrame(loop);
        if (!anL || !anR) return;

        // SPECTRUM
        anL.getByteFrequencyData(freqBuf);
        {
          const { c2, w, h } = setupCanvas(spec);
          c2.clearRect(0, 0, w, h);
          const bins = 64, step = Math.floor(freqBuf.length / bins);
          const bw = w / bins;
          for (let i = 0; i < bins; i++) {
            let v = 0;
            for (let j = 0; j < step; j++) v = Math.max(v, freqBuf[i * step + j]);
            const bh = (v / 255) * h;
            const grad = c2.createLinearGradient(0, h - bh, 0, h);
            grad.addColorStop(0, "#ff2a48");
            grad.addColorStop(1, "#7a0716");
            c2.fillStyle = grad;
            c2.fillRect(i * bw + 1, h - bh, bw - 2, bh);
          }
        }

        // OSCILLOSCOPE
        anL.getFloatTimeDomainData(timeBufL);
        anR.getFloatTimeDomainData(timeBufR);
        {
          const { c2, w, h } = setupCanvas(scope);
          c2.clearRect(0, 0, w, h);
          c2.strokeStyle = "#19e65a";
          c2.lineWidth = 1.5;
          c2.beginPath();
          for (let i = 0; i < timeBufL.length; i++) {
            const x = (i / timeBufL.length) * w;
            const y = h / 2 - timeBufL[i] * h / 2 * 0.9;
            i ? c2.lineTo(x, y) : c2.moveTo(x, y);
          }
          c2.stroke();
        }

        // GONIOMETER
        {
          const { c2, w, h } = setupCanvas(gonio);
          c2.clearRect(0, 0, w, h);
          c2.strokeStyle = "rgba(224,18,46,0.25)";
          c2.beginPath(); c2.moveTo(w / 2, 0); c2.lineTo(w / 2, h); c2.stroke();
          c2.beginPath(); c2.moveTo(w / 2 - h / 2, h / 2 + h / 2 * 0.9); c2.lineTo(w / 2, h * 0.05); c2.lineTo(w / 2 + h / 2, h / 2 + h / 2 * 0.9); c2.stroke();
          c2.fillStyle = "rgba(255,42,72,0.6)";
          for (let i = 0; i < 1024; i += 4) {
            const l = timeBufL[i], r = timeBufR[i];
            const x = w / 2 + (r - l) * w / 2 * 0.8;
            const y = h / 2 - (l + r) * h / 2 * 0.8;
            c2.fillRect(x, y, 2, 2);
          }
        }

        // LUFS (simplified)
        {
          let sum = 0;
          for (let i = 0; i < timeBufL.length; i++) sum += timeBufL[i] * timeBufL[i];
          const rms = Math.sqrt(sum / timeBufL.length);
          const db = 20 * Math.log10(rms || 1e-7);
          lufsHistory.push(db - 5);
          lufsHistory.shift();
          const { c2, w, h } = setupCanvas(lufsCv);
          c2.clearRect(0, 0, w, h);
          c2.strokeStyle = "#ff2a48"; c2.lineWidth = 2;
          c2.beginPath();
          for (let i = 0; i < lufsHistory.length; i++) {
            const x = (i / lufsHistory.length) * w;
            const v = Math.max(-60, Math.min(0, lufsHistory[i]));
            const y = h - ((v + 60) / 60) * h;
            i ? c2.lineTo(x, y) : c2.moveTo(x, y);
          }
          c2.stroke();
          lufsEl.textContent = db.toFixed(1);
        }

        // Readouts
        let peak = 0, sum = 0;
        for (let i = 0; i < timeBufL.length; i++) {
          peak = Math.max(peak, Math.abs(timeBufL[i]));
          sum += timeBufL[i] * timeBufL[i];
        }
        peakEl.textContent = peak > 0 ? (20 * Math.log10(peak)).toFixed(1) : "-inf";
        const rms = Math.sqrt(sum / timeBufL.length);
        rmsEl.textContent = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : "-inf";

        let maxBin = 0, maxVal = 0;
        for (let i = 1; i < freqBuf.length; i++) if (freqBuf[i] > maxVal) { maxVal = freqBuf[i]; maxBin = i; }
        const freqHz = Math.round(maxBin * (ctx.sampleRate / 2) / freqBuf.length);
        freqEl.textContent = maxVal > 30 ? freqHz + " Hz" : "—";

        // Simple correlation
        let num = 0, dl = 0, dr = 0;
        for (let i = 0; i < timeBufL.length; i++) {
          num += timeBufL[i] * timeBufR[i];
          dl += timeBufL[i] * timeBufL[i];
          dr += timeBufR[i] * timeBufR[i];
        }
        const corr = (dl && dr) ? num / Math.sqrt(dl * dr) : 0;
        corrEl.textContent = corr.toFixed(2);
      }
      loop();
    }

    // Expose for hot updates
    window.__elixirUI = { render, updateStatus };
  }

  // Apply state to DSP (stub in step 1)
  function applyState() {
    // DSP wiring comes in Step 2.
    if (window.__elixirUI) window.__elixirUI.updateStatus();
  }

  // Init
  if (document.body) buildUI();
  else document.addEventListener("DOMContentLoaded", buildUI, { once: true });
})();
