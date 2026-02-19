// ============================================
// HEADER GLOBAL - Gestión de navegación
// ============================================

// Cargar header en cualquier página
async function cargarHeader() {
    const headerContainer = document.getElementById('globalHeader');
    if (!headerContainer) return;

    try {
        // Determinar la ruta correcta según la ubicación del HTML
        const rutaHeader = obtenerRutaHeader();

        const response = await fetch(rutaHeader);
        const html = await response.text();
        headerContainer.innerHTML = html;

        inicializarHeader();
    } catch (error) {
        console.error('Error cargando header:', error);
    }
}

// Obtener ruta correcta del header según ubicación
function obtenerRutaHeader() {
    const path = window.location.pathname;

    // Si estamos en la raíz (index.html)
    if (path.endsWith('/') || path.endsWith('index.html') || path.includes('/ViajesAPP/') && !path.includes('/wizard/') && !path.includes('/dashboard/') && !path.includes('/gastos/') && !path.includes('/itinerario/') && !path.includes('/documentos/') && !path.includes('/crucero/')) {
        return 'components/header/header.html';
    }

    // Si estamos en subcarpetas (wizard, dashboard, gastos, etc.)
    return '../components/header/header.html';
}

// Inicializar funcionalidad del header
function inicializarHeader() {
    const btnMenu = document.getElementById('btnMenuMobile');
    const headerNav = document.getElementById('headerNav');
    const menuOverlay = document.getElementById('menuOverlay');
    const headerLogo = document.getElementById('headerLogo');

    // Menú mobile
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

    // Logo click - volver al index
    if (headerLogo) {
        headerLogo.addEventListener('click', () => {
            // Determinar ruta al index según ubicación
            const path = window.location.pathname;
            if (path.endsWith('/') || path.endsWith('index.html') || !path.includes('/wizard/') && !path.includes('/dashboard/') && !path.includes('/gastos/') && !path.includes('/itinerario/') && !path.includes('/documentos/') && !path.includes('/crucero/')) {
                window.location.href = 'index.html';
            } else {
                window.location.href = '../index.html';
            }
        });
    }

    // Configurar navegación según contexto
    configurarNavegacion();
}

// Configurar navegación según la página actual
function configurarNavegacion() {
    const headerNav = document.getElementById('headerNav');
    if (!headerNav) return;

    const linkViaje = obtenerParametroURL('link');
    const path = window.location.pathname;

    // Determinar si estamos en raíz o subcarpeta
    const enRaiz = path.endsWith('/') || path.endsWith('index.html') || !path.includes('/wizard/') && !path.includes('/dashboard/') && !path.includes('/gastos/') && !path.includes('/itinerario/') && !path.includes('/documentos/') && !path.includes('/crucero/');
    const prefijo = enRaiz ? '' : '../';

    // Si estamos en el index (sin link de viaje)
    if (!linkViaje || path.includes('index.html')) {
        headerNav.innerHTML = `
            <a href="${prefijo}wizard/wizard.html">+ Nuevo Viaje</a>
        `;
        return;
    }

    // Si estamos dentro de un viaje
    headerNav.innerHTML = `
        <a href="${prefijo}index.html">🏠 Home</a>
        <a href="${prefijo}dashboard/dashboard.html?link=${linkViaje}" class="${path.includes('dashboard') ? 'active' : ''}">Dashboard</a>
        <a href="${prefijo}gastos/gastos.html?link=${linkViaje}" class="${path.includes('gastos') ? 'active' : ''}">💰 Gastos</a>
        <a href="${prefijo}itinerario/itinerario.html?link=${linkViaje}" class="${path.includes('itinerario') ? 'active' : ''}">📅 Itinerario</a>
        <a href="${prefijo}documentos/documentos.html?link=${linkViaje}" class="${path.includes('documentos') ? 'active' : ''}">📄 Documentos</a>
        <button id="btnCrucero" style="display:none;">🛳️ Crucero</button>
    `;

    // Verificar si el viaje tiene crucero
    verificarCrucero(linkViaje, prefijo);
}

// Verificar si el viaje tiene crucero activo
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

// Inicializar al cargar la página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarHeader);
} else {
    cargarHeader();
}
