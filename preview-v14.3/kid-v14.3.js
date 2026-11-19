"use strict";

/*
  kid-v14.3.js — Spot the Difference v14.3 (loaded last, after kid-v14.1.js).
  - Item 6 UI: Play-screen music toggle ([data-v143-music-toggle]) and Grown-ups
    parent toggle ([data-v143-music-parent]), synced to window.v143Music.
  - Item 7 UI: Kid-facing icon + label decoration for #tipsNav next to #dailyStreak.
  - Item 8: Optional hidden Pip bonus overlay on every non-Duel level
    (in-memory only; zero localStorage writes; zero score/find/miss side effects).
  DOM built exclusively with createElement / createElementNS / textContent / replaceChildren.
*/
(function initSpotTheDifferenceV143() {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // One placement per puzzle id, verified clear of all 5 difference radii and
  // clear of the top-left A/B caption badge in both normal and mirrored orientations.
  const HIDDEN_PIP_SPOTS = Object.freeze({
    "eng-classroom":    Object.freeze({ x: 0.60, y: 0.14 }),
    "eng-bakery":       Object.freeze({ x: 0.14, y: 0.84 }),
    "eng-campsite":     Object.freeze({ x: 0.80, y: 0.16 }),
    "eng-farm":         Object.freeze({ x: 0.14, y: 0.24 }),
    "eng-garden":       Object.freeze({ x: 0.88, y: 0.30 }),
    "eng-trainstation": Object.freeze({ x: 0.16, y: 0.26 }),
    "eng-snowtown":     Object.freeze({ x: 0.84, y: 0.26 }),
    "eng-zoo":          Object.freeze({ x: 0.14, y: 0.26 }),
    "eng-kitchen":      Object.freeze({ x: 0.80, y: 0.14 }),
    "eng-playground":   Object.freeze({ x: 0.12, y: 0.30 }),
    "eng-underwater":   Object.freeze({ x: 0.76, y: 0.86 }),
    "eng-space":        Object.freeze({ x: 0.12, y: 0.24 }),
    "eng-library":      Object.freeze({ x: 0.88, y: 0.54 }),
    "eng-birthday":     Object.freeze({ x: 0.12, y: 0.24 }),
    "eng-rainystreet":  Object.freeze({ x: 0.84, y: 0.26 }),
    "eng-toys":         Object.freeze({ x: 0.84, y: 0.44 }),
    "eng-market":       Object.freeze({ x: 0.74, y: 0.14 }),
    "eng-park":         Object.freeze({ x: 0.50, y: 0.14 }),
    "eng-beach":        Object.freeze({ x: 0.88, y: 0.24 }),
    "eng-firestation":  Object.freeze({ x: 0.12, y: 0.62 }),
    "eng-bedroom":      Object.freeze({ x: 0.88, y: 0.54 }),
    "eng-petshop":      Object.freeze({ x: 0.14, y: 0.26 })
  });

  const hiddenPipState = {
    foundKey: "",
    toastTimer: 0,
    activeToast: null
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  function createMusicIconSvg(isOn) {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: `svg-icon ${isOn ? "icon-music-on" : "icon-music-off"}`,
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    const noteFill = isOn ? "#F5A623" : "#EFE6D5";
    svg.append(
      svgEl("path", { d: "M9 17V6l11-2v11" }),
      svgEl("circle", { cx: "6.5", cy: "17.5", r: "2.6", fill: noteFill }),
      svgEl("circle", { cx: "17.5", cy: "15.5", r: "2.6", fill: noteFill })
    );
    if (!isOn) {
      svg.append(
        svgEl("path", { d: "M4 4l16 16", stroke: "#C73C24", "stroke-width": "2.6" })
      );
    }
    return svg;
  }

  function createHandIconFallback() {
    if (typeof window.createDemoHandIconSvg === "function") {
      return window.createDemoHandIconSvg();
    }
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

  // --------------------------------------------------------------------------
  // Item 6: Play-screen & Grown-up music controls
  // --------------------------------------------------------------------------
  function syncMusicUI() {
    const muted = Boolean(window.v143Music && window.v143Music.isMuted());
    const isOn = !muted;

    const playBtn = document.querySelector("[data-v143-music-toggle]");
    if (playBtn) {
      const label = `Music: ${isOn ? "On" : "Off"}`;
      playBtn.setAttribute("aria-pressed", String(isOn));
      playBtn.setAttribute("aria-label", label);
      playBtn.setAttribute("title", label);
      playBtn.dataset.musicMuted = String(muted);
      playBtn.classList.toggle("is-muted", muted);
      playBtn.replaceChildren(createMusicIconSvg(isOn));
    }

    const parentBtn = document.querySelector("[data-v143-music-parent]");
    if (parentBtn) {
      const label = `Background music: ${isOn ? "On" : "Off"}`;
      parentBtn.setAttribute("aria-pressed", String(isOn));
      parentBtn.setAttribute("aria-label", label);
      parentBtn.dataset.musicMuted = String(muted);
      parentBtn.textContent = label;
    }
  }

  function mountPlayMusicToggle() {
    const badges = document.querySelector("#gameView .game-badges");
    if (!badges) return;
    let btn = badges.querySelector("[data-v143-music-toggle]");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-toggle-button";
      btn.setAttribute("data-v143-music-toggle", "true");
      btn.addEventListener("click", event => {
        event.stopPropagation();
        if (window.v143Music) {
          window.v143Music.toggle();
        }
        syncMusicUI();
      });
      badges.append(btn);
    }
    syncMusicUI();
  }

  function mountParentMusicToggle() {
    const grownGrid = document.querySelector("#grownView .grown-grid");
    if (!grownGrid) return;
    if (grownGrid.querySelector("[data-v143-music-parent]")) {
      syncMusicUI();
      return;
    }

    const card = document.createElement("div");
    card.className = "settings-card music-settings-card";
    card.setAttribute("data-v143-music-card", "true");

    const heading = document.createElement("h2");
    heading.textContent = "Background music";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary-button music-parent-toggle";
    btn.setAttribute("data-v143-music-parent", "true");
    btn.addEventListener("click", () => {
      if (window.v143Music) {
        window.v143Music.toggle();
      }
      syncMusicUI();
    });

    const helper = document.createElement("p");
    helper.className = "helper-text";
    helper.textContent = "Soft music plays during puzzles. Saved on this device.";

    card.append(heading, btn, helper);
    grownGrid.append(card);
    syncMusicUI();
  }

  // --------------------------------------------------------------------------
  // Item 7: Kid-facing How to play decoration next to #dailyStreak
  // --------------------------------------------------------------------------
  function decorateHomeHowToPlay() {
    const tipsBtn = document.getElementById("tipsNav");
    if (!tipsBtn) return;
    const label = document.createElement("span");
    label.className = "hero-how-to-play-label";
    label.textContent = "How to play";
    tipsBtn.replaceChildren(createHandIconFallback(), label);
  }

  // --------------------------------------------------------------------------
  // Item 8: Find the hidden Pip (in-memory only, zero side effects)
  // --------------------------------------------------------------------------
  function clearHiddenPipToast() {
    if (hiddenPipState.toastTimer) {
      window.clearTimeout(hiddenPipState.toastTimer);
      hiddenPipState.toastTimer = 0;
    }
    if (hiddenPipState.activeToast) {
      hiddenPipState.activeToast.remove();
      hiddenPipState.activeToast = null;
    }
    document.querySelectorAll("[data-v143-hidden-pip-toast]").forEach(el => el.remove());
  }

  function removeHiddenPipOverlays() {
    clearHiddenPipToast();
    document.querySelectorAll("[data-v143-hidden-pip-layer]").forEach(el => el.remove());
  }

  function showHiddenPipToast() {
    clearHiddenPipToast();
    const gameView = document.getElementById("gameView");
    if (!gameView) return;

    const toast = document.createElement("div");
    toast.className = "hidden-pip-toast";
    toast.setAttribute("data-v143-hidden-pip-toast", "true");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const iconWrap = document.createElement("span");
    iconWrap.className = "hidden-pip-toast-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    if (typeof window.createPipMascotSvg === "function") {
      iconWrap.append(window.createPipMascotSvg("cheering"));
    }

    const text = document.createElement("span");
    text.textContent = "You found Pip!";

    toast.append(iconWrap, text);
    gameView.append(toast);
    hiddenPipState.activeToast = toast;

    hiddenPipState.toastTimer = window.setTimeout(() => {
      clearHiddenPipToast();
    }, 2200);
  }

  function buildHiddenPipLayer(side, posX, posY, run, levelKey) {
    const layer = document.createElement("div");
    layer.className = "hidden-pip-layer";
    layer.setAttribute("data-v143-hidden-pip-layer", side);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hidden-pip-target";
    btn.setAttribute("data-v143-hidden-pip", side);
    btn.setAttribute("data-v143-hidden-pip-x", posX.toFixed(3));
    btn.setAttribute("data-v143-hidden-pip-y", posY.toFixed(3));
    btn.setAttribute("aria-label", `Hidden Pip in Picture ${side}`);
    btn.style.left = `${(posX * 100).toFixed(2)}%`;
    btn.style.top = `${(posY * 100).toFixed(2)}%`;

    const art = document.createElement("span");
    art.className = "hidden-pip-art";
    art.setAttribute("aria-hidden", "true");
    if (typeof window.createPipMascotSvg === "function") {
      art.append(window.createPipMascotSvg("curious"));
    }
    btn.append(art);

    btn.addEventListener("pointerdown", event => {
      event.stopPropagation();
    });

    btn.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const activeRun = typeof state !== "undefined" && state ? state.run : null;
      if (!activeRun || activeRun !== run || activeRun.phase !== "playing" || activeRun.kind === "duel") {
        return;
      }
      if (hiddenPipState.foundKey === levelKey) {
        return;
      }
      hiddenPipState.foundKey = levelKey;
      document.querySelectorAll("[data-v143-hidden-pip]").forEach(el => {
        el.classList.add("is-found");
        el.setAttribute("data-v143-hidden-pip-found", "true");
      });
      if (typeof window.playSound === "function") {
        window.playSound("pip-chirp");
      }
      showHiddenPipToast();
    });

    layer.append(btn);
    return layer;
  }

  function mountHiddenPipForCurrentRun() {
    removeHiddenPipOverlays();
    const run = typeof state !== "undefined" && state ? state.run : null;
    if (!run || run.finalized || run.kind === "duel") return;
    const puzzle = run.list && run.list[run.levelIndex];
    if (!puzzle) return;

    const stageA = document.getElementById("imageStageA");
    const stageB = document.getElementById("imageStageB");
    if (!stageA || !stageB) return;

    const baseId = puzzle.mirrorOf || puzzle.id;
    const spot = HIDDEN_PIP_SPOTS[baseId] || { x: 0.5, y: 0.14 };
    const posX = puzzle.mirrored === true ? 1 - spot.x : spot.x;
    const posY = spot.y;
    const levelKey = `${run.levelStartedAt || 0}:${run.levelIndex}:${puzzle.id}`;
    hiddenPipState.foundKey = "";

    stageA.append(buildHiddenPipLayer("A", posX, posY, run, levelKey));
    stageB.append(buildHiddenPipLayer("B", posX, posY, run, levelKey));
  }

  // --------------------------------------------------------------------------
  // Wrap global lifecycle hooks (after kid-v14.1.js)
  // --------------------------------------------------------------------------
  function hookGlobalsV143() {
    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function v143StartLevel(...args) {
        const res = origStartLevel.apply(this, args);
        mountPlayMusicToggle();
        mountHiddenPipForCurrentRun();
        syncMusicUI();
        return res;
      };
    }

    if (typeof window.leaveActiveRun === "function") {
      const origLeaveActiveRun = window.leaveActiveRun;
      window.leaveActiveRun = function v143LeaveActiveRun(...args) {
        removeHiddenPipOverlays();
        return origLeaveActiveRun.apply(this, args);
      };
    }

    if (typeof window.finishRun === "function") {
      const origFinishRun = window.finishRun;
      window.finishRun = function v143FinishRun(...args) {
        removeHiddenPipOverlays();
        return origFinishRun.apply(this, args);
      };
    }

    if (typeof window.showView === "function") {
      const origShowView = window.showView;
      window.showView = function v143ShowView(id, ...rest) {
        if (id !== "gameView") {
          removeHiddenPipOverlays();
        }
        const res = origShowView.call(this, id, ...rest);
        if (id === "grownView") {
          mountParentMusicToggle();
          syncMusicUI();
        }
        return res;
      };
    }

    if (typeof window.renderGrownArea === "function") {
      const origRenderGrownArea = window.renderGrownArea;
      window.renderGrownArea = function v143RenderGrownArea(...args) {
        const res = origRenderGrownArea.apply(this, args);
        mountParentMusicToggle();
        syncMusicUI();
        return res;
      };
    }
  }

  hookGlobalsV143();

  if (window.v143Music && typeof window.v143Music.onChange === "function") {
    window.v143Music.onChange(() => {
      syncMusicUI();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    decorateHomeHowToPlay();
    mountPlayMusicToggle();
    mountParentMusicToggle();
    syncMusicUI();
  });
})();
