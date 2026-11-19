"use strict";

(function initSpotTheDifferenceV11() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const UNLOCK_EVENTS = ["pointerdown", "touchend", "click", "keydown"];

  const uiState = {
    soundEnabled: true,
    audioCtx: null,
    unlockArmed: false,
    demoShownThisLoad: false,
    demoActive: false,
    demoTimer: 0,
    demoFinishHandler: null,
    demoReturnFocusEl: null
  };

  function syncAppStateSoundFlag() {
    try {
      if (typeof state !== "undefined" && state) {
        state.soundEnabled = uiState.soundEnabled;
      }
    } catch (_err) {
      /* ignore if state not yet initialized */
    }
  }

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  // Section 3.1: 14-Icon Custom SVG Set + Play triangle (viewBox 0 0 24 24, 2.5px stroke in #1F2438)
  function createSvgIcon(name) {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: `svg-icon icon-${name}`,
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });

    switch (name) {
      case "play": {
        svg.append(
          svgEl("path", {
            d: "M7.5 5.25L18.25 12L7.5 18.75V5.25Z",
            fill: "#FFFDF9",
            stroke: "#1F2438"
          })
        );
        break;
      }
      case "spyglass": {
        svg.append(
          svgEl("circle", { cx: "10.5", cy: "10.5", r: "6.5", fill: "#FFF7DC" }),
          svgEl("circle", { cx: "10.5", cy: "10.5", r: "3.5", fill: "#1B7A6E", stroke: "none", opacity: "0.28" }),
          svgEl("path", { d: "M8 8.5a2.5 2.5 0 0 1 3.5 0" }),
          svgEl("path", { d: "M15.5 15.5L21 21", "stroke-width": "3.2" }),
          svgEl("path", { d: "M14.8 14.8l2.4 2.4", stroke: "#F5A623", "stroke-width": "2.5" })
        );
        break;
      }
      case "star-filled": {
        svg.append(
          svgEl("path", {
            d: "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z",
            fill: "#F5A623",
            stroke: "#1F2438"
          })
        );
        break;
      }
      case "star-empty": {
        svg.append(
          svgEl("path", {
            d: "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z",
            fill: "#EFE6D5",
            stroke: "#B89B72"
          })
        );
        break;
      }
      case "sun-compass": {
        svg.setAttribute("stroke-width", "1.1");
        svg.append(
          svgEl("circle", { cx: "12", cy: "12", r: "5.8", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "1.1" }),
          svgEl("path", { d: "M10.75 4.8L12 1.3L13.25 4.8Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M16.21 6.02L19.56 4.44L17.98 7.79Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M19.2 10.75L22.7 12L19.2 13.25Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M17.98 16.21L19.56 19.56L16.21 17.98Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M13.25 19.2L12 22.7L10.75 19.2Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M7.79 17.98L4.44 19.56L6.02 16.21Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M4.8 13.25L1.3 12L4.8 10.75Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" }),
          svgEl("path", { d: "M6.02 7.79L4.44 4.44L7.79 6.02Z", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "0.9" })
        );
        break;
      }
      case "stopwatch": {
        const handGroup = svgEl("g", { class: "stopwatch-hand" });
        handGroup.append(
          svgEl("path", { d: "M12 9v4.2l2.8 1.8", stroke: "#C73C24" })
        );
        svg.append(
          svgEl("path", { d: "M9.5 2.5h5M12 2.5v2.5M18.2 5.8l1.6-1.6M5.8 5.8L4.2 4.2" }),
          svgEl("circle", { cx: "12", cy: "13", r: "8", fill: "#FFF7DC" }),
          handGroup
        );
        break;
      }
      case "sunburst-flame": {
        svg.append(
          svgEl("path", {
            d: "M12.5 2.5c.6 3.2-2.2 4.8-1.4 7.5.6 1.8 2.6 2.2 3.2.4.9 1.6 1.2 3.9-.2 5.8-1.6 2.2-4.9 2.6-6.9.7-1.9-1.8-2-5.1-.2-7.6 1.4-2 3.8-3.8 5.5-6.8z",
            fill: "#C73C24"
          }),
          svgEl("path", {
            d: "M12 12.2c.5 1.1 1.6 1.5 1.8 2.7.2 1.3-.9 2.5-2.1 2.5-1.3 0-2.2-1.1-1.9-2.4.3-1.2 1.4-1.8 2.2-2.8z",
            fill: "#F5A623",
            stroke: "none"
          })
        );
        break;
      }
      case "sticker-peel": {
        svg.append(
          svgEl("circle", { cx: "12", cy: "12", r: "8.8", fill: "#F5A623" }),
          svgEl("circle", { cx: "12", cy: "12", r: "5.8", fill: "#FFF7DC" }),
          svgEl("path", { d: "M14.8 19.8c0-3.2 1.8-5 5-5", fill: "#FFFFFF" })
        );
        break;
      }
      case "lantern-bulb": {
        svg.append(
          svgEl("path", {
            d: "M9 17h6M10 20.5h4M8.2 14.2C6.8 12.9 6 11.1 6 9a6 6 0 0 1 12 0c0 2.1-.8 3.9-2.2 5.2-.6.6-1 1.4-1.1 2.3H9.3c-.1-.9-.5-1.7-1.1-2.3z",
            fill: "#F5A623"
          })
        );
        break;
      }
      case "padlock": {
        svg.append(
          svgEl("rect", { x: "5", y: "10.5", width: "14", height: "10.5", rx: "2.5", fill: "#DEC9A8" }),
          svgEl("path", { d: "M8 10.5V7.5a4 4 0 0 1 8 0v3" }),
          svgEl("circle", { cx: "12", cy: "15.5", r: "1.4", fill: "#1F2438" })
        );
        break;
      }
      case "trophy": {
        svg.append(
          svgEl("path", { d: "M7 4h10v5a5 5 0 0 1-10 0V4z", fill: "#F5A623" }),
          svgEl("path", { d: "M7 6H4.5a2 2 0 0 0 0 4H7M17 6h2.5a2 2 0 0 1 0 4H17M12 14v4M8.5 18h7v2.5h-7z" })
        );
        break;
      }
      case "shield-key": {
        svg.append(
          svgEl("path", {
            d: "M12 2.8l7.5 3.2v5.4c0 5-3.2 8.6-7.5 10.1-4.3-1.5-7.5-5.1-7.5-10.1V6L12 2.8z",
            fill: "#1B7A6E"
          }),
          svgEl("circle", { cx: "12", cy: "10.5", r: "2", fill: "#FFF7DC" }),
          svgEl("path", { d: "M12 12.5v3.5", stroke: "#FFF7DC" })
        );
        break;
      }
      case "menu-dots": {
        svg.append(
          svgEl("circle", { cx: "5.5", cy: "12", r: "2", fill: "#1F2438" }),
          svgEl("circle", { cx: "12", cy: "12", r: "2", fill: "#1F2438" }),
          svgEl("circle", { cx: "18.5", cy: "12", r: "2", fill: "#1F2438" })
        );
        break;
      }
      case "speaker-on": {
        svg.append(
          svgEl("path", { d: "M4 9.5h3.8L13 5v14l-5.2-4.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z", fill: "#F5A623" }),
          svgEl("path", { d: "M16.5 8.8a4.5 4.5 0 0 1 0 6.4M19.2 6.2a8 8 0 0 1 0 11.6" })
        );
        break;
      }
      case "speaker-off":
      default: {
        svg.append(
          svgEl("path", { d: "M4 9.5h3.8L13 5v14l-5.2-4.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z", fill: "#EFE6D5" }),
          svgEl("path", { d: "M16.5 9.5l4.5 4.5M21 9.5L16.5 14", stroke: "#C73C24" })
        );
        break;
      }
    }

    return svg;
  }

  // Section 3.2: Pip the Detective Owl SVG Mascot (.pip-curious, .pip-cheering, .pip-encouraging)
  function createPipMascotSvg(pose = "curious") {
    const svg = svgEl("svg", {
      viewBox: "0 0 120 120",
      "aria-hidden": "true",
      focusable: "false"
    });

    svg.append(
      svgEl("ellipse", { cx: "60", cy: "110", rx: "34", ry: "6", fill: "#DEC9A8" })
    );

    if (pose === "cheering") {
      svg.append(
        svgEl("path", {
          d: "M24 68C10 52 12 34 24 30c8-2 12 10 10 24z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        }),
        svgEl("path", {
          d: "M96 68c14-16 12-34 0-38-8-2-12 10-10 24z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        }),
        svgEl("circle", { cx: "16", cy: "22", r: "6", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "2.5" }),
        svgEl("circle", { cx: "104", cy: "22", r: "6", fill: "#F5A623", stroke: "#1F2438", "stroke-width": "2.5" })
      );
    } else if (pose === "encouraging") {
      svg.append(
        svgEl("path", {
          d: "M26 56c-12 6-14 22-4 30 6 4 12-4 10-16z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        }),
        svgEl("path", {
          d: "M94 58c14-10 16-24 6-30-7-4-12 6-10 18z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        })
      );
    } else {
      svg.append(
        svgEl("path", {
          d: "M25 56c-10 8-10 26 0 32 6 4 10-4 8-16z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        }),
        svgEl("path", {
          d: "M95 56c10 8 10 26 0 32-6 4-10-4-8-16z",
          fill: "#9E6B43",
          stroke: "#1F2438",
          "stroke-width": "3"
        })
      );
    }

    svg.append(
      svgEl("rect", {
        x: "26",
        y: "30",
        width: "68",
        height: "74",
        rx: "34",
        fill: "#B88256",
        stroke: "#1F2438",
        "stroke-width": "3.2"
      }),
      svgEl("ellipse", {
        cx: "60",
        cy: "76",
        rx: "23",
        ry: "22",
        fill: "#FFF7DC",
        stroke: "#1F2438",
        "stroke-width": "2.5"
      }),
      svgEl("path", {
        d: "M50 72l4 4 4-4M62 72l4 4 4-4M56 82l4 4 4-4",
        fill: "none",
        stroke: "#B88256",
        "stroke-width": "2.5",
        "stroke-linecap": "round"
      }),
      svgEl("path", {
        d: "M44 104h10M66 104h10",
        stroke: "#F5A623",
        "stroke-width": "5",
        "stroke-linecap": "round"
      }),
      svgEl("circle", {
        cx: "46",
        cy: "52",
        r: "14",
        fill: "#FFFDF9",
        stroke: "#1F2438",
        "stroke-width": "3"
      }),
      svgEl("circle", {
        cx: "74",
        cy: "52",
        r: "14",
        fill: "#FFFDF9",
        stroke: "#1F2438",
        "stroke-width": "3"
      }),
      svgEl("circle", { cx: "46", cy: "52", r: "6.5", fill: "#1F2438" }),
      svgEl("circle", { cx: "74", cy: "52", r: "6.5", fill: "#1F2438" }),
      svgEl("circle", { cx: "44", cy: "49.5", r: "2.2", fill: "#FFFDF9" }),
      svgEl("circle", { cx: "72", cy: "49.5", r: "2.2", fill: "#FFFDF9" }),
      svgEl("path", {
        d: "M55 56h10l-5 8z",
        fill: "#F5A623",
        stroke: "#1F2438",
        "stroke-width": "2.5",
        "stroke-linejoin": "round"
      }),
      svgEl("path", {
        d: "M30 34c4-14 20-20 30-20s26 6 30 20H30z",
        fill: "#1B7A6E",
        stroke: "#1F2438",
        "stroke-width": "3"
      }),
      svgEl("path", {
        d: "M24 34h72",
        stroke: "#115249",
        "stroke-width": "5",
        "stroke-linecap": "round"
      }),
      svgEl("circle", {
        cx: "60",
        cy: "13",
        r: "4",
        fill: "#F5A623",
        stroke: "#1F2438",
        "stroke-width": "2.5"
      })
    );

    if (pose === "curious") {
      svg.append(
        svgEl("circle", {
          cx: "76",
          cy: "52",
          r: "15.5",
          fill: "rgba(27, 122, 110, 0.16)",
          stroke: "#F5A623",
          "stroke-width": "3.5"
        }),
        svgEl("path", {
          d: "M87 63l14 14",
          stroke: "#C73C24",
          "stroke-width": "5",
          "stroke-linecap": "round"
        })
      );
    }

    return svg;
  }

  function renderPipMascots() {
    const configs = [
      ["homePipMascot", "curious"],
      ["betweenPipMascot", "cheering"],
      ["resultPipMascot", "cheering"],
      ["demoPipCurious", "curious"],
      ["demoPipCheer", "cheering"]
    ];
    for (const [id, defaultPose] of configs) {
      const container = document.getElementById(id);
      if (!container) continue;
      const pose = container.classList.contains("pip-encouraging")
        ? "encouraging"
        : container.classList.contains("pip-cheering")
          ? "cheering"
          : defaultPose;
      container.replaceChildren(createPipMascotSvg(pose));
    }
    const playPip = document.querySelector("[data-v142-play-pip]");
    if (playPip) {
      playPip.replaceChildren(createPipMascotSvg("curious"));
    }
  }
  window.createPipMascotSvg = createPipMascotSvg;

  function setPipPose(id, pose) {
    const container = document.getElementById(id);
    if (!container) return;
    container.classList.remove("pip-curious", "pip-cheering", "pip-encouraging");
    container.classList.add(`pip-${pose}`);
    container.replaceChildren(createPipMascotSvg(pose));
  }

  // Sync the chosen mode icon inside #playNowButton on load and whenever chooseMode runs
  function syncPlayButtonModeIcon(modeArg) {
    const mode =
      modeArg ||
      (typeof state !== "undefined" && state && state.selectedMode) ||
      "untimed";
    const playBtn = document.getElementById("playNowButton");
    if (!playBtn) return;
    playBtn.dataset.selectedMode = mode;
    const iconName = mode === "timed" ? "stopwatch" : "sun-compass";
    let badge = playBtn.querySelector(".hero-play-mode-icon");
    if (!badge) {
      const glyphsWrap = playBtn.querySelector(".hero-play-glyphs") || playBtn;
      badge = document.createElement("span");
      badge.className = "hero-play-mode-icon";
      badge.setAttribute("aria-hidden", "true");
      glyphsWrap.append(badge);
    }
    badge.dataset.icon = iconName;
    badge.replaceChildren(createSvgIcon(iconName));
  }

  // Section 4.3: Web Audio API Sound Hooks (Session-Only ON by default, unlocked on first gesture)
  function getOrCreateAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!uiState.audioCtx || uiState.audioCtx.state === "closed") {
      try {
        uiState.audioCtx = new AudioCtx();
        uiState.audioCtx.onstatechange = () => {
          if (!uiState.audioCtx || uiState.audioCtx.state !== "running") {
            armUnlockListeners();
          } else {
            disarmUnlockListeners();
          }
        };
      } catch (_err) {
        uiState.audioCtx = null;
        return null;
      }
    }
    return uiState.audioCtx;
  }

  function playSilentUnlockBuffer(ctx) {
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      if (typeof source.start === "function") {
        source.start(0);
      } else if (typeof source.noteOn === "function") {
        source.noteOn(0);
      }
    } catch (_err) {
      /* ignore silent buffer unlock errors */
    }
  }

  function handleGestureUnlock() {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    playSilentUnlockBuffer(ctx);
    if (ctx.state === "running") {
      disarmUnlockListeners();
      return;
    }
    if (typeof ctx.resume === "function") {
      ctx.resume().then(() => {
        playSilentUnlockBuffer(ctx);
        if (ctx.state === "running") {
          disarmUnlockListeners();
        }
      }).catch(() => {});
    }
  }

  function armUnlockListeners() {
    if (uiState.unlockArmed) return;
    if (uiState.audioCtx && uiState.audioCtx.state === "running") return;
    for (const evt of UNLOCK_EVENTS) {
      document.addEventListener(evt, handleGestureUnlock, { capture: true, passive: true });
    }
    uiState.unlockArmed = true;
  }

  function disarmUnlockListeners() {
    if (!uiState.unlockArmed) return;
    for (const evt of UNLOCK_EVENTS) {
      document.removeEventListener(evt, handleGestureUnlock, { capture: true });
    }
    uiState.unlockArmed = false;
  }

  function playTone(ctx, freq, startTime, duration, type = "sine", peakGain = 0.14, endFreq = null) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      if (endFreq !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + duration);
      }
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.018, duration * 0.25));
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    } catch (_err) {
      /* ignore oscillator scheduling errors */
    }
  }

  function scheduleSoundAt(ctx, kind, detail, baseTime) {
    const info = detail && typeof detail === "object" ? detail : {};
    if (kind === "hit") {
      // C Major Pentatonic ladder (C5, D5, E5, G5, A5, C6)
      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
      const rawCount = Number.isFinite(info.foundCount)
        ? info.foundCount
        : (typeof state !== "undefined" && state && state.run && state.run.found ? state.run.found.size : 1);
      const index = Math.min(Math.max(0, (rawCount || 1) - 1), scale.length - 1);
      const rootFreq = scale[index];
      playTone(ctx, rootFreq, baseTime, 0.14, "triangle", 0.20);
      playTone(ctx, rootFreq * 1.25, baseTime + 0.06, 0.20, "sine", 0.18);
      // Soft star-land tick
      playTone(ctx, rootFreq * 1.5, baseTime + 0.15, 0.07, "sine", 0.10);
    } else if (kind === "miss") {
      playTone(ctx, 165, baseTime, 0.11, "sine", 0.14, 88);
      playTone(ctx, 240, baseTime + 0.01, 0.06, "triangle", 0.07, 132);
    } else if (kind === "hint") {
      const arpeggio = [659.25, 880.0, 1174.66];
      arpeggio.forEach((freq, idx) => {
        playTone(ctx, freq, baseTime + idx * 0.055, 0.22, "sine", 0.12);
      });
    } else if (kind === "clear") {
      const fanfare = [
        { freq: 523.25, delay: 0.0, dur: 0.18, type: "triangle", gain: 0.18 },
        { freq: 659.25, delay: 0.09, dur: 0.18, type: "triangle", gain: 0.18 },
        { freq: 783.99, delay: 0.18, dur: 0.18, type: "triangle", gain: 0.18 },
        { freq: 1046.5, delay: 0.28, dur: 0.36, type: "triangle", gain: 0.18 },
        { freq: 1174.66, delay: 0.32, dur: 0.38, type: "sine", gain: 0.14 }
      ];
      fanfare.forEach(({ freq, delay, dur, type, gain }) => {
        playTone(ctx, freq, baseTime + delay, dur, type, gain);
      });
    } else if (kind === "gameover") {
      if (info.reason === "completed") {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1174.66, 1318.51];
        notes.forEach((n, idx) => {
          playTone(ctx, n, baseTime + idx * 0.08, 0.18, "triangle", 0.17);
        });
      } else if (info.reason === "timeout") {
        playTone(ctx, 392.0, baseTime, 0.14, "triangle", 0.14);
        playTone(ctx, 349.23, baseTime + 0.11, 0.15, "sine", 0.13);
        playTone(ctx, 329.63, baseTime + 0.22, 0.22, "sine", 0.12);
      } else {
        playTone(ctx, 349.23, baseTime, 0.14, "sine", 0.12);
        playTone(ctx, 293.66, baseTime + 0.11, 0.16, "sine", 0.11);
        playTone(ctx, 261.63, baseTime + 0.22, 0.22, "sine", 0.10);
      }
    } else if (kind === "sticker-land") {
      const notes = [587.33, 739.99, 880.0, 1174.66];
      notes.forEach((n, idx) => {
        playTone(ctx, n, baseTime + idx * 0.065, 0.22, "triangle", 0.16);
      });
    } else if (kind === "sticker-chime") {
      playTone(ctx, 783.99, baseTime, 0.14, "sine", 0.15);
      playTone(ctx, 1046.5, baseTime + 0.07, 0.22, "triangle", 0.16);
    } else if (kind === "sticker-drop") {
      playTone(ctx, 220, baseTime, 0.09, "sine", 0.14, 150);
      const world = info.world || "jungle";
      const chord = world === "ocean"
        ? [659.25, 987.77, 1318.51]
        : world === "space"
          ? [523.25, 783.99, 1567.98]
          : [587.33, 739.99, 880.0];
      chord.forEach((freq, idx) => {
        playTone(ctx, freq, baseTime + 0.04 + idx * 0.055, 0.22, "triangle", 0.15);
      });
    } else if (kind === "pip-chirp") {
      playTone(ctx, 660, baseTime, 0.11, "sine", 0.14, 920);
      playTone(ctx, 990, baseTime + 0.09, 0.14, "triangle", 0.14);
    }
  }

  const soundLog = [];
  window.soundLog = soundLog;

  function playSound(kind, detail = {}) {
    soundLog.push({ kind, detail, at: Date.now() });
    if (typeof state !== "undefined" && state) {
      state.soundLog = soundLog;
      state.lastSound = kind;
    }
    if (!uiState.soundEnabled) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    const extraDelay = typeof detail.delay === "number" && detail.delay > 0 ? detail.delay : 0;

    if (ctx.state === "running") {
      scheduleSoundAt(ctx, kind, detail, ctx.currentTime + 0.005 + extraDelay);
      return;
    }

    armUnlockListeners();
    if (typeof ctx.resume === "function") {
      ctx.resume().then(() => {
        if (uiState.soundEnabled && ctx.state === "running") {
          scheduleSoundAt(ctx, kind, detail, ctx.currentTime + 0.005 + extraDelay);
        }
      }).catch(() => {});
    }
  }

  window.playSound = playSound;

  function emitSound(kind, detail = {}) {
    if (typeof window.playSound === "function") {
      window.playSound(kind, detail);
    } else {
      playSound(kind, detail);
    }
  }

  function updateSoundToggleUI() {
    syncAppStateSoundFlag();
    const btn = document.getElementById("soundToggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(uiState.soundEnabled));
    const label = `Sound effects: ${uiState.soundEnabled ? "On" : "Off"}`;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.dataset.icon = uiState.soundEnabled ? "speaker-on" : "speaker-off";
    btn.replaceChildren(createSvgIcon(btn.dataset.icon));
  }

  function toggleSound(event) {
    if (event) {
      event.stopPropagation();
    }
    uiState.soundEnabled = !uiState.soundEnabled;
    updateSoundToggleUI();
    if (uiState.soundEnabled) {
      handleGestureUnlock();
      emitSound("hint");
    }
  }

  // First-Play Wordless Demo Overlay (#demoOverlay / #demoGo)
  function isFirstEverPlay() {
    if (typeof state !== "undefined" && state.counters) {
      return !state.counters.firstPlay;
    }
    try {
      const raw = window.localStorage.getItem("sd_counters_v3");
      if (!raw) return true;
      const parsed = JSON.parse(raw);
      return !(parsed && parsed.firstPlay);
    } catch (_err) {
      return false;
    }
  }

  function isPlainLevelRunOptions(options) {
    if (!options || typeof options !== "object") return true;
    if (options.daily || options.duel || options.challenge || Number.isInteger(options.startIndex)) {
      return false;
    }
    return true;
  }

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function closeDemoOverlay() {
    if (!uiState.demoActive) return;
    uiState.demoActive = false;
    if (typeof state !== "undefined" && state) {
      state.lastFrameAt = null;
    }
    if (uiState.demoTimer) {
      window.clearTimeout(uiState.demoTimer);
      uiState.demoTimer = 0;
    }
    const overlay = document.getElementById("demoOverlay");
    if (overlay) {
      overlay.classList.remove("is-playing");
      overlay.hidden = true;
      overlay.setAttribute("hidden", "");
    }
    const cb = uiState.demoFinishHandler;
    const focusTarget = uiState.demoReturnFocusEl;
    uiState.demoFinishHandler = null;
    uiState.demoReturnFocusEl = null;
    if (typeof cb === "function") {
      cb();
    } else if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  function openDemoOverlay(onComplete, returnFocusEl) {
    const overlay = document.getElementById("demoOverlay");
    const goBtn = document.getElementById("demoGo");
    if (!overlay) {
      if (typeof onComplete === "function") onComplete();
      return;
    }
    if (typeof state !== "undefined" && state) {
      state.lastFrameAt = null;
    }
    if (uiState.demoTimer) {
      window.clearTimeout(uiState.demoTimer);
      uiState.demoTimer = 0;
    }
    uiState.demoActive = true;
    uiState.demoFinishHandler = typeof onComplete === "function" ? onComplete : null;
    uiState.demoReturnFocusEl = returnFocusEl || null;

    overlay.classList.remove("is-playing");
    overlay.hidden = false;
    overlay.removeAttribute("hidden");
    void overlay.offsetWidth;
    overlay.classList.add("is-playing");

    if (goBtn && typeof goBtn.focus === "function") {
      goBtn.focus();
    }

    const durationMs = prefersReducedMotion() ? 2500 : 5000;
    uiState.demoTimer = window.setTimeout(() => {
      closeDemoOverlay();
    }, durationMs);
  }

  function bindDemoOverlay() {
    const overlay = document.getElementById("demoOverlay");
    const goBtn = document.getElementById("demoGo");
    if (overlay && overlay.dataset.v12Bound !== "true") {
      overlay.dataset.v12Bound = "true";
      overlay.addEventListener("click", event => {
        if (!uiState.demoActive) return;
        event.preventDefault();
        event.stopPropagation();
        closeDemoOverlay();
      });
    }
    if (goBtn && goBtn.dataset.v12Bound !== "true") {
      goBtn.dataset.v12Bound = "true";
      goBtn.addEventListener("click", event => {
        if (!uiState.demoActive) return;
        event.preventDefault();
        event.stopPropagation();
        closeDemoOverlay();
      });
    }
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && uiState.demoActive) {
        event.preventDefault();
        event.stopPropagation();
        closeDemoOverlay();
      }
    });
  }

  function createDemoHandIconSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 56 56",
      class: "svg-icon icon-show-me-hand",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.append(
      svgEl("path", {
        d: "M22 8C22 5.2 24.2 3 27 3C29.8 3 32 5.2 32 8V23H35C37.2 23 39 24.8 39 27V28.5H41.5C43.7 28.5 45.5 30.3 45.5 32.5V39C45.5 46.2 39.7 52 32.5 52H23.5C17.4 52 12.5 47.1 12.5 41V31C12.5 28.5 14.5 26.5 17 26.5H22V8Z",
        fill: "#FFF7DC",
        stroke: "#1F2438",
        "stroke-width": "3.2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      })
    );
    return svg;
  }

  let showMeFirstSessionArmed = false;
  let showMeFirstSessionTimer = 0;

  function dismissShowMeFirstSessionLabel() {
    if (showMeFirstSessionTimer) {
      window.clearTimeout(showMeFirstSessionTimer);
      showMeFirstSessionTimer = 0;
    }
    const btn = document.getElementById("replayDemoButton");
    if (btn) {
      btn.classList.remove("is-first-session-label");
    }
  }

  function armShowMeFirstSessionLabel() {
    if (showMeFirstSessionArmed) return;
    injectPlayDockDemoReplayButton();
    const btn = document.getElementById("replayDemoButton");
    if (!btn) return;
    showMeFirstSessionArmed = true;
    btn.classList.add("is-first-session-label");
    if (showMeFirstSessionTimer) {
      window.clearTimeout(showMeFirstSessionTimer);
    }
    showMeFirstSessionTimer = window.setTimeout(() => {
      showMeFirstSessionTimer = 0;
      btn.classList.remove("is-first-session-label");
    }, 3000);
  }

  function injectPlayDockDemoReplayButton() {
    const dock = document.querySelector("#gameView .game-actions");
    if (!dock) return;
    let btn = document.getElementById("replayDemoButton");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "replayDemoButton";
    }
    const keepFirstLabel = btn.classList.contains("is-first-session-label");
    btn.className = `quiet-button demo-replay-btn${keepFirstLabel ? " is-first-session-label" : ""}`;
    btn.setAttribute("aria-label", "Show me");
    btn.setAttribute("title", "Show me");
    const label = document.createElement("span");
    label.className = "demo-replay-label";
    label.setAttribute("data-v142-show-me-label", "true");
    label.textContent = "Show me";
    btn.replaceChildren(createDemoHandIconSvg(), label);
    if (btn.dataset.v142Bound !== "true") {
      btn.dataset.v142Bound = "true";
      btn.addEventListener("click", () => {
        dismissShowMeFirstSessionLabel();
        if (typeof closePlayMore === "function") closePlayMore();
        openDemoOverlay(null, btn);
      });
    }
    const moreWrap = document.getElementById("playMoreWrap");
    if (moreWrap && moreWrap.parentNode === dock) {
      dock.insertBefore(btn, moreWrap);
    } else {
      dock.append(btn);
    }
  }

  const PIP_BUBBLE_LINES = Object.freeze([
    "Great eyes!",
    "Ready to look!",
    "Hoo-ray!"
  ]);
  let playPipTimer = 0;

  function triggerPlayPipReaction(kind, side = "right") {
    const playPip = document.querySelector("[data-v142-play-pip]");
    if (!playPip) return;
    if (playPipTimer) {
      window.clearTimeout(playPipTimer);
      playPipTimer = 0;
    }
    playPip.classList.remove("is-hop", "pip-hop", "is-tilt", "pip-tilt", "is-lean-left", "is-lean-right", "pip-lean");
    void playPip.offsetWidth;
    let duration = 650;
    if (kind === "hop") {
      playPip.classList.add("is-hop", "pip-hop");
      duration = 650;
    } else if (kind === "tilt") {
      playPip.classList.add("is-tilt", "pip-tilt");
      duration = 550;
    } else if (kind === "lean") {
      playPip.classList.add("pip-lean", side === "left" ? "is-lean-left" : "is-lean-right");
      duration = 900;
    }
    playPipTimer = window.setTimeout(() => {
      playPip.classList.remove("is-hop", "pip-hop", "is-tilt", "pip-tilt", "is-lean-left", "is-lean-right", "pip-lean");
      playPipTimer = 0;
    }, duration);
  }

  function showPipTapBubble(pipEl, preferredIndex = null) {
    if (!pipEl) return;
    document.querySelectorAll("[data-v142-pip-bubble]").forEach(el => el.remove());
    emitSound("pip-chirp");
    pipEl.classList.remove("is-hop", "pip-hop");
    void pipEl.offsetWidth;
    pipEl.classList.add("is-hop", "pip-hop");
    if (pipEl._hopTimer) window.clearTimeout(pipEl._hopTimer);
    pipEl._hopTimer = window.setTimeout(() => {
      pipEl.classList.remove("is-hop", "pip-hop");
      pipEl._hopTimer = 0;
    }, 650);

    const lineIdx = Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < PIP_BUBBLE_LINES.length
      ? preferredIndex
      : 0;
    const bubble = document.createElement("span");
    bubble.className = "pip-speech-bubble";
    bubble.setAttribute("data-v142-pip-bubble", "true");
    bubble.textContent = PIP_BUBBLE_LINES[lineIdx];
    pipEl.append(bubble);

    if (pipEl._bubbleTimer) window.clearTimeout(pipEl._bubbleTimer);
    pipEl._bubbleTimer = window.setTimeout(() => {
      bubble.remove();
      pipEl._bubbleTimer = 0;
    }, 1500);
  }

  function bindInteractivePipsAndHighFive() {
    const pipConfigs = [
      ["homePipMascot", 1],
      ["betweenPipMascot", 0],
      ["resultPipMascot", 2]
    ];
    for (const [id, defaultIdx] of pipConfigs) {
      const pipEl = document.getElementById(id);
      if (!pipEl || pipEl.dataset.v142TapBound === "true") continue;
      pipEl.dataset.v142TapBound = "true";
      pipEl.addEventListener("click", event => {
        if (id === "homePipMascot") {
          const playBtn = document.getElementById("playNowButton");
          if (playBtn && event && Number.isFinite(event.clientY)) {
            const playRect = playBtn.getBoundingClientRect();
            if (event.clientY >= playRect.top) {
              event.stopPropagation();
              playBtn.click();
              return;
            }
          }
        }
        event.stopPropagation();
        showPipTapBubble(pipEl, defaultIdx);
      });
    }

    const highFiveBtn = document.querySelector("[data-v142-high-five]");
    if (highFiveBtn && highFiveBtn.dataset.v142Bound !== "true") {
      highFiveBtn.dataset.v142Bound = "true";
      const label = document.createElement("span");
      label.textContent = "High five!";
      highFiveBtn.replaceChildren(createSvgIcon("star-filled"), label);
      highFiveBtn.addEventListener("click", () => {
        emitSound("clear");
        highFiveBtn.classList.remove("is-bursting");
        void highFiveBtn.offsetWidth;
        highFiveBtn.classList.add("is-bursting");
        const burst = document.createElement("span");
        burst.className = "high-five-star-burst";
        burst.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 5; i += 1) {
          const s = document.createElement("span");
          s.className = `burst-star burst-star-${i + 1}`;
          s.append(createSvgIcon("star-filled"));
          burst.append(s);
        }
        highFiveBtn.append(burst);
        window.setTimeout(() => {
          burst.remove();
          highFiveBtn.classList.remove("is-bursting");
        }, 700);
      });
    }
  }

  // Decorate static [data-icon] elements with pure-DOM SVGs and accessible names
  function decorateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach(el => {
      if (el.id === "stickerBookButton") return;
      const iconName = el.dataset.icon;
      if (!iconName) return;
      if (
        el.id === "soundToggle" ||
        el.id === "playMoreButton" ||
        el.classList.contains("brand-symbol") ||
        el.classList.contains("mode-icon") ||
        el.classList.contains("hero-play-mode-icon") ||
        el.classList.contains("star-glyph") ||
        el.id === "timerIcon"
      ) {
        el.replaceChildren(createSvgIcon(iconName));
        return;
      }
      if (el.id === "boardsNav" || el.id === "grownNav") {
        const labelText = el.textContent.trim();
        if (labelText) {
          el.setAttribute("aria-label", labelText);
          el.setAttribute("title", labelText);
        }
      }
      const existingIcon = el.querySelector(":scope > .svg-icon");
      if (existingIcon) {
        existingIcon.replaceWith(createSvgIcon(iconName));
      } else {
        el.prepend(createSvgIcon(iconName));
      }
    });
  }

  // Section 4.2: Explorer Rank Titles derived from existing completed counts (zero text emoji)
  function explorerTitleForStars(stars) {
    if (stars >= 50) return "Master Detective";
    if (stars >= 25) return "Sharp Spotter";
    if (stars >= 10) return "Curious Scout";
    return "New Explorer";
  }

  function renderRankBadge(el, starsCount) {
    if (!el) return;
    const textSpan = document.createElement("span");
    textSpan.textContent = `${starsCount} / 50 · ${explorerTitleForStars(starsCount)}`;
    el.replaceChildren(createSvgIcon("star-filled"), textSpan);
  }

  function syncModeRanksAndStars() {
    if (typeof state === "undefined" || !state.counters) return;
    const untimedStarsCount = Math.min(50, (state.counters.untimed?.completed || 0) * 5);
    const timedStarsCount = Math.min(50, (state.counters.timed?.completed || 0) * 5);
    renderRankBadge(document.getElementById("untimedRank"), untimedStarsCount);
    renderRankBadge(document.getElementById("timedRank"), timedStarsCount);
  }

  // Keep each phrase in #betweenScore / #resultScore whole so narrow screens never break mid-phrase
  function formatPhraseContainer(el, delimiter) {
    if (!el) return;
    const raw = el.textContent || "";
    if (!raw.includes(delimiter)) return;
    const parts = raw.split(delimiter);
    el.replaceChildren();
    parts.forEach((part, idx) => {
      if (idx > 0) {
        const sep = document.createElement("span");
        sep.className = "score-sep";
        sep.textContent = delimiter;
        el.append(sep);
      }
      const phrase = document.createElement("span");
      phrase.className = "score-phrase";
      phrase.textContent = part;
      el.append(phrase);
    });
  }

  // Replace emoji in Daily Card with custom SVG icons
  function enhanceDailyCardDOM() {
    if (typeof els === "undefined") return;
    if (els.dailyButton) {
      const labelText = els.dailyButton.textContent.trim() || "Daily Hunt";
      const span = document.createElement("span");
      span.textContent = labelText;
      els.dailyButton.replaceChildren(createSvgIcon("spyglass"), span);
    }
    if (typeof renderHomeStickerCard === "function") {
      renderHomeStickerCard();
    }
    if (els.dailyStreak && typeof state !== "undefined") {
      const streak = state.counters?.daily?.streak || 0;
      els.dailyStreak.hidden = streak < 1;
      if (streak > 0) {
        const span = document.createElement("span");
        span.textContent = `${streak}-day streak`;
        els.dailyStreak.replaceChildren(createSvgIcon("sunburst-flame"), span);
      } else {
        els.dailyStreak.replaceChildren();
      }
    }
  }

  // Replace leading lock glyph in Levels Picker with custom padlock SVG icon
  function enhanceLevelsPickerDOM() {
    const container = document.getElementById("levelChoices");
    if (!container) return;
    container.querySelectorAll(".level-choice").forEach(btn => {
      const raw = btn.textContent.trim();
      const label = document.createElement("span");
      label.textContent = raw;
      if (btn.disabled) {
        btn.replaceChildren(createSvgIcon("padlock"), label);
      } else {
        btn.replaceChildren(createSvgIcon("star-filled"), label);
      }
    });
  }

  // Section 4.2 & 6: Responsive Sticker Windows (72px at 390px, 88px at 768px+)
  function syncResponsiveStickerSlots() {
    if (typeof state === "undefined" || typeof dailyPuzzle !== "function") return;
    const grid = document.getElementById("stickerGrid");
    if (!grid) return;
    const isTabletOrUp = window.innerWidth >= 768;
    const windowSize = isTabletOrUp ? 88 : 72;
    const imageWidth = windowSize * 2;
    const center = windowSize / 2;

    const earned = state.counters?.stickers || [];
    const slots = grid.querySelectorAll(".sticker-slot");
    slots.forEach((slot, idx) => {
      const tomorrow = slot.classList.contains("tomorrow");
      const day = tomorrow ? nextDay(dateKey()) : earned[idx];
      if (!day) return;
      const puzzle = dailyPuzzle(day);
      const picture = slot.querySelector(".sticker-image");
      if (!puzzle || !picture || !puzzle.differences?.[0]) return;
      const diff = puzzle.differences[0];
      const imageHeight = (imageWidth * puzzle.height) / puzzle.width;
      picture.style.width = `${imageWidth}px`;
      picture.style.height = `${imageHeight}px`;
      picture.style.left = `${center - diff.x * imageWidth}px`;
      picture.style.top = `${center - diff.y * imageHeight}px`;
    });
  }

  // Wrap global app.js functions before DOMContentLoaded fires
  function hookGlobalFunctions() {
    if (typeof window.chooseMode === "function") {
      const origChooseMode = window.chooseMode;
      window.chooseMode = function wrappedChooseMode(mode) {
        const res = origChooseMode.apply(this, arguments);
        const activeMode =
          typeof state !== "undefined" && state && state.selectedMode
            ? state.selectedMode
            : mode;
        syncPlayButtonModeIcon(activeMode);
        return res;
      };
    }

    if (typeof window.renderTimedBest === "function") {
      const origRenderTimedBest = window.renderTimedBest;
      window.renderTimedBest = function wrappedRenderTimedBest(...args) {
        const res = origRenderTimedBest.apply(this, args);
        syncModeRanksAndStars();
        return res;
      };
    }

    if (typeof window.renderDailyCard === "function") {
      const origRenderDailyCard = window.renderDailyCard;
      window.renderDailyCard = function wrappedRenderDailyCard(...args) {
        const res = origRenderDailyCard.apply(this, args);
        enhanceDailyCardDOM();
        return res;
      };
    }

    if (typeof window.renderLevelsPicker === "function") {
      const origRenderLevelsPicker = window.renderLevelsPicker;
      window.renderLevelsPicker = function wrappedRenderLevelsPicker(...args) {
        const res = origRenderLevelsPicker.apply(this, args);
        enhanceLevelsPickerDOM();
        return res;
      };
    }

    if (typeof window.renderStickerBook === "function") {
      const origRenderStickerBook = window.renderStickerBook;
      window.renderStickerBook = function wrappedRenderStickerBook(...args) {
        const res = origRenderStickerBook.apply(this, args);
        syncResponsiveStickerSlots();
        return res;
      };
    }

    if (typeof window.markFound === "function") {
      const origMarkFound = window.markFound;
      window.markFound = function wrappedMarkFound(index) {
        const run = typeof state !== "undefined" ? state.run : null;
        const willMark = Boolean(
          run &&
          !run.found.has(index) &&
          run.phase === "playing"
        );
        const fast = Boolean(
          willMark &&
          run.mode === "timed" &&
          run.lastFindAt !== null &&
          performance.now() - run.lastFindAt <= 3000
        );
        const res = origMarkFound.apply(this, arguments);
        if (willMark) {
          triggerPlayPipReaction("hop");
          emitSound("hit", { fast, foundCount: run ? run.found.size : 1 });
        }
        return res;
      };
    }

    if (typeof window.showMissFeedback === "function") {
      const origShowMissFeedback = window.showMissFeedback;
      window.showMissFeedback = function wrappedShowMissFeedback(...args) {
        const res = origShowMissFeedback.apply(this, args);
        triggerPlayPipReaction("tilt");
        emitSound("miss");
        return res;
      };
    }

    if (typeof window.useHint === "function") {
      const origUseHint = window.useHint;
      window.useHint = function wrappedUseHint(...args) {
        const run = typeof state !== "undefined" ? state.run : null;
        const prevHints = run ? run.totalHints : 0;
        const res = origUseHint.apply(this, args);
        if (run && run.totalHints > prevHints) {
          const targetIdx = Number.isInteger(run.hintTarget) && run.hintTarget >= 0 ? run.hintTarget : 0;
          const diff = run.list?.[run.levelIndex]?.differences?.[targetIdx];
          const xPos = diff && typeof displayX === "function" ? displayX(diff) : (diff ? diff.x : 0.5);
          triggerPlayPipReaction("lean", xPos < 0.5 ? "left" : "right");
          emitSound("hint");
        }
        return res;
      };
    }

    if (typeof window.clearLevel === "function") {
      const origClearLevel = window.clearLevel;
      window.clearLevel = function wrappedClearLevel(...args) {
        const run = typeof state !== "undefined" ? state.run : null;
        const willClear = Boolean(run && run.phase === "playing");
        if (willClear) {
          emitSound("clear");
        }
        const res = origClearLevel.apply(this, args);
        setPipPose("betweenPipMascot", "cheering");
        if (typeof els !== "undefined") {
          if (els.nextLevelButton) {
            els.nextLevelButton.textContent = "Next level";
          }
          if (els.betweenScore) {
            formatPhraseContainer(els.betweenScore, " · ");
          }
        }
        return res;
      };
    }

    if (typeof window.finishRun === "function") {
      const origFinishRun = window.finishRun;
      window.finishRun = function wrappedFinishRun(reason) {
        const res = origFinishRun.apply(this, arguments);
        const banner = document.getElementById("resultBanner");
        if (banner) {
          banner.classList.toggle("is-timeout", reason === "timeout");
        }
        const isCheer = reason === "completed" || (typeof state !== "undefined" && state.run && state.run.kind === "duel");
        setPipPose(
          "resultPipMascot",
          isCheer ? "cheering" : "encouraging"
        );

        if (typeof els !== "undefined") {
          if (els.dailyStickerMessage) {
            const span = document.createElement("span");
            span.textContent = "Sticker added!";
            els.dailyStickerMessage.replaceChildren(createSvgIcon("sticker-peel"), span);
          }
        }

        if (typeof state !== "undefined" && state.view === "stickerBookView" && state.newDailyStickerKey) {
          emitSound("sticker-land", { reason: "completed" });
        } else {
          const delay = reason === "completed" ? 0.45 : 0;
          emitSound("gameover", { reason, delay });
        }
        return res;
      };
    }

    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function wrappedStartLevel(...args) {
        const res = origStartLevel.apply(this, args);
        armShowMeFirstSessionLabel();
        return res;
      };
    }

    if (typeof window.newRun === "function") {
      const origNewRun = window.newRun;
      window.newRun = function wrappedNewRun(options = {}) {
        const callContext = this;
        const callArgs = Array.prototype.slice.call(arguments);
        if (
          !uiState.demoShownThisLoad &&
          isPlainLevelRunOptions(options) &&
          isFirstEverPlay()
        ) {
          uiState.demoShownThisLoad = true;
          openDemoOverlay(() => {
            origNewRun.apply(callContext, callArgs);
          }, document.getElementById("playNowButton"));
          return undefined;
        }
        return origNewRun.apply(callContext, callArgs);
      };
    }
  }

  hookGlobalFunctions();
  armUnlockListeners();
  syncAppStateSoundFlag();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const ctx = uiState.audioCtx;
      if (!ctx || ctx.state !== "running") {
        armUnlockListeners();
        if (ctx && ctx.state !== "closed" && typeof ctx.resume === "function") {
          ctx.resume().catch(() => {});
        }
      }
    }
  });

  window.addEventListener("pageshow", () => {
    const ctx = uiState.audioCtx;
    if (!ctx || ctx.state !== "running") {
      armUnlockListeners();
      if (ctx && ctx.state !== "closed" && typeof ctx.resume === "function") {
        ctx.resume().catch(() => {});
      }
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    decorateStaticIcons();
    renderPipMascots();
    updateSoundToggleUI();
    syncPlayButtonModeIcon();
    syncModeRanksAndStars();
    enhanceDailyCardDOM();
    bindDemoOverlay();
    injectPlayDockDemoReplayButton();
    bindInteractivePipsAndHighFive();

    const soundBtn = document.getElementById("soundToggle");
    if (soundBtn) {
      soundBtn.addEventListener("click", toggleSound);
    }

    window.addEventListener("resize", () => {
      if (typeof state !== "undefined" && state.view === "stickerBookView") {
        syncResponsiveStickerSlots();
      }
    });
  });
})();
