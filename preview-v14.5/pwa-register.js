"use strict";

/*
  pwa-register.js — Registers ./sw.js with scope './' and provides the
  Grown-ups "Save for offline" button ([data-offline-save]) that precaches
  all 66 puzzle images + app shell with progress. Zero external requests.
*/
(function initPwaOfflineSupport() {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CACHE_VERSION = 10;
  const OFFLINE_LEVEL_IDS = Object.freeze([
    "eng-classroom", "eng-bakery", "eng-campsite", "eng-farm", "eng-garden",
    "eng-trainstation", "eng-snowtown", "eng-zoo", "eng-kitchen", "eng-playground",
    "eng-underwater", "eng-space", "eng-library", "eng-birthday", "eng-rainystreet",
    "eng-toys", "eng-market", "eng-park", "eng-beach", "eng-firestation",
    "eng-bedroom", "eng-petshop"
  ]);

  const SHELL_FILES = Object.freeze([
    "./",
    "./index.html",
    "./style.css",
    "./kid-v14.css",
    "./kid-v14.1.css",
    "./kid-v14.3.css",
    "./kid-v14.4.css",
    "./app.js",
    "./ui-v11.js",
    "./kid-v14.js",
    "./pwa-register.js",
    "./kid-v14.1.js",
    "./kid-v14.3.js",
    "./kid-v14.4.js",
    "./puzzles.json",
    "./manifest.webmanifest",
    "./icons/icon.svg",
    "./icons/icon-180.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./fonts/Fredoka-SemiBold.woff2",
    "./fonts/Fredoka-Bold.woff2",
    "./fonts/Nunito-Bold.woff2",
    "./fonts/Nunito-ExtraBold.woff2"
  ]);

  const pwaState = {
    registration: null,
    saving: false,
    savedCount: 0,
    totalCount: 66,
    ready: false,
    widgets: []
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function createSuitcaseIcon() {
    const svg = svgEl("svg", {
      viewBox: "0 0 24 24",
      class: "svg-icon icon-offline-pack",
      "aria-hidden": "true",
      focusable: "false",
      fill: "none",
      stroke: "#1F2438",
      "stroke-width": "2.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });
    svg.append(
      svgEl("rect", { x: "3", y: "7", width: "18", height: "13", rx: "3", fill: "#FFF7DC" }),
      svgEl("path", { d: "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" }),
      svgEl("path", { d: "M12 10.5v5.5M9.5 13.8L12 16.3l2.5-2.5", stroke: "#1B7A6E" })
    );
    return svg;
  }

  function deriveCacheNames() {
    const baseHref = pwaState.registration
      ? pwaState.registration.scope
      : new URL("./", window.location.href).href;
    const scopeUrl = new URL(baseHref);
    const scopePath = scopeUrl.pathname.endsWith("/")
      ? scopeUrl.pathname
      : `${scopeUrl.pathname}/`;
    const folderSlug = scopePath
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-") || "root";
    const cachePrefix = `ph-${folderSlug}-`;
    return {
      scopeUrl,
      cachePrefix,
      shellCache: `${cachePrefix}shell-v${CACHE_VERSION}`,
      assetCache: `${cachePrefix}assets-v${CACHE_VERSION}`
    };
  }

  function all66ImageRelativeUrls() {
    const list = [];
    for (const id of OFFLINE_LEVEL_IDS) {
      list.push(`./img/${id}-a.jpg`);
      list.push(`./img/${id}-b.jpg`);
      list.push(`./img/${id}-b-easy.jpg`);
    }
    return list;
  }

  function updateWidgetsUI(statusText) {
    const pct = pwaState.totalCount > 0
      ? Math.round((pwaState.savedCount / pwaState.totalCount) * 100)
      : 0;
    for (const w of pwaState.widgets) {
      w.button.disabled = pwaState.saving;
      w.button.dataset.offlineProgress = `${pwaState.savedCount}/${pwaState.totalCount}`;
      w.button.dataset.offlineSaved = pwaState.ready ? "true" : "false";
      w.buttonLabel.textContent = pwaState.saving
        ? `Saving (${pwaState.savedCount} / ${pwaState.totalCount})...`
        : pwaState.ready
          ? `Saved for offline (${pwaState.totalCount} / ${pwaState.totalCount})`
          : "Save pictures";
      w.progressWrap.hidden = !pwaState.saving && !pwaState.ready && pwaState.savedCount === 0;
      w.progressTrack.setAttribute("aria-valuemax", String(pwaState.totalCount));
      w.progressTrack.setAttribute("aria-valuenow", String(pwaState.savedCount));
      w.progressFill.style.width = `${pct}%`;
      w.status.textContent = statusText || (
        pwaState.ready
          ? `All ${pwaState.totalCount} puzzle pictures are saved on this device for offline play.`
          : "Saves all 66 pictures on this device. Nothing is uploaded."
      );
    }
  }

  async function fetchReloadWithRetry(url) {
    const fetchOpts = { credentials: "same-origin", cache: "reload" };
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(url, fetchOpts);
        if (res && res.ok) {
          return res;
        }
        lastErr = new Error(`HTTP ${res ? res.status : "error"} for ${url}`);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Fetch failed for ${url}`);
  }

  async function saveForOffline() {
    if (pwaState.saving) return;
    pwaState.saving = true;
    pwaState.ready = false;
    pwaState.savedCount = 0;
    const imageRels = all66ImageRelativeUrls();
    pwaState.totalCount = imageRels.length;
    updateWidgetsUI(`Saving pictures for offline play (0 / ${pwaState.totalCount})...`);

    try {
      if ("serviceWorker" in navigator && !pwaState.registration) {
        try {
          pwaState.registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
        } catch (_err) {
          /* continue with Cache Storage precache */
        }
      }

      const info = deriveCacheNames();
      const shell = await window.caches.open(info.shellCache);
      const assets = await window.caches.open(info.assetCache);
      let shellFailures = 0;
      let imageFailures = 0;

      // 1. Precache all app shell files (reload + 1 retry)
      for (const rel of SHELL_FILES) {
        const url = new URL(rel, info.scopeUrl).href;
        try {
          const res = await fetchReloadWithRetry(url);
          await shell.put(url, res.clone());
          if (rel === "./index.html") {
            await shell.put(info.scopeUrl.href, res.clone());
          }
        } catch (_err) {
          shellFailures += 1;
        }
      }

      // 2. Precache all 66 puzzle images with live progress (reload + 1 retry)
      const concurrency = 6;
      let cursor = 0;

      async function worker() {
        while (cursor < imageRels.length) {
          const idx = cursor++;
          const rel = imageRels[idx];
          const url = new URL(rel, info.scopeUrl).href;
          let saved = false;
          try {
            const hit = await assets.match(url, { ignoreSearch: true });
            if (hit) {
              saved = true;
            } else {
              const res = await fetchReloadWithRetry(url);
              await assets.put(url, res.clone());
              saved = true;
            }
          } catch (_err) {
            saved = false;
          }
          if (saved) {
            pwaState.savedCount += 1;
          } else {
            imageFailures += 1;
          }
          updateWidgetsUI(`Saving pictures for offline play (${pwaState.savedCount} / ${pwaState.totalCount})...`);
        }
      }

      const workers = [];
      for (let i = 0; i < concurrency; i += 1) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if ("serviceWorker" in navigator && pwaState.registration) {
        try {
          await navigator.serviceWorker.ready;
        } catch (_err) {
          /* ignore */
        }
      }

      pwaState.saving = false;
      pwaState.ready = imageFailures === 0 && shellFailures === 0 && pwaState.savedCount >= pwaState.totalCount;
      if (pwaState.ready) {
        updateWidgetsUI(
          `Ready for offline play! All ${pwaState.savedCount} / ${pwaState.totalCount} pictures saved.`
        );
      } else if (imageFailures > 0) {
        updateWidgetsUI(
          `Saved ${pwaState.savedCount} of ${pwaState.totalCount} pictures. ${imageFailures} ${imageFailures === 1 ? "picture" : "pictures"} could not be saved — check your connection and try again.`
        );
      } else {
        updateWidgetsUI(
          `Saved ${pwaState.savedCount} / ${pwaState.totalCount} pictures, but some app files could not be saved. Try again when online.`
        );
      }
    } catch (_err) {
      pwaState.saving = false;
      updateWidgetsUI("Offline saving is unavailable in this browser mode.");
    }
  }

  function createOfflineWidget() {
    const card = document.createElement("div");
    card.className = "settings-card offline-pack-card";

    const head = document.createElement("div");
    head.className = "offline-pack-head";

    const titleWrap = document.createElement("div");
    const heading = document.createElement("h2");
    heading.textContent = "Play offline";
    titleWrap.append(heading);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button offline-save-button";
    button.setAttribute("data-offline-save", "true");
    button.dataset.offlineProgress = `0/${pwaState.totalCount}`;
    button.dataset.offlineSaved = "false";

    const buttonLabel = document.createElement("span");
    buttonLabel.textContent = "Save pictures";
    button.append(createSuitcaseIcon(), buttonLabel);
    button.addEventListener("click", () => {
      if (typeof requireGrown === "function") {
        requireGrown(() => {
          void saveForOffline();
        });
      } else {
        void saveForOffline();
      }
    });

    head.append(titleWrap, button);

    const status = document.createElement("p");
    status.className = "helper-text offline-pack-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = "Saves all 66 pictures on this device. Nothing is uploaded.";

    const progressWrap = document.createElement("div");
    progressWrap.className = "offline-progress-wrap";
    progressWrap.hidden = true;

    const progressTrack = document.createElement("div");
    progressTrack.className = "timer-track offline-progress-track";
    progressTrack.setAttribute("role", "progressbar");
    progressTrack.setAttribute("aria-label", "Offline pictures saved");
    progressTrack.setAttribute("aria-valuemin", "0");
    progressTrack.setAttribute("aria-valuemax", String(pwaState.totalCount));
    progressTrack.setAttribute("aria-valuenow", "0");

    const progressFill = document.createElement("div");
    progressFill.className = "timer-fill offline-progress-fill";
    progressFill.style.width = "0%";
    progressTrack.append(progressFill);
    progressWrap.append(progressTrack);

    card.append(head, status, progressWrap);

    const widget = {
      card,
      button,
      buttonLabel,
      status,
      progressWrap,
      progressTrack,
      progressFill
    };
    pwaState.widgets.push(widget);
    return widget;
  }

  function mountOfflineWidgets() {
    const grownGrid = document.querySelector("#grownView .grown-grid");
    if (grownGrid && !grownGrid.querySelector("[data-offline-save]")) {
      const widget = createOfflineWidget();
      grownGrid.append(widget.card);
    }
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      pwaState.registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./"
      });
    } catch (_err) {
      /* ignore registration failure on unsupported protocols */
    }
  }

  window.saveForOfflinePlay = saveForOffline;

  document.addEventListener("DOMContentLoaded", () => {
    mountOfflineWidgets();
    void registerServiceWorker();
  });
})();
