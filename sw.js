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

// ---------------------------------------------------------------------------
// Push notifications — the send-push Edge Function posts a JSON payload
// ({ title, body, url }); this just displays it. Actual sending (looking up
// subscriptions, calling the Web Push service) happens server-side — the
// service worker's only job is to react to the push event once it arrives.
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
    let payload = { title: 'Fidel Classroom', body: 'You have a new update.', url: '/fidel-classroom/' };
    if (event.data) {
        try { payload = { ...payload, ...event.data.json() }; } catch (e) { /* keep default */ }
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: 'IMG_2514.png',
            badge: 'IMG_2514.png',
            data: { url: payload.url || '/fidel-classroom/' }
        })
    );
});

// Tapping the notification focuses an already-open tab if one exists,
// otherwise opens a new one — either way landing on the app's start URL
// (the notification's own url field, or '/fidel-classroom/' as a fallback,
// since the app is served from a GitHub Pages subpath, not domain root).
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/fidel-classroom/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
