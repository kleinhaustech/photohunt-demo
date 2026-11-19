"use strict";

/*
  kid-v14.1.js — Spot the Difference v14.1 (loaded after app.js, ui-v11.js,
  kid-v14.js, pwa-register.js).
  Implements:
  - Item 1: Twin synchronized .loupe (hold >= 250ms, ~1.8x, matching coords <= 2px,
            release makes no find/miss) + two-finger pinch-zoom (<= 2.5x, clamped
            pan, double-tap reset, accurate zoomed hit-test via pickNearestDifference).
  - Item 3: Sticker Worlds (3 illustrated .sticker-world scenes, draggable +
            keyboard-accessible [data-sticker] items saved in
            sd_counters_v3.stickerWorld, and streakFreeze shield readout).
  - Item 5: Grown-up-gated Postcard + Challenge Sharing ([data-share] -> requireGrown
            -> zero-PII canvas PNG + navigator.share({files, url}) + download &
            copy-link fallback; #challenge= with only {p,d,m,t,s,v}; picture-first
            [data-challenge-banner] on challenge link open; malformed hashes ignored).
*/
(function initSpotTheDifferenceV141() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const LOUPE_HOLD_MS = 250;
  const LOUPE_ZOOM = 1.8;
  const MAX_PINCH_ZOOM = 2.5;
  const MIN_PINCH_ZOOM = 1.0;
  const DOUBLE_TAP_MS = 320;
  const DOUBLE_TAP_PX = 36;
  const PAN_DRAG_THRESHOLD_PX = 10;
  const ALLOWED_CHALLENGE_KEYS = new Set(["p", "d", "m", "t", "s", "v"]);

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function clampVal(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function getAppState() {
    return typeof state !== "undefined" && state ? state : null;
  }

  function getCurrentRun() {
    const s = getAppState();
    return s ? s.run : null;
  }

  function isPlayingGame() {
    const s = getAppState();
    return Boolean(s && s.view === "gameView" && s.run && s.run.phase === "playing");
  }

  // ==========================================================================
  // ITEM 1: Twin Synchronized Loupe + Pinch-Zoom Controller
  // ==========================================================================
  const zoomState = {
    scale: 1,
    panX: 0,
    panY: 0,
    activeSide: "A",
    holdTimer: 0,
    loupeActive: false,
    loupeA: null,
    loupeB: null,
    glassA: null,
    glassB: null,
    suppressClickUntil: 0,
    pointers: new Map(),
    pinchInitialDist: 0,
    pinchInitialScale: 1,
    pinchInitialPanX: 0,
    pinchInitialPanY: 0,
    pinchInitialMidX: 0,
    pinchInitialMidY: 0,
    gestureSide: "A",
    panning: false,
    downClientX: 0,
    downClientY: 0,
    downPanX: 0,
    downPanY: 0,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
    deferredTapTimer: 0,
    deferredTapX: 0,
    deferredTapY: 0,
    deferredTapAt: 0
  };

  function isStageZoomed() {
    return zoomState.scale > 1.001 || Math.abs(zoomState.panX) > 0.5 || Math.abs(zoomState.panY) > 0.5;
  }

  function clearDeferredTap() {
    if (zoomState.deferredTapTimer) {
      window.clearTimeout(zoomState.deferredTapTimer);
      zoomState.deferredTapTimer = 0;
    }
  }

  function getStagePair() {
    return {
      stageA: document.getElementById("imageStageA"),
      stageB: document.getElementById("imageStageB"),
      surfaceA: document.getElementById("tapSurfaceA"),
      surfaceB: document.getElementById("tapSurfaceB"),
      imgA: document.getElementById("imageA"),
      imgB: document.getElementById("imageB"),
      marksA: document.getElementById("marksA"),
      marksB: document.getElementById("marksB"),
      glowA: document.getElementById("glowA"),
      glowB: document.getElementById("glowB")
    };
  }

  function clampPanForScale(scale, rawPanX, rawPanY) {
    if (scale <= 1.001) {
      return { scale: 1, panX: 0, panY: 0 };
    }
    const { stageA } = getStagePair();
    const rect = stageA ? stageA.getBoundingClientRect() : { width: 400, height: 300 };
    const w = rect.width || 400;
    const h = rect.height || 300;
    const maxPanX = Math.max(0, (w * (scale - 1)) / 2);
    const maxPanY = Math.max(0, (h * (scale - 1)) / 2);
    return {
      scale: Number(clampVal(scale, MIN_PINCH_ZOOM, MAX_PINCH_ZOOM).toFixed(4)),
      panX: Number(clampVal(rawPanX, -maxPanX, maxPanX).toFixed(2)),
      panY: Number(clampVal(rawPanY, -maxPanY, maxPanY).toFixed(2))
    };
  }

  function applyZoomTransform() {
    const { stageA, stageB, surfaceA, surfaceB, imgA, imgB, marksA, marksB, glowA, glowB } = getStagePair();
    if (!stageA || !stageB) return;

    const { scale, panX, panY } = zoomState;
    const isZoomed = isStageZoomed();

    stageA.classList.toggle("is-zoomed", isZoomed);
    stageB.classList.toggle("is-zoomed", isZoomed);
    if (surfaceA) surfaceA.classList.toggle("is-zoomed", isZoomed);
    if (surfaceB) surfaceB.classList.toggle("is-zoomed", isZoomed);
    stageA.dataset.zoom = String(scale);
    stageB.dataset.zoom = String(scale);
    stageA.dataset.panX = String(panX);
    stageA.dataset.panY = String(panY);
    stageB.dataset.panX = String(panX);
    stageB.dataset.panY = String(panY);

    for (const imgEl of [imgA, imgB]) {
      if (!imgEl) continue;
      if (!isZoomed) {
        imgEl.style.transform = "";
      } else {
        const mirrored = imgEl.classList.contains("is-mirrored");
        const sx = mirrored ? -scale : scale;
        imgEl.style.transform = `translate(${panX}px, ${panY}px) scale(${sx}, ${scale})`;
      }
    }

    for (const layer of [marksA, marksB, glowA, glowB]) {
      if (!layer) continue;
      layer.style.transform = isZoomed
        ? `translate(${panX}px, ${panY}px) scale(${scale})`
        : "";
    }
  }

  function setPictureZoom(scale = 1, panX = 0, panY = 0) {
    const clamped = clampPanForScale(Number(scale) || 1, Number(panX) || 0, Number(panY) || 0);
    zoomState.scale = clamped.scale;
    zoomState.panX = clamped.panX;
    zoomState.panY = clamped.panY;
    applyZoomTransform();
    return { scale: zoomState.scale, panX: zoomState.panX, panY: zoomState.panY };
  }

  function resetPictureZoom() {
    clearDeferredTap();
    hideTwinLoupes();
    zoomState.pointers.clear();
    zoomState.panning = false;
    return setPictureZoom(1, 0, 0);
  }

  function clearHoldTimer() {
    if (zoomState.holdTimer) {
      window.clearTimeout(zoomState.holdTimer);
      zoomState.holdTimer = 0;
    }
  }

  function ensureLoupeNodes() {
    const { stageA, stageB } = getStagePair();
    if (!stageA || !stageB) return false;

    if (!zoomState.loupeA) {
      const la = document.createElement("div");
      la.className = "loupe ph-loupe";
      la.setAttribute("aria-hidden", "true");
      const ga = document.createElement("span");
      ga.className = "loupe-glass";
      la.append(ga);
      zoomState.loupeA = la;
      zoomState.glassA = ga;
    }
    if (!zoomState.loupeB) {
      const lb = document.createElement("div");
      lb.className = "loupe ph-loupe";
      lb.setAttribute("aria-hidden", "true");
      const gb = document.createElement("span");
      gb.className = "loupe-glass";
      lb.append(gb);
      zoomState.loupeB = lb;
      zoomState.glassB = gb;
    }

    if (zoomState.loupeA.parentNode !== stageA) {
      stageA.append(zoomState.loupeA);
    }
    if (zoomState.loupeB.parentNode !== stageB) {
      stageB.append(zoomState.loupeB);
    }
    return true;
  }

  function updateTwinLoupesAt(clientX, clientY, side) {
    const { stageA, stageB, imgA, imgB } = getStagePair();
    if (!stageA || !stageB || !imgA || !imgB) return;
    if (!ensureLoupeNodes()) return;

    const refStage = side === "B" ? stageB : stageA;
    const refRect = refStage.getBoundingClientRect();
    if (refRect.width <= 0 || refRect.height <= 0) return;

    // Normalised coordinates within the stage viewport [0, 1]
    const stageNormX = clampVal((clientX - refRect.left) / refRect.width, 0, 1);
    const stageNormY = clampVal((clientY - refRect.top) / refRect.height, 0, 1);

    const leftPct = `${(stageNormX * 100).toFixed(3)}%`;
    const topPct = `${(stageNormY * 100).toFixed(3)}%`;

    // Position both .loupe circles at the exact same normalised coordinate
    zoomState.loupeA.style.left = leftPct;
    zoomState.loupeA.style.top = topPct;
    zoomState.loupeB.style.left = leftPct;
    zoomState.loupeB.style.top = topPct;

    zoomState.loupeA.dataset.normX = stageNormX.toFixed(4);
    zoomState.loupeA.dataset.normY = stageNormY.toFixed(4);
    zoomState.loupeB.dataset.normX = stageNormX.toFixed(4);
    zoomState.loupeB.dataset.normY = stageNormY.toFixed(4);

    // Map stage viewport coordinate to underlying image coordinate accounting for zoom/pan
    const imgNormX = clampVal(
      (stageNormX - 0.5 - zoomState.panX / refRect.width) / zoomState.scale + 0.5,
      0,
      1
    );
    const imgNormY = clampVal(
      (stageNormY - 0.5 - zoomState.panY / refRect.height) / zoomState.scale + 0.5,
      0,
      1
    );

    const effZoom = zoomState.scale * LOUPE_ZOOM;
    const loupeRect = zoomState.loupeA.getBoundingClientRect();
    const lw = loupeRect.width || 124;
    const lh = loupeRect.height || 124;

    const pairs = [
      [zoomState.loupeA, zoomState.glassA, imgA, stageA.getBoundingClientRect()],
      [zoomState.loupeB, zoomState.glassB, imgB, stageB.getBoundingClientRect()]
    ];

    for (const [loupeEl, glassEl, imgEl, sRect] of pairs) {
      const sw = sRect.width || refRect.width;
      const sh = sRect.height || refRect.height;
      const bgW = sw * effZoom;
      const bgH = sh * effZoom;
      const mirrored = imgEl.classList.contains("is-mirrored");
      const sampleX = mirrored ? 1 - imgNormX : imgNormX;
      const bgPosX = `${(lw / 2 - sampleX * bgW).toFixed(1)}px`;
      const bgPosY = `${(lh / 2 - imgNormY * bgH).toFixed(1)}px`;
      const bgSize = `${bgW.toFixed(1)}px ${bgH.toFixed(1)}px`;
      const src = imgEl.getAttribute("src") || imgEl.src || "";
      const bgImg = src ? `url("${src}")` : "none";

      loupeEl.style.backgroundImage = bgImg;
      loupeEl.style.backgroundSize = bgSize;
      loupeEl.style.backgroundPosition = `${bgPosX} ${bgPosY}`;

      glassEl.classList.toggle("is-mirrored", mirrored);
      glassEl.style.backgroundImage = bgImg;
      glassEl.style.backgroundSize = bgSize;
      glassEl.style.backgroundPosition = `${bgPosX} ${bgPosY}`;
    }

    zoomState.loupeActive = true;
  }

  function hideTwinLoupes() {
    clearHoldTimer();
    zoomState.loupeActive = false;
    if (zoomState.loupeA && zoomState.loupeA.parentNode) {
      zoomState.loupeA.remove();
    }
    if (zoomState.loupeB && zoomState.loupeB.parentNode) {
      zoomState.loupeB.remove();
    }
  }

  function armClickSuppression(durationMs = 450) {
    zoomState.suppressClickUntil = performance.now() + durationMs;
  }

  function beginPinchFromPair(p1, p2, side) {
    clearDeferredTap();
    hideTwinLoupes();
    zoomState.panning = false;
    zoomState.gestureSide = side;
    zoomState.pinchInitialDist = Math.max(12, Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY));
    zoomState.pinchInitialScale = zoomState.scale;
    zoomState.pinchInitialPanX = zoomState.panX;
    zoomState.pinchInitialPanY = zoomState.panY;
    zoomState.pinchInitialMidX = (p1.clientX + p2.clientX) / 2;
    zoomState.pinchInitialMidY = (p1.clientY + p2.clientY) / 2;
    armClickSuppression(600);
  }

  function updatePinchFromPair(p1, p2) {
    const { stageA, stageB } = getStagePair();
    const refStage = zoomState.gestureSide === "B" ? stageB : stageA;
    if (!refStage) return;
    const rect = refStage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dist = Math.max(12, Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY));
    const rawScale = zoomState.pinchInitialScale * (dist / zoomState.pinchInitialDist);
    const nextScale = clampVal(rawScale, MIN_PINCH_ZOOM, MAX_PINCH_ZOOM);

    const midX = (p1.clientX + p2.clientX) / 2;
    const midY = (p1.clientY + p2.clientY) / 2;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const focalOffsetX = zoomState.pinchInitialMidX - centerX;
    const focalOffsetY = zoomState.pinchInitialMidY - centerY;
    const ratio = nextScale / (zoomState.pinchInitialScale || 1);

    const rawPanX = focalOffsetX - (focalOffsetX - zoomState.pinchInitialPanX) * ratio + (midX - zoomState.pinchInitialMidX);
    const rawPanY = focalOffsetY - (focalOffsetY - zoomState.pinchInitialPanY) * ratio + (midY - zoomState.pinchInitialMidY);

    setPictureZoom(nextScale, rawPanX, rawPanY);
    armClickSuppression(600);
  }

  function onStagePointerDown(event, side) {
    if (!isPlayingGame()) return;
    if (event.button !== undefined && event.button !== 0) return;

    zoomState.activeSide = side;
    zoomState.pointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      side
    });

    if (zoomState.pointers.size === 2) {
      const [p1, p2] = [...zoomState.pointers.values()];
      beginPinchFromPair(p1, p2, side);
      return;
    }

    if (zoomState.pointers.size > 2) {
      clearDeferredTap();
      hideTwinLoupes();
      armClickSuppression(600);
      return;
    }

    // Check double-tap to reset when zoomed
    const now = performance.now();
    if (
      isStageZoomed() &&
      now - zoomState.lastTapAt <= DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - zoomState.lastTapX, event.clientY - zoomState.lastTapY) <= DOUBLE_TAP_PX
    ) {
      clearDeferredTap();
      zoomState.lastTapAt = 0;
      resetPictureZoom();
      armClickSuppression(500);
      return;
    }

    zoomState.downClientX = event.clientX;
    zoomState.downClientY = event.clientY;
    zoomState.downPanX = zoomState.panX;
    zoomState.downPanY = zoomState.panY;
    zoomState.panning = false;

    clearHoldTimer();
    const startX = event.clientX;
    const startY = event.clientY;
    zoomState.holdTimer = window.setTimeout(() => {
      zoomState.holdTimer = 0;
      if (!isPlayingGame() || zoomState.pointers.size !== 1 || zoomState.panning) return;
      clearDeferredTap();
      const currentPtr = [...zoomState.pointers.values()][0];
      const cx = currentPtr ? currentPtr.clientX : startX;
      const cy = currentPtr ? currentPtr.clientY : startY;
      updateTwinLoupesAt(cx, cy, side);
      armClickSuppression(600);
    }, LOUPE_HOLD_MS);
  }

  function onWindowPointerMove(event) {
    if (!zoomState.pointers.has(event.pointerId)) return;
    const rec = zoomState.pointers.get(event.pointerId);
    rec.clientX = event.clientX;
    rec.clientY = event.clientY;

    if (zoomState.pointers.size === 2) {
      const [p1, p2] = [...zoomState.pointers.values()];
      updatePinchFromPair(p1, p2);
      return;
    }

    if (zoomState.pointers.size !== 1) return;

    if (zoomState.loupeActive) {
      updateTwinLoupesAt(event.clientX, event.clientY, rec.side);
      armClickSuppression(600);
      return;
    }

    const dx = event.clientX - zoomState.downClientX;
    const dy = event.clientY - zoomState.downClientY;
    const movedDist = Math.hypot(dx, dy);

    if (isStageZoomed() && movedDist > PAN_DRAG_THRESHOLD_PX) {
      clearHoldTimer();
      clearDeferredTap();
      zoomState.panning = true;
      setPictureZoom(zoomState.scale, zoomState.downPanX + dx, zoomState.downPanY + dy);
      armClickSuppression(500);
    }
  }

  function onWindowPointerUp(event) {
    if (!zoomState.pointers.has(event.pointerId)) return;
    const wasLoupe = zoomState.loupeActive;
    const wasPanning = zoomState.panning;
    const hadMulti = zoomState.pointers.size >= 2;

    zoomState.pointers.delete(event.pointerId);

    if (wasLoupe || wasPanning || hadMulti) {
      clearDeferredTap();
      armClickSuppression(450);
    } else if (event.type === "pointerup") {
      zoomState.lastTapAt = performance.now();
      zoomState.lastTapX = event.clientX;
      zoomState.lastTapY = event.clientY;
    }

    if (zoomState.pointers.size === 0) {
      hideTwinLoupes();
      zoomState.panning = false;
    }
  }

  // Fallback for synthetic TouchEvent pinch in headless test runners
  function onStageTouchStart(event, side) {
    if (!isPlayingGame()) return;
    if (event.touches && event.touches.length === 2 && zoomState.pointers.size < 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      beginPinchFromPair(t1, t2, side);
    }
  }

  function onStageTouchMove(event) {
    if (!isPlayingGame()) return;
    const touchCount = event.touches ? event.touches.length : 0;
    const pinchInProgress = zoomState.pointers.size >= 2 || touchCount >= 2;
    if (zoomState.loupeActive || zoomState.panning || pinchInProgress) {
      if (event.cancelable !== false) {
        event.preventDefault();
      }
    }
    if (touchCount === 2 && zoomState.pointers.size < 2) {
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      updatePinchFromPair(t1, t2);
    }
  }

  function onStageTouchEnd(event) {
    if (event.touches && event.touches.length === 0 && zoomState.pointers.size === 0) {
      hideTwinLoupes();
    }
  }

  function onStageWheel(event, side) {
    if (!isPlayingGame()) return;
    if (!event.ctrlKey && zoomState.scale <= 1.001) return;
    event.preventDefault();
    const delta = -event.deltaY * 0.008;
    const nextScale = clampVal(zoomState.scale + delta, MIN_PINCH_ZOOM, MAX_PINCH_ZOOM);
    zoomState.gestureSide = side;
    setPictureZoom(nextScale, zoomState.panX, zoomState.panY);
  }

  function bindLoupeAndZoomEvents() {
    const { stageA, stageB } = getStagePair();
    if (!stageA || !stageB) return;

    for (const [stage, side] of [
      [stageA, "A"],
      [stageB, "B"]
    ]) {
      stage.addEventListener("pointerdown", e => onStagePointerDown(e, side), { passive: true });
      stage.addEventListener("touchstart", e => onStageTouchStart(e, side), { passive: true });
      stage.addEventListener("touchmove", e => onStageTouchMove(e), { passive: false });
      stage.addEventListener("touchend", e => onStageTouchEnd(e), { passive: true });
      stage.addEventListener("wheel", e => onStageWheel(e, side), { passive: false });
      stage.addEventListener("dblclick", e => {
        if (isStageZoomed()) {
          e.preventDefault();
          e.stopPropagation();
          clearDeferredTap();
          resetPictureZoom();
          armClickSuppression(400);
        }
      });
    }

    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    window.addEventListener("pointerup", onWindowPointerUp, { passive: true });
    window.addEventListener("pointercancel", onWindowPointerUp, { passive: true });

    // Suppress click after a loupe hold or pinch/pan gesture so release makes no find and no miss
    window.addEventListener(
      "click",
      event => {
        if (performance.now() > zoomState.suppressClickUntil) return;
        const target = event.target;
        if (target && typeof target.closest === "function") {
          if (target.closest("#tapSurfaceA, #tapSurfaceB, #imageStageA, #imageStageB")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            zoomState.suppressClickUntil = 0;
          }
        }
      },
      true
    );
  }

  // Expose TwinLoupeController API for programmatic control & QA inspection
  window.TwinLoupeController = {
    getZoom: () => ({ scale: zoomState.scale, panX: zoomState.panX, panY: zoomState.panY }),
    setZoom: setPictureZoom,
    resetZoom: resetPictureZoom,
    showLoupeAt: (normX, normY, side = "A") => {
      const { stageA, stageB } = getStagePair();
      const st = side === "B" ? stageB : stageA;
      if (!st) return;
      const r = st.getBoundingClientRect();
      updateTwinLoupesAt(r.left + normX * r.width, r.top + normY * r.height, side);
    },
    hideLoupe: hideTwinLoupes
  };
  window.setPictureZoom = setPictureZoom;
  window.getPictureZoom = () => ({ scale: zoomState.scale, panX: zoomState.panX, panY: zoomState.panY });
  window.resetPictureZoom = resetPictureZoom;

  // ==========================================================================
  // ITEM 3: Sticker Worlds (.sticker-world, [data-sticker], Freeze Shield)
  // ==========================================================================
  const STICKER_WORLDS_META = Object.freeze([
    Object.freeze({ id: "jungle", name: "Jungle Safari" }),
    Object.freeze({ id: "ocean", name: "Deep Ocean" }),
    Object.freeze({ id: "space", name: "Space Station" })
  ]);

  let selectedStickerKey = null;

  function createShieldSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-freeze-shield",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.append(
      svgEl("path", {
        d: "M12 2.5l7.5 3.2v5.4c0 5-3.2 8.6-7.5 10.1-4.3-1.5-7.5-5.1-7.5-10.1V5.7L12 2.5z",
        fill: "#D9F2EE"
      }),
      svgEl("path", { d: "M12 7v10M8 12h8M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6", stroke: "#1B7A6E", "stroke-width": "2" })
    );
    return svg;
  }

  function createWorldIconSvg(worldId) {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: `svg-icon icon-world-${worldId}`,
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    if (worldId === "jungle") {
      svg.append(
        svgEl("circle", { cx: "12", cy: "9", r: "5.5", fill: "#1E9E5A" }),
        svgEl("rect", { x: "10.5", y: "14", width: "3", height: "6.5", rx: "1", fill: "#9E6B43" })
      );
    } else if (worldId === "ocean") {
      svg.append(
        svgEl("circle", { cx: "12", cy: "12", r: "8", fill: "#1B7A6E" }),
        svgEl("path", { d: "M5 13c2-2 4-2 6 0s4 2 6 0", stroke: "#FFFDF9", "stroke-width": "2.2" })
      );
    } else {
      svg.append(
        svgEl("circle", { cx: "12", cy: "12", r: "6", fill: "#F5A623" }),
        svgEl("ellipse", { cx: "12", cy: "12", rx: "10", ry: "3.2", stroke: "#1F2438" })
      );
    }
    return svg;
  }

  function createWorldBackgroundSvg(worldId) {
    const svg = svgEl("svg", {
      viewBox: "0 0 800 600",
      class: "sticker-world-bg",
      "aria-hidden": "true",
      focusable: "false",
      preserveAspectRatio: "none"
    });

    if (worldId === "jungle") {
      svg.append(
        svgEl("rect", { width: "800", height: "600", fill: "#FFF7DC" }),
        svgEl("circle", { cx: "660", cy: "110", r: "56", fill: "#F5A623" }),
        svgEl("path", { d: "M0 370 Q210 285 430 355 T800 330 L800 600 L0 600 Z", fill: "#84CC6E" }),
        svgEl("path", { d: "M0 435 Q260 375 520 435 T800 415 L800 600 L0 600 Z", fill: "#1E9E5A" }),
        svgEl("path", { d: "M315 432 Q360 515 295 600 L435 600 Q455 515 390 432 Z", fill: "#1B7A6E" }),
        svgEl("rect", { x: "82", y: "280", width: "28", height: "170", rx: "10", fill: "#9E6B43" }),
        svgEl("circle", { cx: "96", cy: "235", r: "88", fill: "#1E9E5A" }),
        svgEl("circle", { cx: "152", cy: "262", r: "68", fill: "#84CC6E" }),
        svgEl("rect", { x: "696", y: "290", width: "26", height: "155", rx: "10", fill: "#9E6B43" }),
        svgEl("circle", { cx: "710", cy: "248", r: "82", fill: "#1E9E5A" })
      );
    } else if (worldId === "ocean") {
      svg.append(
        svgEl("rect", { width: "800", height: "600", fill: "#1B7A6E" }),
        svgEl("polygon", { points: "170,0 265,0 385,600 115,600", fill: "#FFFDF9", opacity: "0.10" }),
        svgEl("polygon", { points: "515,0 605,0 715,600 445,600", fill: "#FFFDF9", opacity: "0.10" }),
        svgEl("path", { d: "M0 485 Q210 445 430 490 T800 475 L800 600 L0 600 Z", fill: "#FFF7DC" }),
        svgEl("circle", { cx: "135", cy: "492", r: "46", fill: "#C73C24" }),
        svgEl("circle", { cx: "180", cy: "508", r: "34", fill: "#F5A623" }),
        svgEl("path", { d: "M655 508 Q640 425 668 372 Q688 425 674 508 Z", fill: "#1E9E5A" }),
        svgEl("path", { d: "M702 512 Q688 410 715 348 Q735 410 718 512 Z", fill: "#84CC6E" })
      );
    } else {
      svg.append(
        svgEl("rect", { width: "800", height: "600", fill: "#1F2438" }),
        svgEl("circle", { cx: "140", cy: "110", r: "5", fill: "#FFF7DC" }),
        svgEl("circle", { cx: "320", cy: "82", r: "4", fill: "#FFFDF9" }),
        svgEl("circle", { cx: "485", cy: "140", r: "5.5", fill: "#F5A623" }),
        svgEl("circle", { cx: "695", cy: "98", r: "4", fill: "#FFF7DC" }),
        svgEl("circle", { cx: "625", cy: "212", r: "68", fill: "#F5A623" }),
        svgEl("ellipse", {
          cx: "625",
          cy: "212",
          rx: "116",
          ry: "22",
          fill: "none",
          stroke: "#FFF7DC",
          "stroke-width": "10",
          transform: "rotate(-16 625 212)"
        }),
        svgEl("path", { d: "M0 472 Q400 392 800 472 L800 600 L0 600 Z", fill: "#D6CFC2" }),
        svgEl("ellipse", { cx: "225", cy: "518", rx: "48", ry: "15", fill: "#B89B72" }),
        svgEl("ellipse", { cx: "565", cy: "502", rx: "60", ry: "17", fill: "#B89B72" })
      );
    }
    return svg;
  }

  function syncCountersFromStorageIfChanged() {
    if (typeof window.syncExternalCounters === "function") {
      window.syncExternalCounters();
      return;
    }
    const s = getAppState();
    if (!s || !s.storageOkay) return;
    try {
      const raw = window.localStorage.getItem("sd_counters_v3");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof normalizeCounters === "function") {
        s.counters = normalizeCounters(parsed);
      }
    } catch (_err) {
      /* ignore */
    }
  }

  function ensureStickerWorldState() {
    const s = getAppState();
    if (!s || !s.counters) return { activeWorld: "jungle", placements: {} };
    if (!s.counters.stickerWorld || typeof s.counters.stickerWorld !== "object") {
      s.counters.stickerWorld = { activeWorld: "jungle", placements: {} };
    }
    if (!s.counters.stickerWorld.placements || typeof s.counters.stickerWorld.placements !== "object") {
      s.counters.stickerWorld.placements = {};
    }
    if (!["jungle", "ocean", "space"].includes(s.counters.stickerWorld.activeWorld)) {
      s.counters.stickerWorld.activeWorld = "jungle";
    }
    if (typeof s.counters.streakFreeze !== "number" || !Number.isFinite(s.counters.streakFreeze)) {
      s.counters.streakFreeze = 0;
    }
    return s.counters.stickerWorld;
  }

  function collectStickerKeys() {
    const s = getAppState();
    if (!s || !s.counters) return [];
    const sw = ensureStickerWorldState();
    const earned = Array.isArray(s.counters.stickers) ? s.counters.stickers : [];
    const placedKeys = Object.keys(sw.placements || {});
    const merged = [...new Set([...earned, ...placedKeys])];
    return merged;
  }

  function defaultPlacementForSticker(index, preferredWorld = "jungle") {
    const cols = 4;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const world = ["jungle", "ocean", "space"].includes(preferredWorld) ? preferredWorld : "jungle";
    return {
      world,
      x: Number(clampVal(0.22 + col * 0.19, 0.14, 0.86).toFixed(4)),
      y: Number(clampVal(0.54 - row * 0.16, 0.18, 0.82).toFixed(4))
    };
  }

  function isCompactWorldTabs() {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 819px)").matches;
    }
    return (window.innerWidth || 1024) < 820;
  }

  function saveStickerPlacement(stickerKey, worldId, normX, normY) {
    const s = getAppState();
    if (!s || !s.counters) return;
    const sw = ensureStickerWorldState();
    const validWorld = ["jungle", "ocean", "space"].includes(worldId) ? worldId : sw.activeWorld;
    sw.activeWorld = validWorld;
    sw.placements[stickerKey] = {
      world: validWorld,
      x: Number(clampVal(normX, 0.06, 0.94).toFixed(4)),
      y: Number(clampVal(normY, 0.08, 0.92).toFixed(4))
    };
    if (typeof persistCounters === "function") {
      persistCounters();
    }
  }

  function createStarPopSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon sticker-pop-star-svg",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.append(
      svgEl("path", {
        d: "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z",
        fill: "#F5A623",
        stroke: "#1F2438",
        "stroke-width": "2",
        "stroke-linejoin": "round"
      })
    );
    return svg;
  }

  function createHeartIconSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-pip-heart",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.append(
      svgEl("path", {
        d: "M12 20.5s-7.5-4.6-9.3-9C1.4 8.2 3.5 4.5 7.2 4.5c2.1 0 3.7 1.2 4.8 2.8 1.1-1.6 2.7-2.8 4.8-2.8 3.7 0 5.8 3.7 4.5 7-1.8 4.4-9.3 9-9.3 9z",
        fill: "#C73C24",
        stroke: "#1F2438",
        "stroke-width": "2",
        "stroke-linejoin": "round"
      })
    );
    return svg;
  }

  function triggerStickerWiggle(btn) {
    if (!btn) return;
    btn.classList.remove("is-wiggle");
    void btn.offsetWidth;
    btn.classList.add("is-wiggle");
    if (typeof window.playSound === "function") {
      window.playSound("sticker-chime", { world: btn.dataset.world || "jungle" });
    }
    if (btn._wiggleTimer) window.clearTimeout(btn._wiggleTimer);
    btn._wiggleTimer = window.setTimeout(() => {
      btn.classList.remove("is-wiggle");
      btn._wiggleTimer = 0;
    }, 700);
  }

  function triggerStickerStarPop(btn) {
    if (!btn) return;
    const pop = document.createElement("span");
    pop.className = "sticker-star-pop";
    pop.setAttribute("aria-hidden", "true");
    pop.append(createStarPopSvg());
    btn.append(pop);
    window.setTimeout(() => {
      pop.remove();
    }, 550);
  }

  function buildWorldStickerNode(stickerKey, index, placement) {
    const s = getAppState();
    const isNewDaily = Boolean(s && s.newDailyStickerKey === stickerKey);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `world-sticker${isNewDaily ? " is-new-pop" : ""}`;
    if (selectedStickerKey === stickerKey) {
      btn.classList.add("is-selected");
    }
    if (isNewDaily) {
      btn.setAttribute("data-v142-new-sticker", "true");
    }
    btn.setAttribute("data-sticker", stickerKey);
    btn.dataset.world = placement.world;
    btn.dataset.x = String(placement.x);
    btn.dataset.y = String(placement.y);
    btn.draggable = false;
    btn.style.left = `${(placement.x * 100).toFixed(2)}%`;
    btn.style.top = `${(placement.y * 100).toFixed(2)}%`;

    const puzzle = typeof dailyPuzzle === "function" ? dailyPuzzle(stickerKey) : null;
    const weekdayTitle = typeof window.formatStickerTitle === "function"
      ? window.formatStickerTitle(stickerKey, puzzle)
      : `Monday · ${puzzle && puzzle.title ? puzzle.title : "Picture"}`;
    btn.setAttribute("aria-label", `${weekdayTitle} — drag or use arrow keys to move`);
    btn.setAttribute("title", weekdayTitle);

    const circle = document.createElement("span");
    circle.className = `world-sticker-circle${puzzle && puzzle.mirrored ? " is-mirrored" : ""}`;

    if (puzzle && puzzle.differences && puzzle.differences[0]) {
      const img = document.createElement("img");
      img.className = "world-sticker-img";
      img.draggable = false;
      const diff = puzzle.differences[0];
      const winSize = 62;
      const imgW = winSize * 2;
      const imgH = (imgW * puzzle.height) / puzzle.width;
      const center = winSize / 2;
      img.width = puzzle.width;
      img.height = puzzle.height;
      img.style.width = `${imgW}px`;
      img.style.height = `${imgH}px`;
      img.style.left = `${center - diff.x * imgW}px`;
      img.style.top = `${center - diff.y * imgH}px`;
      img.src = puzzle.imageA;
      img.alt = "";
      circle.append(img);
    } else {
      circle.append(createWorldIconSvg(placement.world || "jungle"));
    }

    btn.append(circle);
    bindStickerInteractions(btn, stickerKey, index);
    return btn;
  }

  function findTargetWorldElement(clientX, clientY, fallbackEl) {
    const worlds = [...document.querySelectorAll("#stickerBookView .sticker-world")];
    for (const w of worlds) {
      const r = w.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return w;
      }
    }
    return fallbackEl || worlds[0] || null;
  }

  function bindStickerInteractions(btn, stickerKey, index) {
    let lastPointerUpAt = 0;

    btn.addEventListener("click", event => {
      if (performance.now() - lastPointerUpAt < 350) return;
      event.preventDefault();
      event.stopPropagation();
      triggerStickerWiggle(btn);
    });

    btn.addEventListener("pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      selectedStickerKey = stickerKey;
      document.querySelectorAll("#stickerBookView .world-sticker").forEach(el => {
        el.classList.toggle("is-selected", el === btn);
      });
      btn.classList.add("is-dragging");
      if (typeof btn.focus === "function") btn.focus();

      let currentWorldEl = btn.closest(".sticker-world");
      if (!currentWorldEl) return;

      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      let latestWorldId = currentWorldEl.dataset.world || "jungle";
      let latestNormX = Number(btn.dataset.x) || 0.5;
      let latestNormY = Number(btn.dataset.y) || 0.5;

      if (typeof btn.setPointerCapture === "function") {
        try {
          btn.setPointerCapture(event.pointerId);
        } catch (_err) {
          /* ignore synthetic pointerId capture errors */
        }
      }

      const onMove = moveEvt => {
        if (!moved && Math.hypot(moveEvt.clientX - startX, moveEvt.clientY - startY) > 4) {
          moved = true;
        }
        if (!moved) return;
        const targetWorld = findTargetWorldElement(moveEvt.clientX, moveEvt.clientY, currentWorldEl);
        if (!targetWorld) return;
        if (targetWorld !== currentWorldEl) {
          currentWorldEl = targetWorld;
          currentWorldEl.append(btn);
        }
        const rect = currentWorldEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        latestWorldId = currentWorldEl.dataset.world || "jungle";
        latestNormX = clampVal((moveEvt.clientX - rect.left) / rect.width, 0.06, 0.94);
        latestNormY = clampVal((moveEvt.clientY - rect.top) / rect.height, 0.08, 0.92);
        btn.style.left = `${(latestNormX * 100).toFixed(2)}%`;
        btn.style.top = `${(latestNormY * 100).toFixed(2)}%`;
        btn.dataset.world = latestWorldId;
        btn.dataset.x = String(Number(latestNormX.toFixed(4)));
        btn.dataset.y = String(Number(latestNormY.toFixed(4)));
      };

      const onUp = upEvt => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        btn.classList.remove("is-dragging");
        lastPointerUpAt = performance.now();

        if (
          upEvt &&
          Number.isFinite(upEvt.clientX) &&
          Number.isFinite(upEvt.clientY) &&
          Math.hypot(upEvt.clientX - startX, upEvt.clientY - startY) > 4
        ) {
          moved = true;
          const targetWorld = findTargetWorldElement(upEvt.clientX, upEvt.clientY, currentWorldEl);
          if (targetWorld) {
            if (targetWorld !== currentWorldEl) {
              currentWorldEl = targetWorld;
              currentWorldEl.append(btn);
            }
            const rect = currentWorldEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              latestWorldId = currentWorldEl.dataset.world || "jungle";
              latestNormX = clampVal((upEvt.clientX - rect.left) / rect.width, 0.06, 0.94);
              latestNormY = clampVal((upEvt.clientY - rect.top) / rect.height, 0.08, 0.92);
            }
          }
        }

        if (moved) {
          btn.style.left = `${(latestNormX * 100).toFixed(2)}%`;
          btn.style.top = `${(latestNormY * 100).toFixed(2)}%`;
          btn.dataset.world = latestWorldId;
          btn.dataset.x = String(Number(latestNormX.toFixed(4)));
          btn.dataset.y = String(Number(latestNormY.toFixed(4)));
          const s = getAppState();
          if (s) s.newDailyStickerKey = null;
          saveStickerPlacement(stickerKey, latestWorldId, latestNormX, latestNormY);
          if (typeof window.playSound === "function") {
            window.playSound("sticker-drop", { world: latestWorldId });
          }
          triggerStickerStarPop(btn);
        } else {
          triggerStickerWiggle(btn);
        }
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
    });

    // Keyboard place & move support (Arrow keys + Enter / Space)
    btn.addEventListener("keydown", event => {
      const sw = ensureStickerWorldState();
      const current = sw.placements[stickerKey] || defaultPlacementForSticker(index);
      let nextWorld = current.world || sw.activeWorld || "jungle";
      let nextX = Number(btn.dataset.x) || current.x;
      let nextY = Number(btn.dataset.y) || current.y;
      const step = 0.06;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextX = clampVal(nextX + step, 0.06, 0.94);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nextX = clampVal(nextX - step, 0.06, 0.94);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nextY = clampVal(nextY + step, 0.08, 0.92);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextY = clampVal(nextY - step, 0.08, 0.92);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectedStickerKey = stickerKey;
        nextWorld = sw.activeWorld || nextWorld;
        nextX = clampVal(nextX + 0.12 > 0.88 ? 0.34 : nextX + 0.12, 0.08, 0.92);
        nextY = clampVal(nextY - 0.18 < 0.16 ? 0.52 : nextY - 0.18, 0.10, 0.90);
      } else {
        return;
      }

      const targetWorldEl = document.querySelector(`#stickerBookView .sticker-world[data-world="${nextWorld}"]`);
      if (targetWorldEl && btn.parentNode !== targetWorldEl) {
        targetWorldEl.append(btn);
      }
      btn.style.left = `${(nextX * 100).toFixed(2)}%`;
      btn.style.top = `${(nextY * 100).toFixed(2)}%`;
      btn.dataset.world = nextWorld;
      btn.dataset.x = String(Number(nextX.toFixed(4)));
      btn.dataset.y = String(Number(nextY.toFixed(4)));
      const s = getAppState();
      if (s) s.newDailyStickerKey = null;
      saveStickerPlacement(stickerKey, nextWorld, nextX, nextY);
    });
  }

  let inviteRevealTimer = 0;

  function restoreButtonsToResultView(keepInviteTimer = false) {
    if (!keepInviteTimer && inviteRevealTimer) {
      window.clearTimeout(inviteRevealTimer);
      inviteRevealTimer = 0;
    }
    const cardInner = document.querySelector("#resultView .result-card-inner");
    if (!cardInner) return;
    const anchorRow = cardInner.querySelector(".result-secondary-row");
    const duelBtn = document.getElementById("duelButton");
    const stickerBtn = document.getElementById("resultStickerButton");
    const shareBtn = document.querySelector("[data-share]");
    const panel = document.querySelector(".share-fallback-panel");

    if (duelBtn && duelBtn.parentNode !== cardInner) {
      if (stickerBtn && stickerBtn.parentNode === cardInner) {
        cardInner.insertBefore(duelBtn, stickerBtn);
      } else if (anchorRow) {
        cardInner.insertBefore(duelBtn, anchorRow);
      } else {
        cardInner.append(duelBtn);
      }
    }
    if (shareBtn && shareBtn.parentNode !== cardInner) {
      if (anchorRow) {
        cardInner.insertBefore(shareBtn, anchorRow);
      } else {
        cardInner.append(shareBtn);
      }
    }
    if (panel && panel.parentNode !== cardInner) {
      if (anchorRow) {
        cardInner.insertBefore(panel, anchorRow);
      } else {
        cardInner.append(panel);
      }
    }
  }

  function renderDailyEndBannerInStickerBook(view, studio) {
    const s = getAppState();
    const today = typeof dateKey === "function" ? dateKey() : "";
    const info = s && s.lastCompletedDaily && s.lastCompletedDaily.day === today
      ? s.lastCompletedDaily
      : null;

    let statsStrip = view.querySelector("[data-v142-daily-stats]");
    let inviteCard = view.querySelector("[data-v142-grownup-invite]");

    if (!info) {
      restoreButtonsToResultView(false);
      if (statsStrip) statsStrip.hidden = true;
      if (inviteCard) inviteCard.hidden = true;
      return;
    }

    if (!statsStrip) {
      statsStrip = document.createElement("div");
      statsStrip.className = "daily-book-stats-strip";
      statsStrip.setAttribute("data-v142-daily-stats", "true");
      view.insertBefore(statsStrip, studio);
    }
    if (!inviteCard) {
      inviteCard = document.createElement("div");
      inviteCard.className = "daily-grownup-invite";
      inviteCard.setAttribute("data-v142-grownup-invite", "true");
      view.insertBefore(inviteCard, studio);
    }

    statsStrip.hidden = false;
    statsStrip.replaceChildren();

    const pillsWrap = document.createElement("div");
    pillsWrap.className = "daily-stats-pills";

    const timeStr = typeof duelTime === "function" ? duelTime(info.elapsedMs) : "0:30";
    const timePill = document.createElement("span");
    timePill.className = "daily-stat-pill";
    timePill.textContent = `Time ${timeStr}`;

    const findsPill = document.createElement("span");
    findsPill.className = "daily-stat-pill";
    findsPill.textContent = `${info.finds || 5} / 5 found`;

    const streakVal = s && s.counters && s.counters.daily && s.counters.daily.streak
      ? s.counters.daily.streak
      : (info.streak || 1);
    const streakPill = document.createElement("span");
    streakPill.className = "daily-stat-pill daily-stat-streak";
    streakPill.textContent = info.restarted
      ? `Welcome back! ${streakVal} ${streakVal === 1 ? "day" : "days"}`
      : `${streakVal} ${streakVal === 1 ? "day" : "days"}`;

    pillsWrap.append(timePill, findsPill, streakPill);

    const peekWrap = document.createElement("div");
    peekWrap.className = "daily-tomorrow-peek";
    const tomorrowDay = typeof nextDay === "function" ? nextDay(today) : "";
    const tomorrowPuzzle = typeof dailyPuzzle === "function" && tomorrowDay ? dailyPuzzle(tomorrowDay) : null;
    if (tomorrowPuzzle) {
      const peekImg = document.createElement("img");
      peekImg.className = `daily-peek-thumb${tomorrowPuzzle.mirrored ? " is-mirrored" : ""}`;
      peekImg.src = tomorrowPuzzle.imageA;
      peekImg.alt = "Tomorrow's picture peek";
      peekImg.width = 48;
      peekImg.height = 36;
      peekWrap.append(peekImg);
    }
    const peekLabel = document.createElement("span");
    peekLabel.className = "daily-peek-label";
    peekLabel.textContent = "Tomorrow's peek";
    peekWrap.append(peekLabel);

    statsStrip.append(pillsWrap, peekWrap);

    // Build [data-v142-grownup-invite]
    restoreButtonsToResultView(true);
    inviteCard.replaceChildren();

    const flourish = document.createElement("div");
    flourish.className = "grownup-invite-flourish";
    const pipWrap = document.createElement("span");
    pipWrap.className = "pip-mascot invite-pip pip-cheering";
    pipWrap.setAttribute("aria-hidden", "true");
    if (typeof window.createPipMascotSvg === "function") {
      pipWrap.append(window.createPipMascotSvg("cheering"));
    }
    const flourishCopy = document.createElement("span");
    flourishCopy.className = "grownup-invite-turn";
    const turnText = document.createElement("strong");
    turnText.textContent = "Your turn!";
    flourishCopy.append(createHeartIconSvg(), turnText);
    flourish.append(pipWrap, flourishCopy);

    const actionsRow = document.createElement("div");
    actionsRow.className = "grownup-invite-actions";

    const duelBtn = document.getElementById("duelButton");
    if (duelBtn) {
      duelBtn.hidden = false;
      duelBtn.textContent = `Grown-up's turn: beat ${timeStr}?`;
      actionsRow.append(duelBtn);
    }

    const homeBtn = document.createElement("button");
    homeBtn.type = "button";
    homeBtn.className = "secondary-button daily-invite-home-btn";
    homeBtn.setAttribute("data-v142-daily-home", "true");
    homeBtn.textContent = "Home";
    homeBtn.addEventListener("click", () => {
      if (typeof returnHome === "function") returnHome();
    });
    actionsRow.append(homeBtn);

    ensureResultShareUI();
    const shareBtn = document.querySelector("[data-share]");
    const sharePanel = document.querySelector(".share-fallback-panel");
    const shareCanvas = document.querySelector(".postcard-preview-canvas");
    const activeRun = s && s.run;
    const isTodayFinishedDailyRun = Boolean(
      activeRun &&
      activeRun.kind === "daily" &&
      activeRun.finalized &&
      !activeRun.revealed &&
      activeRun.dailyDate === today
    );

    if (isTodayFinishedDailyRun && shareBtn) {
      shareBtn.hidden = false;
      if (shareCanvas) {
        prepareResultPostcard(activeRun, shareBtn, shareCanvas);
      }
      actionsRow.append(shareBtn);
    } else if (shareBtn) {
      shareBtn.hidden = true;
    }

    inviteCard.append(flourish, actionsRow);
    if (isTodayFinishedDailyRun && sharePanel) {
      sharePanel.hidden = true;
      inviteCard.append(sharePanel);
    } else if (sharePanel) {
      sharePanel.hidden = true;
    }

    const reducedMotion = Boolean(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );

    inviteCard.hidden = false;
    if (info.justCompleted) {
      info.justCompleted = false;
      if (inviteRevealTimer) {
        window.clearTimeout(inviteRevealTimer);
        inviteRevealTimer = 0;
      }
      if (!reducedMotion) {
        info.invitePending = true;
        inviteCard.classList.add("is-pending");
        inviteCard.classList.remove("is-revealed");
        inviteRevealTimer = window.setTimeout(() => {
          inviteRevealTimer = 0;
          info.invitePending = false;
          const card = document.querySelector("[data-v142-grownup-invite]");
          if (card) {
            card.hidden = false;
            card.classList.remove("is-pending");
            card.classList.add("is-revealed");
          }
          if (typeof window.playSound === "function") {
            window.playSound("pip-chirp");
          }
        }, 1200);
      } else {
        info.invitePending = false;
        inviteCard.classList.remove("is-pending");
        inviteCard.classList.add("is-revealed");
      }
    } else if (info.invitePending && inviteRevealTimer) {
      inviteCard.classList.add("is-pending");
      inviteCard.classList.remove("is-revealed");
    } else {
      inviteCard.classList.remove("is-pending");
      inviteCard.classList.add("is-revealed");
    }
  }

  function renderStickerWorldsStudio() {
    const view = document.getElementById("stickerBookView");
    const grid = document.getElementById("stickerGrid");
    if (!view || !grid) return;

    syncCountersFromStorageIfChanged();
    const s = getAppState();
    const sw = ensureStickerWorldState();
    const streak = (s && s.counters && s.counters.daily && s.counters.daily.streak) || 0;
    const freezeCount = (s && s.counters && typeof s.counters.streakFreeze === "number")
      ? s.counters.streakFreeze
      : 0;
    const compactTabs = isCompactWorldTabs();

    let studio = view.querySelector(".sticker-worlds-studio");
    if (!studio) {
      studio = document.createElement("div");
      studio.className = "sticker-worlds-studio";
      view.insertBefore(studio, grid);
    }
    renderDailyEndBannerInStickerBook(view, studio);
    studio.replaceChildren();

    // Header: Streak shield pill + World selector tabs
    const header = document.createElement("div");
    header.className = "sticker-worlds-header";

    const freezeBar = document.createElement("div");
    freezeBar.className = "streak-freeze-bar";

    const freezePill = document.createElement("div");
    freezePill.className = "streak-freeze-pill";
    freezePill.setAttribute("data-streak-freeze", String(freezeCount));
    const freezeText = document.createElement("span");
    freezeText.textContent = `${streak}-day streak · ${freezeCount} ${freezeCount === 1 ? "shield" : "shields"}`;
    freezePill.append(createShieldSvg(), freezeText);
    const hideStreakPill = streak <= 0 && freezeCount <= 0;
    freezePill.hidden = hideStreakPill;
    freezeBar.hidden = hideStreakPill;
    freezeBar.append(freezePill);

    const tabs = document.createElement("div");
    tabs.className = "sticker-world-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Sticker Worlds");

    for (const meta of STICKER_WORLDS_META) {
      const isSelected = sw.activeWorld === meta.id;
      const panelId = `sticker-world-${meta.id}`;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = `sticker-world-tab${isSelected ? " is-selected" : ""}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(isSelected));
      tab.setAttribute("aria-controls", panelId);
      tab.dataset.worldTab = meta.id;
      const label = document.createElement("span");
      label.textContent = meta.name;
      tab.append(createWorldIconSvg(meta.id), label);
      tab.addEventListener("click", () => {
        if (s) s.newDailyStickerKey = null;
        sw.activeWorld = meta.id;
        if (typeof persistCounters === "function") persistCounters();
        renderStickerWorldsStudio();
      });
      tabs.append(tab);
    }

    header.append(freezeBar, tabs);

    // 3 Illustrated Worlds (.sticker-world)
    const worldsGrid = document.createElement("div");
    worldsGrid.className = "sticker-worlds-grid";

    const worldEls = new Map();
    for (const meta of STICKER_WORLDS_META) {
      const isActive = sw.activeWorld === meta.id;
      const worldEl = document.createElement("div");
      worldEl.id = `sticker-world-${meta.id}`;
      worldEl.className = `sticker-world${isActive ? " is-active" : ""}`;
      worldEl.dataset.world = meta.id;
      worldEl.setAttribute("role", "tabpanel");
      worldEl.setAttribute("aria-label", `${meta.name} sticker world`);
      worldEl.hidden = compactTabs ? !isActive : false;
      if (compactTabs && !isActive) {
        worldEl.setAttribute("aria-hidden", "true");
      }

      const titleBadge = document.createElement("span");
      titleBadge.className = "sticker-world-title";
      const titleText = document.createElement("span");
      titleText.textContent = meta.name;
      titleBadge.append(createWorldIconSvg(meta.id), titleText);

      worldEl.append(createWorldBackgroundSvg(meta.id), titleBadge);

      // HTML5 dragover/drop support in addition to pointer dragging
      worldEl.addEventListener("dragover", e => {
        e.preventDefault();
      });
      worldEl.addEventListener("drop", e => {
        e.preventDefault();
        const key = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || selectedStickerKey;
        if (!key) return;
        const rect = worldEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const nx = clampVal((e.clientX - rect.left) / rect.width, 0.06, 0.94);
        const ny = clampVal((e.clientY - rect.top) / rect.height, 0.08, 0.92);
        if (s) s.newDailyStickerKey = null;
        saveStickerPlacement(key, meta.id, nx, ny);
        renderStickerWorldsStudio();
      });

      worldEls.set(meta.id, worldEl);
      worldsGrid.append(worldEl);
    }

    // Place earned [data-sticker] items into their respective worlds
    const keys = collectStickerKeys();
    let didSaveInitialPlacement = false;
    keys.forEach((stickerKey, idx) => {
      let saved = sw.placements[stickerKey];
      if (!saved) {
        saved = defaultPlacementForSticker(idx, sw.activeWorld);
        sw.placements[stickerKey] = saved;
        didSaveInitialPlacement = true;
      }
      const targetWorldId = worldEls.has(saved.world) ? saved.world : sw.activeWorld;
      const placement = {
        world: targetWorldId,
        x: saved.x,
        y: saved.y
      };
      const targetWorld = worldEls.get(targetWorldId) || worldEls.get(sw.activeWorld) || worldEls.get("jungle");
      const stickerNode = buildWorldStickerNode(stickerKey, idx, placement);
      if (targetWorld) {
        targetWorld.append(stickerNode);
      }
    });
    if (didSaveInitialPlacement && typeof persistCounters === "function") {
      persistCounters();
    }

    studio.append(header, worldsGrid);
  }

  // ==========================================================================
  // ITEM 5: Postcard + Challenge Sharing ([data-share], [data-challenge-banner])
  // ==========================================================================
  const shareState = {
    unlockedForCurrentResult: false,
    activeChallenge: null,
    lastBlobUrl: null,
    lastChallengeUrl: "",
    lastPayload: null,
    preparedBlob: null,
    preparedFile: null,
    preparedPayloadKey: ""
  };

  function createShareIconSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-share-postcard",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.append(
      svgEl("rect", { x: "3", y: "5", width: "18", height: "14", rx: "2.5", fill: "#FFF7DC" }),
      svgEl("circle", { cx: "8.5", cy: "10", r: "2", fill: "#F5A623" }),
      svgEl("path", { d: "M4.5 16.5l4.5-4 3.5 3 3-2.5 4 3.5" })
    );
    return svg;
  }

  function createChallengeClockSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-challenge-clock",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.append(
      svgEl("circle", { cx: "12", cy: "13", r: "8", fill: "#FFF7DC" }),
      svgEl("path", { d: "M12 9v4l2.5 1.5M9.5 2.5h5" })
    );
    return svg;
  }

  function createChallengeStarSvg() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-challenge-star",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.append(
      svgEl("path", {
        d: "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z",
        fill: "#F5A623"
      })
    );
    return svg;
  }

  function computeSingleLevelElapsedMs(activeRun) {
    if (!activeRun) return 1000;
    const levelIndex = Number(activeRun.levelIndex) || 0;
    const levelElapsed = Number(activeRun.levelElapsedMs) || 0;
    const totalElapsed = Number(activeRun.elapsedMs) || 0;
    const startElapsed = Number(activeRun.levelStartElapsedMs) || 0;

    if (levelIndex > 0) {
      if (levelElapsed > 0 && (totalElapsed === 0 || levelElapsed <= totalElapsed)) {
        return levelElapsed;
      }
      if (startElapsed > 0 && totalElapsed >= startElapsed) {
        return Math.max(1000, totalElapsed - startElapsed);
      }
      if (
        activeRun.mode === "timed" &&
        Number(activeRun.timeLimit) > 0 &&
        Number.isFinite(activeRun.timeRemaining) &&
        activeRun.timeRemaining < activeRun.timeLimit
      ) {
        return Math.max(1000, (activeRun.timeLimit - activeRun.timeRemaining) * 1000);
      }
      if (Number(activeRun.levelStartedAt) > 0) {
        return Math.max(1000, performance.now() - activeRun.levelStartedAt);
      }
      if (totalElapsed > 0) {
        return Math.max(1000, Math.round(totalElapsed / (levelIndex + 1)));
      }
    }

    if (levelElapsed > 0) return levelElapsed;
    if (totalElapsed > 0) return totalElapsed;
    if (
      activeRun.mode === "timed" &&
      Number(activeRun.timeLimit) > 0 &&
      Number.isFinite(activeRun.timeRemaining) &&
      activeRun.timeRemaining < activeRun.timeLimit
    ) {
      return Math.max(1000, (activeRun.timeLimit - activeRun.timeRemaining) * 1000);
    }
    return 1000;
  }

  function buildChallengePayloadFromRun(run) {
    const s = getAppState();
    const activeRun = run || getCurrentRun();
    if (!activeRun || !Array.isArray(activeRun.list) || activeRun.list.length === 0) {
      return null;
    }
    const rawPuzzle = activeRun.list[activeRun.levelIndex] || activeRun.list[0];
    if (!rawPuzzle) return null;
    const puzzleId = rawPuzzle.mirrorOf || rawPuzzle.id;
    if (!puzzleId) return null;
    const difficulty = activeRun.difficulty || (s && s.selectedDifficulty) || "medium";
    const mode = activeRun.mode === "timed" ? "timed" : "untimed";
    const levelMs = computeSingleLevelElapsedMs(activeRun);
    const seconds = Math.max(1, Math.round(levelMs / 1000));
    const hasLevelScore = Boolean(
      Number.isFinite(activeRun.levelScore) &&
      (activeRun.levelScore > 0 || (Number(activeRun.levelIndex) || 0) > 0 || !(Number(activeRun.score) > 0))
    );
    const rawScore = hasLevelScore
      ? activeRun.levelScore
      : activeRun.score || 0;
    const score = Math.max(0, Math.floor(rawScore));

    // Strictly only {p, d, m, t, s, v} — never nickname or storage text
    return {
      p: String(puzzleId),
      d: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
      m: mode,
      t: seconds,
      s: score,
      v: 1
    };
  }

  function encodeChallengeUrl(payload) {
    const clean = {
      p: payload.p,
      d: payload.d,
      m: payload.m,
      t: payload.t,
      s: payload.s,
      v: payload.v
    };
    const json = JSON.stringify(clean);
    const b64 = window.btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}#challenge=${b64}`;
  }

  function parseChallengeHash(hashString) {
    if (typeof hashString !== "string" || !hashString.startsWith("#challenge=")) {
      return null;
    }
    const raw = hashString.slice("#challenge=".length).trim();
    if (!raw || raw.length > 512) return null;

    let parsed = null;

    // 1. Try raw or URI-encoded JSON
    if (raw.startsWith("{") || raw.startsWith("%7B") || raw.startsWith("%7b")) {
      try {
        parsed = JSON.parse(decodeURIComponent(raw));
      } catch (_err) {
        return null;
      }
    } else if (raw.includes("=") && (raw.includes("&") || raw.startsWith("p="))) {
      // 2. Try query-string format (#challenge=p=eng-classroom&d=medium...)
      try {
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) {
          obj[k] = v;
        }
        parsed = obj;
      } catch (_err) {
        return null;
      }
    } else {
      // 3. Try Base64URL / Base64 JSON
      try {
        const stdB64 = raw.replace(/-/g, "+").replace(/_/g, "/");
        const padded = stdB64 + "===".slice((stdB64.length + 3) % 4);
        const decoded = window.atob(padded);
        parsed = JSON.parse(decoded);
      } catch (_err) {
        try {
          parsed = JSON.parse(decodeURIComponent(raw));
        } catch (_err2) {
          return null;
        }
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    // Strict key whitelist: payload keys must be a subset of {p, d, m, t, s, v}
    const keys = Object.keys(parsed);
    if (keys.length === 0 || !keys.every(k => ALLOWED_CHALLENGE_KEYS.has(k))) {
      return null;
    }

    const p = typeof parsed.p === "string" ? parsed.p.trim() : "";
    if (!/^[a-z0-9-]+$/.test(p)) return null;
    if (typeof LEVEL_ORDER !== "undefined" && !LEVEL_ORDER.includes(p)) {
      return null;
    }

    const d = typeof parsed.d === "string" && ["easy", "medium", "hard"].includes(parsed.d)
      ? parsed.d
      : "medium";
    const m = typeof parsed.m === "string" && ["untimed", "timed"].includes(parsed.m)
      ? parsed.m
      : "untimed";
    const tNum = parsed.t !== undefined ? Number(parsed.t) : 0;
    const sNum = parsed.s !== undefined ? Number(parsed.s) : 0;
    if (!Number.isFinite(tNum) || tNum < 0 || !Number.isFinite(sNum) || sNum < 0) {
      return null;
    }

    return {
      p,
      d,
      m,
      t: clampVal(Math.round(tNum), 0, 86400),
      s: clampVal(Math.round(sNum), 0, 1000000),
      v: 1
    };
  }

  function drawStarPath(ctx, cx, cy, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Zero-PII Postcard Canvas Renderer: takes no nickname or text from localStorage
  function renderPostcardToCanvas(canvas, payload) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 720;
    const H = 540;
    canvas.width = W;
    canvas.height = H;

    // 1. Sunlit Studio card ground & border
    ctx.fillStyle = "#FBF6EC";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#FFF7DC";
    ctx.strokeStyle = "#1F2438";
    ctx.lineWidth = 6;
    ctx.fillRect(20, 20, W - 40, H - 40);
    ctx.strokeRect(20, 20, W - 40, H - 40);

    // 2. Scene thumbnail (crop-to-fill 4:3 scene into 624x336 box without stretching)
    const imgA = document.getElementById("imageA");
    const thumbX = 48;
    const thumbY = 48;
    const thumbW = 624;
    const thumbH = 336;

    ctx.fillStyle = "#EFE6D5";
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);

    if (imgA && imgA.complete && imgA.naturalWidth > 0 && imgA.naturalHeight > 0) {
      try {
        const iw = imgA.naturalWidth;
        const ih = imgA.naturalHeight;
        const targetRatio = thumbW / thumbH;
        const sourceRatio = iw / ih;
        let sx = 0;
        let sy = 0;
        let sw = iw;
        let sh = ih;
        if (sourceRatio > targetRatio) {
          sw = Math.round(ih * targetRatio);
          sx = Math.round((iw - sw) / 2);
        } else {
          sh = Math.round(iw / targetRatio);
          sy = Math.round((ih - sh) / 2);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(thumbX, thumbY, thumbW, thumbH);
        ctx.clip();
        ctx.drawImage(imgA, sx, sy, sw, sh, thumbX, thumbY, thumbW, thumbH);
        ctx.restore();
      } catch (_err) {
        /* ignore canvas image draw issue */
      }
    }

    ctx.strokeStyle = "#1F2438";
    ctx.lineWidth = 4;
    ctx.strokeRect(thumbX, thumbY, thumbW, thumbH);

    // 3. Stars row (5 stars)
    const run = getCurrentRun();
    const earnedStars = run ? clampVal(run.found ? run.found.size : 5, 0, 5) : 5;
    for (let i = 0; i < 5; i += 1) {
      const sx = 92 + i * 48;
      const sy = 432;
      drawStarPath(ctx, sx, sy, 18, 8);
      ctx.fillStyle = i < earnedStars ? "#F5A623" : "#D5C7B0";
      ctx.fill();
      ctx.strokeStyle = "#1F2438";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 4. Score & difficulty badge (strictly numeric + fixed labels, zero nickname/PII)
    const diffLabel = ({ easy: "Easy", medium: "Medium", hard: "Hard" })[payload.d] || "Medium";
    const modeLabel = payload.m === "timed" ? "Timed" : "Untimed";

    ctx.fillStyle = "#1F2438";
    ctx.font = "700 26px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Spot the Difference", 48, 490);

    ctx.fillStyle = "#C73C24";
    ctx.font = "700 32px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${payload.s} pts`, W - 48, 438);

    ctx.fillStyle = "#525B76";
    ctx.font = "700 20px Nunito, system-ui, sans-serif";
    ctx.fillText(`${diffLabel} · ${modeLabel} · ${payload.t}s`, W - 48, 488);
  }

  function blobToPostcardFile(blob) {
    if (!blob || typeof File !== "function") return null;
    try {
      return new File([blob], "spot-the-difference-postcard.png", { type: "image/png" });
    } catch (_err) {
      return null;
    }
  }

  function canvasToBlobSync(canvas) {
    if (!canvas || typeof canvas.toDataURL !== "function") return null;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) return null;
      const raw = window.atob(dataUrl.slice(comma + 1));
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) {
        bytes[i] = raw.charCodeAt(i);
      }
      return new Blob([bytes], { type: "image/png" });
    } catch (_err) {
      return null;
    }
  }

  function prepareResultPostcard(run, shareBtn, canvas) {
    if (!canvas) return;
    const payload = buildChallengePayloadFromRun(run);
    if (!payload) return;
    const challengeUrl = encodeChallengeUrl(payload);
    const payloadKey = JSON.stringify(payload);

    if (
      canvas._drawnPayloadKey === payloadKey &&
      shareState.preparedPayloadKey === payloadKey &&
      shareState.preparedBlob
    ) {
      shareState.lastPayload = payload;
      shareState.lastChallengeUrl = challengeUrl;
      window.lastChallengePayload = payload;
      window.lastChallengeUrl = challengeUrl;
      if (shareBtn) {
        shareBtn.dataset.challengeUrl = challengeUrl;
        shareBtn.dataset.challengePayload = payloadKey;
      }
      return;
    }

    shareState.lastPayload = payload;
    shareState.lastChallengeUrl = challengeUrl;
    shareState.preparedPayloadKey = payloadKey;
    window.lastChallengePayload = payload;
    window.lastChallengeUrl = challengeUrl;

    if (shareBtn) {
      shareBtn.dataset.challengeUrl = challengeUrl;
      shareBtn.dataset.challengePayload = payloadKey;
    }

    renderPostcardToCanvas(canvas, payload);
    canvas._drawnPayloadKey = payloadKey;
    const syncBlob = canvasToBlobSync(canvas);
    if (syncBlob) {
      shareState.preparedBlob = syncBlob;
      shareState.preparedFile = blobToPostcardFile(syncBlob);
    }
    if (typeof canvas.toBlob === "function") {
      try {
        canvas.toBlob(blob => {
          if (blob && shareState.preparedPayloadKey === payloadKey) {
            shareState.preparedBlob = blob;
            shareState.preparedFile = blobToPostcardFile(blob);
          }
        }, "image/png");
      } catch (_err) {
        /* ignore toBlob error */
      }
    }
  }

  function triggerPostcardDownload(canvas) {
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "spot-the-difference-postcard.png";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (_err) {
      /* ignore */
    }
  }

  async function copyChallengeLink(url, statusEl) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(url);
        if (statusEl) statusEl.textContent = "Challenge link copied!";
        return;
      }
    } catch (_err) {
      /* fallback below */
    }
    if (statusEl) statusEl.textContent = `Challenge link: ${url}`;
  }

  async function performUnlockedShare(shareBtn, panel, canvas, statusEl) {
    const run = getCurrentRun();
    const payload = buildChallengePayloadFromRun(run);
    if (!payload) return;
    const challengeUrl = encodeChallengeUrl(payload);
    const payloadKey = JSON.stringify(payload);

    if (shareState.preparedPayloadKey !== payloadKey || !shareState.preparedBlob) {
      prepareResultPostcard(run, shareBtn, canvas);
    } else {
      shareState.lastPayload = payload;
      shareState.lastChallengeUrl = challengeUrl;
      window.lastChallengePayload = payload;
      window.lastChallengeUrl = challengeUrl;
      if (shareBtn) {
        shareBtn.dataset.challengeUrl = challengeUrl;
        shareBtn.dataset.challengePayload = payloadKey;
      }
    }

    if (panel) {
      panel.hidden = false;
      if (typeof panel.scrollIntoView === "function") {
        try {
          panel.scrollIntoView({ block: "nearest", behavior: "instant" });
        } catch (_err) {
          panel.scrollIntoView();
        }
      }
    }

    const file = shareState.preparedFile || blobToPostcardFile(shareState.preparedBlob);

    if (typeof navigator.share === "function") {
      const shareData = {
        url: challengeUrl,
        title: "Spot the Difference"
      };
      if (file) {
        const candidateFiles = [file];
        let canAttachFiles = true;
        if (typeof navigator.canShare === "function") {
          try {
            canAttachFiles = Boolean(navigator.canShare({ files: candidateFiles }));
          } catch (_err) {
            canAttachFiles = false;
          }
        }
        if (canAttachFiles) {
          shareData.files = candidateFiles;
        }
      }
      try {
        await navigator.share(shareData);
        if (statusEl) statusEl.textContent = "Shared postcard and challenge link!";
        return;
      } catch (_err) {
        /* fall back to download + copy link buttons */
      }
    }

    if (statusEl) {
      statusEl.textContent = "Postcard ready — download the PNG or copy the challenge link below.";
    }
  }

  function runThroughGrownGate(action) {
    const s = getAppState();
    if (!s || typeof requireGrown !== "function") return;
    if (!shareState.unlockedForCurrentResult) {
      s.gatePassed = false;
    }
    requireGrown(() => {
      shareState.unlockedForCurrentResult = true;
      action();
    });
  }

  function ensureResultShareUI() {
    const cardInner = document.querySelector("#resultView .result-card-inner");
    if (!cardInner) return;
    if (document.querySelector("[data-share]")) return;

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "secondary-button wide share-result-button";
    shareBtn.setAttribute("data-share", "true");
    const shareLabel = document.createElement("span");
    shareLabel.textContent = "Share postcard & challenge";
    shareBtn.append(createShareIconSvg(), shareLabel);

    const panel = document.createElement("div");
    panel.className = "share-fallback-panel";
    panel.hidden = true;

    const canvas = document.createElement("canvas");
    canvas.className = "postcard-preview-canvas";
    canvas.width = 720;
    canvas.height = 540;
    canvas.setAttribute("aria-label", "Result postcard preview");

    const actions = document.createElement("div");
    actions.className = "share-fallback-actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.className = "secondary-button";
    downloadBtn.setAttribute("data-share-download", "true");
    downloadBtn.textContent = "Download postcard PNG";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "quiet-button";
    copyBtn.setAttribute("data-share-copy", "true");
    copyBtn.textContent = "Copy challenge link";

    const statusEl = document.createElement("p");
    statusEl.className = "helper-text share-status-text";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");

    actions.append(downloadBtn, copyBtn);
    panel.append(canvas, actions, statusEl);

    shareBtn.addEventListener("click", () => {
      if (!buildChallengePayloadFromRun(getCurrentRun())) return;
      runThroughGrownGate(() => {
        void performUnlockedShare(shareBtn, panel, canvas, statusEl);
      });
    });

    downloadBtn.addEventListener("click", () => {
      const payload = shareState.lastPayload || buildChallengePayloadFromRun(getCurrentRun());
      if (!payload) return;
      runThroughGrownGate(() => {
        if (!shareState.lastPayload) {
          renderPostcardToCanvas(canvas, payload);
        }
        triggerPostcardDownload(canvas);
        statusEl.textContent = "Postcard PNG downloaded.";
      });
    });

    copyBtn.addEventListener("click", () => {
      const payload = buildChallengePayloadFromRun(getCurrentRun());
      const url = shareState.lastChallengeUrl || (payload ? encodeChallengeUrl(payload) : "");
      if (!url) return;
      runThroughGrownGate(() => {
        void copyChallengeLink(url, statusEl);
      });
    });

    const anchorRow = cardInner.querySelector(".result-secondary-row");
    if (anchorRow) {
      cardInner.insertBefore(shareBtn, anchorRow);
      cardInner.insertBefore(panel, anchorRow);
    } else {
      cardInner.append(shareBtn, panel);
    }
  }

  function resetResultShareSession() {
    shareState.unlockedForCurrentResult = false;
    shareState.preparedBlob = null;
    shareState.preparedFile = null;
    shareState.preparedPayloadKey = "";
    const canvas = document.querySelector(".postcard-preview-canvas");
    if (canvas) canvas._drawnPayloadKey = "";
    const panel = document.querySelector(".share-fallback-panel");
    if (panel) panel.hidden = true;
    const s = getAppState();
    if (s) s.gatePassed = false;
  }

  function isShareableResult(run, reason) {
    if (!run) return false;
    if (run.kind === "duel") return false;
    if (reason === "revealed" || run.revealed) return false;
    return true;
  }

  function syncResultShareVisibility(reason) {
    const run = getCurrentRun();
    const shareBtn = document.querySelector("#resultView [data-share]");
    const panel = document.querySelector("#resultView .share-fallback-panel");
    const canvas = document.querySelector("#resultView .postcard-preview-canvas");
    const allowShare = isShareableResult(run, reason);
    if (shareBtn) {
      shareBtn.hidden = !allowShare;
    }
    if (panel) {
      panel.hidden = true;
    }
    if (allowShare && canvas) {
      prepareResultPostcard(run, shareBtn, canvas);
    }
  }

  function renderChallengeBanner(challenge, puzzle) {
    const gameView = document.getElementById("gameView");
    if (!gameView) return;

    let banner = gameView.querySelector("[data-challenge-banner]");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "challenge-banner";
      banner.setAttribute("data-challenge-banner", "true");
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-label", "Challenge target");
      const topline = gameView.querySelector(".game-topline");
      if (topline && topline.nextSibling) {
        gameView.insertBefore(banner, topline.nextSibling);
      } else {
        gameView.prepend(banner);
      }
    }

    const isUntimed = challenge.m === "untimed";
    banner.hidden = false;
    banner.dataset.challengePuzzle = puzzle.id;
    banner.dataset.challengeScore = String(challenge.s);
    banner.dataset.challengeTime = String(challenge.t);
    banner.dataset.challengeMode = challenge.m;
    banner.dataset.challengeGoal = isUntimed ? "time" : "score";
    banner.replaceChildren();

    const main = document.createElement("div");
    main.className = "challenge-banner-main";

    const thumb = document.createElement("img");
    thumb.className = "challenge-banner-thumb";
    thumb.src = puzzle.imageA;
    thumb.alt = puzzle.title || puzzle.id;
    thumb.width = 96;
    thumb.height = 72;

    const copy = document.createElement("div");
    copy.className = "challenge-banner-copy";

    const statsRow = document.createElement("div");
    statsRow.className = "challenge-banner-stats";

    const timeChip = document.createElement("span");
    timeChip.className = "challenge-stat-chip challenge-stat-time";
    const timeText = document.createElement("span");
    timeText.textContent = `${challenge.t}s`;
    timeChip.append(createChallengeClockSvg(), timeText);

    const scoreChip = document.createElement("span");
    scoreChip.className = "challenge-stat-chip challenge-stat-score";
    const scoreText = document.createElement("span");
    scoreText.textContent = `${challenge.s} pts`;
    scoreChip.append(createChallengeStarSvg(), scoreText);

    if (isUntimed) {
      statsRow.append(timeChip, scoreChip);
    } else {
      statsRow.append(scoreChip, timeChip);
    }

    const diffLabel = ({ easy: "Easy", medium: "Medium", hard: "Hard" })[challenge.d] || "Medium";
    const modeLabel = challenge.m === "timed" ? "Timed" : "Untimed";
    const sub = document.createElement("p");
    sub.className = "challenge-banner-sub";
    sub.textContent = isUntimed
      ? `Beat this time · ${puzzle.title || puzzle.id} · ${diffLabel} · ${modeLabel}`
      : `${puzzle.title || puzzle.id} · ${diffLabel} · ${modeLabel}`;

    copy.append(statsRow, sub);
    main.append(thumb, copy);
    banner.append(main);
  }

  function hideChallengeBanner() {
    const banner = document.querySelector("[data-challenge-banner]");
    if (banner) {
      banner.hidden = true;
    }
  }

  function retryActiveChallenge() {
    const s = getAppState();
    const c = shareState.activeChallenge;
    if (s && c && Array.isArray(s.puzzles)) {
      const puzzle = s.puzzles.find(item => item.id === c.p && !item.mirrored);
      if (puzzle && typeof newRun === "function") {
        newRun({
          challenge: true,
          puzzle,
          mode: c.m,
          difficulty: c.d
        });
        renderChallengeBanner(c, puzzle);
        return true;
      }
    }
    const prevRun = s && s.run;
    if (prevRun && prevRun.kind === "challenge" && prevRun.list && prevRun.list[0] && typeof newRun === "function") {
      const rawId = prevRun.list[0].mirrorOf || prevRun.list[0].id;
      const puzzle = (s.puzzles && s.puzzles.find(item => item.id === rawId && !item.mirrored)) || prevRun.list[0];
      newRun({
        challenge: true,
        puzzle,
        mode: prevRun.mode,
        difficulty: prevRun.difficulty
      });
      if (c) renderChallengeBanner(c, puzzle);
      return true;
    }
    if (typeof newRun === "function") newRun();
    return false;
  }

  window.retryActiveChallenge = retryActiveChallenge;

  function tryActivateChallengeFromHash() {
    const s = getAppState();
    if (!s || !Array.isArray(s.puzzles) || s.puzzles.length === 0) return false;
    if (s.run && !s.run.finalized) return false;

    const parsed = parseChallengeHash(window.location.hash);
    if (!parsed) {
      return false;
    }

    const puzzle = s.puzzles.find(item => item.id === parsed.p && !item.mirrored);
    if (!puzzle) {
      return false;
    }

    shareState.activeChallenge = parsed;

    if (typeof newRun === "function") {
      newRun({
        challenge: true,
        puzzle,
        mode: parsed.m,
        difficulty: parsed.d
      });
    }
    renderChallengeBanner(parsed, puzzle);
    if (window.history && typeof window.history.replaceState === "function") {
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      } catch (_err) {
        /* ignore history replaceState restriction */
      }
    }
    return true;
  }

  // ==========================================================================
  // Hook Global Functions (app.js / ui-v11.js / kid-v14.js)
  // ==========================================================================
  function hookGlobalsV141() {
    if (typeof window.pickNearestDifference === "function") {
      const origPickNearestDifference = window.pickNearestDifference;
      window.pickNearestDifference = function v141PickNearestDifference(xPx, yPx, width, height) {
        if (isStageZoomed()) {
          const adjX = (xPx - width / 2 - zoomState.panX) / zoomState.scale + width / 2;
          const adjY = (yPx - height / 2 - zoomState.panY) / zoomState.scale + height / 2;
          return origPickNearestDifference.call(this, adjX, adjY, width, height);
        }
        return origPickNearestDifference.call(this, xPx, yPx, width, height);
      };
    }

    if (typeof window.tapImage === "function") {
      const origTapImage = window.tapImage;
      window.tapImage = function v141TapImage(event, which) {
        zoomState.activeSide = which === "B" ? "B" : "A";
        if (!isStageZoomed()) {
          return origTapImage.call(this, event, which);
        }

        if (event && event.detail === 0) {
          return origTapImage.call(this, event, which);
        }

        const now = performance.now();
        const clientX = event ? event.clientX : 0;
        const clientY = event ? event.clientY : 0;

        if (
          zoomState.deferredTapTimer &&
          now - zoomState.deferredTapAt <= DOUBLE_TAP_MS &&
          Math.hypot(clientX - zoomState.deferredTapX, clientY - zoomState.deferredTapY) <= DOUBLE_TAP_PX
        ) {
          clearDeferredTap();
          zoomState.lastTapAt = 0;
          resetPictureZoom();
          return;
        }
        if (event && event.detail >= 2) {
          clearDeferredTap();
          zoomState.lastTapAt = 0;
          resetPictureZoom();
          return;
        }

        clearDeferredTap();
        const savedRun = getCurrentRun();
        const syntheticEvent = {
          detail: event && typeof event.detail === "number" ? event.detail : 1,
          clientX,
          clientY
        };
        zoomState.deferredTapX = clientX;
        zoomState.deferredTapY = clientY;
        zoomState.deferredTapAt = now;
        zoomState.deferredTapTimer = window.setTimeout(() => {
          zoomState.deferredTapTimer = 0;
          if (!isPlayingGame() || getCurrentRun() !== savedRun) return;
          if (zoomState.loupeActive || zoomState.panning || zoomState.pointers.size > 0) return;
          if (!isStageZoomed()) return;
          zoomState.activeSide = which === "B" ? "B" : "A";
          origTapImage.call(this, syntheticEvent, which);
        }, DOUBLE_TAP_MS);
      };
    }

    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function v141StartLevel(...args) {
        resetPictureZoom();
        return origStartLevel.apply(this, args);
      };
    }

    if (typeof window.leaveActiveRun === "function") {
      const origLeaveActiveRun = window.leaveActiveRun;
      window.leaveActiveRun = function v141LeaveActiveRun(...args) {
        resetPictureZoom();
        return origLeaveActiveRun.apply(this, args);
      };
    }

    if (typeof window.newRun === "function") {
      const origNewRun = window.newRun;
      window.newRun = function v141NewRun(options = {}) {
        if (!options || !options.challenge) {
          shareState.activeChallenge = null;
          hideChallengeBanner();
        }
        return origNewRun.apply(this, arguments);
      };
    }

    if (typeof window.renderStickerBook === "function") {
      const origRenderStickerBook = window.renderStickerBook;
      window.renderStickerBook = function v141RenderStickerBook(...args) {
        syncCountersFromStorageIfChanged();
        const res = origRenderStickerBook.apply(this, args);
        renderStickerWorldsStudio();
        return res;
      };
    }

    if (typeof window.finishRun === "function") {
      const origFinishRun = window.finishRun;
      window.finishRun = function v141FinishRun(reason, ...rest) {
        resetPictureZoom();
        resetResultShareSession();
        ensureResultShareUI();
        restoreButtonsToResultView();
        const res = origFinishRun.call(this, reason, ...rest);
        const s = getAppState();
        if (!s || s.view === "resultView") {
          restoreButtonsToResultView();
          syncResultShareVisibility(reason);
        }
        return res;
      };
    }

    if (typeof window.verifyCatalog === "function") {
      const origVerifyCatalog = window.verifyCatalog;
      window.verifyCatalog = function v141VerifyCatalog(...args) {
        const res = origVerifyCatalog.apply(this, args);
        tryActivateChallengeFromHash();
        return res;
      };
    }
  }

  hookGlobalsV141();

  window.addEventListener("hashchange", () => {
    const s = getAppState();
    if (s && s.run && !s.run.finalized) return;
    tryActivateChallengeFromHash();
  });

  if (typeof window.matchMedia === "function") {
    const compactMq = window.matchMedia("(max-width: 819px)");
    if (typeof compactMq.addEventListener === "function") {
      compactMq.addEventListener("change", () => {
        renderStickerWorldsStudio();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindLoupeAndZoomEvents();
    ensureResultShareUI();
    renderStickerWorldsStudio();
    if (window.location.hash.startsWith("#challenge=")) {
      tryActivateChallengeFromHash();
    }
  });
})();
