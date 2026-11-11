"use strict";

(function initSpotTheDifferenceV11() {
  const SVG_NS = "http://www.w3.org/2000/svg";

  const uiState = {
    soundEnabled: false,
    audioCtx: null
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  // Section 3.1: 14-Icon Custom SVG Set (viewBox 0 0 24 24, 2.5px stroke in #1F2438)
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
        svg.append(
          svgEl("circle", { cx: "12", cy: "12", r: "8.5", fill: "#FFF7DC" }),
          svgEl("circle", { cx: "12", cy: "12", r: "3", fill: "#F5A623" }),
          svgEl("path", { d: "M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M19.2 4.8l-1.7 1.7M6.5 17.5l-1.7 1.7" })
        );
        break;
      }
      case "stopwatch": {
        svg.append(
          svgEl("path", { d: "M9.5 2.5h5M12 2.5v2.5M18.2 5.8l1.6-1.6M5.8 5.8L4.2 4.2" }),
          svgEl("circle", { cx: "12", cy: "13", r: "8", fill: "#FFF7DC" }),
          svgEl("path", { d: "M12 9v4.2l2.8 1.8", stroke: "#C73C24" })
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
      ["resultPipMascot", "cheering"]
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
  }

  function setPipPose(id, pose) {
    const container = document.getElementById(id);
    if (!container) return;
    container.classList.remove("pip-curious", "pip-cheering", "pip-encouraging");
    container.classList.add(`pip-${pose}`);
    container.replaceChildren(createPipMascotSvg(pose));
  }

  // Section 4.3: Respectful Web Audio API Sound Hooks (Session-Only, Off by Default)
  function ensureAudioContext() {
    if (!uiState.soundEnabled) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!uiState.audioCtx) {
      uiState.audioCtx = new AudioCtx();
    }
    if (uiState.audioCtx.state === "suspended") {
      uiState.audioCtx.resume().catch(() => {});
    }
    return uiState.audioCtx;
  }

  function playTone(ctx, freq, startTime, duration, type = "sine", peakGain = 0.14, endFreq = null) {
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
  }

  function playSound(kind, detail = {}) {
    if (!uiState.soundEnabled) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === "hit") {
      playTone(ctx, 523.25, now, 0.08, "triangle", 0.16);
      playTone(ctx, 783.99, now + 0.065, 0.11, "triangle", 0.18);
      if (detail.fast) {
        playTone(ctx, 1318.51, now + 0.13, 0.12, "sine", 0.14);
      }
    } else if (kind === "miss") {
      playTone(ctx, 175, now, 0.085, "sine", 0.12, 125);
    } else if (kind === "hint") {
      playTone(ctx, 440, now, 0.09, "sine", 0.13);
      playTone(ctx, 659.25, now + 0.08, 0.13, "sine", 0.14);
    } else if (kind === "clear") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        playTone(ctx, n, now + idx * 0.08, 0.13, "triangle", 0.16);
      });
    } else if (kind === "gameover") {
      if (detail.reason === "completed") {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
        notes.forEach((n, idx) => {
          playTone(ctx, n, now + idx * 0.085, 0.15, "triangle", 0.16);
        });
      } else if (detail.reason === "timeout") {
        playTone(ctx, 392.0, now, 0.13, "sine", 0.13);
        playTone(ctx, 329.63, now + 0.12, 0.16, "sine", 0.12);
      }
    }
  }

  function updateSoundToggleUI() {
    const btn = document.getElementById("soundToggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(uiState.soundEnabled));
    const label = `Sound effects: ${uiState.soundEnabled ? "On" : "Off"}`;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.dataset.icon = uiState.soundEnabled ? "speaker-on" : "speaker-off";
    btn.replaceChildren(createSvgIcon(btn.dataset.icon));
  }

  function toggleSound() {
    uiState.soundEnabled = !uiState.soundEnabled;
    updateSoundToggleUI();
    if (uiState.soundEnabled) {
      playSound("hint");
    }
  }

  // Decorate static [data-icon] elements with pure-DOM SVGs and accessible names
  function decorateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach(el => {
      const iconName = el.dataset.icon;
      if (!iconName) return;
      if (
        el.id === "soundToggle" ||
        el.id === "playMoreButton" ||
        el.classList.contains("brand-symbol") ||
        el.classList.contains("mode-icon") ||
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
    if (els.stickerBookButton) {
      const count = (typeof state !== "undefined" && state.counters?.stickers?.length) || 0;
      const span = document.createElement("span");
      span.textContent = `Stickers: ${count} ›`;
      els.stickerBookButton.replaceChildren(createSvgIcon("sticker-peel"), span);
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
      const raw = btn.textContent.replace(/^\uD83D\uDD12\s*/, "").trim();
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
          playSound("hit", { fast });
        }
        return res;
      };
    }

    if (typeof window.showMissFeedback === "function") {
      const origShowMissFeedback = window.showMissFeedback;
      window.showMissFeedback = function wrappedShowMissFeedback(...args) {
        const res = origShowMissFeedback.apply(this, args);
        playSound("miss");
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
          playSound("hint");
        }
        return res;
      };
    }

    if (typeof window.clearLevel === "function") {
      const origClearLevel = window.clearLevel;
      window.clearLevel = function wrappedClearLevel(...args) {
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
        playSound("clear");
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
        setPipPose(
          "resultPipMascot",
          reason === "completed" ? "cheering" : "encouraging"
        );

        if (typeof els !== "undefined") {
          if (els.resultDescription && els.resultDescription.textContent.includes("\uD83D\uDD0D")) {
            els.resultDescription.textContent = els.resultDescription.textContent
              .replace(/\uD83D\uDD0D\s*/g, "");
          }
          if (els.dailyStickerMessage) {
            const span = document.createElement("span");
            span.textContent = "Sticker added!";
            els.dailyStickerMessage.replaceChildren(createSvgIcon("sticker-peel"), span);
          }
          if (els.resultScore) {
            formatPhraseContainer(els.resultScore, " vs ");
          }
        }

        playSound("gameover", { reason });
        return res;
      };
    }
  }

  hookGlobalFunctions();

  document.addEventListener("DOMContentLoaded", () => {
    decorateStaticIcons();
    renderPipMascots();
    updateSoundToggleUI();
    syncModeRanksAndStars();
    enhanceDailyCardDOM();

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