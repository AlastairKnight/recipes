const CACHE = 'recipe-box-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

// Cache every recipe page and photo listed in index.html that isn't cached yet.
async function precacheRecipes(indexHtml) {
  const cache = await caches.open(CACHE);
  const paths = [...indexHtml.matchAll(/"(?:file|img)":"([^"]+)"/g)].map(m => encodePath(m[1]));
  await Promise.all(paths.map(async p => {
    if (!(await cache.match(p))) {
      try { await cache.add(p); } catch (e) {}
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    const index = await cache.match('index.html');
    await precacheRecipes(await index.text());
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first so updates show up, cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          const path = url.pathname.replace(self.registration.scope.replace(url.origin, ''), '');
          if (path === '' || path === 'index.html') {
            event.waitUntil(res.clone().text().then(precacheRecipes));
          }
        }
        return res;
      } catch (e) {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('index.html'));
      }
    })());
    return;
  }

  // Images, fonts, everything else: cache first.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  })());
});
