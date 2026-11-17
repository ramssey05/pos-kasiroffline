// POS Kasir Offline - update aman tanpa menghapus cache lama atau data lokal.
const CACHE = 'warkop-kasir-pwa-v9';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

async function refreshAppShell() {
  const cache = await caches.open(CACHE);

  for (const url of APP_SHELL) {
    try {
      // Ambil file terbaru dari server, bukan salinan HTTP cache browser.
      const response = await fetch(new Request(url, { cache: 'no-store' }));
      if (response && response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (err) {
      // Saat offline, pertahankan file cache yang sudah tersimpan.
      console.warn('Tidak dapat memperbarui cache:', url, err);
    }
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    refreshAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // Tidak menghapus cache apa pun. Cache lama tetap menjadi cadangan offline.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // Network-first: saat online, ambil versi terbaru lalu perbarui cache offline.
    try {
      const freshResponse = await fetch(new Request(request, { cache: 'no-store' }));

      if (freshResponse && freshResponse.ok && freshResponse.type !== 'opaque') {
        await cache.put(request, freshResponse.clone());
      }
      return freshResponse;
    } catch (err) {
      // Offline: gunakan cache aktif, lalu cache lain yang sudah ada sebagai cadangan.
      const cachedResponse =
        await cache.match(request) ||
        await caches.match(request) ||
        (request.mode === 'navigate'
          ? (await cache.match('./index.html')) || (await caches.match('./index.html'))
          : null);

      if (cachedResponse) return cachedResponse;
      throw err;
    }
  })());
});
