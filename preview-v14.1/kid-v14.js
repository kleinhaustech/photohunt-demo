"use strict";

/*
  kid-v14.js — Spot the Difference v14 (classic deferred script, loaded after
  app.js and ui-v11.js). Wraps global app.js functions the same way ui-v11.js
  does: call the original first, then add behaviour. Finds and misses are still
  decided only by app.js (pickNearestDifference / effectiveRadiusPixels /
  markFound). No new storage keys, no network, DOM built with createElement(NS).
  The only persisted value is the ghostHandDone flag inside the existing
  sd_counters_v3 object, written through app.js persistCounters().

  1. Kid lobby: picture icons on every .category-button (static and rebuilt).
  2. Progressive hints: .is-nudge on #hintButton after 15s without a find.
     (Quadrant -> exact .hint-spot escalation and the 40s untimed ready rule
     live in app.js useHint / frame.)
  3. Level 1 ghost hand after 4s of play clock with no tap, only until the
     player's first successful find ever (R3).
  6. Flying star from a find to the next HUD star slot, kept >= 8px inside
     the viewport for the whole flight (R2).
  7. Lobby peek: sizes the home hero so 64px of #kidLobby shows above the
     fold below 1024px (R1, paired with kid-v14.css section 9).
*/
(function initSpotTheDifferenceV14() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const NUDGE_NO_FIND_MS = 15000;
  const GHOST_DELAY_MS = 4000;
  const FLY_STAR_MS = 720;
  const LAST_TAP_FRESH_MS = 1500;

  // R2: flying-star geometry. The .fly-star box is 32px; each keyframe's
  // scale/rotation gives its on-screen half-extent. Centres are clamped so the
  // rotated, scaled box stays FLY_SAFE_INSET px inside the viewport, with a
  // small pad for the in-between frames of the scale/rotate interpolation.
  const FLY_STAR_HALF = 16;
  const FLY_ARC_LIFT = 72;
  const FLY_SAFE_INSET = 8;
  const FLY_SAFE_PAD = 2;
  const FLY_KEYS = Object.freeze([
    Object.freeze({ scale: 0.5, rotate: -25, opacity: 1 }),
    Object.freeze({ scale: 1.3, rotate: 10, opacity: 1 }),
    Object.freeze({ scale: 0.62, rotate: 36, opacity: 0.95 })
  ]);

  // Session-only, in memory.
  const kid = {
    tappedRun: null,
    ghostShownRun: null,
    ghostNodes: [],
    lastTapStageId: "",
    lastTapAt: 0,
    flyNodes: new Set(),
    flyTimers: new Set()
  };

  function appState() {
    return typeof state !== "undefined" && state ? state : null;
  }

  function currentRun() {
    const s = appState();
    return s ? s.run : null;
  }

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }
    return el;
  }

  function baseSvg(className, viewBox = "0 0 24 24") {
    return svgEl("svg", {
      class: className,
      viewBox,
      "aria-hidden": "true",
      focusable: "false"
    });
  }

  const STAR_PATH = "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z";

  function starSvg(className) {
    const svg = baseSvg(className);
    svg.append(svgEl("path", {
      d: STAR_PATH,
      fill: "#F5A623",
      stroke: "#1F2438",
      "stroke-width": "2",
      "stroke-linejoin": "round"
    }));
    return svg;
  }

  function checkBadge() {
    const badge = document.createElement("span");
    badge.className = "pick-check";
    badge.setAttribute("aria-hidden", "true");
    const svg = baseSvg("pick-check-svg", "0 0 16 16");
    svg.append(svgEl("path", {
      d: "M3.5 8.5L6.5 11.5L12.5 4.5",
      fill: "none",
      stroke: "#FFFDF9",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));
    badge.append(svg);
    return badge;
  }

  // ------------------------------------------------------------------------
  // 1. Category picture icons (same drawings as the static index.html ones)
  // ------------------------------------------------------------------------
  function categorySvg(categoryId) {
    const svg = baseSvg("category-svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "#1F2438");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    switch (categoryId) {
      case "all":
        svg.append(
          svgEl("rect", { x: "2.5", y: "4", width: "19", height: "16", rx: "3", fill: "#FFF7DC" }),
          svgEl("circle", { cx: "8.5", cy: "9.5", r: "2.2", fill: "#F5A623" }),
          svgEl("path", { d: "M3.5 17.5L9 12.5L12.5 15.5L15.5 12.5L20.5 17.5V19H3.5Z", fill: "#1E9E5A", stroke: "none" }),
          svgEl("path", { d: "M3.5 17.5L9 12.5L12.5 15.5L15.5 12.5L20.5 17.5" })
        );
        break;
      case "animals":
        svg.append(
          svgEl("path", { d: "M12 12.5c-3 0-6 3.4-6 6 0 1.6 1.3 2.5 3 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.7 0 3-.9 3-2.5 0-2.6-3-6-6-6z", fill: "#B88256" }),
          svgEl("ellipse", { cx: "5", cy: "10", rx: "2", ry: "2.5", fill: "#B88256" }),
          svgEl("ellipse", { cx: "9.2", cy: "5.8", rx: "2", ry: "2.6", fill: "#B88256" }),
          svgEl("ellipse", { cx: "14.8", cy: "5.8", rx: "2", ry: "2.6", fill: "#B88256" }),
          svgEl("ellipse", { cx: "19", cy: "10", rx: "2", ry: "2.5", fill: "#B88256" })
        );
        break;
      case "sea-sky":
        svg.append(
          svgEl("circle", { cx: "17", cy: "6.5", r: "3", fill: "#F5A623" }),
          svgEl("path", { d: "M5 11.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.4 1.6 2.2 2.2 0 0 1 .2 4.4z", fill: "#FFFDF9" }),
          svgEl("path", { d: "M2 16.5c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0 3.3-1.6 5 0 3.3 1.6 5 0V21H2z", fill: "#1B7A6E" })
        );
        break;
      case "vehicles-space":
        svg.append(
          svgEl("path", { d: "M10 18.5l-1 3 3-1.6 3 1.6-1-3z", fill: "#F5A623" }),
          svgEl("path", { d: "M8.6 13.5L5.5 16.5V19l3.5-1.5zM15.4 13.5l3.1 3V19L15 17.5z", fill: "#C73C24" }),
          svgEl("path", { d: "M12 2.5c3.2 2.4 4.4 6 3.6 11.5L15 18.5H9L8.4 14C7.6 8.5 8.8 4.9 12 2.5z", fill: "#FFFDF9" }),
          svgEl("circle", { cx: "12", cy: "10", r: "2", fill: "#1B7A6E" })
        );
        break;
      default:
        // Any future catalogue category: a friendly star, never an emoji.
        svg.append(svgEl("path", { d: STAR_PATH, fill: "#F5A623" }));
        break;
    }
    return svg;
  }

  function decorateCategoryButtons() {
    const container = document.getElementById("categoryChoices");
    if (!container) return;
    container.querySelectorAll("button[data-category]").forEach(button => {
      if (button.querySelector(":scope > .category-icon")) return;
      const labelText = button.textContent.trim();
      const icon = document.createElement("span");
      icon.className = "category-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.append(categorySvg(button.dataset.category));
      const label = document.createElement("span");
      label.className = "category-label";
      label.textContent = labelText;
      button.replaceChildren(checkBadge(), icon, label);
    });
  }

  // ------------------------------------------------------------------------
  // 2. Hint nudge: 15s without a find (or since the last hint) and usable
  // ------------------------------------------------------------------------
  function syncHintNudge(run) {
    const s = appState();
    const button = document.getElementById("hintButton");
    if (!button) return;
    let nudge = false;
    if (s && run && s.view === "gameView" && run.phase === "playing" && !button.disabled) {
      const noFind = Number(run.noFindElapsedMs) || 0;
      let since = Number(run.kidNudgeFromMs) || 0;
      if (noFind < since) {
        since = 0;
        run.kidNudgeFromMs = 0;
      }
      nudge = noFind - since >= NUDGE_NO_FIND_MS;
    }
    if (button.classList.contains("is-nudge") !== nudge) {
      button.classList.toggle("is-nudge", nudge);
    }
  }

  // ------------------------------------------------------------------------
  // 3. Ghost hand on Level 1 of a plain levels run, until the first find ever
  // ------------------------------------------------------------------------
  // R3: the seen flag lives inside the existing sd_counters_v3 object
  // (state.counters). app.js normalizeCounters() keeps it across loads and
  // treats a missing field in older saves as false.
  function ghostHandDone() {
    const s = appState();
    return Boolean(s && s.counters && s.counters.ghostHandDone === true);
  }

  function recordFirstFind(run) {
    const s = appState();
    if (!s || !s.counters || !run || run.kind === "duel") return;
    if (s.counters.ghostHandDone === true) return;
    // Mutate the merged in-memory counters, then write the whole object
    // back through app.js, so no other field is dropped.
    s.counters.ghostHandDone = true;
    if (typeof persistCounters === "function") persistCounters();
  }

  function fingerSvg() {
    const svg = baseSvg("ghost-hand-svg", "0 0 56 56");
    svg.append(svgEl("path", {
      d: "M22 8C22 5.2 24.2 3 27 3C29.8 3 32 5.2 32 8V23H35C37.2 23 39 24.8 39 27V28.5H41.5C43.7 28.5 45.5 30.3 45.5 32.5V39C45.5 46.2 39.7 52 32.5 52H23.5C17.4 52 12.5 47.1 12.5 41V31C12.5 28.5 14.5 26.5 17 26.5H22V8Z",
      fill: "#FFF7DC",
      stroke: "#1F2438",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }));
    return svg;
  }

  function removeGhost() {
    for (const nodeEl of kid.ghostNodes) nodeEl.remove();
    kid.ghostNodes = [];
  }

  function ghostTargetDifference(run) {
    const puzzle = run.list && run.list[run.levelIndex];
    if (!puzzle || !Array.isArray(puzzle.differences)) return null;
    return puzzle.differences.find((_, i) => !run.found.has(i)) || null;
  }

  function showGhost(run) {
    const stageA = document.getElementById("imageStageA");
    const stageB = document.getElementById("imageStageB");
    const diff = ghostTargetDifference(run);
    if (!stageA || !stageB || !diff) return;
    removeGhost();

    const x = typeof displayX === "function" ? displayX(diff) : diff.x;
    const left = `${(x * 100).toFixed(3)}%`;
    const top = `${(diff.y * 100).toFixed(3)}%`;

    const layerA = document.createElement("div");
    layerA.className = "ghost-layer";
    layerA.setAttribute("aria-hidden", "true");
    const tapRing = document.createElement("span");
    tapRing.className = "ghost-ring";
    tapRing.style.left = left;
    tapRing.style.top = top;
    const hand = document.createElement("span");
    hand.className = "ghost-hand";
    hand.style.left = left;
    hand.style.top = top;
    hand.append(fingerSvg());
    layerA.append(tapRing, hand);

    const layerB = document.createElement("div");
    layerB.className = "ghost-layer";
    layerB.setAttribute("aria-hidden", "true");
    const twinRing = document.createElement("span");
    twinRing.className = "ghost-ring";
    twinRing.style.left = left;
    twinRing.style.top = top;
    layerB.append(twinRing);

    stageA.append(layerA);
    stageB.append(layerB);
    kid.ghostNodes = [layerA, layerB];
    kid.ghostShownRun = run;
  }

  function ghostEligible(run) {
    const s = appState();
    return Boolean(
      s &&
      run &&
      s.view === "gameView" &&
      run.mode === "untimed" &&
      run.kind === "levels" &&
      run.levelIndex === 0 &&
      run.phase === "playing" &&
      kid.tappedRun !== run &&
      run.found.size === 0 &&
      !ghostHandDone()
    );
  }

  function isGhostBlockingCoach(run) {
    return ghostEligible(run) || kid.ghostNodes.length > 0;
  }

  window.isGhostBlockingCoach = isGhostBlockingCoach;

  function syncGhost(run) {
    const s = appState();
    if (!s || !run) return;
    if (!ghostEligible(run)) {
      if (kid.ghostNodes.length) removeGhost();
      return;
    }
    if (kid.ghostShownRun !== run && (Number(run.elapsedMs) || 0) >= GHOST_DELAY_MS) {
      showGhost(run);
    }
  }

  function handleFirstPointer(event) {
    const s = appState();
    if (!s || s.view !== "gameView" || !s.run) return;
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const stage = target.closest("#tapSurfaceA, #tapSurfaceB, #imageStageA, #imageStageB");
    if (!stage) return;
    kid.tappedRun = s.run;
    if (kid.ghostNodes.length) removeGhost();
    const stageEl = stage.id === "imageStageA" || stage.id === "imageStageB"
      ? stage
      : stage.closest("#imageStageA, #imageStageB");
    if (stageEl) {
      kid.lastTapStageId = stageEl.id;
      kid.lastTapAt = performance.now();
    }
  }

  // ------------------------------------------------------------------------
  // 6. Flying star from the find to the next .star-progress .star-slot
  // ------------------------------------------------------------------------
  function visibleRect(el) {
    if (!el || el.hidden) return null;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function clearFlyingStars() {
    for (const timer of kid.flyTimers) window.clearTimeout(timer);
    kid.flyTimers.clear();
    for (const nodeEl of kid.flyNodes) nodeEl.remove();
    kid.flyNodes.clear();
    document.querySelectorAll(".star-progress .star-slot").forEach(slot => {
      slot.classList.remove("is-awaiting", "is-landed");
    });
  }

  // Half the on-screen size of the 32px box after scale + rotate.
  function flyExtent(key) {
    const rad = key.rotate * Math.PI / 180;
    return FLY_STAR_HALF * key.scale * (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)));
  }

  // Keep a centre so its box sits FLY_SAFE_INSET (+ pad) inside [0, size].
  function clampCentre(value, extent, size) {
    const min = FLY_SAFE_INSET + FLY_SAFE_PAD + extent;
    const max = size - FLY_SAFE_INSET - FLY_SAFE_PAD - extent;
    if (max < min) return size / 2;
    return Math.min(max, Math.max(min, value));
  }

  function flyFrame(key, centreX, centreY) {
    const x = centreX - FLY_STAR_HALF;
    const y = centreY - FLY_STAR_HALF;
    return {
      transform: `translate(${x}px, ${y}px) scale(${key.scale}) rotate(${key.rotate}deg)`,
      opacity: key.opacity
    };
  }

  function flyStar(run, index) {
    const s = appState();
    if (!s || prefersReducedMotion()) return;
    if (s.view !== "gameView" || s.run !== run || (run.phase !== "playing" && run.phase !== "between")) return;
    if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function") return;

    const puzzle = run.list[run.levelIndex];
    const diff = puzzle && puzzle.differences ? puzzle.differences[index] : null;
    const slot = document.querySelectorAll(".star-progress .star-slot")[run.found.size - 1];
    const slotRect = visibleRect(slot);
    if (!diff || !slotRect) return;

    const freshTap = performance.now() - kid.lastTapAt <= LAST_TAP_FRESH_MS;
    const stage = document.getElementById(freshTap && kid.lastTapStageId ? kid.lastTapStageId : "imageStageB");
    const stageRect = visibleRect(stage);
    if (!stageRect) return;

    const root = document.documentElement;
    const viewW = Math.min(window.innerWidth || Infinity, root.clientWidth || Infinity);
    const viewH = Math.min(window.innerHeight || Infinity, root.clientHeight || Infinity);
    if (!Number.isFinite(viewW) || !Number.isFinite(viewH)) return;

    const [startKey, midKey, endKey] = FLY_KEYS;
    const startExtent = flyExtent(startKey);
    const midExtent = flyExtent(midKey);
    const endExtent = flyExtent(endKey);

    const x = typeof displayX === "function" ? displayX(diff) : diff.x;
    const startX = clampCentre(stageRect.left + x * stageRect.width, startExtent, viewW);
    const startY = clampCentre(stageRect.top + diff.y * stageRect.height, startExtent, viewH);
    const endX = clampCentre(slotRect.left + slotRect.width / 2, endExtent, viewW);
    const endY = clampCentre(slotRect.top + slotRect.height / 2, endExtent, viewH);
    // The apex is the highest point of the flight; clamp it so the star never
    // leaves the top of the viewport (it used to rise 49-63px above it).
    const midX = clampCentre((startX + endX) / 2, midExtent, viewW);
    const midY = clampCentre(Math.min(startY, endY) - FLY_ARC_LIFT, midExtent, viewH);

    const star = document.createElement("span");
    star.className = "fly-star";
    star.setAttribute("aria-hidden", "true");
    star.append(starSvg("fly-star-svg"));
    document.body.append(star);
    kid.flyNodes.add(star);
    slot.classList.remove("is-landed");
    slot.classList.add("is-awaiting");

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      star.remove();
      kid.flyNodes.delete(star);
      slot.classList.remove("is-awaiting");
      slot.classList.add("is-landed");
      const landTimer = window.setTimeout(() => {
        slot.classList.remove("is-landed");
        kid.flyTimers.delete(landTimer);
      }, 420);
      kid.flyTimers.add(landTimer);
    };

    const animation = star.animate(
      [
        flyFrame(startKey, startX, startY),
        { ...flyFrame(midKey, midX, midY), offset: 0.5 },
        flyFrame(endKey, endX, endY)
      ],
      { duration: FLY_STAR_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
    );
    animation.addEventListener("finish", finish);
    animation.addEventListener("cancel", finish);
    const safety = window.setTimeout(() => {
      kid.flyTimers.delete(safety);
      finish();
    }, FLY_STAR_MS + 250);
    kid.flyTimers.add(safety);
  }

  // ------------------------------------------------------------------------
  // Wrap app.js globals (after ui-v11.js has wrapped them)
  // ------------------------------------------------------------------------
  function hookGlobalFunctions() {
    if (typeof window.buildCategories === "function") {
      const origBuildCategories = window.buildCategories;
      window.buildCategories = function kidBuildCategories(...args) {
        const res = origBuildCategories.apply(this, args);
        decorateCategoryButtons();
        return res;
      };
    }

    if (typeof window.updateHUD === "function") {
      const origUpdateHUD = window.updateHUD;
      window.updateHUD = function kidUpdateHUD(...args) {
        const res = origUpdateHUD.apply(this, args);
        const run = currentRun();
        syncHintNudge(run);
        syncGhost(run);
        return res;
      };
    }

    if (typeof window.useHint === "function") {
      const origUseHint = window.useHint;
      window.useHint = function kidUseHint(...args) {
        const run = currentRun();
        const prevHints = run ? run.totalHints : 0;
        const res = origUseHint.apply(this, args);
        if (run && run.totalHints > prevHints) {
          run.kidNudgeFromMs = Number(run.noFindElapsedMs) || 0;
          syncHintNudge(run);
        }
        return res;
      };
    }

    if (typeof window.markFound === "function") {
      const origMarkFound = window.markFound;
      window.markFound = function kidMarkFound(index) {
        const run = currentRun();
        const willMark = Boolean(run && run.phase === "playing" && !run.found.has(index));
        const res = origMarkFound.apply(this, arguments);
        if (willMark) {
          removeGhost();
          recordFirstFind(run);
          flyStar(run, index);
        }
        return res;
      };
    }

    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function kidStartLevel(...args) {
        removeGhost();
        clearFlyingStars();
        return origStartLevel.apply(this, args);
      };
    }

    if (typeof window.showView === "function") {
      const origShowView = window.showView;
      window.showView = function kidShowView(id, ...rest) {
        if (id !== "gameView") clearFlyingStars();
        return origShowView.call(this, id, ...rest);
      };
    }

    if (typeof window.leaveActiveRun === "function") {
      const origLeaveActiveRun = window.leaveActiveRun;
      window.leaveActiveRun = function kidLeaveActiveRun(...args) {
        removeGhost();
        clearFlyingStars();
        const button = document.getElementById("hintButton");
        if (button) button.classList.remove("is-nudge");
        return origLeaveActiveRun.apply(this, args);
      };
    }
  }

  hookGlobalFunctions();

  // Capture phase on window: runs before app.js document-level handlers and
  // never stops the tap, so the hit test is untouched.
  window.addEventListener("pointerdown", handleFirstPointer, { capture: true, passive: true });

  document.addEventListener("DOMContentLoaded", () => {
    decorateCategoryButtons();
  });
})();
