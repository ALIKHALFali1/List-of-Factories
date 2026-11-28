/* ==========================================================================
   AlRahma ERP — Lightweight PWA Offline Cache Service Worker (sw.js)
   - HTML / Navigation: Network-First (preserves instant Live OTA updates)
   - Static CDN / Fonts / Icons: Stale-While-Revalidate (fast mobile startup)
   - Firebase / Live FX APIs / non-GET: Network-Only (never cached)
   ========================================================================== */
const CACHE_NAME = 'alrahma-static-v1';

const STATIC_HOSTS = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.tailwindcss.com',
    'cdn.jsdelivr.net',
    'www.gstatic.com'
];

const BYPASS_HOSTS = [
    'firebaseio.com',
    'firebasedatabase.app',
    'open.er-api.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebasestorage.googleapis.com'
];

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (e) { return; }
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return;

    // Never intercept Firebase RTDB, Auth, Storage, or Live FX rates
    if (BYPASS_HOSTS.some(h => url.hostname.endsWith(h))) return;
    if (url.href.includes('currency-api')) return;

    // 1) Navigation / index.html -> Network-First (Live OTA always fresh!)
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(req))
        );
        return;
    }

    // 2) Static CDN libraries, fonts, icons, local images -> Stale-While-Revalidate
    const isStaticCdn = STATIC_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h));
    const isLocalAsset = url.origin === self.location.origin && /\.(css|js|png|jpg|jpeg|svg|webp|woff2?|ico|json)$/i.test(url.pathname);
    if (isStaticCdn || isLocalAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(req).then(cached => {
                    const networkFetch = fetch(req).then(res => {
                        if (res && (res.ok || res.type === 'opaque')) {
                            cache.put(req, res.clone()).catch(() => {});
                        }
                        return res;
                    }).catch(() => cached);
                    return cached || networkFetch;
                })
            )
        );
    }
});
