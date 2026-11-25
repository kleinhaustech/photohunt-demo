"use strict";

/*
  kid-v14.6.js — Spot the Difference v14.6 (loaded last, after kid-v14.4.js).
  - Item 1: Make-a-puzzle studio from the 22 official built-in scenes.
            No photo pick, camera, or device files.
            Composes Picture B on a <canvas> copy of the chosen official scene
            by placing, moving, or recoloring kid-safe stickers/objects from
            existing game assets (ctx.drawImage + canvas.toDataURL('image/jpeg')
            data: URLs).
            Requires exactly 5 changes to save (rejects 4 or 6 or any count !== 5).
            Saves to IndexedDB ('sd_studio_v146', store 'puzzles') on this device
            with zero PII and zero new localStorage keys.
            Supports solo play and 2-turn VS / Family Duel on saved custom puzzles
            without unlocking official progress or writing official counters/boards.
  - Item 2: Kid-usable create, edit, save, and play (no requireGrown gate).
  DOM built exclusively with createElement / createElementNS / textContent / replaceChildren.
*/
(function initSpotTheDifferenceV146() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const IDB_NAME = "sd_studio_v146";
  const IDB_VERSION = 1;
  const IDB_STORE = "puzzles";
  const STUDIO_WIDTH = 800;
  const STUDIO_HEIGHT = 600;
  const DIFF_RADIUS_NORM = 0.055;
  const MAX_WORKING_CHANGES = 8;

  const FALLBACK_SCENES = Object.freeze([
    { id: "eng-classroom", title: "Classroom" },
    { id: "eng-bakery", title: "Bakery" },
    { id: "eng-campsite", title: "Campsite" },
    { id: "eng-farm", title: "Farm" },
    { id: "eng-garden", title: "Garden" },
    { id: "eng-trainstation", title: "Train Station" },
    { id: "eng-snowtown", title: "Snowy Town" },
    { id: "eng-zoo", title: "Zoo" },
    { id: "eng-kitchen", title: "Kitchen" },
    { id: "eng-playground", title: "Playground" },
    { id: "eng-underwater", title: "Underwater" },
    { id: "eng-space", title: "Space" },
    { id: "eng-library", title: "Library" },
    { id: "eng-birthday", title: "Birthday" },
    { id: "eng-rainystreet", title: "Rainy Street" },
    { id: "eng-toys", title: "Toy Shop" },
    { id: "eng-market", title: "Market" },
    { id: "eng-park", title: "Park" },
    { id: "eng-beach", title: "Beach" },
    { id: "eng-firestation", title: "Fire Station" },
    { id: "eng-bedroom", title: "Bedroom" },
    { id: "eng-petshop", title: "Pet Shop" }
  ]);

  const STICKER_CATALOG = Object.freeze([
    Object.freeze({ id: "star", label: "Star" }),
    Object.freeze({ id: "pip", label: "Pip Owl" }),
    Object.freeze({ id: "sun", label: "Sun" }),
    Object.freeze({ id: "spyglass", label: "Spyglass" }),
    Object.freeze({ id: "hat", label: "Hat" }),
    Object.freeze({ id: "bow", label: "Bow" })
  ]);

  const COLOR_CATALOG = Object.freeze([
    Object.freeze({ id: "gold", label: "Gold", hex: "#F5A623", rim: "#B87009", tint: "#FFF7DC" }),
    Object.freeze({ id: "teal", label: "Teal", hex: "#1B7A6E", rim: "#115249", tint: "#E7F6F3" }),
    Object.freeze({ id: "coral", label: "Coral", hex: "#C73C24", rim: "#8F2715", tint: "#FDE8E6" }),
    Object.freeze({ id: "green", label: "Green", hex: "#1E9E5A", rim: "#126B3B", tint: "#E7F8EE" }),
    Object.freeze({ id: "berry", label: "Berry", hex: "#8E5B9C", rim: "#5D3768", tint: "#F5EBF7" })
  ]);

  // Well-spaced preset spots in normalized [0..1] coordinates for quick placement
  // or when repeated center clicks occur at the same spot.
  const PRESET_SPOTS = Object.freeze([
    Object.freeze({ x: 0.24, y: 0.28 }),
    Object.freeze({ x: 0.76, y: 0.28 }),
    Object.freeze({ x: 0.50, y: 0.52 }),
    Object.freeze({ x: 0.24, y: 0.74 }),
    Object.freeze({ x: 0.76, y: 0.74 }),
    Object.freeze({ x: 0.50, y: 0.24 }),
    Object.freeze({ x: 0.50, y: 0.78 }),
    Object.freeze({ x: 0.36, y: 0.48 })
  ]);

  const studioState = {
    viewEl: null,
    canvasEl: null,
    previewAEl: null,
    counterPillEl: null,
    statusEl: null,
    changesListEl: null,
    savedListEl: null,
    sceneGridEl: null,
    morePicturesHintEl: null,
    toggleScenesBtnEl: null,
    stickerListEl: null,
    colorListEl: null,
    sceneId: "eng-classroom",
    scenePicked: false,
    activeStickerId: "star",
    activeColorId: "gold",
    changes: [],
    selectedIndex: -1,
    editingPuzzleId: null,
    dirtySinceSave: false,
    lastSavedPuzzle: null,
    lastPlayedCustomPuzzle: null,
    savedPuzzles: [],
    sceneImages: new Map(),
    stampCache: new Map(),
    officialIconImg: null,
    dragIndex: -1,
    dragPointerId: null,
    dragStartX: 0,
    dragStartY: 0,
    dragMoved: false,
    suppressNextCanvasClick: false,
    confirmDialogEl: null,
    confirmTitleEl: null,
    confirmBodyEl: null,
    confirmAcceptBtn: null,
    pendingConfirmAction: null
  };

  function clampNum(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function domNode(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  function getOfficialScenes() {
    const list = [];
    const order = typeof LEVEL_ORDER !== "undefined" && Array.isArray(LEVEL_ORDER)
      ? LEVEL_ORDER
      : FALLBACK_SCENES.map(s => s.id);
    const catalog = typeof state !== "undefined" && state && Array.isArray(state.puzzles)
      ? state.puzzles
      : [];
    for (const id of order) {
      const match = catalog.find(p => p && p.id === id && !p.mirrored);
      const fallback = FALLBACK_SCENES.find(s => s.id === id);
      list.push({
        id,
        title: (match && match.title) || (fallback && fallback.title) || id,
        imageA: (match && match.imageA) || `img/${id}-a.jpg`,
        width: (match && match.width) || STUDIO_WIDTH,
        height: (match && match.height) || STUDIO_HEIGHT
      });
    }
    return list;
  }

  function getSceneMeta(sceneId) {
    const scenes = getOfficialScenes();
    return scenes.find(s => s.id === sceneId) || scenes[0];
  }

  function getStickerMeta(stickerId) {
    return STICKER_CATALOG.find(s => s.id === stickerId) || STICKER_CATALOG[0];
  }

  function getColorMeta(colorId) {
    return COLOR_CATALOG.find(c => c.id === colorId) || COLOR_CATALOG[0];
  }

  // --------------------------------------------------------------------------
  // 1. IndexedDB Storage (Studio Custom Puzzles Only, Zero PII)
  // --------------------------------------------------------------------------
  function openStudioDB() {
    return new Promise((resolve, reject) => {
      if (typeof window.indexedDB === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      try {
        const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB open error"));
      } catch (err) {
        reject(err);
      }
    });
  }

  function isValidStudioRecord(record) {
    if (!record || typeof record !== "object") return false;
    if (typeof record.id !== "string" || !record.id) return false;
    if (typeof record.sceneId !== "string" || !record.sceneId) return false;
    const validIds = getOfficialScenes().map(s => s.id);
    if (!validIds.includes(record.sceneId)) return false;
    if (typeof record.imageA !== "string" || !record.imageA.startsWith("img/")) return false;
    if (typeof record.imageB !== "string" || !record.imageB.startsWith("data:image/")) return false;
    if (!Array.isArray(record.differences) || record.differences.length !== 5) return false;
    if (!Array.isArray(record.changes) || record.changes.length !== 5) return false;
    for (const d of record.differences) {
      if (
        !d ||
        typeof d !== "object" ||
        !Number.isFinite(d.x) ||
        !Number.isFinite(d.y) ||
        !Number.isFinite(d.r) ||
        d.x < 0 ||
        d.x > 1 ||
        d.y < 0 ||
        d.y > 1 ||
        d.r <= 0
      ) {
        return false;
      }
    }
    return true;
  }

  async function idbGetAllPuzzles() {
    try {
      const db = await openStudioDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          const valid = rows
            .filter(isValidStudioRecord)
            .map(r => ({ ...r, customStudio: true }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          resolve(valid);
        };
        req.onerror = () => reject(req.error || new Error("IndexedDB getAll failed"));
        tx.oncomplete = () => db.close();
      });
    } catch (_err) {
      return studioState.savedPuzzles.slice();
    }
  }

  async function idbPutPuzzle(record) {
    if (!isValidStudioRecord(record)) {
      throw new Error("Invalid custom puzzle: exactly 5 changes are required.");
    }
    const cleanRecord = {
      id: String(record.id),
      sceneId: String(record.sceneId),
      title: String(record.title || "Studio Puzzle"),
      imageA: String(record.imageA),
      imageB: String(record.imageB),
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      differences: record.differences.map(d => ({
        x: Number(clampNum(d.x, 0.04, 0.96).toFixed(4)),
        y: Number(clampNum(d.y, 0.05, 0.95).toFixed(4)),
        r: Number(clampNum(d.r || DIFF_RADIUS_NORM, 0.03, 0.10).toFixed(4)),
        what: String(d.what || "Sticker change")
      })),
      changes: record.changes.map(c => ({
        stickerId: getStickerMeta(c.stickerId).id,
        colorId: getColorMeta(c.colorId).id,
        x: Number(clampNum(c.x, 0.06, 0.94).toFixed(4)),
        y: Number(clampNum(c.y, 0.08, 0.92).toFixed(4))
      })),
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now()
    };

    const db = await openStudioDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(cleanRecord);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error || new Error("IndexedDB put failed"));
      tx.oncomplete = () => db.close();
    });

    return { ...cleanRecord, customStudio: true };
  }

  async function idbDeletePuzzle(id) {
    try {
      const db = await openStudioDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const store = tx.objectStore(IDB_STORE);
        const req = store.delete(String(id));
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new Error("IndexedDB delete failed"));
        tx.oncomplete = () => db.close();
      });
      return true;
    } catch (_err) {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // 2. Same-Origin Image & Sticker Stamp Canvas Rendering (ctx.drawImage + data:)
  // --------------------------------------------------------------------------
  function preloadOfficialIconAsset() {
    if (studioState.officialIconImg) return;
    const img = new Image();
    img.decoding = "async";
    img.src = "icons/icon.svg";
    studioState.officialIconImg = img;
  }

  function ensureSceneImageLoaded(sceneId) {
    const meta = getSceneMeta(sceneId);
    const existing = studioState.sceneImages.get(meta.id);
    if (existing && existing.complete && existing.naturalWidth > 0) {
      return Promise.resolve(existing);
    }
    return new Promise(resolve => {
      const img = existing || new Image();
      img.decoding = "async";
      studioState.sceneImages.set(meta.id, img);
      if (img.complete && img.naturalWidth > 0) {
        resolve(img);
        return;
      }
      const finish = () => {
        if (studioState.sceneId === meta.id) {
          renderStudioCanvas();
        }
        resolve(img);
      };
      img.addEventListener("load", finish, { once: true });
      img.addEventListener("error", finish, { once: true });
      if (!img.getAttribute("src")) {
        img.src = meta.imageA;
      }
    });
  }

  function drawStarShape(ctx, cx, cy, outerR, innerR) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function getStickerStampCanvas(stickerId, colorId) {
    const sMeta = getStickerMeta(stickerId);
    const cMeta = getColorMeta(colorId);
    const key = `${sMeta.id}:${cMeta.id}`;
    if (studioState.stampCache.has(key)) {
      return studioState.stampCache.get(key);
    }

    const size = 96;
    const cx = size / 2;
    const cy = size / 2;
    const stamp = document.createElement("canvas");
    stamp.width = size;
    stamp.height = size;
    const ctx = stamp.getContext("2d");
    if (!ctx) return stamp;

    // Outer tactile sticker medallion
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 42, 0, Math.PI * 2);
    ctx.fillStyle = cMeta.rim;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fillStyle = cMeta.hex;
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = "#1F2438";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 31, 0, Math.PI * 2);
    ctx.fillStyle = cMeta.tint;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1F2438";
    ctx.stroke();

    // Draw existing official icon art via drawImage as subtle texture base when ready
    if (
      studioState.officialIconImg &&
      studioState.officialIconImg.complete &&
      studioState.officialIconImg.naturalWidth > 0
    ) {
      try {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.drawImage(studioState.officialIconImg, cx - 22, cy - 22, 44, 44);
        ctx.restore();
      } catch (_err) {
        /* ignore */
      }
    }

    // Draw distinct kid-safe sticker motif from existing game assets
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (sMeta.id === "star") {
      drawStarShape(ctx, cx, cy, 22, 10);
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 5, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFDF9";
      ctx.fill();
    } else if (sMeta.id === "pip") {
      // Pip the Detective Owl face
      ctx.beginPath();
      ctx.arc(cx, cy + 3, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#B88256";
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();

      // Cap in chosen recolor
      ctx.beginPath();
      ctx.arc(cx, cy - 7, 16, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
      ctx.stroke();

      // Eyes
      for (const ex of [cx - 8, cx + 8]) {
        ctx.beginPath();
        ctx.arc(ex, cy + 1, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFDF9";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex, cy + 1, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#1F2438";
        ctx.fill();
      }
      // Beak
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy + 6);
      ctx.lineTo(cx + 4, cy + 6);
      ctx.lineTo(cx, cy + 12);
      ctx.closePath();
      ctx.fillStyle = "#F5A623";
      ctx.fill();
      ctx.stroke();
    } else if (sMeta.id === "sun") {
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        const x1 = cx + Math.cos(a) * 15;
        const y1 = cy + Math.sin(a) * 15;
        const x2 = cx + Math.cos(a) * 24;
        const y2 = cy + Math.sin(a) * 24;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = cMeta.hex;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();
    } else if (sMeta.id === "spyglass") {
      ctx.beginPath();
      ctx.moveTo(cx + 6, cy + 6);
      ctx.lineTo(cx + 20, cy + 20);
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = cMeta.hex;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - 4, cy - 4, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFDF9";
      ctx.fill();
      ctx.lineWidth = 3.8;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - 4, cy - 4, 8, 0, Math.PI * 2);
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
    } else if (sMeta.id === "hat") {
      // Pip's Explorer Hat in chosen color
      ctx.beginPath();
      ctx.arc(cx, cy + 4, 18, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();

      ctx.beginPath();
      ctx.roundRect
        ? ctx.roundRect(cx - 22, cy + 2, 44, 8, 4)
        : ctx.rect(cx - 22, cy + 2, 44, 8);
      ctx.fillStyle = "#FFF7DC";
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy - 15, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#F5A623";
      ctx.fill();
      ctx.stroke();
    } else if (sMeta.id === "bow") {
      // Pip's Ribbon Bow in chosen color
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 19, cy - 13);
      ctx.lineTo(cx - 19, cy + 13);
      ctx.closePath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 19, cy - 13);
      ctx.lineTo(cx + 19, cy + 13);
      ctx.closePath();
      ctx.fillStyle = cMeta.hex;
      ctx.fill();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#1F2438";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#F5A623";
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
    studioState.stampCache.set(key, stamp);
    return stamp;
  }

  function findSceneDrawableImage(sceneId) {
    const meta = getSceneMeta(sceneId);
    const cached = studioState.sceneImages.get(meta.id);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return cached;
    }
    if (studioState.previewAEl && studioState.previewAEl.complete && studioState.previewAEl.naturalWidth > 0) {
      return studioState.previewAEl;
    }
    const thumb = document.querySelector(`[data-v146-scene="${meta.id}"] img`);
    if (thumb && thumb.complete && thumb.naturalWidth > 0) {
      return thumb;
    }
    return null;
  }

  function renderStudioCanvas() {
    const canvas = studioState.canvasEl;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = STUDIO_WIDTH;
    canvas.height = STUDIO_HEIGHT;

    ctx.fillStyle = "#FBF6EC";
    ctx.fillRect(0, 0, STUDIO_WIDTH, STUDIO_HEIGHT);

    const sceneImg = findSceneDrawableImage(studioState.sceneId);
    if (sceneImg) {
      try {
        ctx.drawImage(sceneImg, 0, 0, STUDIO_WIDTH, STUDIO_HEIGHT);
      } catch (_err) {
        /* fallback ground already filled */
      }
    }

    const stampRadiusPx = Math.round(DIFF_RADIUS_NORM * STUDIO_WIDTH);
    const stampDiameterPx = stampRadiusPx * 2;

    for (let i = 0; i < studioState.changes.length; i += 1) {
      const change = studioState.changes[i];
      const stamp = getStickerStampCanvas(change.stickerId, change.colorId);
      const px = Math.round(change.x * STUDIO_WIDTH);
      const py = Math.round(change.y * STUDIO_HEIGHT);
      ctx.drawImage(
        stamp,
        px - stampRadiusPx,
        py - stampRadiusPx,
        stampDiameterPx,
        stampDiameterPx
      );
    }
  }

  function exportStudioPictureBDataUrl() {
    renderStudioCanvas();
    if (!studioState.canvasEl) return "";
    try {
      const jpegUrl = studioState.canvasEl.toDataURL("image/jpeg", 0.92);
      if (typeof jpegUrl === "string" && jpegUrl.startsWith("data:image/")) {
        return jpegUrl;
      }
      return studioState.canvasEl.toDataURL("image/png");
    } catch (_err) {
      return "";
    }
  }

  // --------------------------------------------------------------------------
  // 3. Studio Editor State & Change Operations (Place, Move, Recolor, Remove)
  // --------------------------------------------------------------------------
  function createStickerIconSvg(stickerId, colorHex = "#F5A623") {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: `svg-icon icon-studio-${stickerId}`,
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    if (stickerId === "star") {
      svg.append(
        svgEl("path", {
          d: "M12 2.6l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8 6.4 19.7l1.1-6.2L3 9.1l6.2-.9L12 2.6z",
          fill: colorHex
        })
      );
    } else if (stickerId === "pip") {
      svg.append(
        svgEl("circle", { cx: "12", cy: "13", r: "8", fill: "#B88256" }),
        svgEl("path", { d: "M5 10c1.5-4.5 5-6.5 7-6.5s5.5 2 7 6.5H5z", fill: colorHex }),
        svgEl("circle", { cx: "9", cy: "13", r: "2.5", fill: "#FFFDF9" }),
        svgEl("circle", { cx: "15", cy: "13", r: "2.5", fill: "#FFFDF9" }),
        svgEl("path", { d: "M10.8 16h2.4L12 18.2z", fill: "#F5A623" })
      );
    } else if (stickerId === "sun") {
      svg.append(
        svgEl("circle", { cx: "12", cy: "12", r: "5.5", fill: colorHex }),
        svgEl("path", { d: "M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" })
      );
    } else if (stickerId === "spyglass") {
      svg.append(
        svgEl("circle", { cx: "10.5", cy: "10.5", r: "6", fill: colorHex }),
        svgEl("path", { d: "M15 15l5.5 5.5", "stroke-width": "3" })
      );
    } else if (stickerId === "hat") {
      svg.append(
        svgEl("path", { d: "M5 15c1-6 4-9 7-9s6 3 7 9H5z", fill: colorHex }),
        svgEl("rect", { x: "3", y: "14", width: "18", height: "4", rx: "2", fill: "#FFF7DC" }),
        svgEl("circle", { cx: "12", cy: "4.5", r: "2", fill: "#F5A623" })
      );
    } else {
      svg.append(
        svgEl("path", { d: "M12 12L4.5 6.5v11L12 12zm0 0l7.5-5.5v11L12 12z", fill: colorHex }),
        svgEl("circle", { cx: "12", cy: "12", r: "2.6", fill: "#F5A623" })
      );
    }
    return svg;
  }

  function setStudioStatus(text, kind = "info") {
    if (!studioState.statusEl) return;
    studioState.statusEl.textContent = text;
    studioState.statusEl.setAttribute("data-v146-status-kind", kind);
  }

  function chooseNextAvailableSpot(requestedX, requestedY) {
    const hasCoords = Number.isFinite(requestedX) && Number.isFinite(requestedY);
    if (hasCoords) {
      const cx = clampNum(requestedX, 0.08, 0.92);
      const cy = clampNum(requestedY, 0.10, 0.90);
      const tooClose = studioState.changes.some(
        item => Math.hypot(item.x - cx, item.y - cy) < 0.045
      );
      if (!tooClose) {
        return {
          x: Number(cx.toFixed(4)),
          y: Number(cy.toFixed(4))
        };
      }
    }
    for (const spot of PRESET_SPOTS) {
      const occupied = studioState.changes.some(
        item => Math.hypot(item.x - spot.x, item.y - spot.y) < 0.06
      );
      if (!occupied) {
        return { x: spot.x, y: spot.y };
      }
    }
    const idx = studioState.changes.length;
    const angle = (idx * Math.PI * 2) / 7;
    return {
      x: Number(clampNum(0.5 + Math.cos(angle) * 0.28, 0.10, 0.90).toFixed(4)),
      y: Number(clampNum(0.5 + Math.sin(angle) * 0.26, 0.12, 0.88).toFixed(4))
    };
  }

  function describeChangeWhat(change) {
    const cMeta = getColorMeta(change.colorId);
    const sMeta = getStickerMeta(change.stickerId);
    return `${cMeta.label} ${sMeta.label} sticker`;
  }

  function updateSceneScrollHint() {
    const grid = studioState.sceneGridEl;
    const hint = studioState.morePicturesHintEl;
    if (!grid || !hint) return;
    const scrollable = grid.scrollHeight > grid.clientHeight + 4;
    hint.hidden = !scrollable;
    if (!scrollable) return;
    const atBottom = grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 8;
    hint.textContent = atBottom
      ? "All 22 pictures shown ↑ Scroll up for top"
      : "More pictures ↓ Scroll for all 22 scenes";
  }

  function syncStudioUI() {
    if (!studioState.viewEl) return;
    const count = studioState.changes.length;
    const isPicked = Boolean(studioState.scenePicked);
    studioState.viewEl.setAttribute("data-v146-changes-count", String(count));
    studioState.viewEl.setAttribute("data-v146-active-scene", studioState.sceneId);
    studioState.viewEl.setAttribute("data-v146-scene-picked", String(isPicked));
    studioState.viewEl.classList.toggle("is-scene-picked", isPicked);

    if (studioState.toggleScenesBtnEl) {
      studioState.toggleScenesBtnEl.hidden = !isPicked;
      studioState.toggleScenesBtnEl.textContent = "Show all scenes";
    }

    if (studioState.counterPillEl) {
      studioState.counterPillEl.setAttribute("data-v146-change-count", String(count));
      studioState.counterPillEl.classList.toggle("is-ready", count === 5);
      studioState.counterPillEl.classList.toggle("is-over", count > 5);
      studioState.counterPillEl.textContent = count === 5
        ? "5 / 5 changes · Ready!"
        : `${count} / 5 changes`;
    }

    if (studioState.sceneGridEl) {
      let selectedSceneBtn = null;
      studioState.sceneGridEl.querySelectorAll("[data-v146-scene]").forEach(btn => {
        const isCurrent = btn.getAttribute("data-v146-scene") === studioState.sceneId;
        btn.classList.toggle("is-selected", isCurrent);
        btn.setAttribute("aria-pressed", String(isCurrent));
        if (isCurrent) selectedSceneBtn = btn;
      });
      if (isPicked && selectedSceneBtn) {
        const grid = studioState.sceneGridEl;
        grid.scrollTop = 0;
        const gr = grid.getBoundingClientRect();
        const br = selectedSceneBtn.getBoundingClientRect();
        if (gr.width > 0 && (br.left < gr.left || br.right > gr.right)) {
          grid.scrollLeft += (br.left - gr.left) - 8;
        }
      }
      updateSceneScrollHint();
    }

    if (studioState.stickerListEl) {
      studioState.stickerListEl.querySelectorAll("[data-v146-sticker]").forEach(btn => {
        const isCurrent = btn.getAttribute("data-v146-sticker") === studioState.activeStickerId;
        btn.classList.toggle("is-selected", isCurrent);
        btn.setAttribute("aria-pressed", String(isCurrent));
      });
    }

    if (studioState.colorListEl) {
      studioState.colorListEl.querySelectorAll("[data-v146-color]").forEach(btn => {
        const isCurrent = btn.getAttribute("data-v146-color") === studioState.activeColorId;
        btn.classList.toggle("is-selected", isCurrent);
        btn.setAttribute("aria-pressed", String(isCurrent));
      });
    }

    const sceneMeta = getSceneMeta(studioState.sceneId);
    if (studioState.previewAEl) {
      if (studioState.previewAEl.getAttribute("src") !== sceneMeta.imageA) {
        studioState.previewAEl.src = sceneMeta.imageA;
      }
      studioState.previewAEl.alt = `Picture A original: ${sceneMeta.title}`;
    }

    if (studioState.changesListEl) {
      studioState.changesListEl.replaceChildren();
      if (studioState.changes.length === 0) {
        const emptyMsg = domNode(
          "p",
          "v146-empty-changes",
          "No changes placed yet. Tap Picture B or tap Add change to place 5 stickers."
        );
        studioState.changesListEl.append(emptyMsg);
      } else {
        studioState.changes.forEach((change, idx) => {
          const isSelected = idx === studioState.selectedIndex;
          const chip = domNode(
            "button",
            `v146-change-chip${isSelected ? " is-selected" : ""}`
          );
          chip.type = "button";
          chip.setAttribute("data-v146-change-chip", String(idx));
          chip.setAttribute("aria-pressed", String(isSelected));
          const cMeta = getColorMeta(change.colorId);
          const sMeta = getStickerMeta(change.stickerId);
          chip.append(
            createStickerIconSvg(sMeta.id, cMeta.hex),
            domNode("span", "", `#${idx + 1} ${cMeta.label} ${sMeta.label}`)
          );
          chip.addEventListener("click", () => {
            studioState.selectedIndex = idx;
            studioState.activeStickerId = change.stickerId;
            studioState.activeColorId = change.colorId;
            syncStudioUI();
          });
          studioState.changesListEl.append(chip);
        });
      }
    }

    const saveBtn = studioState.viewEl.querySelector("[data-v146-save]");
    const savePlayBtn = studioState.viewEl.querySelector("[data-v146-save-and-play]");
    const playBtn = studioState.viewEl.querySelector("[data-v146-play]");
    const playVsBtn = studioState.viewEl.querySelector("[data-v146-play-vs]");
    const isReadyToSave = count === 5;
    const isSavedReady = Boolean(
      studioState.lastSavedPuzzle &&
      !studioState.dirtySinceSave &&
      count === 5
    );
    if (saveBtn) {
      saveBtn.setAttribute("data-v146-can-save", String(isReadyToSave));
    }
    if (savePlayBtn) {
      savePlayBtn.setAttribute("data-v146-can-save", String(isReadyToSave));
      savePlayBtn.disabled = !isReadyToSave;
      savePlayBtn.setAttribute("aria-disabled", String(!isReadyToSave));
    }
    if (playBtn) {
      playBtn.disabled = !isSavedReady;
      playBtn.setAttribute("aria-disabled", String(!isSavedReady));
      playBtn.setAttribute("data-v146-can-play", String(isSavedReady));
    }
    if (playVsBtn) {
      playVsBtn.disabled = !isSavedReady;
      playVsBtn.setAttribute("aria-disabled", String(!isSavedReady));
      playVsBtn.setAttribute("data-v146-can-play", String(isSavedReady));
    }

    renderStudioCanvas();
  }

  function pickStudioScene(sceneId) {
    const meta = getSceneMeta(sceneId);
    studioState.sceneId = meta.id;
    studioState.scenePicked = true;
    studioState.dirtySinceSave = true;
    void ensureSceneImageLoaded(meta.id).then(() => {
      renderStudioCanvas();
    });
    syncStudioUI();
    setStudioStatus(`Scene: ${meta.title}. Place 5 changes on Picture B (${studioState.changes.length} / 5).`, "info");
    return meta.id;
  }

  function addStudioChange(options = {}) {
    if (studioState.changes.length >= MAX_WORKING_CHANGES) {
      setStudioStatus(`You have ${studioState.changes.length} changes. Remove extras so you have exactly 5 / 5.`, "error");
      return null;
    }
    const stickerId = options.stickerId
      ? getStickerMeta(options.stickerId).id
      : studioState.activeStickerId;
    const colorId = options.colorId
      ? getColorMeta(options.colorId).id
      : studioState.activeColorId;
    const spot = chooseNextAvailableSpot(options.x, options.y);

    const entry = {
      stickerId,
      colorId,
      x: spot.x,
      y: spot.y
    };
    studioState.changes.push(entry);
    studioState.selectedIndex = studioState.changes.length - 1;
    studioState.dirtySinceSave = true;

    // Auto-advance default sticker/color slightly so consecutive quick-adds look varied
    if (!options.keepTool) {
      const nextStickerIdx = (STICKER_CATALOG.findIndex(s => s.id === stickerId) + 1) % STICKER_CATALOG.length;
      const nextColorIdx = (COLOR_CATALOG.findIndex(c => c.id === colorId) + 1) % COLOR_CATALOG.length;
      studioState.activeStickerId = STICKER_CATALOG[nextStickerIdx].id;
      studioState.activeColorId = COLOR_CATALOG[nextColorIdx].id;
    }

    if (studioState.viewEl) {
      studioState.viewEl.removeAttribute("data-v146-save-result");
    }
    syncStudioUI();

    const count = studioState.changes.length;
    if (count === 5) {
      setStudioStatus("5 / 5 changes placed! Ready to save and play.", "success");
    } else if (count > 5) {
      setStudioStatus(`${count} / 5 changes placed. Remove ${count - 5} so you have exactly 5.`, "error");
    } else {
      setStudioStatus(`Placed ${describeChangeWhat(entry)} (${count} / 5).`, "info");
    }
    return entry;
  }

  function moveStudioChange(index, x, y) {
    const targetIdx = Number.isInteger(index) && index >= 0 && index < studioState.changes.length
      ? index
      : studioState.selectedIndex >= 0 && studioState.selectedIndex < studioState.changes.length
        ? studioState.selectedIndex
        : studioState.changes.length - 1;
    if (targetIdx < 0 || !studioState.changes[targetIdx]) return false;

    const item = studioState.changes[targetIdx];
    if (Number.isFinite(x) && Number.isFinite(y)) {
      item.x = Number(clampNum(x, 0.08, 0.92).toFixed(4));
      item.y = Number(clampNum(y, 0.10, 0.90).toFixed(4));
    } else {
      // Cycle/nudge position safely inside canvas bounds
      const nextX = item.x + 0.08 > 0.88 ? 0.18 : item.x + 0.08;
      const nextY = item.y + 0.06 > 0.86 ? 0.22 : item.y + 0.06;
      item.x = Number(clampNum(nextX, 0.08, 0.92).toFixed(4));
      item.y = Number(clampNum(nextY, 0.10, 0.90).toFixed(4));
    }
    studioState.selectedIndex = targetIdx;
    studioState.dirtySinceSave = true;
    syncStudioUI();
    setStudioStatus(`Moved change #${targetIdx + 1} (${studioState.changes.length} / 5).`, "info");
    return true;
  }

  function recolorStudioChange(index, colorId) {
    const targetIdx = Number.isInteger(index) && index >= 0 && index < studioState.changes.length
      ? index
      : studioState.selectedIndex >= 0 && studioState.selectedIndex < studioState.changes.length
        ? studioState.selectedIndex
        : studioState.changes.length - 1;
    if (targetIdx < 0 || !studioState.changes[targetIdx]) return false;

    const item = studioState.changes[targetIdx];
    if (colorId && COLOR_CATALOG.some(c => c.id === colorId)) {
      item.colorId = colorId;
    } else {
      const curIdx = COLOR_CATALOG.findIndex(c => c.id === item.colorId);
      const nextColor = COLOR_CATALOG[(curIdx + 1) % COLOR_CATALOG.length];
      item.colorId = nextColor.id;
    }
    studioState.activeColorId = item.colorId;
    studioState.selectedIndex = targetIdx;
    studioState.dirtySinceSave = true;
    syncStudioUI();
    setStudioStatus(`Recolored change #${targetIdx + 1} to ${getColorMeta(item.colorId).label} (${studioState.changes.length} / 5).`, "info");
    return true;
  }

  function removeStudioChange(index) {
    if (studioState.changes.length === 0) return false;
    const targetIdx = Number.isInteger(index) && index >= 0 && index < studioState.changes.length
      ? index
      : studioState.selectedIndex >= 0 && studioState.selectedIndex < studioState.changes.length
        ? studioState.selectedIndex
        : studioState.changes.length - 1;
    if (targetIdx < 0) return false;

    studioState.changes.splice(targetIdx, 1);
    studioState.selectedIndex = Math.min(targetIdx, studioState.changes.length - 1);
    studioState.dirtySinceSave = true;
    syncStudioUI();

    const count = studioState.changes.length;
    if (count === 5) {
      setStudioStatus("Now at 5 / 5 changes! Ready to save and play.", "success");
    } else {
      setStudioStatus(`Removed change (${count} / 5).`, "info");
    }
    return true;
  }

  function clearStudioChanges() {
    studioState.changes = [];
    studioState.selectedIndex = -1;
    studioState.editingPuzzleId = null;
    studioState.dirtySinceSave = false;
    if (studioState.viewEl) {
      studioState.viewEl.removeAttribute("data-v146-save-result");
      studioState.viewEl.removeAttribute("data-v146-rejected-count");
    }
    syncStudioUI();
    setStudioStatus("Cleared changes (0 / 5). Tap Picture B to place 5 changes.", "info");
  }

  // --------------------------------------------------------------------------
  // 4. Save Validation (Strictly 5 Changes; Reject 4 or 6) & Play Wiring
  // --------------------------------------------------------------------------
  async function saveCurrentStudioPuzzle() {
    const count = studioState.changes.length;
    if (count !== 5) {
      const msg = count < 5
        ? `Need exactly 5 changes to save (currently ${count} / 5). Add ${5 - count} more.`
        : `Need exactly 5 changes to save (currently ${count} / 5). Remove ${count - 5}.`;
      setStudioStatus(msg, "error");
      if (studioState.viewEl) {
        studioState.viewEl.setAttribute("data-v146-save-result", "rejected");
        studioState.viewEl.setAttribute("data-v146-rejected-count", String(count));
      }
      return {
        ok: false,
        rejected: true,
        count,
        error: msg
      };
    }

    await ensureSceneImageLoaded(studioState.sceneId);
    const imageBDataUrl = exportStudioPictureBDataUrl();
    if (!imageBDataUrl || !imageBDataUrl.startsWith("data:image/")) {
      const msg = "Could not compose Picture B canvas.";
      setStudioStatus(msg, "error");
      return { ok: false, rejected: true, count, error: msg };
    }

    const sceneMeta = getSceneMeta(studioState.sceneId);
    const differences = studioState.changes.map(c => ({
      x: Number(clampNum(c.x, 0.04, 0.96).toFixed(4)),
      y: Number(clampNum(c.y, 0.05, 0.95).toFixed(4)),
      r: DIFF_RADIUS_NORM,
      what: describeChangeWhat(c)
    }));

    const existingIdx = studioState.editingPuzzleId
      ? studioState.savedPuzzles.findIndex(p => p.id === studioState.editingPuzzleId)
      : -1;
    const serialNumber = existingIdx >= 0
      ? studioState.savedPuzzles.length - existingIdx
      : studioState.savedPuzzles.length + 1;
    const id = studioState.editingPuzzleId || `studio-${sceneMeta.id}-${Date.now()}`;
    const title = `${sceneMeta.title} · Studio ${serialNumber}`;

    const record = {
      id,
      sceneId: sceneMeta.id,
      title,
      imageA: sceneMeta.imageA,
      imageB: imageBDataUrl,
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      differences,
      changes: studioState.changes.map(c => ({ ...c })),
      createdAt: Date.now()
    };

    try {
      const saved = await idbPutPuzzle(record);
      studioState.lastSavedPuzzle = saved;
      studioState.editingPuzzleId = saved.id;
      studioState.dirtySinceSave = false;
      studioState.savedPuzzles = await idbGetAllPuzzles();
      if (!studioState.savedPuzzles.some(p => p.id === saved.id)) {
        studioState.savedPuzzles.unshift(saved);
      }
    } catch (_err) {
      const fallbackSaved = { ...record, customStudio: true };
      studioState.lastSavedPuzzle = fallbackSaved;
      studioState.editingPuzzleId = fallbackSaved.id;
      studioState.dirtySinceSave = false;
      studioState.savedPuzzles = [
        fallbackSaved,
        ...studioState.savedPuzzles.filter(p => p.id !== fallbackSaved.id)
      ];
    }

    if (studioState.viewEl) {
      studioState.viewEl.setAttribute("data-v146-save-result", "saved");
      studioState.viewEl.removeAttribute("data-v146-rejected-count");
      studioState.viewEl.setAttribute("data-v146-last-saved-id", studioState.lastSavedPuzzle.id);
    }

    syncStudioUI();
    renderSavedPuzzlesList();
    setStudioStatus(`Saved "${studioState.lastSavedPuzzle.title}" on this device!`, "success");
    return {
      ok: true,
      rejected: false,
      count: 5,
      puzzle: studioState.lastSavedPuzzle
    };
  }

  function buildPlayableCustomPuzzle(record) {
    if (!record || !Array.isArray(record.differences) || record.differences.length !== 5) {
      return null;
    }
    return {
      id: String(record.id),
      sceneId: String(record.sceneId),
      title: String(record.title || "Studio Puzzle"),
      category: "all",
      imageA: String(record.imageA),
      imageB: String(record.imageB),
      width: STUDIO_WIDTH,
      height: STUDIO_HEIGHT,
      differences: record.differences.map(d => ({
        x: Number(d.x),
        y: Number(d.y),
        r: Number(d.r || DIFF_RADIUS_NORM),
        what: String(d.what || "Sticker change")
      })),
      customStudio: true
    };
  }

  function startCustomPuzzlePlay(recordOrId, options = {}) {
    let target = null;
    if (typeof recordOrId === "string") {
      target = studioState.savedPuzzles.find(p => p.id === recordOrId) ||
        (studioState.lastSavedPuzzle && studioState.lastSavedPuzzle.id === recordOrId
          ? studioState.lastSavedPuzzle
          : null);
    } else if (recordOrId && typeof recordOrId === "object") {
      target = recordOrId;
    } else {
      target = studioState.lastSavedPuzzle || studioState.savedPuzzles[0] || null;
    }

    const playable = buildPlayableCustomPuzzle(target);
    if (!playable || typeof newRun !== "function") return false;

    studioState.lastPlayedCustomPuzzle = playable;
    const isDuel = options.duel === true;

    if (isDuel) {
      if (typeof state !== "undefined" && state) {
        state.lastHomeDuel = null;
      }
      newRun({
        duel: true,
        homeDuel: true,
        studio: true,
        puzzle: playable,
        difficulty: (typeof state !== "undefined" && state && state.selectedDifficulty) || "medium",
        childElapsedMs: 0,
        childFinds: 0
      });
    } else {
      newRun({
        studio: true,
        puzzle: playable,
        mode: "untimed",
        difficulty: (typeof state !== "undefined" && state && state.selectedDifficulty) || "medium"
      });
    }
    return true;
  }

  async function saveAndPlayStudioPuzzle(options = {}) {
    // If editor has 0 changes and we already have a saved puzzle, allow Play to launch it;
    // otherwise validate the working changes count === 5 and save first.
    if (
      options.allowExistingIfEmpty &&
      studioState.changes.length === 0 &&
      (studioState.lastSavedPuzzle || studioState.savedPuzzles.length > 0)
    ) {
      return startCustomPuzzlePlay(studioState.lastSavedPuzzle || studioState.savedPuzzles[0], options);
    }

    // If already saved and unmodified at 5 changes, reuse lastSavedPuzzle without duplicating
    if (
      studioState.changes.length === 5 &&
      !studioState.dirtySinceSave &&
      studioState.lastSavedPuzzle
    ) {
      return startCustomPuzzlePlay(studioState.lastSavedPuzzle, options);
    }

    const res = await saveCurrentStudioPuzzle();
    if (!res || !res.ok || !res.puzzle) {
      return false;
    }
    return startCustomPuzzlePlay(res.puzzle, options);
  }

  function loadSavedPuzzleIntoEditor(record) {
    if (!record || !Array.isArray(record.changes) || record.changes.length !== 5) return false;
    studioState.sceneId = getSceneMeta(record.sceneId).id;
    studioState.changes = record.changes.map(c => ({
      stickerId: getStickerMeta(c.stickerId).id,
      colorId: getColorMeta(c.colorId).id,
      x: Number(c.x),
      y: Number(c.y)
    }));
    studioState.selectedIndex = 0;
    studioState.editingPuzzleId = record.id;
    studioState.lastSavedPuzzle = record;
    studioState.dirtySinceSave = false;
    void ensureSceneImageLoaded(studioState.sceneId).then(() => {
      renderStudioCanvas();
    });
    syncStudioUI();
    setStudioStatus(`Editing "${record.title}" (5 / 5 changes).`, "info");
    return true;
  }

  function closeStudioConfirmDialog() {
    studioState.pendingConfirmAction = null;
    const dlg = studioState.confirmDialogEl;
    if (!dlg) return;
    if (dlg.open && typeof dlg.close === "function") {
      dlg.close();
    } else {
      dlg.removeAttribute("open");
    }
  }

  function ensureStudioConfirmDialog() {
    if (studioState.confirmDialogEl) return studioState.confirmDialogEl;
    const dlg = domNode("dialog", "app-dialog v146-confirm-dialog");
    dlg.setAttribute("data-v146-confirm-dialog", "true");
    dlg.setAttribute("aria-label", "Confirm studio action");

    const header = domNode("div", "dialog-header");
    const heading = domNode("h2", "v146-confirm-heading", "Are you sure?");
    heading.setAttribute("data-v146-confirm-title", "true");
    const closeBtn = domNode("button", "close-button", "Close");
    closeBtn.type = "button";
    closeBtn.setAttribute("data-v146-confirm-close", "true");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", closeStudioConfirmDialog);
    header.append(heading, closeBtn);

    const body = domNode("p", "v146-confirm-body", "");
    body.setAttribute("data-v146-confirm-body", "true");

    const acceptBtn = domNode("button", "danger-button wide", "Yes");
    acceptBtn.type = "button";
    acceptBtn.setAttribute("data-v146-confirm-accept", "true");
    acceptBtn.addEventListener("click", () => {
      const action = studioState.pendingConfirmAction;
      closeStudioConfirmDialog();
      if (typeof action === "function") {
        action();
      }
    });

    const cancelBtn = domNode("button", "quiet-button wide", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.setAttribute("data-v146-confirm-cancel", "true");
    cancelBtn.addEventListener("click", closeStudioConfirmDialog);

    dlg.addEventListener("cancel", () => {
      studioState.pendingConfirmAction = null;
    });

    dlg.append(header, body, acceptBtn, cancelBtn);
    document.body.append(dlg);

    studioState.confirmDialogEl = dlg;
    studioState.confirmTitleEl = heading;
    studioState.confirmBodyEl = body;
    studioState.confirmAcceptBtn = acceptBtn;
    return dlg;
  }

  function openStudioConfirmDialog({ kind, title, message, confirmLabel, onConfirm }) {
    const dlg = ensureStudioConfirmDialog();
    dlg.setAttribute("data-v146-confirm-kind", kind || "confirm");
    if (studioState.confirmTitleEl) studioState.confirmTitleEl.textContent = title || "Are you sure?";
    if (studioState.confirmBodyEl) studioState.confirmBodyEl.textContent = message || "";
    if (studioState.confirmAcceptBtn) studioState.confirmAcceptBtn.textContent = confirmLabel || "Yes";
    studioState.pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
    if (!dlg.open) {
      if (typeof dlg.showModal === "function") {
        dlg.showModal();
      } else {
        dlg.setAttribute("open", "");
      }
    }
  }

  async function performDeleteSavedPuzzle(itemId) {
    await idbDeletePuzzle(itemId);
    studioState.savedPuzzles = studioState.savedPuzzles.filter(p => p.id !== itemId);
    if (studioState.lastSavedPuzzle && studioState.lastSavedPuzzle.id === itemId) {
      studioState.lastSavedPuzzle = studioState.savedPuzzles[0] || null;
    }
    if (studioState.editingPuzzleId === itemId) {
      studioState.editingPuzzleId = null;
      studioState.dirtySinceSave = true;
    }
    syncStudioUI();
    renderSavedPuzzlesList();
    setStudioStatus("Deleted custom puzzle from this device.", "info");
  }

  function renderSavedPuzzlesList() {
    if (!studioState.savedListEl) return;
    studioState.savedListEl.replaceChildren();

    if (studioState.savedPuzzles.length === 0) {
      const empty = domNode(
        "p",
        "v146-empty-changes",
        "Your saved studio puzzles will appear here on this device."
      );
      empty.setAttribute("data-v146-saved-empty", "true");
      studioState.savedListEl.append(empty);
      return;
    }

    for (const item of studioState.savedPuzzles) {
      const card = domNode("div", "v146-saved-card");
      card.setAttribute("data-v146-saved-item", item.id);
      card.setAttribute("data-v146-saved-scene", item.sceneId);

      const thumb = domNode("img", "v146-saved-thumb");
      thumb.setAttribute("data-v146-saved-thumb", "true");
      thumb.src = item.imageB;
      thumb.alt = `Custom puzzle Picture B: ${item.title}`;
      thumb.width = 240;
      thumb.height = 180;
      thumb.decoding = "async";

      const titleEl = domNode("h3", "v146-saved-title", item.title);
      const metaEl = domNode("p", "v146-saved-meta", "5 differences · Saved on this device");

      const actions = domNode("div", "v146-saved-actions");

      const playBtn = domNode("button", "secondary-button", "Play");
      playBtn.type = "button";
      playBtn.setAttribute("data-v146-play-saved", item.id);
      playBtn.addEventListener("click", () => {
        startCustomPuzzlePlay(item, { duel: false });
      });

      const duelBtn = domNode("button", "secondary-button", "Play VS");
      duelBtn.type = "button";
      duelBtn.setAttribute("data-v146-duel-saved", item.id);
      duelBtn.addEventListener("click", () => {
        startCustomPuzzlePlay(item, { duel: true });
      });

      const editBtn = domNode("button", "quiet-button", "Edit");
      editBtn.type = "button";
      editBtn.setAttribute("data-v146-edit-saved", item.id);
      editBtn.addEventListener("click", () => {
        loadSavedPuzzleIntoEditor(item);
      });

      const delBtn = domNode("button", "quiet-button v146-delete-saved-btn", "Delete");
      delBtn.type = "button";
      delBtn.setAttribute("data-v146-delete-saved", item.id);
      delBtn.addEventListener("click", () => {
        openStudioConfirmDialog({
          kind: "delete-saved",
          title: "Delete saved puzzle?",
          message: `Remove "${item.title}" from this device?`,
          confirmLabel: "Yes, delete puzzle",
          onConfirm: () => {
            void performDeleteSavedPuzzle(item.id);
          }
        });
      });

      actions.append(playBtn, duelBtn, editBtn, delBtn);
      card.append(thumb, titleEl, metaEl, actions);
      studioState.savedListEl.append(card);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Canvas Pointer Interaction (Tap to Place, Drag to Move)
  // --------------------------------------------------------------------------
  function canvasNormalizedCoords(event) {
    if (!studioState.canvasEl) return { x: 0.5, y: 0.5 };
    const rect = studioState.canvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    const nx = clampNum((event.clientX - rect.left) / rect.width, 0.08, 0.92);
    const ny = clampNum((event.clientY - rect.top) / rect.height, 0.10, 0.90);
    return {
      x: Number(nx.toFixed(4)),
      y: Number(ny.toFixed(4))
    };
  }

  function findHitChangeIndex(nx, ny) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = studioState.changes.length - 1; i >= 0; i -= 1) {
      const c = studioState.changes[i];
      const dist = Math.hypot(c.x - nx, c.y - ny);
      if (dist <= 0.068 && dist < bestDist) {
        bestIdx = i;
        bestDist = dist;
      }
    }
    return bestIdx;
  }

  function bindCanvasInteractions(canvas) {
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      const coords = canvasNormalizedCoords(event);
      const hitIdx = findHitChangeIndex(coords.x, coords.y);
      studioState.dragPointerId = event.pointerId;
      studioState.dragStartX = event.clientX;
      studioState.dragStartY = event.clientY;
      studioState.dragMoved = false;
      studioState.dragIndex = hitIdx;
      if (hitIdx >= 0) {
        studioState.selectedIndex = hitIdx;
        syncStudioUI();
      }
    });

    window.addEventListener("pointermove", event => {
      if (studioState.dragPointerId === null || event.pointerId !== studioState.dragPointerId) return;
      if (studioState.dragIndex < 0 || !studioState.changes[studioState.dragIndex]) return;
      const dist = Math.hypot(
        event.clientX - studioState.dragStartX,
        event.clientY - studioState.dragStartY
      );
      if (dist > 6) {
        studioState.dragMoved = true;
        const coords = canvasNormalizedCoords(event);
        studioState.changes[studioState.dragIndex].x = coords.x;
        studioState.changes[studioState.dragIndex].y = coords.y;
        studioState.dirtySinceSave = true;
        renderStudioCanvas();
      }
    });

    const endDrag = event => {
      if (studioState.dragPointerId === null || event.pointerId !== studioState.dragPointerId) return;
      const wasMoved = studioState.dragMoved;
      const draggedIdx = studioState.dragIndex;
      studioState.dragPointerId = null;
      studioState.dragIndex = -1;
      studioState.dragMoved = false;
      if (wasMoved && draggedIdx >= 0) {
        studioState.suppressNextCanvasClick = true;
        syncStudioUI();
        setStudioStatus(`Moved change #${draggedIdx + 1} (${studioState.changes.length} / 5).`, "info");
      }
    };

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("click", event => {
      if (studioState.suppressNextCanvasClick) {
        studioState.suppressNextCanvasClick = false;
        return;
      }
      const coords = canvasNormalizedCoords(event);
      addStudioChange({ x: coords.x, y: coords.y });
    });
  }

  // --------------------------------------------------------------------------
  // 6. Build Studio View DOM (Pure DOM, Zero IDs, Zero Inline Styles)
  // --------------------------------------------------------------------------
  function ensureStudioViewMounted() {
    if (studioState.viewEl) return studioState.viewEl;
    const mainEl = document.getElementById("main");
    if (!mainEl) return null;

    preloadOfficialIconAsset();

    const section = domNode("section", "view v146-studio-view");
    section.setAttribute("data-v146-studio-view", "true");
    section.setAttribute("aria-label", "Make a puzzle studio");
    section.hidden = true;

    // Top Header Card
    const topCard = domNode("div", "v146-studio-card");
    const headerRow = domNode("div", "v146-studio-header");
    const titleWrap = domNode("div", "v146-studio-title-wrap");
    const eyebrow = domNode("p", "eyebrow", "On this device · Built-in scenes");
    const title = domNode("h1", "v146-studio-title", "Make a Puzzle Studio");
    titleWrap.append(eyebrow, title);

    const headerActions = domNode("div", "v146-studio-header-actions");
    const counterPill = domNode("span", "v146-change-counter-pill", "0 / 5 changes");
    counterPill.setAttribute("data-v146-change-count", "0");
    counterPill.setAttribute("role", "status");
    counterPill.setAttribute("aria-live", "polite");

    const backBtn = domNode("button", "quiet-button", "Home");
    backBtn.type = "button";
    backBtn.setAttribute("data-v146-studio-back", "true");
    backBtn.addEventListener("click", () => {
      if (typeof returnHome === "function") {
        returnHome();
      } else if (typeof showView === "function") {
        showView("homeView");
      }
    });

    headerActions.append(counterPill, backBtn);
    headerRow.append(titleWrap, headerActions);

    // Step 1: Pick one of the 22 official scenes
    const step1Head = domNode("div", "v146-step-head");
    const step1TextWrap = domNode("div", "v146-step-title-group");
    step1TextWrap.append(
      domNode("h2", "v146-step-heading", "1. Pick an official scene"),
      domNode("p", "v146-step-sub", "Choose any of the 22 built-in pictures.")
    );
    const toggleScenesBtn = domNode("button", "quiet-button v146-toggle-scenes-btn", "Show all scenes");
    toggleScenesBtn.type = "button";
    toggleScenesBtn.hidden = true;
    toggleScenesBtn.setAttribute("data-v146-toggle-scenes", "true");
    toggleScenesBtn.addEventListener("click", () => {
      studioState.scenePicked = false;
      syncStudioUI();
    });
    step1Head.append(step1TextWrap, toggleScenesBtn);

    const sceneGrid = domNode("div", "v146-scene-grid");
    sceneGrid.setAttribute("data-v146-scene-picker", "true");
    sceneGrid.setAttribute("role", "group");
    sceneGrid.setAttribute("aria-label", "Built-in scenes");
    sceneGrid.addEventListener("scroll", () => {
      updateSceneScrollHint();
    }, { passive: true });

    const scenes = getOfficialScenes();
    scenes.forEach((scene, index) => {
      const btn = domNode("button", "v146-scene-btn");
      btn.type = "button";
      btn.setAttribute("data-v146-scene", scene.id);
      btn.setAttribute("data-v146-scene-index", String(index));
      btn.setAttribute("aria-label", `Scene ${index + 1}: ${scene.title}`);
      const thumb = domNode("img", "v146-scene-thumb");
      thumb.src = scene.imageA;
      thumb.alt = scene.title;
      thumb.width = 120;
      thumb.height = 90;
      thumb.loading = "lazy";
      thumb.decoding = "async";
      const nameSpan = domNode("span", "v146-scene-name", scene.title);
      btn.append(thumb, nameSpan);
      btn.addEventListener("click", () => {
        pickStudioScene(scene.id);
      });
      sceneGrid.append(btn);
    });

    const morePicturesHint = domNode(
      "p",
      "v146-more-pictures-hint",
      "More pictures ↓ Scroll for all 22 scenes"
    );
    morePicturesHint.setAttribute("data-v146-more-pictures", "true");

    topCard.append(headerRow, step1Head, sceneGrid, morePicturesHint);

    // Step 2: Place, Move, or Recolor 5 Stickers on Picture B
    const editorCard = domNode("div", "v146-studio-card");
    editorCard.setAttribute("data-v146-editor", "true");

    const step2Head = domNode("div", "v146-step-head");
    step2Head.append(
      domNode("h2", "v146-step-heading", "2. Make exactly 5 changes on Picture B"),
      domNode("p", "v146-step-sub", "Tap Picture B to place a sticker, drag to move, or tap a color to recolor.")
    );

    const palettesRow = domNode("div", "v146-palettes-row");

    // Sticker Picker
    const stickerBox = domNode("div", "v146-palette-box");
    stickerBox.append(domNode("p", "v146-palette-label", "Sticker shape"));
    const stickerList = domNode("div", "v146-sticker-list");
    stickerList.setAttribute("data-v146-sticker-picker", "true");
    stickerList.setAttribute("role", "group");
    stickerList.setAttribute("aria-label", "Choose sticker shape");

    for (const sItem of STICKER_CATALOG) {
      const btn = domNode("button", "v146-sticker-btn");
      btn.type = "button";
      btn.setAttribute("data-v146-sticker", sItem.id);
      btn.setAttribute("aria-label", `${sItem.label} sticker`);
      btn.append(createStickerIconSvg(sItem.id), domNode("span", "", sItem.label));
      btn.addEventListener("click", () => {
        studioState.activeStickerId = sItem.id;
        if (
          studioState.selectedIndex >= 0 &&
          studioState.selectedIndex < studioState.changes.length
        ) {
          studioState.changes[studioState.selectedIndex].stickerId = sItem.id;
          studioState.dirtySinceSave = true;
        }
        syncStudioUI();
      });
      stickerList.append(btn);
    }
    stickerBox.append(stickerList);

    // Color Picker
    const colorBox = domNode("div", "v146-palette-box");
    colorBox.append(domNode("p", "v146-palette-label", "Sticker color (tap to recolor)"));
    const colorList = domNode("div", "v146-color-list");
    colorList.setAttribute("data-v146-color-picker", "true");
    colorList.setAttribute("role", "group");
    colorList.setAttribute("aria-label", "Choose sticker color");

    for (const cItem of COLOR_CATALOG) {
      const btn = domNode("button", "v146-color-btn");
      btn.type = "button";
      btn.setAttribute("data-v146-color", cItem.id);
      btn.setAttribute("aria-label", `${cItem.label} color`);
      const swatch = domNode("span", `v146-color-swatch v146-color-swatch-${cItem.id}`);
      swatch.setAttribute("aria-hidden", "true");
      btn.append(swatch, domNode("span", "", cItem.label));
      btn.addEventListener("click", () => {
        studioState.activeColorId = cItem.id;
        if (
          studioState.selectedIndex >= 0 &&
          studioState.selectedIndex < studioState.changes.length
        ) {
          recolorStudioChange(studioState.selectedIndex, cItem.id);
        } else {
          syncStudioUI();
        }
      });
      colorList.append(btn);
    }
    colorBox.append(colorList);
    palettesRow.append(stickerBox, colorBox);

    // Picture A and Picture B Stage
    const stageGrid = domNode("div", "v146-stage-grid");
    stageGrid.setAttribute("data-v146-stage", "true");

    const figA = domNode("figure", "v146-figure v146-figure-a");
    figA.setAttribute("data-v146-figure-a", "true");
    const capA = domNode("figcaption", "v146-figcaption", "Picture A (Original scene)");
    const previewA = domNode("img", "v146-preview-img");
    previewA.setAttribute("data-v146-preview-a", "true");
    previewA.src = "img/eng-classroom-a.jpg";
    previewA.alt = "Picture A original: Classroom";
    previewA.width = STUDIO_WIDTH;
    previewA.height = STUDIO_HEIGHT;
    previewA.decoding = "async";
    previewA.addEventListener("load", () => {
      renderStudioCanvas();
    });
    figA.append(capA, previewA);

    const figB = domNode("figure", "v146-figure v146-figure-b");
    figB.setAttribute("data-v146-figure-b", "true");
    const capB = domNode("figcaption", "v146-figcaption", "Picture B (Tap to place · Drag to move)");
    const canvasB = domNode("canvas", "v146-studio-canvas");
    canvasB.setAttribute("data-v146-canvas", "true");
    canvasB.width = STUDIO_WIDTH;
    canvasB.height = STUDIO_HEIGHT;
    canvasB.setAttribute("role", "img");
    canvasB.setAttribute("aria-label", "Picture B studio canvas — tap to place or drag to move a sticker");
    figB.append(capB, canvasB);

    stageGrid.append(figA, figB);

    // Quick Action Toolbar
    const toolbar = domNode("div", "v146-toolbar");
    toolbar.setAttribute("data-v146-toolbar", "true");

    const addBtn = domNode("button", "secondary-button", "Add change");
    addBtn.type = "button";
    addBtn.setAttribute("data-v146-add-change", "true");
    addBtn.addEventListener("click", () => {
      addStudioChange();
    });

    const moveBtn = domNode("button", "quiet-button", "Move selected");
    moveBtn.type = "button";
    moveBtn.setAttribute("data-v146-move-change", "true");
    moveBtn.addEventListener("click", () => {
      moveStudioChange();
    });

    const recolorBtn = domNode("button", "quiet-button", "Recolor selected");
    recolorBtn.type = "button";
    recolorBtn.setAttribute("data-v146-recolor-change", "true");
    recolorBtn.addEventListener("click", () => {
      recolorStudioChange();
    });

    const removeBtn = domNode("button", "quiet-button", "Remove last");
    removeBtn.type = "button";
    removeBtn.setAttribute("data-v146-remove-change", "true");
    removeBtn.setAttribute("data-v146-undo", "true");
    removeBtn.addEventListener("click", () => {
      removeStudioChange();
    });

    const clearBtn = domNode("button", "quiet-button", "Clear all");
    clearBtn.type = "button";
    clearBtn.setAttribute("data-v146-clear-changes", "true");
    clearBtn.addEventListener("click", () => {
      openStudioConfirmDialog({
        kind: "clear-all",
        title: "Clear all changes?",
        message: "Remove all placed stickers from Picture B and start fresh?",
        confirmLabel: "Yes, clear all",
        onConfirm: () => {
          clearStudioChanges();
        }
      });
    });

    toolbar.append(addBtn, moveBtn, recolorBtn, removeBtn, clearBtn);

    const changesList = domNode("div", "v146-changes-list");
    changesList.setAttribute("data-v146-changes-list", "true");

    const statusBanner = domNode(
      "p",
      "v146-status-banner",
      "Pick a scene and place 5 changes on Picture B (0 / 5)."
    );
    statusBanner.setAttribute("data-v146-status", "true");
    statusBanner.setAttribute("data-v146-status-kind", "info");
    statusBanner.setAttribute("role", "status");
    statusBanner.setAttribute("aria-live", "polite");

    const saveActions = domNode("div", "v146-save-actions");
    saveActions.setAttribute("data-v146-actions", "true");

    const savePlayBtn = domNode("button", "primary-button", "Save & Play");
    savePlayBtn.type = "button";
    savePlayBtn.disabled = true;
    savePlayBtn.setAttribute("aria-disabled", "true");
    savePlayBtn.setAttribute("data-v146-save-and-play", "true");
    savePlayBtn.addEventListener("click", () => {
      void saveAndPlayStudioPuzzle({ duel: false, allowExistingIfEmpty: false });
    });

    const saveBtn = domNode("button", "secondary-button", "Save puzzle");
    saveBtn.type = "button";
    saveBtn.setAttribute("data-v146-save", "true");
    saveBtn.addEventListener("click", () => {
      void saveCurrentStudioPuzzle();
    });

    const playBtn = domNode("button", "quiet-button", "Play puzzle");
    playBtn.type = "button";
    playBtn.disabled = true;
    playBtn.setAttribute("aria-disabled", "true");
    playBtn.setAttribute("data-v146-play", "true");
    playBtn.addEventListener("click", () => {
      void saveAndPlayStudioPuzzle({ duel: false, allowExistingIfEmpty: true });
    });

    const playVsBtn = domNode("button", "quiet-button", "Play VS grown-up");
    playVsBtn.type = "button";
    playVsBtn.disabled = true;
    playVsBtn.setAttribute("aria-disabled", "true");
    playVsBtn.setAttribute("data-v146-play-vs", "true");
    playVsBtn.addEventListener("click", () => {
      void saveAndPlayStudioPuzzle({ duel: true, allowExistingIfEmpty: true });
    });

    saveActions.append(savePlayBtn, saveBtn, playBtn, playVsBtn);
    editorCard.append(step2Head, stageGrid, palettesRow, toolbar, changesList, statusBanner, saveActions);

    // Step 3: Saved Studio Puzzles on This Device
    const savedCard = domNode("div", "v146-studio-card");
    const savedHead = domNode("div", "v146-step-head");
    savedHead.append(
      domNode("h2", "v146-step-heading", "Saved Studio Puzzles"),
      domNode("p", "v146-step-sub", "Stored only on this device. Custom play does not change official levels or scores.")
    );
    const savedList = domNode("div", "v146-saved-grid");
    savedList.setAttribute("data-v146-saved-list", "true");
    savedCard.append(savedHead, savedList);

    section.append(topCard, editorCard, savedCard);

    const homeView = document.getElementById("homeView");
    if (homeView && homeView.nextSibling) {
      mainEl.insertBefore(section, homeView.nextSibling);
    } else {
      mainEl.append(section);
    }

    studioState.viewEl = section;
    studioState.canvasEl = canvasB;
    studioState.previewAEl = previewA;
    studioState.counterPillEl = counterPill;
    studioState.statusEl = statusBanner;
    studioState.changesListEl = changesList;
    studioState.savedListEl = savedList;
    studioState.sceneGridEl = sceneGrid;
    studioState.morePicturesHintEl = morePicturesHint;
    studioState.toggleScenesBtnEl = toggleScenesBtn;
    studioState.stickerListEl = stickerList;
    studioState.colorListEl = colorList;

    ensureStudioConfirmDialog();
    bindCanvasInteractions(canvasB);
    void ensureSceneImageLoaded(studioState.sceneId);
    syncStudioUI();
    renderSavedPuzzlesList();

    return section;
  }

  function openStudioView() {
    ensureStudioViewMounted();
    if (studioState.changes.length === 0 && !studioState.editingPuzzleId) {
      studioState.scenePicked = false;
      if (studioState.sceneGridEl) {
        studioState.sceneGridEl.scrollTop = 0;
      }
    }
    if (typeof leaveActiveRun === "function") {
      leaveActiveRun();
    }
    if (typeof showView === "function") {
      showView("studioView");
    }
    void ensureSceneImageLoaded(studioState.sceneId).then(() => {
      renderStudioCanvas();
    });
    syncStudioUI();
    updateSceneScrollHint();
    renderSavedPuzzlesList();
  }

  function bindHomeStudioTile() {
    const btn = document.querySelector("[data-v146-home-studio]");
    if (!btn || btn.dataset.v146Bound === "true") return;
    btn.dataset.v146Bound = "true";
    btn.addEventListener("click", () => {
      openStudioView();
    });
  }

  // --------------------------------------------------------------------------
  // 7. Wrap Global Lifecycle Hooks & Protect Official Counters / Share
  // --------------------------------------------------------------------------
  function hookGlobalsV146() {
    if (typeof window.showView === "function") {
      const origShowView = window.showView;
      window.showView = function v146ShowView(id, ...rest) {
        const res = origShowView.call(this, id, ...rest);
        if (studioState.viewEl) {
          const isStudio = id === "studioView";
          studioState.viewEl.hidden = !isStudio;
          document.body.classList.toggle("v146-studio-screen", isStudio);
        }
        return res;
      };
    }

    if (typeof window.finishRun === "function") {
      const origFinishRun = window.finishRun;
      window.finishRun = function v146FinishRun(reason, ...rest) {
        const activeRun = typeof state !== "undefined" && state ? state.run : null;
        const res = origFinishRun.call(this, reason, ...rest);
        if (activeRun && (activeRun.customStudio || activeRun.kind === "studio")) {
          // Never allow sharing or leaderboard saving on custom studio puzzles
          const shareBtn = document.querySelector("#resultView [data-share]");
          if (shareBtn) shareBtn.hidden = true;
          const sharePanel = document.querySelector("#resultView .share-fallback-panel");
          if (sharePanel) sharePanel.hidden = true;
          const saveBtn = document.getElementById("resultSaveButton");
          if (saveBtn) saveBtn.hidden = true;

          // If solo custom play finished without reveal, also offer Grown-up's turn (VS Duel on custom)
          if (activeRun.kind !== "duel" && !activeRun.revealed && reason === "completed") {
            const duelBtn = document.getElementById("duelButton");
            if (duelBtn && typeof state !== "undefined" && state) {
              state.lastHomeDuel = {
                day: typeof dateKey === "function" ? dateKey() : "",
                puzzle: activeRun.list[0],
                childElapsedMs: activeRun.elapsedMs || 1000,
                difficulty: activeRun.difficulty || "medium",
                childFinds: activeRun.totalFinds || 5
              };
              duelBtn.hidden = false;
              const timeStr = typeof duelTime === "function"
                ? duelTime(activeRun.elapsedMs || 1000)
                : "0:01";
              duelBtn.textContent = `Grown-up's turn: beat ${timeStr}?`;
            }
          }
        }
        return res;
      };
    }
  }

  window.replayCustomStudioPuzzle = function replayCustomStudioPuzzle() {
    if (studioState.lastPlayedCustomPuzzle) {
      return startCustomPuzzlePlay(studioState.lastPlayedCustomPuzzle, { duel: false });
    }
    if (studioState.lastSavedPuzzle || studioState.savedPuzzles[0]) {
      return startCustomPuzzlePlay(studioState.lastSavedPuzzle || studioState.savedPuzzles[0], { duel: false });
    }
    if (typeof returnHome === "function") returnHome();
    return false;
  };

  window.openPuzzleStudio = openStudioView;
  window.v146Studio = {
    open: openStudioView,
    close: () => {
      if (typeof returnHome === "function") returnHome();
    },
    getScenes: () => getOfficialScenes().map(s => s.id),
    pickScene: pickStudioScene,
    addChange: addStudioChange,
    moveChange: moveStudioChange,
    recolorChange: recolorStudioChange,
    removeChange: removeStudioChange,
    clearChanges: clearStudioChanges,
    getChanges: () => studioState.changes.map(c => ({ ...c })),
    save: saveCurrentStudioPuzzle,
    savePuzzle: saveCurrentStudioPuzzle,
    saveAndPlay: () => saveAndPlayStudioPuzzle({ duel: false, allowExistingIfEmpty: false }),
    play: (recordOrId) => startCustomPuzzlePlay(recordOrId, { duel: false }),
    playPuzzle: (recordOrId) => startCustomPuzzlePlay(recordOrId, { duel: false }),
    playDuel: (recordOrId) => startCustomPuzzlePlay(recordOrId, { duel: true }),
    startCustomDuel: (recordOrId) => startCustomPuzzlePlay(recordOrId, { duel: true }),
    getSavedPuzzles: async () => {
      studioState.savedPuzzles = await idbGetAllPuzzles();
      renderSavedPuzzlesList();
      return studioState.savedPuzzles.slice();
    },
    deletePuzzle: async (id) => {
      const ok = await idbDeletePuzzle(id);
      studioState.savedPuzzles = await idbGetAllPuzzles();
      renderSavedPuzzlesList();
      return ok;
    }
  };

  hookGlobalsV146();

  document.addEventListener("DOMContentLoaded", () => {
    bindHomeStudioTile();
    ensureStudioViewMounted();
    void (async () => {
      studioState.savedPuzzles = await idbGetAllPuzzles();
      if (studioState.savedPuzzles.length > 0 && !studioState.lastSavedPuzzle) {
        studioState.lastSavedPuzzle = studioState.savedPuzzles[0];
      }
      renderSavedPuzzlesList();
    })();
  });
})();
