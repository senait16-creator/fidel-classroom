// =============================================================================
// SERVICE WORKER — app-shell caching only.
//
// Network-first, not cache-first: this app changes constantly (new commits
// go live throughout the day), so the priority is "always try to get the
// freshest file" and only fall back to the cache when actually offline.
// A cache-first strategy here would silently serve stale JS/CSS and
// recreate the exact "why don't I see my changes" confusion already hit
// with GitHub Pages deploys.
//
// Only same-origin GET requests are handled. Supabase, YouTube, fonts, and
// any other cross-origin request are left alone — caching API responses
// would serve stale team/progress data, which is worse than no caching.
// =============================================================================

const CACHE_NAME = 'fidel-classroom-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    if (req.method !== 'GET') return;
    if (new URL(req.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
                return res;
            })
            .catch(() => caches.match(req))
    );
});
