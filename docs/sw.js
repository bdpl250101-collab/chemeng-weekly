/* Research Weekly 서비스 워커
 *
 * 대시보드(HTML)는 네트워크 우선: 온라인이면 항상 최신 갱신본을 받고,
 * 오프라인이면 마지막으로 받아 둔 화면을 보여 준다.
 * 스타일·스크립트·아이콘은 캐시를 먼저 쓰고 뒤에서 새 버전을 받아 둔다.
 * 다른 사이트(논문 원문, 뉴스, 화공 블로그)는 건드리지 않는다.
 */
const CACHE = "research-weekly-v1";
const SHELL = [
  "./",
  "assets/style.css",
  "assets/app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./", copy));
          }
          return res;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
