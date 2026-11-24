// 冒险岛离线缓存：页面和图标先用缓存；计划和验收清单先联网取最新，断网时用上次的
const CACHE = "quest-island-v1-11";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192-v2.png", "icons/icon-512-v2.png", "icons/apple-touch-icon-v2.png", "plan.json", "verified.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.origin + url.pathname;
  const fresh = /\/(plan|verified)\.json$/.test(url.pathname) || e.request.mode === "navigate";
  if (fresh) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)); } return r; })
      .catch(() => caches.match(key).then(m => {
        if (!m) return caches.match("index.html");
        if (e.request.mode === "navigate") return m;
        // 连不上网站时用上次存的计划/验收清单，并打上标记，让页面告诉用户这是旧的
        return m.blob().then(b => new Response(b, { headers: { "content-type": "application/json", "x-quest-stale": "1" } }));
      })));
  } else {
    e.respondWith(caches.match(key).then(m => m || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)); } return r; })));
  }
});
