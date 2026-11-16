// 冒险岛离线缓存：计划、验收和页面先联网，连接卡住时有界限地回退本机缓存。
const CACHE = "quest-island-v1-3-local-rewards";
const SHELL = ["./", "index.html", "reward-library.js", "reward-ui.js", "rewards.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "plan.json", "verified.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("quest-island-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function freshOrCached(request, key, navigation, save) {
  const controller = new AbortController(); let timer;
  try {
    const response = fetch(request, {signal:controller.signal});
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Network timeout")); }, 3500); });
    const r = await Promise.race([response, timeout]);
    if (!r.ok) throw new Error("HTTP " + r.status);
    save(r.clone()); return r;
  } catch (error) {
    const cached = await caches.match(key) || (navigation ? await caches.match("index.html") : null);
    if (cached) return cached;
    throw error; // Never return HTML as a fake plan/verification JSON response.
  } finally { clearTimeout(timer); }
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const key = url.origin + url.pathname;
  const save = response => e.waitUntil(caches.open(CACHE).then(c => c.put(key, response)).catch(() => {}));
  const navigation = e.request.mode === "navigate";
  if (/\/(plan|verified)\.json$/.test(url.pathname) || navigation) {
    e.respondWith(freshOrCached(e.request, key, navigation, save));
  } else {
    e.respondWith(caches.match(key).then(m => m || fetch(e.request).then(r => { if (r.ok) save(r.clone()); return r; })));
  }
});
