/**
 * Service worker — wymagany, żeby Chrome uznał stronę za instalowalną (WebAPK).
 *
 * Zasady:
 *   • `/api/*` NIGDY nie jest cache'owane. Token sesji WebRTC żyje kilka sekund,
 *     podany z cache byłby już nieważny.
 *   • Nawigacja: najpierw sieć, cache dopiero jako zapas. Dzięki temu nowy deploy
 *     na Railway widać od razu, a bez zasięgu interfejs i tak wstaje.
 *   • Statyki: z cache (szybki start), a w tle pobierana jest świeża wersja.
 *
 * Po zmianie plików w `public/` podbij VERSION — to unieważnia stary cache.
 */

const VERSION = "v1";
const CACHE = `pipeline-gadanie-${VERSION}`;

const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/vendor/lib.iife.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Pojedynczo, nie addAll — jeden nieudany zasób nie może wywalić instalacji.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Tylko własny origin — ruch do ElevenLabs/LiveKit zostawiamy w spokoju.
  if (url.origin !== self.location.origin) return;

  // Token sesji i health-check zawsze prosto z sieci.
  if (url.pathname.startsWith("/api/")) return;

  // Nawigacja: sieć z zapasem w cache.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put("/index.html", fresh.clone());
          return fresh;
        } catch {
          return (await caches.match("/index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Statyki: oddaj z cache i odśwież w tle.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(CACHE);
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      return cached || (await network) || Response.error();
    })()
  );
});
