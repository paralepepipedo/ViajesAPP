// ============================================
// CONFIGURACIÓN SUPABASE
// ============================================
const SUPABASE_URL = 'https://lpspcmwxallshngaggmw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_d96GjwG17EM1jBNXupW0rQ_EVzmEES0';
// Inicializar cliente Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// CATEGORÍAS PREDEFINIDAS
// ============================================
const CATEGORIAS_GASTOS = [
    'Uber',
    'Comida',
    'Alojamiento',
    'Entretenimiento',
    'Souvenir',
    'Tour',
    'Compras',
    'Otro'
];

const CATEGORIAS_ITINERARIO = [
    'Tour',
    'Restaurant',
    'Traslado',
    'Actividad Gratis',
    'Compras',
    'Descanso',
    'Otro'
];

const TIPOS_TRANSPORTE = [
    { id: 'avion', label: 'Avión', icon: '✈️' },
    { id: 'crucero', label: 'Crucero', icon: '🛳️' },
    { id: 'auto', label: 'Auto', icon: '🚗' },
    { id: 'bus', label: 'Bus', icon: '🚌' },
    { id: 'tren', label: 'Tren', icon: '🚂' }
];

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Formatear fecha a DD-MM-AAAA
function formatearFecha(fecha) {
    if (!fecha) return '';
    const date = new Date(fecha);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const anio = date.getFullYear();
    return `${dia}-${mes}-${anio}`;
}

// Convertir DD-MM-AAAA a formato ISO (AAAA-MM-DD)
function fechaAISO(fechaStr) {
    if (!fechaStr) return '';
    const partes = fechaStr.split('-');
    return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

// Formatear número con separador de miles y decimales
function formatearNumero(numero) {
    if (!numero && numero !== 0) return '0,00';
    return new Intl.NumberFormat('es-CL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(numero);
}

// Calcular días entre fechas
function calcularDias(fechaInicio, fechaFin) {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);
    const diferencia = fin - inicio;
    return Math.ceil(diferencia / (1000 * 60 * 60 * 24)) + 1;
}

// Obtener parámetro de URL
function obtenerParametroURL(nombre) {
    const params = new URLSearchParams(window.location.search);
    return params.get(nombre);
}

// Redirigir con parámetros
function redirigirConLink(url, link) {
    window.location.href = `${url}?link=${link}`;
}

// Validar email
function validarEmail(email) {
    if (!email) return true; // Email es opcional
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Mostrar notificación
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notif = document.createElement('div');
    notif.className = `notificacion notificacion-${tipo}`;
    notif.textContent = mensaje;
    document.body.appendChild(notif);

    setTimeout(() => {
        notif.classList.add('show');
    }, 10);

    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// Confirmar acción
function confirmarAccion(mensaje) {
    return confirm(mensaje);
}

// ============================================
// FUNCIONES OFFLINE - IndexedDB
// ============================================

// Inicializar IndexedDB para almacenamiento offline
function inicializarDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ViajesAppDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Store para viajes
            if (!db.objectStoreNames.contains('viajes')) {
                db.createObjectStore('viajes', { keyPath: 'id' });
            }

            // Store para gastos pendientes de sincronizar
            if (!db.objectStoreNames.contains('gastos_pendientes')) {
                const gastosStore = db.createObjectStore('gastos_pendientes', { keyPath: 'temp_id', autoIncrement: true });
                gastosStore.createIndex('viaje_id', 'viaje_id', { unique: false });
                gastosStore.createIndex('sincronizado', 'sincronizado', { unique: false });
            }

            // Store para itinerarios pendientes
            if (!db.objectStoreNames.contains('itinerarios_pendientes')) {
                const itinerarioStore = db.createObjectStore('itinerarios_pendientes', { keyPath: 'temp_id', autoIncrement: true });
                itinerarioStore.createIndex('viaje_id', 'viaje_id', { unique: false });
                itinerarioStore.createIndex('sincronizado', 'sincronizado', { unique: false });
            }

            // Store para datos cacheados del viaje
            if (!db.objectStoreNames.contains('viajes_cache')) {
                db.createObjectStore('viajes_cache', { keyPath: 'link_unico' });
            }
        };
    });
}

