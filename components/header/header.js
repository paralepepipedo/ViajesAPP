// ============================================
// HEADER GLOBAL - Gestión de navegación
// ============================================

// Variable global para el prompt de instalación PWA
let _pwaInstallPrompt = null;

// Capturar evento de instalación lo antes posible
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _pwaInstallPrompt = e;
    mostrarBannerPWA();
});

// Cuando ya está instalada: ocultar banner para siempre
window.addEventListener('appinstalled', () => {
    ocultarBannerPWA();
    localStorage.setItem('pwa-instalada', '1');
    _pwaInstallPrompt = null;
});

// ── PWA Banner ──────────────────────────────
function mostrarBannerPWA() {
    if (localStorage.getItem('pwa-instalada')) return;
    const cerradoHasta = localStorage.getItem('pwa-banner-cerrado');
    if (cerradoHasta && Date.now() < parseInt(cerradoHasta)) return;

    const banner = document.getElementById('pwaInstallBanner');
    if (banner && _pwaInstallPrompt) banner.style.display = 'block';
}

function ocultarBannerPWA() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) banner.style.display = 'none';
}

function inicializarBannerPWA() {
    // Limpiar flag expirado
    const cerradoHasta = localStorage.getItem('pwa-banner-cerrado');
    if (cerradoHasta && Date.now() > parseInt(cerradoHasta)) {
        localStorage.removeItem('pwa-banner-cerrado');
    }

    const btnInstalar = document.getElementById('pwaBtnInstalar');
    if (btnInstalar) {
        btnInstalar.addEventListener('click', async () => {
            if (!_pwaInstallPrompt) return;
            _pwaInstallPrompt.prompt();
            const { outcome } = await _pwaInstallPrompt.userChoice;
            if (outcome === 'accepted') ocultarBannerPWA();
            _pwaInstallPrompt = null;
        });
    }

    const btnCerrar = document.getElementById('pwaBtnCerrar');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            ocultarBannerPWA();
            // No volver a molestar por 7 días
            localStorage.setItem('pwa-banner-cerrado', Date.now() + 7 * 24 * 60 * 60 * 1000);
        });
    }

    // Si el prompt llegó antes de que se cargara el header
    mostrarBannerPWA();
}

// ── Favicons ─────────────────────────────────
function inyectarFavicons() {
    if (document.getElementById('favicon-injected')) return;
    document.head.insertAdjacentHTML('beforeend', `
        <link id="favicon-injected" rel="icon" href="/favicon.ico" sizes="48x48">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        <link rel="manifest" href="/site.webmanifest">
        <meta name="theme-color" content="#667eea">
    `);
}

// ── Cargar header ─────────────────────────────
async function cargarHeader() {
    const headerContainer = document.getElementById('globalHeader');
    if (!headerContainer) return;

    inyectarFavicons();

    try {
        const rutaHeader = obtenerRutaHeader();
        const response = await fetch(rutaHeader);
        const html = await response.text();
        headerContainer.innerHTML = html;

        inicializarHeader();
        inicializarBannerPWA();
    } catch (error) {
        console.error('Error cargando header:', error);
    }
}

// ── Ruta del header ───────────────────────────
function obtenerRutaHeader() {
    const path = window.location.pathname;

    if (path.endsWith('/') || path.endsWith('index.html') ||
        path.includes('/ViajesAPP/') &&
        !path.includes('/wizard/') && !path.includes('/dashboard/') &&
        !path.includes('/gastos/') && !path.includes('/itinerario/') &&
        !path.includes('/documentos/') && !path.includes('/crucero/')) {
        return 'components/header/header.html';
    }

    return '../components/header/header.html';
}

// ── Inicializar header ────────────────────────
function inicializarHeader() {
    const btnMenu    = document.getElementById('btnMenuMobile');
    const headerNav  = document.getElementById('headerNav');
    const menuOverlay = document.getElementById('menuOverlay');
    const headerLogo  = document.getElementById('headerLogo');

    if (btnMenu) {
        btnMenu.addEventListener('click', () => {
            btnMenu.classList.toggle('active');
            headerNav.classList.toggle('active');
            menuOverlay.classList.toggle('active');
        });
    }

    if (menuOverlay) {
        menuOverlay.addEventListener('click', () => {
            btnMenu.classList.remove('active');
            headerNav.classList.remove('active');
            menuOverlay.classList.remove('active');
        });
    }

    if (headerLogo) {
        headerLogo.style.cursor = 'pointer';
        headerLogo.addEventListener('click', () => {
            const path = window.location.pathname;
            const enRaiz = path.endsWith('/') || path.endsWith('index.html') ||
                !path.includes('/wizard/') && !path.includes('/dashboard/') &&
                !path.includes('/gastos/') && !path.includes('/itinerario/') &&
                !path.includes('/documentos/') && !path.includes('/crucero/');
            window.location.href = enRaiz ? 'index.html' : '../index.html';
        });
    }

    configurarNavegacion();
}

// ── Navegación según contexto ─────────────────
function configurarNavegacion() {
    const headerNav = document.getElementById('headerNav');
    if (!headerNav) return;

    const linkViaje = obtenerParametroURL('link');
    const path = window.location.pathname;

    const enRaiz = path.endsWith('/') || path.endsWith('index.html') ||
        !path.includes('/wizard/') && !path.includes('/dashboard/') &&
        !path.includes('/gastos/') && !path.includes('/itinerario/') &&
        !path.includes('/documentos/') && !path.includes('/crucero/');
    const prefijo = enRaiz ? '' : '../';

    if (!linkViaje || path.includes('index.html')) {
        headerNav.innerHTML = `<a href="${prefijo}wizard/wizard.html">+ Nuevo Viaje</a>`;
        return;
    }

    headerNav.innerHTML = `
        <a href="${prefijo}index.html">🏠 Home</a>
        <a href="${prefijo}dashboard/dashboard.html?link=${linkViaje}" class="${path.includes('dashboard') ? 'active' : ''}">Dashboard</a>
        <a href="${prefijo}gastos/gastos.html?link=${linkViaje}" class="${path.includes('gastos') ? 'active' : ''}">💰 Gastos</a>
        <a href="${prefijo}itinerario/itinerario.html?link=${linkViaje}" class="${path.includes('itinerario') ? 'active' : ''}">📅 Itinerario</a>
        <a href="${prefijo}documentos/documentos.html?link=${linkViaje}" class="${path.includes('documentos') ? 'active' : ''}">📄 Documentos</a>
        <button id="btnCrucero" style="display:none;">🛳️ Crucero</button>
    `;

    verificarCrucero(linkViaje, prefijo);
}

// ── Verificar crucero ─────────────────────────
async function verificarCrucero(linkViaje, prefijo = '../') {
    try {
        const { data, error } = await supabaseClient
            .from('v3_viajes')
            .select('tiene_crucero')
            .eq('link_unico', linkViaje)
            .single();

        if (error) throw error;

        const btnCrucero = document.getElementById('btnCrucero');
        if (data.tiene_crucero && btnCrucero) {
            btnCrucero.style.display = 'block';
            btnCrucero.addEventListener('click', () => {
                window.location.href = `${prefijo}crucero/crucero.html?link=${linkViaje}`;
            });
        }
    } catch (error) {
        console.error('Error verificando crucero:', error);
    }
}

// ── Init ──────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarHeader);
} else {
    cargarHeader();
}
