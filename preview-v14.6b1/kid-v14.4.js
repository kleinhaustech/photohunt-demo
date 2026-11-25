"use strict";

/*
  kid-v14.4.js — Spot the Difference v14.4 (loaded last, after kid-v14.3.js).
  - Item 1: Sticker quests that earn Pip outfits (hat, scarf, bow) with earn toasts.
  - Item 2: Outfit picker ([data-v144-outfit-picker]) inside #stickerBookView.
  - Item 3: Keeps Pip's chosen outfit synced across home, play dock, between, result,
    and hidden-Pip art.
  - Item 4: Persists only hiddenPipFinds and pipOutfit inside sd_counters_v3 via app.js.
  DOM built exclusively with createElement / textContent / replaceChildren.
*/
(function initSpotTheDifferenceV144() {
  const FALLBACK_ANIMAL_IDS = Object.freeze([
    "eng-campsite",
    "eng-farm",
    "eng-garden",
    "eng-snowtown",
    "eng-zoo",
    "eng-park",
    "eng-petshop"
  ]);

  const OUTFIT_CATALOG = Object.freeze([
    Object.freeze({
      id: "none",
      name: "None",
      goal: "",
      target: 0,
      earnMessage: ""
    }),
    Object.freeze({
      id: "hat",
      name: "Hat",
      goal: "Find 3 hidden Pips",
      target: 3,
      earnMessage: "You earned Pip's hat!"
    }),
    Object.freeze({
      id: "scarf",
      name: "Scarf",
      goal: "Clear 2 animal pictures",
      target: 2,
      earnMessage: "You earned Pip's scarf!"
    }),
    Object.freeze({
      id: "bow",
      name: "Bow",
      goal: "Play a Daily",
      target: 1,
      earnMessage: "You earned Pip's bow!"
    })
  ]);

  const OUTFIT_IDS = Object.freeze(OUTFIT_CATALOG.map(item => item.id));

  const questToastState = {
    timer: 0,
    el: null,
    lastToastedOutfit: "",
    lastToastedAt: 0
  };

  const pipRunState = {
    run: null,
    count: 0,
    popTimer: 0
  };

  // Brand palette ONLY: --color-reward, --color-accent-secondary, --color-accent, --color-ink, cream
  const CONFETTI_COLORS = Object.freeze([
    "#F5A623",
    "#1B7A6E",
    "#C73C24",
    "#1F2438",
    "#FFF7DC",
    "#FFFDF9"
  ]);

  const confettiState = {
    layer: null,
    rafId: 0,
    timerId: 0,
    lastBurst: null
  };

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function getCounters() {
    if (typeof state !== "undefined" && state && state.counters) {
      return state.counters;
    }
    return null;
  }

  function getLevelOrderList() {
    if (typeof LEVEL_ORDER !== "undefined" && Array.isArray(LEVEL_ORDER)) {
      return LEVEL_ORDER;
    }
    return [];
  }

  function getAnimalIdSet() {
    const set = new Set();
    if (
      typeof state !== "undefined" &&
      state &&
      state.catalog &&
      Array.isArray(state.catalog.puzzles)
    ) {
      for (const puzzle of state.catalog.puzzles) {
        if (puzzle && puzzle.category === "animals") {
          const baseId = puzzle.mirrorOf || puzzle.id;
          if (typeof baseId === "string" && baseId) {
            set.add(baseId);
          }
        }
      }
    }
    if (set.size === 0) {
      for (const id of FALLBACK_ANIMAL_IDS) {
        set.add(id);
      }
    }
    return set;
  }

  function getQuestProgress() {
    const counters = getCounters();
    const levelOrder = getLevelOrderList();
    const animalSet = getAnimalIdSet();

    const rawFinds = counters && Array.isArray(counters.hiddenPipFinds)
      ? counters.hiddenPipFinds
      : [];
    const uniqueFinds = [];
    for (const id of rawFinds) {
      if (
        typeof id === "string" &&
        (levelOrder.length === 0 || levelOrder.includes(id)) &&
        !uniqueFinds.includes(id)
      ) {
        uniqueFinds.push(id);
      }
    }

    const rawCleared = counters && Array.isArray(counters.clearedLevels)
      ? counters.clearedLevels
      : [];
    const uniqueAnimals = [];
    for (const id of rawCleared) {
      if (typeof id === "string" && animalSet.has(id) && !uniqueAnimals.includes(id)) {
        uniqueAnimals.push(id);
      }
    }

    const rawStickers = counters && Array.isArray(counters.stickers)
      ? counters.stickers
      : [];
    const dailyCount = rawStickers.length;

    const unlocked = {
      none: true,
      hat: uniqueFinds.length >= 3,
      scarf: uniqueAnimals.length >= 2,
      bow: dailyCount >= 1
    };

    return {
      hiddenPipCount: uniqueFinds.length,
      animalClearsCount: uniqueAnimals.length,
      dailyStickersCount: dailyCount,
      unlocked
    };
  }

  function getActivePipOutfit() {
    const counters = getCounters();
    if (!counters || typeof counters.pipOutfit !== "string") return "none";
    const candidate = counters.pipOutfit;
    if (!OUTFIT_IDS.includes(candidate)) return "none";
    const progress = getQuestProgress();
    return progress.unlocked[candidate] ? candidate : "none";
  }

  function clearQuestEarnToast() {
    if (questToastState.timer) {
      window.clearTimeout(questToastState.timer);
      questToastState.timer = 0;
    }
    if (questToastState.el) {
      questToastState.el.remove();
      questToastState.el = null;
    }
    document.querySelectorAll("[data-v144-quest-toast]").forEach(el => el.remove());
  }

  function showQuestEarnToast(outfitId) {
    const meta = OUTFIT_CATALOG.find(item => item.id === outfitId);
    if (!meta || !meta.earnMessage) return;

    const now = Date.now();
    if (questToastState.lastToastedOutfit === outfitId && now - questToastState.lastToastedAt < 1000) {
      return;
    }
    questToastState.lastToastedOutfit = outfitId;
    questToastState.lastToastedAt = now;

    clearQuestEarnToast();
    if (!document.body) return;

    const toast = document.createElement("div");
    toast.className = "v144-quest-toast";
    toast.setAttribute("data-v144-quest-toast", outfitId);
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const iconWrap = document.createElement("span");
    iconWrap.className = "v144-quest-toast-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    if (typeof window.createPipMascotSvg === "function") {
      iconWrap.append(window.createPipMascotSvg("cheering", { outfit: outfitId }));
    }

    const text = document.createElement("span");
    text.className = "v144-quest-toast-text";
    text.textContent = meta.earnMessage;

    toast.append(iconWrap, text);
    document.body.append(toast);
    questToastState.el = toast;

    questToastState.timer = window.setTimeout(() => {
      clearQuestEarnToast();
    }, 3400);
  }

  function needsPipOutfitUpdate(activeOutfit) {
    const ids = ["homePipMascot", "betweenPipMascot", "resultPipMascot"];
    for (const id of ids) {
      const container = document.getElementById(id);
      if (!container) continue;
      const svg = container.querySelector("svg");
      if (!svg || svg.getAttribute("data-v144-pip-outfit") !== activeOutfit) {
        return true;
      }
    }
    const playPip = document.querySelector("[data-v142-play-pip]");
    if (playPip) {
      const svg = playPip.querySelector("svg");
      if (!svg || svg.getAttribute("data-v144-pip-outfit") !== activeOutfit) {
        return true;
      }
    }
    return false;
  }

  function syncAllPipMascots(force = false) {
    const active = getActivePipOutfit();
    if (force || needsPipOutfitUpdate(active)) {
      if (typeof window.renderPipMascots === "function") {
        window.renderPipMascots();
      }
    }
    document.querySelectorAll("[data-v143-hidden-pip] .hidden-pip-art").forEach(art => {
      const svg = art.querySelector("svg");
      if (!force && svg && svg.getAttribute("data-v144-pip-outfit") === active) return;
      if (typeof window.createPipMascotSvg === "function") {
        art.replaceChildren(window.createPipMascotSvg("curious"));
      }
    });
    document.querySelectorAll("#stickerBookView .invite-pip").forEach(wrap => {
      const svg = wrap.querySelector("svg");
      if (!force && svg && svg.getAttribute("data-v144-pip-outfit") === active) return;
      if (typeof window.createPipMascotSvg === "function") {
        wrap.replaceChildren(window.createPipMascotSvg("cheering"));
      }
    });
    document.querySelectorAll("[data-v144-pip-count] .v144-pip-count-icon").forEach(wrap => {
      const svg = wrap.querySelector("svg");
      if (!force && svg && svg.getAttribute("data-v144-pip-outfit") === active) return;
      if (typeof window.createPipMascotSvg === "function") {
        wrap.replaceChildren(window.createPipMascotSvg("curious"));
      }
    });
  }

  // --------------------------------------------------------------------------
  // A3: Small hidden-Pip find counter (per-run in HUD + total from hiddenPipFinds)
  // --------------------------------------------------------------------------
  function syncPipRunBinding() {
    const activeRun = typeof state !== "undefined" && state ? state.run : null;
    if (activeRun !== pipRunState.run) {
      pipRunState.run = activeRun;
      pipRunState.count = 0;
    }
  }

  function renderPlayPipCounter(justFound = false) {
    syncPipRunBinding();
    const badges = document.querySelector("#gameView .game-badges");
    if (!badges) return;

    const run = pipRunState.run;
    const hideCounter = !run || run.kind === "duel" || run.kind === "studio" || run.customStudio;
    let badge = badges.querySelector("[data-v144-pip-count]");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "v144-pip-count-badge";
      badge.setAttribute("data-v144-pip-count", "true");
      badge.setAttribute("role", "status");
      badge.setAttribute("aria-live", "polite");

      const iconWrap = document.createElement("span");
      iconWrap.className = "v144-pip-count-icon";
      iconWrap.setAttribute("aria-hidden", "true");
      if (typeof window.createPipMascotSvg === "function") {
        iconWrap.append(window.createPipMascotSvg("curious"));
      }

      const textWrap = document.createElement("span");
      textWrap.className = "v144-pip-count-text";

      const runLabel = document.createElement("strong");
      runLabel.className = "v144-pip-count-run";
      runLabel.setAttribute("data-v144-pip-run-label", "true");

      const totalLabel = document.createElement("span");
      totalLabel.className = "v144-pip-count-total";
      totalLabel.setAttribute("data-v144-pip-total-label", "true");

      textWrap.append(runLabel, totalLabel);
      badge.append(iconWrap, textWrap);

      const musicBtn = badges.querySelector("[data-v143-music-toggle]");
      if (musicBtn && musicBtn.parentNode === badges) {
        badges.insertBefore(badge, musicBtn);
      } else {
        badges.append(badge);
      }
    }

    badge.hidden = hideCounter;
    if (hideCounter) return;

    const progress = getQuestProgress();
    const maxPips = getLevelOrderList().length || 22;
    const totalCount = Math.min(maxPips, progress.hiddenPipCount);
    const runCount = pipRunState.count;

    badge.setAttribute("data-v144-pip-run", String(runCount));
    badge.setAttribute("data-v144-pip-total", String(totalCount));
    badge.setAttribute(
      "aria-label",
      `Hidden Pips found this run: ${runCount}. Total found: ${totalCount} of ${maxPips}.`
    );

    const runLabel = badge.querySelector("[data-v144-pip-run-label]");
    const totalLabel = badge.querySelector("[data-v144-pip-total-label]");
    if (runLabel) runLabel.textContent = `Pip ${runCount}`;
    if (totalLabel) totalLabel.textContent = `${totalCount}/${maxPips}`;

    if (justFound && !prefersReducedMotion()) {
      badge.classList.remove("is-bumped");
      void badge.offsetWidth;
      badge.classList.add("is-bumped");
      if (pipRunState.popTimer) window.clearTimeout(pipRunState.popTimer);
      pipRunState.popTimer = window.setTimeout(() => {
        badge.classList.remove("is-bumped");
        pipRunState.popTimer = 0;
      }, 480);
    }
  }

  // --------------------------------------------------------------------------
  // A4: Branded confetti burst on every real level clear
  // --------------------------------------------------------------------------
  function clearClearConfetti() {
    if (confettiState.rafId) {
      window.cancelAnimationFrame(confettiState.rafId);
      confettiState.rafId = 0;
    }
    if (confettiState.timerId) {
      window.clearTimeout(confettiState.timerId);
      confettiState.timerId = 0;
    }
    if (confettiState.layer) {
      confettiState.layer.remove();
      confettiState.layer = null;
    }
    document.querySelectorAll("[data-v144-confetti]").forEach(el => el.remove());
  }

  function drawConfettiStar(ctx, size) {
    const spikes = 5;
    const outer = size;
    const inner = size * 0.46;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i += 1) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i * Math.PI) / spikes - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function launchClearConfetti() {
    clearClearConfetti();
    if (!document.body) return;

    const reduced = prefersReducedMotion();
    const width = Math.max(320, window.innerWidth || 390);
    const height = Math.max(320, window.innerHeight || 640);
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const layer = document.createElement("div");
    layer.className = "v144-confetti-layer";
    layer.setAttribute("data-v144-confetti", "true");
    layer.setAttribute("data-v144-confetti-reduced", String(reduced));
    layer.setAttribute("aria-hidden", "true");

    const canvas = document.createElement("canvas");
    canvas.className = "v144-confetti-canvas";
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layer.append(canvas);
    document.body.append(layer);
    confettiState.layer = layer;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      clearClearConfetti();
      return;
    }
    ctx.scale(dpr, dpr);

    const pieceCount = reduced ? 16 : 42;
    const shapes = ["rect", "circle", "star"];
    const originY = height * 0.34;
    const particles = [];

    for (let i = 0; i < pieceCount; i += 1) {
      const spreadT = pieceCount > 1 ? i / (pieceCount - 1) : 0.5;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const shape = shapes[i % shapes.length];
      const angle = -Math.PI * 0.88 + spreadT * Math.PI * 0.76 + ((i % 3) - 1) * 0.08;
      const speed = 220 + ((i * 53) % 210);
      const radius = 58 + ((i * 29) % 110);
      particles.push({
        x: reduced
          ? width * 0.5 + Math.cos(spreadT * Math.PI * 2) * radius * (width < 500 ? 0.85 : 1.3)
          : width * (0.28 + spreadT * 0.44),
        y: reduced
          ? originY + Math.sin(spreadT * Math.PI * 2) * radius * 0.65
          : originY + ((i % 5) - 2) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        size: shape === "star" ? 7.5 + (i % 3) * 1.5 : 6 + (i % 4) * 1.8,
        rot: (i * 0.7) % (Math.PI * 2),
        vrot: ((i % 2 === 0 ? 1 : -1) * (3.2 + (i % 4) * 1.1)),
        color,
        shape
      });
    }

    confettiState.lastBurst = {
      at: Date.now(),
      reduced,
      count: pieceCount,
      colors: CONFETTI_COLORS.slice()
    };

    function drawFrame(alpha) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      for (const p of particles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "star") {
          drawConfettiStar(ctx, p.size);
        } else {
          ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
        }
        if (p.color === "#FFF7DC" || p.color === "#FFFDF9") {
          ctx.strokeStyle = "#1F2438";
          ctx.lineWidth = 1;
          if (p.shape === "circle") {
            ctx.stroke();
          } else if (p.shape === "star") {
            ctx.stroke();
          } else {
            ctx.strokeRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
          }
        }
        ctx.restore();
      }
      ctx.restore();
    }

    if (reduced) {
      // Static gentle branded sparkle frame — zero motion
      drawFrame(0.92);
      confettiState.timerId = window.setTimeout(() => {
        clearClearConfetti();
      }, 650);
      return;
    }

    const durationMs = 1050;
    const gravity = 640;
    let startAt = 0;
    let prevAt = 0;

    function tick(ts) {
      if (!confettiState.layer) return;
      if (!startAt) {
        startAt = ts;
        prevAt = ts;
      }
      const elapsed = ts - startAt;
      const dt = Math.min(0.05, Math.max(0, (ts - prevAt) / 1000));
      prevAt = ts;

      if (elapsed >= durationMs) {
        clearClearConfetti();
        return;
      }

      for (const p of particles) {
        p.vy += gravity * dt;
        p.vx *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      }

      const fade = elapsed > durationMs * 0.68
        ? 1 - (elapsed - durationMs * 0.68) / (durationMs * 0.32)
        : 1;
      drawFrame(fade);
      confettiState.rafId = window.requestAnimationFrame(tick);
    }

    confettiState.rafId = window.requestAnimationFrame(tick);
  }

  function recordHiddenPipFind(puzzleId) {
    const activeRun = typeof state !== "undefined" && state ? state.run : null;
    if (activeRun && (activeRun.customStudio || activeRun.kind === "studio")) {
      return false;
    }
    if (typeof window.syncExternalCounters === "function") {
      window.syncExternalCounters();
    }
    syncPipRunBinding();
    if (pipRunState.run && pipRunState.run.kind !== "duel") {
      pipRunState.count += 1;
    }

    const counters = getCounters();
    if (!counters || typeof puzzleId !== "string") {
      renderPlayPipCounter(true);
      return false;
    }
    const levelOrder = getLevelOrderList();
    if (levelOrder.length > 0 && !levelOrder.includes(puzzleId)) {
      renderPlayPipCounter(true);
      return false;
    }

    if (!Array.isArray(counters.hiddenPipFinds)) {
      counters.hiddenPipFinds = [];
    }
    if (counters.hiddenPipFinds.includes(puzzleId)) {
      renderPlayPipCounter(true);
      return false;
    }

    const wasHatUnlocked = getQuestProgress().unlocked.hat;
    counters.hiddenPipFinds.push(puzzleId);
    counters.hiddenPipFinds = [...new Set(
      counters.hiddenPipFinds.filter(id => levelOrder.length === 0 || levelOrder.includes(id))
    )].slice(0, levelOrder.length || 22);

    if (typeof window.persistCounters === "function") {
      window.persistCounters();
    }

    renderPlayPipCounter(true);

    const isHatUnlockedNow = getQuestProgress().unlocked.hat;
    if (!wasHatUnlocked && isHatUnlockedNow) {
      showQuestEarnToast("hat");
    }
    return true;
  }

  function selectPipOutfit(outfitId) {
    if (typeof window.syncExternalCounters === "function") {
      window.syncExternalCounters();
    }
    const counters = getCounters();
    if (!counters || !OUTFIT_IDS.includes(outfitId)) return false;

    const progress = getQuestProgress();
    if (!progress.unlocked[outfitId]) {
      return false;
    }

    counters.pipOutfit = outfitId;
    if (typeof window.persistCounters === "function") {
      window.persistCounters();
    }
    syncAllPipMascots(true);
    renderOutfitPicker();

    if (typeof window.playSound === "function") {
      window.playSound("pip-chirp");
    }
    return true;
  }

  function progressCountForOutfit(outfitId, progress) {
    if (outfitId === "hat") return Math.min(3, progress.hiddenPipCount);
    if (outfitId === "scarf") return Math.min(2, progress.animalClearsCount);
    if (outfitId === "bow") return Math.min(1, progress.dailyStickersCount);
    return 0;
  }

  function renderOutfitPicker() {
    const view = document.getElementById("stickerBookView");
    const grid = document.getElementById("stickerGrid");
    if (!view || !grid) return;

    if (typeof window.syncExternalCounters === "function") {
      window.syncExternalCounters();
    }

    const progress = getQuestProgress();
    const activeOutfit = getActivePipOutfit();

    let section = view.querySelector("[data-v144-outfit-section]");
    const studio = view.querySelector(".sticker-worlds-studio");
    const insertTarget = studio || grid;
    if (!section) {
      section = document.createElement("section");
      section.className = "v144-outfit-panel";
      section.setAttribute("data-v144-outfit-section", "true");
      section.setAttribute("aria-label", "Pip's outfits");
      view.insertBefore(section, insertTarget);
    } else if (section.nextElementSibling !== insertTarget) {
      view.insertBefore(section, insertTarget);
    }

    const head = document.createElement("div");
    head.className = "v144-outfit-head";

    const heading = document.createElement("h2");
    heading.className = "v144-outfit-heading";
    heading.textContent = "Pip's outfits";

    const maxPips = getLevelOrderList().length || 22;
    const pipTotalPill = document.createElement("span");
    pipTotalPill.className = "v144-pip-total-pill";
    pipTotalPill.setAttribute("data-v144-pip-total-badge", "true");
    pipTotalPill.textContent = `Hidden Pips: ${Math.min(maxPips, progress.hiddenPipCount)} / ${maxPips}`;

    const subtitle = document.createElement("p");
    subtitle.className = "v144-outfit-subtitle";
    subtitle.textContent = "Play puzzles to unlock outfits for Pip.";

    head.append(heading, pipTotalPill, subtitle);

    const picker = document.createElement("div");
    picker.className = "v144-outfit-picker";
    picker.setAttribute("data-v144-outfit-picker", "true");
    picker.setAttribute("role", "group");
    picker.setAttribute("aria-label", "Choose Pip's outfit");

    for (const item of OUTFIT_CATALOG) {
      const isUnlocked = Boolean(progress.unlocked[item.id]);
      const isSelected = isUnlocked && activeOutfit === item.id;
      const currentCount = progressCountForOutfit(item.id, progress);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `v144-outfit-choice${isSelected ? " is-selected" : ""}${isUnlocked ? "" : " is-locked"}`;
      btn.setAttribute("data-v144-outfit-option", item.id);
      btn.setAttribute("data-v144-outfit-unlocked", String(isUnlocked));
      btn.setAttribute("aria-pressed", String(isSelected));

      if (!isUnlocked) {
        btn.disabled = true;
        btn.setAttribute("aria-disabled", "true");
      }

      const ariaDesc = isUnlocked
        ? isSelected
          ? `${item.name} outfit — wearing`
          : `${item.name} outfit — unlocked`
        : item.target > 1
          ? `${item.name} outfit — locked. ${item.goal} (${currentCount} of ${item.target})`
          : `${item.name} outfit — locked. ${item.goal}`;
      btn.setAttribute("aria-label", ariaDesc);

      const preview = document.createElement("span");
      preview.className = "v144-outfit-preview";
      preview.setAttribute("aria-hidden", "true");
      if (typeof window.createPipMascotSvg === "function") {
        preview.append(window.createPipMascotSvg("curious", { outfit: item.id }));
      }

      const name = document.createElement("span");
      name.className = "v144-outfit-name";
      name.textContent = item.name;

      const metaWrap = document.createElement("span");
      metaWrap.className = "v144-outfit-meta";

      if (!isUnlocked) {
        const goalEl = document.createElement("span");
        goalEl.className = "v144-outfit-goal";
        goalEl.textContent = item.goal;
        metaWrap.append(goalEl);

        if (item.target > 1) {
          const prog = document.createElement("span");
          prog.className = "v144-outfit-progress";
          prog.textContent = `${currentCount} / ${item.target}`;
          metaWrap.append(prog);
        }
      } else {
        const status = document.createElement("span");
        status.className = `v144-outfit-status${isSelected ? " is-wearing" : ""}`;
        status.textContent = isSelected
          ? "Wearing"
          : item.id === "none"
            ? "Classic Pip"
            : "Unlocked";
        metaWrap.append(status);
      }

      btn.append(preview, name, metaWrap);

      btn.addEventListener("click", () => {
        if (!isUnlocked) return;
        selectPipOutfit(item.id);
      });

      picker.append(btn);
    }

    section.replaceChildren(head, picker);
  }

  function hookGlobalsV144() {
    if (typeof window.renderStickerBook === "function") {
      const origRenderStickerBook = window.renderStickerBook;
      window.renderStickerBook = function v144RenderStickerBook(...args) {
        const res = origRenderStickerBook.apply(this, args);
        renderOutfitPicker();
        syncAllPipMascots(false);
        return res;
      };
    }

    if (typeof window.clearLevel === "function") {
      const origClearLevel = window.clearLevel;
      window.clearLevel = function v144ClearLevel(...args) {
        const activeRun = typeof state !== "undefined" && state ? state.run : null;
        const willClear = Boolean(activeRun && activeRun.phase === "playing" && !activeRun.levelRevealed);
        const hadScarf = getQuestProgress().unlocked.scarf;
        const res = origClearLevel.apply(this, args);
        if (willClear) {
          launchClearConfetti();
        }
        const hasScarf = getQuestProgress().unlocked.scarf;
        if (!hadScarf && hasScarf) {
          showQuestEarnToast("scarf");
        }
        return res;
      };
    }

    if (typeof window.startLevel === "function") {
      const origStartLevel = window.startLevel;
      window.startLevel = function v144StartLevel(...args) {
        const res = origStartLevel.apply(this, args);
        renderPlayPipCounter(false);
        return res;
      };
    }

    if (typeof window.leaveActiveRun === "function") {
      const origLeaveActiveRun = window.leaveActiveRun;
      window.leaveActiveRun = function v144LeaveActiveRun(...args) {
        pipRunState.run = null;
        pipRunState.count = 0;
        clearClearConfetti();
        return origLeaveActiveRun.apply(this, args);
      };
    }

    if (typeof window.markDailyComplete === "function") {
      const origMarkDailyComplete = window.markDailyComplete;
      window.markDailyComplete = function v144MarkDailyComplete(...args) {
        const hadBow = getQuestProgress().unlocked.bow;
        const res = origMarkDailyComplete.apply(this, args);
        const hasBow = getQuestProgress().unlocked.bow;
        if (!hadBow && hasBow) {
          showQuestEarnToast("bow");
        }
        return res;
      };
    }

    if (typeof window.finishRun === "function") {
      const origFinishRun = window.finishRun;
      window.finishRun = function v144FinishRun(...args) {
        const hadBow = getQuestProgress().unlocked.bow;
        const res = origFinishRun.apply(this, args);
        const hasBow = getQuestProgress().unlocked.bow;
        if (!hadBow && hasBow) {
          showQuestEarnToast("bow");
        }
        return res;
      };
    }

    if (typeof window.showView === "function") {
      const origShowView = window.showView;
      window.showView = function v144ShowView(id, ...rest) {
        const res = origShowView.call(this, id, ...rest);
        if (id === "stickerBookView") {
          renderOutfitPicker();
        }
        syncAllPipMascots(false);
        return res;
      };
    }
  }

  function bindHomeDuelEntry() {
    const btn = document.querySelector("[data-v144-home-duel]");
    if (!btn || btn.dataset.v144Bound === "true") return;
    btn.dataset.v144Bound = "true";
    btn.addEventListener("click", () => {
      if (typeof state !== "undefined" && state && state.view !== "homeView") return;
      if (typeof window.startHomeDuel === "function") {
        window.startHomeDuel();
      } else if (typeof window.startFamilyDuel === "function") {
        window.startFamilyDuel();
      }
      const didSpeak = typeof window.speakFindWhat === "function"
        ? window.speakFindWhat("Play with a grown-up")
        : false;
      btn.setAttribute("data-v146b-spoken", String(didSpeak));
      btn.setAttribute("data-v146b-spoken-phrase", didSpeak ? "Play with a grown-up" : "");
    });
  }

  window.v144GetActivePipOutfit = getActivePipOutfit;
  window.v144RecordHiddenPipFind = recordHiddenPipFind;
  window.v144Outfits = {
    getProgress: getQuestProgress,
    getActiveOutfit: getActivePipOutfit,
    selectOutfit: selectPipOutfit,
    renderPicker: renderOutfitPicker,
    syncPips: syncAllPipMascots
  };
  window.v144PipCounter = {
    getRunCount: () => {
      syncPipRunBinding();
      return pipRunState.count;
    },
    getTotalCount: () => getQuestProgress().hiddenPipCount,
    render: renderPlayPipCounter
  };
  window.v144Confetti = {
    launch: launchClearConfetti,
    clear: clearClearConfetti,
    getLastBurst: () => confettiState.lastBurst
  };

  hookGlobalsV144();

  document.addEventListener("DOMContentLoaded", () => {
    bindHomeDuelEntry();
    renderPlayPipCounter(false);
    syncAllPipMascots(true);
    if (typeof state !== "undefined" && state && state.view === "stickerBookView") {
      renderOutfitPicker();
    }
  });
})();
