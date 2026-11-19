"use strict";

/*
  sw.js — Spot the Difference v14.2 offline service worker.
  - Registered with scope './' from the active preview folder.
  - Cache names are prefixed with the folder slug derived from registration.scope
    (e.g. ph-preview-v14.2-shell-v3 and ph-preview-v14.2-assets-v3).
  - activate deletes ONLY its own folder caches matching ^ph-<slug>-(shell|assets)-v\d+$.
  - fetch handles ONLY same-origin GET requests inside registration.scope.
  - Zero analytics, zero background sync, zero push, zero external requests.
*/
(function initServiceWorker() {
  const CACHE_VERSION = 3;

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getScopeInfo() {
    const scopeUrl = new URL(self.registration.scope);
    const scopePath = scopeUrl.pathname.endsWith("/")
      ? scopeUrl.pathname
      : `${scopeUrl.pathname}/`;
    const folderSlug = scopePath
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-") || "root";
    const cachePrefix = `ph-${folderSlug}-`;
    const shellCache = `${cachePrefix}shell-v${CACHE_VERSION}`;
    const assetCache = `${cachePrefix}assets-v${CACHE_VERSION}`;
    const ownCachePattern = new RegExp(`^ph-${escapeRegExp(folderSlug)}-(shell|assets)-v\\d+$`);
    return {
      scopeUrl,
      scopePath,
      folderSlug,
      cachePrefix,
      shellCache,
      assetCache,
      ownCachePattern,
      activeCaches: new Set([shellCache, assetCache])
    };
  }

  const SHELL_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./kid-v14.css",
    "./kid-v14.1.css",
    "./app.js",
    "./ui-v11.js",
    "./kid-v14.js",
    "./pwa-register.js",
    "./kid-v14.1.js",
    "./puzzles.json",
    "./manifest.webmanifest",
    "./icons/icon.svg",
    "./icons/icon-180.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./fonts/Fredoka-SemiBold.woff2",
    "./fonts/Fredoka-Bold.woff2",
    "./fonts/Nunito-Bold.woff2",
    "./fonts/Nunito-ExtraBold.woff2",
    "./img/eng-classroom-a.jpg",
    "./img/eng-classroom-b.jpg",
    "./img/eng-classroom-b-easy.jpg"
  ];

  self.addEventListener("install", event => {
    const info = getScopeInfo();
    event.waitUntil(
      (async () => {
        const shell = await caches.open(info.shellCache);
        const assets = await caches.open(info.assetCache);
        for (const rel of SHELL_FILES) {
          try {
            const targetUrl = new URL(rel, info.scopeUrl).href;
            const res = await fetch(targetUrl, { credentials: "same-origin" });
            if (res && res.ok) {
              const bucket = rel.startsWith("./img/") ? assets : shell;
              await bucket.put(targetUrl, res.clone());
              if (rel === "./index.html") {
                await shell.put(info.scopeUrl.href, res.clone());
              }
            }
          } catch (_err) {
            /* ignore single asset install error */
          }
        }
        await self.skipWaiting();
      })()
    );
  });

  self.addEventListener("activate", event => {
    const info = getScopeInfo();
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        for (const key of keys) {
          if (info.ownCachePattern.test(key) && !info.activeCaches.has(key)) {
            await caches.delete(key);
          }
        }
        await self.clients.claim();
      })()
    );
  });

  async function findInOwnCaches(info, requestUrl, isNavigate) {
    const shell = await caches.open(info.shellCache);
    const assets = await caches.open(info.assetCache);

    let hit = await assets.match(requestUrl, { ignoreSearch: true });
    if (hit) return hit;

    hit = await shell.match(requestUrl, { ignoreSearch: true });
    if (hit) return hit;

    if (isNavigate || requestUrl === info.scopeUrl.href) {
      const indexUrl = new URL("./index.html", info.scopeUrl).href;
      hit = (await shell.match(indexUrl, { ignoreSearch: true })) ||
            (await shell.match(info.scopeUrl.href, { ignoreSearch: true }));
      if (hit) return hit;
    }
    return null;
  }

  self.addEventListener("fetch", event => {
    const request = event.request;
    if (!request || request.method !== "GET") return;

    const info = getScopeInfo();
    let url;
    try {
      url = new URL(request.url);
    } catch (_err) {
      return;
    }

    // Strictly same-origin and inside this registration's folder scope.
    if (url.origin !== info.scopeUrl.origin) return;
    if (!url.pathname.startsWith(info.scopePath)) return;

    const isNavigate = request.mode === "navigate";
    const cleanUrl = `${url.origin}${url.pathname}`;

    event.respondWith(
      (async () => {
        const cached = await findInOwnCaches(info, cleanUrl, isNavigate);
        if (cached) {
          return cached;
        }
        try {
          const networkRes = await fetch(request);
          if (networkRes && networkRes.ok && networkRes.type === "basic") {
            try {
              const isAsset = url.pathname.includes("/img/") || url.pathname.includes("/fonts/");
              const cache = await caches.open(isAsset ? info.assetCache : info.shellCache);
              await cache.put(cleanUrl, networkRes.clone());
            } catch (_putErr) {
              /* ignore cache put error and still return networkRes */
            }
          }
          return networkRes;
        } catch (err) {
          const fallback = await findInOwnCaches(info, cleanUrl, true);
          if (fallback) return fallback;
          throw err;
        }
      })()
    );
  });
})();
