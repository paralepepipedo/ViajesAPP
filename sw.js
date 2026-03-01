// ============================================
// SERVICE WORKER — ViajesAPP
// Estrategia: Cache First para estáticos,
//             Network First para datos Supabase
// ============================================

const APP_VERSION   = 'v1.0.0';
const CACHE_STATIC  = `viajes-static-${APP_VERSION}`;
const CACHE_PAGES   = `viajes-pages-${APP_VERSION}`;

// ── Archivos estáticos que se cachean al instalar ──────────────────────────
// El SW detecta automáticamente si está en / (Vercel) o en /ViajesAPP/ (XAMPP)
const BASE = self.location.pathname.replace('/sw.js', '');

const ARCHIVOS_ESTATICOS = [
    // Raíz
    `${BASE}/index.html`,
    `${BASE}/index.css`,
    `${BASE}/index.js`,
    `${BASE}/config.js`,
    `${BASE}/offline.html`,
    `${BASE}/web-app-manifest-512x434.png`,
    `${BASE}/web-app-manifest-192x192.png`,
    `${BASE}/favicon.svg`,
    `${BASE}/favicon.ico`,
    `${BASE}/favicon-96x96.png`,
    `${BASE}/apple-touch-icon.png`,
    `${BASE}/site.webmanifest`,

    // Header global
    `${BASE}/components/header/header.html`,
    `${BASE}/components/header/header.css`,
    `${BASE}/components/header/header.js`,
    `${BASE}/components/header/index.html`,

    // Dashboard
    `${BASE}/dashboard/dashboard.html`,
    `${BASE}/dashboard/dashboard.css`,
    `${BASE}/dashboard/dashboard.js`,

    // Gastos
    `${BASE}/gastos/gastos.html`,
    `${BASE}/gastos/gastos.css`,
    `${BASE}/gastos/gastos.js`,

    // Itinerario
    `${BASE}/itinerario/itinerario.html`,
    `${BASE}/itinerario/itinerario.css`,
    `${BASE}/itinerario/itinerario.js`,

    // Crucero
    `${BASE}/crucero/crucero.html`,
    `${BASE}/crucero/crucero.css`,
    `${BASE}/crucero/crucero.js`,

    // Documentos
    `${BASE}/documentos/documentos.html`,
    `${BASE}/documentos/documentos.css`,
    `${BASE}/documentos/documentos.js`,

    // Wizard
    `${BASE}/wizard/wizard.html`,
    `${BASE}/wizard/wizard.css`,
    `${BASE}/wizard/wizard.js`,

    // Mobile
    `${BASE}/mobile/mobile-styles.css`,
    `${BASE}/mobile/index-mobile.html`,
    `${BASE}/mobile/dashboard-mobile.html`,
    `${BASE}/mobile/gastos-mobile.html`,
    `${BASE}/mobile/itinerario-mobile.html`,
    `${BASE}/mobile/documentos-mobile.html`,
    `${BASE}/mobile/crucero-mobile.html`,

    // Utils
    `${BASE}/utils/currency-utils.js`,
    `${BASE}/utils/date-utils.js`,
    `${BASE}/utils/db-helpers.js`,
    `${BASE}/utils/debt-calculator.js`,
    `${BASE}/utils/export-excel.js`,

    // Supabase SDK
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── Página de fallback offline ─────────────────────────────────────────────
const OFFLINE_PAGE = `${BASE}/offline.html`;

// ══════════════════════════════════════════════
// INSTALL — cachear todos los estáticos
// ══════════════════════════════════════════════
self.addEventListener('install', event => {
    console.log('[SW] Instalando versión', APP_VERSION);

    event.waitUntil(
        caches.open(CACHE_STATIC).then(async cache => {
            // Cachear uno por uno para que un error no rompa todo
            const resultados = await Promise.allSettled(
                ARCHIVOS_ESTATICOS.map(url =>
                    cache.add(url).catch(e =>
                        console.warn(`[SW] No se pudo cachear: ${url}`, e.message)
                    )
                )
            );
            const ok = resultados.filter(r => r.status === 'fulfilled').length;
            console.log(`[SW] Cacheados ${ok}/${ARCHIVOS_ESTATICOS.length} archivos`);
        }).then(() => self.skipWaiting())
    );
});

// ══════════════════════════════════════════════
// ACTIVATE — limpiar caches viejos
// ══════════════════════════════════════════════
self.addEventListener('activate', event => {
    console.log('[SW] Activado versión', APP_VERSION);

    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_STATIC && k !== CACHE_PAGES)
                    .map(k => {
                        console.log('[SW] Eliminando cache viejo:', k);
                        return caches.delete(k);
                    })
            )
        ).then(() => self.clients.claim())
    );
});

// ══════════════════════════════════════════════
// FETCH — estrategia por tipo de request
// ══════════════════════════════════════════════
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar requests no-GET y extensiones de Chrome
    if (request.method !== 'GET') return;
    if (url.protocol === 'chrome-extension:') return;

    // ── Supabase API → Network First (datos siempre frescos si hay red) ──
    if (url.hostname.includes('supabase.co')) {
        event.respondWith(networkFirstConCache(request, CACHE_PAGES));
        return;
    }

    // ── CDN externo (Supabase SDK, etc) → Cache First ───────────────────
    if (url.hostname.includes('cdn.jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com')) {
        event.respondWith(cacheFirst(request, CACHE_STATIC));
        return;
    }

    // ── Archivos propios → Cache First con fallback a red ───────────────
    event.respondWith(cacheFirstConFallback(request));
});

// ══════════════════════════════════════════════
// ESTRATEGIAS DE CACHE
// ══════════════════════════════════════════════

// Cache First: sirve desde cache, si no existe va a la red y cachea
async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Recurso no disponible offline', { status: 503 });
    }
}

// Cache First con fallback a página offline para HTML
async function cacheFirstConFallback(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_STATIC);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Si es una página HTML, devolver la página offline
        if (request.headers.get('accept')?.includes('text/html')) {
            const offlinePage = await caches.match(OFFLINE_PAGE);
            if (offlinePage) return offlinePage;
        }
        return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// Network First: intenta la red, si falla usa cache (para datos Supabase)
async function networkFirstConCache(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) {
            console.log('[SW] Sirviendo desde cache offline:', request.url);
            return cached;
        }
        return new Response(JSON.stringify({ error: 'Sin conexión', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// ══════════════════════════════════════════════
// SYNC — sincronizar cola offline al recuperar red
// ══════════════════════════════════════════════
self.addEventListener('sync', event => {
    if (event.tag === 'sync-pending') {
        console.log('[SW] Background sync activado');
        event.waitUntil(notificarClientesSync());
    }
});

async function notificarClientesSync() {
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.postMessage({ type: 'SYNC_READY' }));
}

// ══════════════════════════════════════════════
// MENSAJE DESDE LA APP — forzar actualización
// ══════════════════════════════════════════════
self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data?.type === 'CLEAR_CACHE') {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
    }
});
