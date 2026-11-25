"use strict";

(function initSpotTheDifferenceV11() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const UNLOCK_EVENTS = ["pointerdown", "touchend", "click", "keydown"];

  const uiState = {
    soundEnabled: true,
    audioCtx: null,
    unlockArmed: false,
    pendingSounds: [],
    scheduledToneCount: 0,
    lastHitScheduledAt: 0,
    demoShownThisLoad: false,
    demoActive: false,
    demoTimer: 0,
    demoFinishHandler: null,
    demoReturnFocusEl: null
  };

  // Soft background music beds (v14.4, single shared AudioContext, three distinct loops: home, untimed, timed)
  const MUSIC_GAIN = 0.034;
  const MUSIC_TRACKS = Object.freeze({
    home: Object.freeze({
      name: "home",
      gain: 0.030,
      stepMs: 1120,
      cutoff: 760,
      leadType: "sine",
      leadGain: 0.50,
      leadDur: 1.55,
      harmType: "sine",
      harmRatio: 1.5,
      harmGain: 0.14,
      harmDur: 1.30,
      bassDur: 3.0,
      bassGain: 0.42,
      pattern: Object.freeze([
        { lead: 349.23, bass: 174.61 }, // F4 / F3
        { lead: 440.0,  bass: 0 },      // A4
        { lead: 523.25, bass: 0 },      // C5
        { lead: 587.33, bass: 0 },      // D5
        { lead: 523.25, bass: 130.81 }, // C5 / C3
        { lead: 440.0,  bass: 0 },      // A4
        { lead: 392.0,  bass: 0 },      // G4
        { lead: 440.0,  bass: 0 },      // A4
        { lead: 587.33, bass: 146.83 }, // D5 / D3
        { lead: 523.25, bass: 0 },      // C5
        { lead: 440.0,  bass: 0 },      // A4
        { lead: 392.0,  bass: 0 },      // G4
        { lead: 466.16, bass: 116.54 }, // Bb4 / Bb2
        { lead: 440.0,  bass: 0 },      // A4
        { lead: 392.0,  bass: 0 },      // G4
        { lead: 349.23, bass: 0 }       // F4
      ])
    }),
    untimed: Object.freeze({
      name: "untimed",
      gain: 0.034,
      stepMs: 950,
      cutoff: 850,
      leadType: "sine",
      leadGain: 0.55,
      leadDur: 1.35,
      harmType: "triangle",
      harmRatio: 0.5,
      harmGain: 0.22,
      harmDur: 1.45,
      bassDur: 2.8,
      bassGain: 0.45,
      pattern: Object.freeze([
        { lead: 523.25, bass: 130.81 }, // C5 / C3
        { lead: 659.25, bass: 0 },      // E5
        { lead: 587.33, bass: 0 },      // D5
        { lead: 783.99, bass: 0 },      // G5
        { lead: 440.0,  bass: 110.0 },  // A4 / A2
        { lead: 523.25, bass: 0 },      // C5
        { lead: 659.25, bass: 0 },      // E5
        { lead: 587.33, bass: 0 },      // D5
        { lead: 440.0,  bass: 174.61 }, // A4 / F3
        { lead: 523.25, bass: 0 },      // C5
        { lead: 659.25, bass: 0 },      // E5
        { lead: 523.25, bass: 0 },      // C5
        { lead: 587.33, bass: 196.0 },  // D5 / G3
        { lead: 659.25, bass: 0 },      // E5
        { lead: 493.88, bass: 0 },      // B4
        { lead: 587.33, bass: 0 }       // D5
      ])
    }),
    timed: Object.freeze({
      name: "timed",
      gain: 0.032,
      stepMs: 650,
      cutoff: 980,
      leadType: "triangle",
      leadGain: 0.50,
      leadDur: 0.72,
      harmType: "sine",
      harmRatio: 0.5,
      harmGain: 0.18,
      harmDur: 0.80,
      bassDur: 1.35,
      bassGain: 0.40,
      pattern: Object.freeze([
        { lead: 392.0,  bass: 196.0 },  // G4 / G3
        { lead: 493.88, bass: 0 },      // B4
        { lead: 587.33, bass: 146.83 }, // D5 / D3
        { lead: 659.25, bass: 0 },      // E5
        { lead: 783.99, bass: 164.81 }, // G5 / E3
        { lead: 659.25, bass: 0 },      // E5
        { lead: 587.33, bass: 196.0 },  // D5 / G3
        { lead: 493.88, bass: 0 },      // B4
        { lead: 523.25, bass: 130.81 }, // C5 / C3
        { lead: 587.33, bass: 0 },      // D5
        { lead: 659.25, bass: 196.0 },  // E5 / G3
        { lead: 523.25, bass: 0 },      // C5
        { lead: 587.33, bass: 146.83 }, // D5 / D3
        { lead: 659.25, bass: 0 },      // E5
        { lead: 587.33, bass: 220.0 },  // D5 / A3
        { lead: 493.88, bass: 0 }       // B4
      ])
    })
  });

  const musicState = {
    desired: false,
    playing: false,
    track: null,
    ctx: null,
    filter: null,
    masterGain: null,
    timer: 0,
    swapTimer: 0,
    transitionId: 0,
    step: 0,
    scheduledSteps: 0,
    trackHistory: [],
    activeOscs: new Set(),
    listeners: new Set()
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

  function resolvePipOutfit(options) {
    const valid = ["none", "hat", "scarf", "bow"];
    if (options && options.bare === true) return "none";
    if (options && typeof options.outfit === "string" && valid.includes(options.outfit)) {
      return options.outfit;
    }
    if (typeof window.v144GetActivePipOutfit === "function") {
      const active = window.v144GetActivePipOutfit();
      return valid.includes(active) ? active : "none";
    }
    if (
      typeof state !== "undefined" &&
      state &&
      state.counters &&
      typeof state.counters.pipOutfit === "string" &&
      valid.includes(state.counters.pipOutfit)
    ) {
      const candidate = state.counters.pipOutfit;
      if (candidate === "none") return "none";
      if (typeof window.isPipOutfitUnlockedForCounters === "function") {
        return window.isPipOutfitUnlockedForCounters(candidate, state.counters) ? candidate : "none";
      }
    }
    return "none";
  }

  function appendPipOutfitSvg(svg, outfit) {
    if (!outfit || outfit === "none") return;
    const group = svgEl("g", {
      class: `pip-outfit-layer pip-outfit-${outfit}`,
      "data-v144-outfit-part": outfit
    });

    if (outfit === "hat") {
      group.append(
        svgEl("path", {
          d: "M27 33C29 17 43 11 60 11s31 6 33 22H27z",
          fill: "#E04F33",
          stroke: "#1F2438",
          "stroke-width": "3",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M32 23Q60 18 88 23",
          fill: "none",
          stroke: "#F5A623",
          "stroke-width": "4.2",
          "stroke-linecap": "round"
        }),
        svgEl("rect", {
          x: "23",
          y: "26",
          width: "74",
          height: "9",
          rx: "4.5",
          fill: "#FFF7DC",
          stroke: "#1F2438",
          "stroke-width": "2.8"
        }),
        svgEl("path", {
          d: "M36 27.5v6M48 27.5v6M60 27.5v6M72 27.5v6M84 27.5v6",
          fill: "none",
          stroke: "#DEC9A8",
          "stroke-width": "2",
          "stroke-linecap": "round"
        }),
        svgEl("circle", {
          cx: "60",
          cy: "8.5",
          r: "5.5",
          fill: "#F5A623",
          stroke: "#1F2438",
          "stroke-width": "2.5"
        })
      );
    } else if (outfit === "scarf") {
      group.append(
        svgEl("path", {
          d: "M35 73L48 75L46 98L33 96Z",
          fill: "#E04F33",
          stroke: "#1F2438",
          "stroke-width": "2.8",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M34.5 87L46.5 89",
          fill: "none",
          stroke: "#F5A623",
          "stroke-width": "3.4",
          "stroke-linecap": "round"
        }),
        svgEl("path", {
          d: "M35 97v5M40 97.5v5M45 98v5",
          fill: "none",
          stroke: "#F5A623",
          "stroke-width": "2.4",
          "stroke-linecap": "round"
        }),
        svgEl("path", {
          d: "M27 65Q60 73 93 65L91 77Q60 85 29 77Z",
          fill: "#E04F33",
          stroke: "#1F2438",
          "stroke-width": "2.8",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M42 69L41 79M60 71L60 81M78 69L79 79",
          fill: "none",
          stroke: "#F5A623",
          "stroke-width": "3.4",
          "stroke-linecap": "round"
        }),
        svgEl("ellipse", {
          cx: "41",
          cy: "74",
          rx: "7",
          ry: "5.2",
          fill: "#F5A623",
          stroke: "#1F2438",
          "stroke-width": "2.6"
        })
      );
    } else if (outfit === "bow") {
      group.append(
        svgEl("path", {
          d: "M55 26L48 35L54 33.5L58 27Z",
          fill: "#E85D88",
          stroke: "#1F2438",
          "stroke-width": "2.4",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M65 26L72 35L66 33.5L62 27Z",
          fill: "#E85D88",
          stroke: "#1F2438",
          "stroke-width": "2.4",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M58 22C46 10 34 12 34 22c0 10 12 12 24 0Z",
          fill: "#E85D88",
          stroke: "#1F2438",
          "stroke-width": "2.8",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M62 22C74 10 86 12 86 22c0 10-12 12-24 0Z",
          fill: "#E85D88",
          stroke: "#1F2438",
          "stroke-width": "2.8",
          "stroke-linejoin": "round"
        }),
        svgEl("path", {
          d: "M53 22L43 19.5M53 22L43 24.5M67 22L77 19.5M67 22L77 24.5",
          fill: "none",
          stroke: "#B83B64",
          "stroke-width": "2.1",
          "stroke-linecap": "round"
        }),
        svgEl("rect", {
          x: "54",
          y: "16.5",
          width: "12",
          height: "11",
          rx: "5",
          fill: "#F5A623",
          stroke: "#1F2438",
          "stroke-width": "2.6"
        })
      );
    }

    svg.append(group);
  }

  // Section 3.2: Pip the Detective Owl SVG Mascot (.pip-curious, .pip-cheering, .pip-encouraging)
  function createPipMascotSvg(pose = "curious", options = null) {
    const outfit = resolvePipOutfit(options);
    const svg = svgEl("svg", {
      viewBox: "0 0 120 120",
      "aria-hidden": "true",
      focusable: "false",
      "data-v144-pip-outfit": outfit
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

    appendPipOutfitSvg(svg, outfit);

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
      ["homePipMascot", "curious", false],
      ["betweenPipMascot", "cheering", false],
      ["resultPipMascot", "cheering", false],
      ["demoPipCurious", "curious", true],
      ["demoPipCheer", "cheering", true]
    ];
    for (const [id, defaultPose, bare] of configs) {
      const container = document.getElementById(id);
      if (!container) continue;
      const pose = container.classList.contains("pip-encouraging")
        ? "encouraging"
        : container.classList.contains("pip-cheering")
          ? "cheering"
          : defaultPose;
      const svg = window.createPipMascotSvg(pose, bare ? { bare: true } : undefined);
      container.replaceChildren(svg);
    }
    const playPip = document.querySelector("[data-v142-play-pip]");
    if (playPip) {
      playPip.replaceChildren(window.createPipMascotSvg("curious"));
    }
  }
  window.createPipMascotSvg = createPipMascotSvg;
  window.renderPipMascots = renderPipMascots;

  function setPipPose(id, pose) {
    const container = document.getElementById(id);
    if (!container) return;
    container.classList.remove("pip-curious", "pip-cheering", "pip-encouraging");
    container.classList.add(`pip-${pose}`);
    const bare = id === "demoPipCurious" || id === "demoPipCheer";
    container.replaceChildren(window.createPipMascotSvg(pose, bare ? { bare: true } : undefined));
  }
  window.setPipPose = setPipPose;

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
  function isMusicMuted() {
    try {
      if (typeof state !== "undefined" && state && state.counters) {
        return state.counters.musicMuted === true;
      }
      const raw = window.localStorage.getItem("sd_counters_v3");
      if (raw) {
        const parsed = JSON.parse(raw);
        return Boolean(parsed && parsed.musicMuted === true);
      }
    } catch (_err) {
      /* ignore */
    }
    return false;
  }

  function resolveDesiredMusicTrack() {
    if (typeof state === "undefined" || !state) return "home";
    if (state.view === "homeView") return "home";
    if ((state.view === "gameView" || state.view === "betweenView") && state.run && !state.run.finalized) {
      return state.run.mode === "timed" ? "timed" : "untimed";
    }
    return null;
  }

  function notifyMusicListeners() {
    const muted = isMusicMuted();
    for (const fn of musicState.listeners) {
      try {
        fn(muted, musicState.playing, musicState.track);
      } catch (_err) {
        /* ignore listener errors */
      }
    }
  }

  function clearActiveMusicOscs() {
    for (const osc of musicState.activeOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch (_err) {
        /* ignore already stopped oscillator */
      }
    }
    musicState.activeOscs.clear();
  }

  function stopMusicBed() {
    musicState.transitionId += 1;
    if (musicState.timer) {
      window.clearInterval(musicState.timer);
      musicState.timer = 0;
    }
    if (musicState.swapTimer) {
      window.clearTimeout(musicState.swapTimer);
      musicState.swapTimer = 0;
    }
    const wasPlaying = musicState.playing;
    musicState.playing = false;
    musicState.track = null;
    const ctx = musicState.ctx || uiState.audioCtx;
    if (musicState.masterGain && ctx && ctx.state !== "closed") {
      try {
        const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
        musicState.masterGain.gain.cancelScheduledValues(now);
        musicState.masterGain.gain.setValueAtTime(
          Math.max(0.0001, Number(musicState.masterGain.gain.value) || 0.0001),
          now
        );
        musicState.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      } catch (_err) {
        /* ignore gain ramp errors */
      }
    }
    clearActiveMusicOscs();
    if (wasPlaying) notifyMusicListeners();
  }

  function ensureMusicNodes(ctx) {
    if (!ctx || ctx.state === "closed") return false;
    if (musicState.ctx !== ctx || !musicState.masterGain || !musicState.filter) {
      try {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 850;
        filter.Q.value = 0.7;
        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.0001;
        filter.connect(masterGain);
        masterGain.connect(ctx.destination);
        musicState.ctx = ctx;
        musicState.filter = filter;
        musicState.masterGain = masterGain;
      } catch (_err) {
        musicState.filter = null;
        musicState.masterGain = null;
        return false;
      }
    }
    return true;
  }

  function playMusicVoice(ctx, freq, startTime, duration, type, peakGain) {
    if (!ctx || ctx.state !== "running" || !musicState.filter) return;
    try {
      const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      const t0 = Math.max(now + 0.01, startTime);
      const dur = Math.max(0.25, duration);
      const tAttack = t0 + Math.min(0.14, dur * 0.25);
      const tEnd = Math.max(tAttack + 0.08, t0 + dur);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(55, freq), t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(Math.max(0.001, peakGain), tAttack);
      gain.gain.exponentialRampToValueAtTime(0.0001, tEnd);
      osc.connect(gain);
      gain.connect(musicState.filter);
      musicState.activeOscs.add(osc);
      osc.onended = () => {
        musicState.activeOscs.delete(osc);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (_err) {
          /* ignore */
        }
      };
      osc.start(t0);
      osc.stop(tEnd + 0.03);
    } catch (_err) {
      /* ignore soft voice errors */
    }
  }

  function playMusicStep(ctx) {
    if (!musicState.playing || !musicState.desired || !musicState.track || isMusicMuted()) {
      stopMusicBed();
      return;
    }
    if (!ctx || ctx.state !== "running") return;
    const trackDef = MUSIC_TRACKS[musicState.track] || MUSIC_TRACKS.untimed;
    const pattern = trackDef.pattern;
    const item = pattern[musicState.step % pattern.length];
    musicState.step = (musicState.step + 1) % pattern.length;
    musicState.scheduledSteps += 1;
    const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
    if (item.lead > 0) {
      playMusicVoice(ctx, item.lead, now + 0.02, trackDef.leadDur, trackDef.leadType, trackDef.leadGain);
      if (trackDef.harmGain > 0) {
        playMusicVoice(
          ctx,
          item.lead * trackDef.harmRatio,
          now + 0.03,
          trackDef.harmDur,
          trackDef.harmType,
          trackDef.harmGain
        );
      }
    }
    if (item.bass > 0) {
      playMusicVoice(ctx, item.bass, now + 0.02, trackDef.bassDur, "sine", trackDef.bassGain);
    }
  }

  function beginTrackLoop(ctx, trackName, fadeInSec) {
    const trackDef = MUSIC_TRACKS[trackName];
    if (!trackDef || !ctx || ctx.state !== "running" || !ensureMusicNodes(ctx)) return;
    const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
    const reduced = prefersReducedMotion();
    const targetGain = trackDef.gain * (reduced ? 0.8 : 1);
    const rampSec = reduced ? Math.max(0.6, fadeInSec) : fadeInSec;
    try {
      musicState.filter.frequency.cancelScheduledValues(now);
      musicState.filter.frequency.setTargetAtTime(trackDef.cutoff, now, 0.12);
      musicState.masterGain.gain.cancelScheduledValues(now);
      musicState.masterGain.gain.setValueAtTime(0.0001, now);
      musicState.masterGain.gain.linearRampToValueAtTime(targetGain, now + rampSec);
    } catch (_err) {
      /* ignore gain/filter ramp errors */
    }
    musicState.playing = true;
    musicState.track = trackName;
    musicState.step = 0;
    musicState.trackHistory.push(trackName);
    if (musicState.trackHistory.length > 20) {
      musicState.trackHistory.splice(0, musicState.trackHistory.length - 20);
    }
    playMusicStep(ctx);
    if (musicState.timer) window.clearInterval(musicState.timer);
    musicState.timer = window.setInterval(() => {
      playMusicStep(uiState.audioCtx);
    }, trackDef.stepMs);
    notifyMusicListeners();
  }

  function startMusicBed(targetTrack) {
    const trackName = targetTrack || resolveDesiredMusicTrack();
    if (!trackName || !MUSIC_TRACKS[trackName] || isMusicMuted() || document.visibilityState === "hidden") {
      stopMusicBed();
      return;
    }
    musicState.desired = true;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state !== "running") {
      armUnlockListeners();
      if (typeof ctx.resume === "function") {
        ctx.resume().then(() => {
          if (ctx.state === "running") {
            disarmUnlockListeners();
            flushPendingSounds();
            syncMusicPlayback();
          }
        }).catch(() => {});
      }
      return;
    }
    if (musicState.playing && musicState.ctx === ctx && musicState.track === trackName && !musicState.swapTimer) {
      return;
    }
    if (!ensureMusicNodes(ctx)) return;

    if (musicState.playing && musicState.track && musicState.track !== trackName) {
      // Gentle crossfade swap between home / untimed / timed without a startle
      if (musicState.timer) {
        window.clearInterval(musicState.timer);
        musicState.timer = 0;
      }
      if (musicState.swapTimer) {
        window.clearTimeout(musicState.swapTimer);
        musicState.swapTimer = 0;
      }
      const myTransition = ++musicState.transitionId;
      const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      try {
        musicState.masterGain.gain.cancelScheduledValues(now);
        musicState.masterGain.gain.setValueAtTime(
          Math.max(0.0001, Number(musicState.masterGain.gain.value) || 0.0001),
          now
        );
        musicState.masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.16);
      } catch (_err) {
        /* ignore */
      }
      musicState.swapTimer = window.setTimeout(() => {
        musicState.swapTimer = 0;
        if (myTransition !== musicState.transitionId) return;
        if (isMusicMuted() || document.visibilityState === "hidden") {
          stopMusicBed();
          return;
        }
        const desiredNow = resolveDesiredMusicTrack();
        if (desiredNow !== trackName) {
          syncMusicPlayback();
          return;
        }
        const activeCtx = uiState.audioCtx;
        if (!activeCtx || activeCtx.state !== "running") return;
        clearActiveMusicOscs();
        beginTrackLoop(activeCtx, trackName, 0.42);
      }, 175);
      return;
    }

    if (musicState.swapTimer) {
      window.clearTimeout(musicState.swapTimer);
      musicState.swapTimer = 0;
    }
    musicState.transitionId += 1;
    beginTrackLoop(ctx, trackName, 0.55);
  }

  function syncMusicPlayback() {
    const desiredTrack = resolveDesiredMusicTrack();
    musicState.desired = Boolean(desiredTrack);
    if (desiredTrack && !isMusicMuted() && document.visibilityState !== "hidden") {
      startMusicBed(desiredTrack);
    } else {
      stopMusicBed();
    }
  }

  function setMusicMuted(muted) {
    const nextMuted = Boolean(muted);
    if (typeof syncExternalCounters === "function") {
      syncExternalCounters();
    }
    if (typeof state !== "undefined" && state && state.counters) {
      state.counters.musicMuted = nextMuted;
      if (typeof persistCounters === "function") {
        persistCounters();
      }
    }
    if (nextMuted) {
      stopMusicBed();
    } else {
      handleGestureUnlock();
      syncMusicPlayback();
    }
    notifyMusicListeners();
  }

  function toggleMusic() {
    setMusicMuted(!isMusicMuted());
    return !isMusicMuted();
  }

  window.v143Music = {
    isMuted: isMusicMuted,
    setMuted: setMusicMuted,
    toggle: toggleMusic,
    isPlaying: () => Boolean(musicState.playing),
    getTrack: () => musicState.track,
    getDesiredTrack: resolveDesiredMusicTrack,
    getLoops: () => Object.keys(MUSIC_TRACKS),
    getStepCount: () => musicState.scheduledSteps,
    getTrackHistory: () => musicState.trackHistory.slice(),
    getVolume: () => (musicState.track && MUSIC_TRACKS[musicState.track] ? MUSIC_TRACKS[musicState.track].gain : MUSIC_GAIN),
    sync: syncMusicPlayback,
    onChange: fn => {
      if (typeof fn === "function") musicState.listeners.add(fn);
    }
  };

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
            flushPendingSounds();
            syncMusicPlayback();
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
    if (!ctx || ctx.state === "closed") return;
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

  function flushPendingSounds() {
    const ctx = uiState.audioCtx;
    if (!ctx || ctx.state !== "running" || !uiState.soundEnabled) return;
    if (!uiState.pendingSounds.length) return;
    const nowWall = Date.now();
    const queue = uiState.pendingSounds.splice(0, uiState.pendingSounds.length);
    for (const entry of queue) {
      if (!entry || entry.played) continue;
      if (nowWall - entry.queuedAt > 2000) continue;
      entry.played = true;
      const baseTime = (Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0) + 0.005 + entry.extraDelay;
      scheduleSoundAt(ctx, entry.kind, entry.detail, baseTime);
    }
  }

  function handleGestureUnlock() {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    playSilentUnlockBuffer(ctx);
    if (ctx.state === "running") {
      disarmUnlockListeners();
      flushPendingSounds();
      syncMusicPlayback();
      return;
    }
    if (typeof ctx.resume === "function") {
      ctx.resume().then(() => {
        playSilentUnlockBuffer(ctx);
        if (ctx.state === "running") {
          disarmUnlockListeners();
          flushPendingSounds();
          syncMusicPlayback();
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
    if (!ctx || ctx.state === "closed") return false;
    try {
      const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      const t0 = Math.max(now + 0.002, Number.isFinite(startTime) ? startTime : now + 0.002);
      const dur = Math.max(0.03, Number.isFinite(duration) ? duration : 0.12);
      const attack = Math.min(0.018, dur * 0.25);
      const tAttack = t0 + attack;
      const tEnd = Math.max(tAttack + 0.01, t0 + dur);
      const safeFreq = Math.max(40, Number.isFinite(freq) ? freq : 440);
      const safePeak = Math.max(0.002, Number.isFinite(peakGain) ? peakGain : 0.14);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(safeFreq, t0);
      if (endFreq !== null && Number.isFinite(endFreq)) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), tEnd);
      }
      gain.gain.setValueAtTime(0.0008, t0);
      gain.gain.linearRampToValueAtTime(safePeak, tAttack);
      gain.gain.exponentialRampToValueAtTime(0.0008, tEnd);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(tEnd + 0.015);
      uiState.scheduledToneCount += 1;
      return true;
    } catch (_err) {
      return false;
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
      uiState.lastHitScheduledAt = Date.now();
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
      const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      scheduleSoundAt(ctx, kind, detail, now + 0.005 + extraDelay);
      return;
    }

    // Attempt synchronous unlock + resume inside the active user gesture and
    // queue the sound so it plays as soon as the context reaches "running".
    playSilentUnlockBuffer(ctx);
    uiState.pendingSounds.push({
      kind,
      detail,
      extraDelay,
      queuedAt: Date.now(),
      played: false
    });
    if (uiState.pendingSounds.length > 6) {
      uiState.pendingSounds.splice(0, uiState.pendingSounds.length - 6);
    }
    armUnlockListeners();
    if (typeof ctx.resume === "function") {
      try {
        const resumePromise = ctx.resume();
        if (ctx.state === "running") {
          disarmUnlockListeners();
          flushPendingSounds();
          syncMusicPlayback();
          return;
        }
        if (resumePromise && typeof resumePromise.then === "function") {
          resumePromise.then(() => {
            if (ctx.state === "running") {
              disarmUnlockListeners();
              flushPendingSounds();
              syncMusicPlayback();
            }
          }).catch(() => {});
        }
      } catch (_err) {
        /* wait for unlock listener / statechange */
      }
    }
  }

  window.playSound = playSound;
  window.createSvgIcon = createSvgIcon;

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
    } else if (typeof window.cancelFindSpeech === "function") {
      window.cancelFindSpeech();
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
  window.openDemoOverlay = openDemoOverlay;

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
      "data-v145-hand-icon": "open-hand",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.append(
      svgEl("path", {
        d: "M15 6.5Q27 2 39 6.5",
        fill: "none",
        stroke: "#F5A623",
        "stroke-width": "3",
        "stroke-linecap": "round"
      }),
      svgEl("path", {
        d: "M14 38L7.5 29.5C5.8 27.3 6.3 24.2 8.6 22.7C10.8 21.3 13.7 22 15.2 24.2L16.5 26.2V14C16.5 11.5 18.5 9.5 21 9.5C23.5 9.5 25.5 11.5 25.5 14V23.5H26.5V11.5C26.5 9 28.5 7 31 7C33.5 7 35.5 9 35.5 11.5V24H36.5V14.5C36.5 12 38.5 10 41 10C43.5 10 45.5 12 45.5 14.5V26.5H46.5V19C46.5 16.8 48.3 15 50.5 15C52.7 15 54.5 16.8 54.5 19V36.5C54.5 45.1 47.6 52 39 52H25.5C19.5 52 15.2 46.8 14 38Z",
        fill: "#FFF7DC",
        stroke: "#1F2438",
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }),
      svgEl("path", {
        d: "M22 37.5Q31 34 40 38",
        fill: "none",
        stroke: "#1F2438",
        "stroke-width": "2.4",
        "stroke-linecap": "round"
      })
    );
    return svg;
  }
  window.createDemoHandIconSvg = createDemoHandIconSvg;

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
    const cardDailyBtn = document.querySelector("[data-v145-daily-button]");
    if (cardDailyBtn) {
      const labelText = cardDailyBtn.textContent.trim() || "Daily Hunt";
      const span = document.createElement("span");
      span.textContent = labelText;
      cardDailyBtn.replaceChildren(createSvgIcon("spyglass"), span);
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
          !(run.revealedIdx instanceof Set && run.revealedIdx.has(index)) &&
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
        musicState.desired = false;
        stopMusicBed();
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

    if (typeof window.leaveActiveRun === "function") {
      const origLeaveActiveRun = window.leaveActiveRun;
      window.leaveActiveRun = function wrappedLeaveActiveRun(...args) {
        const res = origLeaveActiveRun.apply(this, args);
        syncMusicPlayback();
        return res;
      };
    }

    if (typeof window.showView === "function") {
      const origShowView = window.showView;
      window.showView = function wrappedShowView(id, ...rest) {
        const res = origShowView.call(this, id, ...rest);
        syncMusicPlayback();
        return res;
      };
    }

    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function wrappedStartLevel(...args) {
        const res = origStartLevel.apply(this, args);
        armShowMeFirstSessionLabel();
        syncMusicPlayback();
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
          const activeMode =
            typeof state !== "undefined" && state && state.selectedMode === "timed"
              ? "timed"
              : "untimed";
          const returnFocusTile =
            document.getElementById(activeMode === "timed" ? "modeTimed" : "modeUntimed") ||
            document.getElementById("modeUntimed");
          openDemoOverlay(() => {
            origNewRun.apply(callContext, callArgs);
          }, returnFocusTile);
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
    if (document.visibilityState === "hidden") {
      stopMusicBed();
      armUnlockListeners();
      return;
    }
    if (document.visibilityState === "visible") {
      const ctx = uiState.audioCtx;
      if (!ctx || ctx.state !== "running") {
        armUnlockListeners();
        if (ctx && ctx.state !== "closed" && typeof ctx.resume === "function") {
          ctx.resume().then(() => {
            if (ctx.state === "running") {
              disarmUnlockListeners();
              flushPendingSounds();
              syncMusicPlayback();
            }
          }).catch(() => {});
        }
      } else {
        flushPendingSounds();
        syncMusicPlayback();
      }
    }
  });

  window.addEventListener("pageshow", () => {
    const ctx = uiState.audioCtx;
    if (!ctx || ctx.state !== "running") {
      armUnlockListeners();
      if (ctx && ctx.state !== "closed" && typeof ctx.resume === "function") {
        ctx.resume().then(() => {
          if (ctx.state === "running") {
            disarmUnlockListeners();
            flushPendingSounds();
            syncMusicPlayback();
          }
        }).catch(() => {});
      }
    } else {
      flushPendingSounds();
      syncMusicPlayback();
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
    syncMusicPlayback();
    notifyMusicListeners();

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
