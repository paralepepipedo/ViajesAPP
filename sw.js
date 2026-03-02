// ============================================
// SERVICE WORKER — ViajesAPP
// v2.0.0 — Vercel compatible
// ============================================

const VERSION      = 'v2.0.0';
const CACHE_APP    = `viajes-app-${VERSION}`;
const CACHE_DATA   = `viajes-data-${VERSION}`;

const ARCHIVOS_APP = [
    '/index.html', '/index.css', '/index.js', '/config.js', '/offline.html',
    '/site.webmanifest', '/favicon.svg', '/favicon.ico', '/favicon-96x96.png',
    '/apple-touch-icon.png', '/web-app-manifest-512x434.png', '/web-app-manifest-192x192.png',
    '/components/header/header.html', '/components/header/header.css',
    '/components/header/header.js', '/components/header/index.html',
    '/dashboard/dashboard.html', '/dashboard/dashboard.css', '/dashboard/dashboard.js',
    '/gastos/gastos.html', '/gastos/gastos.css', '/gastos/gastos.js',
    '/itinerario/itinerario.html', '/itinerario/itinerario.css', '/itinerario/itinerario.js',
    '/crucero/crucero.html', '/crucero/crucero.css', '/crucero/crucero.js',
    '/documentos/documentos.html', '/documentos/documentos.css', '/documentos/documentos.js',
    '/wizard/wizard.html', '/wizard/wizard.css', '/wizard/wizard.js',
    '/mobile/mobile-styles.css', '/mobile/index-mobile.html', '/mobile/dashboard-mobile.html',
    '/mobile/gastos-mobile.html', '/mobile/itinerario-mobile.html',
    '/mobile/documentos-mobile.html', '/mobile/crucero-mobile.html',
    '/utils/currency-utils.js', '/utils/date-utils.js', '/utils/db-helpers.js',
    '/utils/debt-calculator.js', '/utils/export-excel.js',
];

// ══════════════════════════════════════════════
// INSTALL
// ══════════════════════════════════════════════
self.addEventListener('install', event => {
    console.log('[SW] Instalando', VERSION);
    event.waitUntil(precachearArchivos().then(() => self.skipWaiting()));
});

async function precachearArchivos() {
    const cache = await caches.open(CACHE_APP);
    let ok = 0, fail = 0;
    for (const url of ARCHIVOS_APP) {
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) { await cache.put(url, res); ok++; }
            else { console.warn(`[SW] ${res.status} ${url}`); fail++; }
        } catch(e) { console.warn(`[SW] fetch error ${url}`); fail++; }
    }
    console.log(`[SW] Precacheo: ${ok} ok, ${fail} fallidos de ${ARCHIVOS_APP.length}`);
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'SW_INSTALLED', ok, fail, total: ARCHIVOS_APP.length }));
}

// ══════════════════════════════════════════════
// ACTIVATE — limpiar caches viejos y avisar al usuario
// ══════════════════════════════════════════════
self.addEventListener('activate', event => {
    console.log('[SW] Activado', VERSION);
    event.waitUntil(
        caches.keys().then(async keys => {
            // Detectar si había versión anterior
            const hayVersionVieja = keys.some(k =>
                (k.startsWith('viajes-app-') || k.startsWith('viajes-static-')) && k !== CACHE_APP
            );
            // Borrar caches viejos
            await Promise.all(
                keys.filter(k => k !== CACHE_APP && k !== CACHE_DATA).map(k => caches.delete(k))
            );
            await self.clients.claim();
            // Avisar a la app si hay update
            if (hayVersionVieja) {
                const clients = await self.clients.matchAll({ type: 'window' });
                clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION }));
            }
        })
    );
});

// ══════════════════════════════════════════════
// FETCH
// ══════════════════════════════════════════════
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    if (url.hostname.includes('supabase.co')) {
        event.respondWith(networkFirst(request, CACHE_DATA));
        return;
    }
    if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(cacheFirst(request, CACHE_APP));
        return;
    }
    event.respondWith(cacheFirstConFallback(request));
});

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const res = await fetch(request);
        if (res.ok) { const c = await caches.open(cacheName); c.put(request, res.clone()); }
        return res;
    } catch { return new Response('Sin conexión', { status: 503 }); }
}

async function cacheFirstConFallback(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const res = await fetch(request);
        if (res.ok) { const c = await caches.open(CACHE_APP); c.put(request, res.clone()); }
        return res;
    } catch {
        if (request.headers.get('accept')?.includes('text/html')) {
            const offline = await caches.match('/offline.html');
            if (offline) return offline;
        }
        return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
}

async function networkFirst(request, cacheName) {
    try {
        const res = await fetch(request);
        if (res.ok) { const c = await caches.open(cacheName); c.put(request, res.clone()); }
        return res;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
}

// ══════════════════════════════════════════════
// MENSAJES DESDE LA APP
// ══════════════════════════════════════════════
self.addEventListener('message', async event => {
    const { type } = event.data || {};
    if (type === 'SKIP_WAITING') self.skipWaiting();

    if (type === 'CACHE_APP') {
        const client = event.source;
        const cache = await caches.open(CACHE_APP);
        let ok = 0;
        for (const url of ARCHIVOS_APP) {
            try {
                const res = await fetch(url, { cache: 'no-cache' });
                if (res.ok) {
                    await cache.put(url, res);
                    ok++;
                    client.postMessage({ type: 'CACHE_PROGRESS', ok, total: ARCHIVOS_APP.length, url });
                }
            } catch(e) { console.warn('[SW] No se pudo cachear:', url); }
        }
        client.postMessage({ type: 'CACHE_DONE', ok, total: ARCHIVOS_APP.length });
    }

    if (type === 'CLEAR_CACHE') {
        await caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        event.source?.postMessage({ type: 'CACHE_CLEARED' });
    }

    if (type === 'CHECK_CACHE') {
        const cache = await caches.open(CACHE_APP);
        const keys = await cache.keys();
        event.source?.postMessage({ type: 'CACHE_STATUS', cached: keys.length, total: ARCHIVOS_APP.length });
    }
});

self.addEventListener('sync', event => {
    if (event.tag === 'sync-pending') {
        event.waitUntil(
            self.clients.matchAll({ type: 'window' })
                .then(clients => clients.forEach(c => c.postMessage({ type: 'SYNC_READY' })))
        );
    }
});