// Guardar viaje en cache local
async function guardarViajeLocal(viaje) {
    const db = await inicializarDB();
    const transaction = db.transaction(['viajes_cache'], 'readwrite');
    const store = transaction.objectStore('viajes_cache');

    return new Promise((resolve, reject) => {
        const request = store.put({
            ...viaje,
            ultima_actualizacion: new Date().toISOString()
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Obtener viaje desde cache local
async function obtenerViajeLocal(linkUnico) {
    const db = await inicializarDB();
    const transaction = db.transaction(['viajes_cache'], 'readonly');
    const store = transaction.objectStore('viajes_cache');

    return new Promise((resolve, reject) => {
        const request = store.get(linkUnico);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Guardar gasto offline
async function guardarGastoOffline(gasto) {
    const db = await inicializarDB();
    const transaction = db.transaction(['gastos_pendientes'], 'readwrite');
    const store = transaction.objectStore('gastos_pendientes');

    return new Promise((resolve, reject) => {
        const request = store.add({
            ...gasto,
            sincronizado: false,
            fecha_creacion_local: new Date().toISOString()
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Obtener gastos pendientes de sincronizar
async function obtenerGastosPendientes(viajeId = null) {
    const db = await inicializarDB();
    const transaction = db.transaction(['gastos_pendientes'], 'readonly');
    const store = transaction.objectStore('gastos_pendientes');

    return new Promise((resolve, reject) => {
        let request;
        if (viajeId) {
            const index = store.index('viaje_id');
            request = index.getAll(viajeId);
        } else {
            request = store.getAll();
        }

        request.onsuccess = () => {
            const gastos = request.result.filter(g => !g.sincronizado);
            resolve(gastos);
        };
        request.onerror = () => reject(request.error);
    });
}

// Sincronizar gastos pendientes
async function sincronizarGastosPendientes() {
    if (!navigator.onLine) {
        console.log('Sin conexión, no se puede sincronizar');
        return { sincronizados: 0, errores: 0 };
    }

    const gastosPendientes = await obtenerGastosPendientes();
    let sincronizados = 0;
    let errores = 0;

    for (const gasto of gastosPendientes) {
        try {
            const { error } = await supabaseClient
                .from('v3_gastos')  // ← minúsculas
                .insert({
                    viaje_id: gasto.viaje_id,
                    descripcion: gasto.descripcion,
                    monto: gasto.monto,
                    moneda: gasto.moneda,
                    monto_clp: gasto.monto_clp,
                    fecha: gasto.fecha,
                    pagado_por_id: gasto.pagado_por_id,
                    categoria: gasto.categoria,
                    tipo_division: gasto.tipo_division,
                    division_detalle: gasto.division_detalle
                });

            if (error) throw error;

            // Marcar como sincronizado
            await marcarGastoSincronizado(gasto.temp_id);
            sincronizados++;

        } catch (error) {
            console.error('Error sincronizando gasto:', error);
            errores++;
        }
    }

    return { sincronizados, errores };
}

// Marcar gasto como sincronizado
async function marcarGastoSincronizado(tempId) {
    const db = await inicializarDB();
    const transaction = db.transaction(['gastos_pendientes'], 'readwrite');
    const store = transaction.objectStore('gastos_pendientes');

    return new Promise((resolve, reject) => {
        const getRequest = store.get(tempId);

        getRequest.onsuccess = () => {
            const gasto = getRequest.result;
            if (gasto) {
                gasto.sincronizado = true;
                const updateRequest = store.put(gasto);
                updateRequest.onsuccess = () => resolve();
                updateRequest.onerror = () => reject(updateRequest.error);
            } else {
                resolve();
            }
        };

        getRequest.onerror = () => reject(getRequest.error);
    });
}

// Detectar cambios de conexión y sincronizar automáticamente
window.addEventListener('online', async () => {
    console.log('Conexión restaurada, sincronizando...');
    mostrarNotificacion('Conexión restaurada. Sincronizando datos...', 'info');

    const resultado = await sincronizarGastosPendientes();

    if (resultado.sincronizados > 0) {
        mostrarNotificacion(`${resultado.sincronizados} registro(s) sincronizado(s)`, 'success');
    }

    if (resultado.errores > 0) {
        mostrarNotificacion(`${resultado.errores} error(es) al sincronizar`, 'warning');
    }
});

window.addEventListener('offline', () => {
    console.log('Sin conexión, modo offline activado');
    mostrarNotificacion('Sin conexión. Los cambios se guardarán localmente', 'warning');
});

// Verificar estado de conexión
function estaOnline() {
    return navigator.onLine;
}

// Inicializar DB al cargar la página
inicializarDB().catch(error => {
    console.error('Error inicializando IndexedDB:', error);
});
