// ============================================
// INDEX - Listado de Viajes
// ============================================

let viajesData = [];
let viajesFiltrados = [];
let viajeEliminarId = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    inicializarEventos();
    verificarEstadoConexion();
    await cargarViajes();
});

// ============================================
// EVENTOS
// ============================================
function inicializarEventos() {

    // Búsqueda (barra de controles móvil)
    const inputBuscar = document.getElementById('buscarViaje');
    inputBuscar.addEventListener('input', () => filtrarViajes());

    // Búsqueda del hero (desktop)
    const inputBuscarHero = document.getElementById('buscarViajeHero');
    if (inputBuscarHero) {
        inputBuscarHero.addEventListener('input', () => {
            inputBuscar.value = inputBuscarHero.value;
            filtrarViajes();
        });
    }

    // Filtros (barra móvil)
    const filtroEstado = document.getElementById('filtroEstado');
    filtroEstado.addEventListener('change', () => {
        const hero = document.getElementById('filtroEstadoHero');
        if (hero) hero.value = filtroEstado.value;
        filtrarViajes();
    });

    const ordenar = document.getElementById('ordenar');
    ordenar.addEventListener('change', () => {
        const hero = document.getElementById('ordenarHero');
        if (hero) hero.value = ordenar.value;
        filtrarViajes();
    });

    // Filtros del hero (desktop) — sincronizan con los controles
    const filtroEstadoHero = document.getElementById('filtroEstadoHero');
    if (filtroEstadoHero) {
        filtroEstadoHero.addEventListener('change', () => {
            filtroEstado.value = filtroEstadoHero.value;
            filtrarViajes();
        });
    }
    const ordenarHero = document.getElementById('ordenarHero');
    if (ordenarHero) {
        ordenarHero.addEventListener('change', () => {
            ordenar.value = ordenarHero.value;
            filtrarViajes();
        });
    }

    // Toggle búsqueda en móvil
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    const searchBox = document.getElementById('searchBox');
    if (searchToggleBtn) {
        searchToggleBtn.addEventListener('click', () => {
            searchBox.classList.toggle('expanded');
            if (searchBox.classList.contains('expanded')) {
                searchBox.querySelector('input').focus();
            }
        });
    }

    // Mostrar toggle solo en móvil
    function ajustarControlesMobile() {
        const esMobil = window.innerWidth <= 768;
        if (searchToggleBtn) searchToggleBtn.style.display = esMobil ? 'flex' : 'none';
        if (!esMobil && searchBox) {
            searchBox.classList.remove('expanded');
            searchBox.style.display = '';
        }
    }
    ajustarControlesMobile();
    window.addEventListener('resize', ajustarControlesMobile);

    // Modal eliminar
    const modalEliminar = document.getElementById('modalEliminar');
    const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
    const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');

    btnCancelarEliminar.addEventListener('click', () => {
        modalEliminar.classList.remove('active');
    });

    btnConfirmarEliminar.addEventListener('click', async () => {
        await eliminarViaje();
    });

    modalEliminar.addEventListener('click', (e) => {
        if (e.target === modalEliminar) {
            modalEliminar.classList.remove('active');
        }
    });

    // Lightbox mapa crucero
    document.getElementById('btnCerrarLightboxMapa').addEventListener('click', cerrarMapaViaje);
    document.getElementById('lightboxMapaIndex').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) cerrarMapaViaje();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarMapaViaje();
    });
}

// ============================================
// VERIFICAR ESTADO DE CONEXIÓN
// ============================================
function verificarEstadoConexion() {
    actualizarIndicadorSync();

    window.addEventListener('offline', () => {
        actualizarIndicadorSync();
    });

    window.addEventListener('online', () => {
        actualizarIndicadorSync();
        cargarViajes(); // refresca datos al volver a conectar
    });
}

// ============================================
// CACHE LOCAL — IndexedDB helpers
// ============================================
const CACHE_KEY   = 'viajes_cache_v3';
const CACHE_TS_KEY = 'viajes_cache_ts';

function guardarCacheLocal(viajes) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(viajes));
        localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
    } catch(e) { console.warn('Cache write error:', e); }
}

function leerCacheLocal() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
}

function edadCacheMinutos() {
    const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0');
    return ts ? (Date.now() - ts) / 60000 : Infinity;
}

// ============================================
// SKELETON LOADING
// ============================================
function mostrarSkeletons(n = 3) {
    const grid = document.getElementById('viajesGrid');
    grid.innerHTML = Array(n).fill(0).map(() => `
        <div class="skeleton-card">
            <div class="sk-header"></div>
            <div class="sk-bar"></div>
            <div class="sk-stats">
                <div class="sk-stat"></div><div class="sk-stat"></div><div class="sk-stat"></div>
            </div>
            <div class="sk-footer"></div>
        </div>
    `).join('');
}

// ============================================
// CARGAR VIAJES — optimizado
// ============================================
async function cargarViajes() {
    const loadingViajes  = document.getElementById('loadingViajes');
    const viajesGrid     = document.getElementById('viajesGrid');
    const estadoVacio    = document.getElementById('estadoVacio');

    loadingViajes.style.display = 'none';
    estadoVacio.style.display   = 'none';

    // ── PASO 1: mostrar cache instantáneamente ──────────────────────────
    const cached = leerCacheLocal();
    if (cached.length > 0) {
        viajesData = cached;
        filtrarViajes();              // render inmediato con datos viejos
    } else {
        mostrarSkeletons(3);          // primera vez: mostrar skeletons
    }

    // ── PASO 2: si offline, quedarse con cache ──────────────────────────
    if (!navigator.onLine) {
        if (cached.length === 0) estadoVacio.style.display = 'block';
        actualizarIndicadorSync();
        return;
    }

    // ── PASO 3: fetch paralelo — una query por tabla ────────────────────
    try {
        const viajeIds_arr = [];  // se llena después de tener viajes

        // 3a: traer todos los viajes primero (liviano)
        const { data: viajes, error: errViajes } = await supabaseClient
            .from('v3_viajes')
            .select('*')
            .order('created_at', { ascending: false });

        if (errViajes) throw errViajes;
        if (!viajes || viajes.length === 0) {
            viajesData = [];
            guardarCacheLocal([]);
            estadoVacio.style.display = 'block';
            viajesGrid.innerHTML = '';
            return;
        }

        const ids = viajes.map(v => v.id);

        // 3b: todas las tablas relacionadas EN PARALELO
        // Nota: usamos filter con cs() no .in() para evitar el bug de Supabase con array de 1 elemento
        const fetchTabla = async (tabla, campos) => {
            if (ids.length === 0) return [];
            const { data, error } = await supabaseClient
                .from(tabla)
                .select(campos)
                .in('viaje_id', ids);
            if (error) {
                console.warn(`Error cargando ${tabla}:`, error.message);
                return [];
            }
            return data || [];
        };

        const [
            todosDestinos,
            todosGastos,
            todosTransportes,
            todosCruceros,
            todosParticipantes
        ] = await Promise.all([
            fetchTabla('v3_destinos',     'viaje_id, id, nombre, moneda_codigo'),
            fetchTabla('v3_gastos',       'viaje_id, monto_clp'),
            fetchTabla('v3_transportes',  'viaje_id, tipo'),
            fetchTabla('v3_cruceros',     'viaje_id, detalles'),
            fetchTabla('v3_participantes','viaje_id')
        ]);

        // 3c: ensamblar en memoria
        const destinosPorViaje      = agruparPor(todosDestinos,      'viaje_id');
        const gastosPorViaje        = agruparPor(todosGastos,        'viaje_id');
        const transportesPorViaje   = agruparPor(todosTransportes,   'viaje_id');
        const crucerosPorViaje      = agruparPor(todosCruceros,      'viaje_id');
        const participantesPorViaje = agruparPor(todosParticipantes, 'viaje_id');

        for (const viaje of viajes) {
            viaje.destinos            = destinosPorViaje[viaje.id]    || [];
            viaje.gastos              = gastosPorViaje[viaje.id]      || [];
            viaje.transportes         = transportesPorViaje[viaje.id] || [];
            viaje.participantes_count = (participantesPorViaje[viaje.id] || []).length;
            viaje.documentos_count    = 0;

            const crucero = (crucerosPorViaje[viaje.id] || [])[0];
            viaje.crucero_mapa_url    = crucero?.detalles?.mapa_url || null;
        }

        // ── PASO 4: sync de datos offline pendientes ────────────────────
        const pendientes = leerPendientesOffline();
        if (pendientes.length > 0) {
            await sincronizarPendientes(pendientes, viajes);
        }

        // ── PASO 5: guardar cache y renderizar ──────────────────────────
        guardarCacheLocal(viajes);
        viajesData = viajes;
        filtrarViajes();

    } catch (error) {
        console.error('Error cargando viajes:', error);
        // Si falla la red, usar cache que ya está en pantalla
        if (cached.length === 0) {
            estadoVacio.style.display = 'block';
            viajesGrid.innerHTML = '';
        }
        mostrarNotificacion('Error de conexión — mostrando datos guardados', 'warning');
    }
}

// ─── helper: agrupar array por campo ────────────────────────────────────────
function agruparPor(arr, campo) {
    return arr.reduce((acc, item) => {
        const key = item[campo];
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

// ============================================
// OFFLINE — guardar/leer datos pendientes de sync
// ============================================
const OFFLINE_PENDING_KEY = 'viajes_offline_pending';

function guardarPendienteOffline(accion, datos) {
    const pendientes = leerPendientesOffline();
    pendientes.push({
        id:        crypto.randomUUID(),
        accion,    // 'crear' | 'editar' | 'eliminar'
        datos,
        timestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_PENDING_KEY, JSON.stringify(pendientes));
    actualizarIndicadorSync();
}

function leerPendientesOffline() {
    try {
        return JSON.parse(localStorage.getItem(OFFLINE_PENDING_KEY) || '[]');
    } catch(e) { return []; }
}

function limpiarPendientesOffline() {
    localStorage.removeItem(OFFLINE_PENDING_KEY);
    actualizarIndicadorSync();
}

async function sincronizarPendientes(pendientes, viajesOnline) {
    if (!navigator.onLine || pendientes.length === 0) return;

    let sincronizados = 0;
    const errores = [];

    for (const p of pendientes) {
        try {
            if (p.accion === 'eliminar') {
                await supabaseClient.from('v3_viajes').delete().eq('id', p.datos.id);
                sincronizados++;
            }
            // 'crear' y 'editar' se manejan en sus respectivas páginas
            // aquí solo procesamos los que puede generar index.js
        } catch(e) {
            errores.push(p);
        }
    }

    if (errores.length === 0) {
        limpiarPendientesOffline();
        if (sincronizados > 0)
            mostrarNotificacion(`✅ ${sincronizados} cambio(s) sincronizado(s)`, 'success');
    } else {
        localStorage.setItem(OFFLINE_PENDING_KEY, JSON.stringify(errores));
        mostrarNotificacion(`⚠️ ${errores.length} cambio(s) no pudieron sincronizarse`, 'warning');
    }
    actualizarIndicadorSync();
}

// ── Indicador visual de pendientes offline ───────────────────────────────────
function actualizarIndicadorSync() {
    const banner  = document.getElementById('offlineBanner');
    const pending = leerPendientesOffline();

    if (!navigator.onLine) {
        banner.classList.add('show');
        banner.querySelector('p').textContent =
            pending.length > 0
                ? `📡 Offline — ${pending.length} cambio(s) pendiente(s) de sincronizar al volver a conectar`
                : '📡 Modo offline — mostrando datos guardados';
    } else if (pending.length > 0) {
        banner.classList.add('show');
        banner.querySelector('p').textContent =
            `🔄 Sincronizando ${pending.length} cambio(s)...`;
    } else {
        banner.classList.remove('show');
    }
}

// ============================================
// CARGAR VIAJES DESDE CACHE LOCAL (legacy - mantener por compatibilidad)
// ============================================
async function cargarViajesLocales() {
    return leerCacheLocal();
}

async function guardarViajeLocal(viaje) {
    const todos = leerCacheLocal();
    const idx = todos.findIndex(v => v.link_unico === viaje.link_unico);
    if (idx >= 0) todos[idx] = viaje; else todos.push(viaje);
    guardarCacheLocal(todos);
}

async function eliminarViajeLocal(linkUnico) {
    const todos = leerCacheLocal().filter(v => v.link_unico !== linkUnico);
    guardarCacheLocal(todos);
}

async function inicializarDB() { return null; } // legacy stub

// ============================================
// FILTRAR Y ORDENAR VIAJES
// ============================================
function filtrarViajes() {
    const busqueda = document.getElementById('buscarViaje').value.toLowerCase();
    const filtroEstado = document.getElementById('filtroEstado').value;
    const ordenamiento = document.getElementById('ordenar').value;

    // Filtrar
    viajesFiltrados = viajesData.filter(viaje => {
        // Búsqueda por nombre
        const coincideBusqueda = viaje.nombre.toLowerCase().includes(busqueda);

        // Filtro por estado
        let coincideEstado = true;
        if (filtroEstado !== 'todos') {
            const estado = obtenerEstadoViaje(viaje);
            coincideEstado = estado === filtroEstado;
        }

        return coincideBusqueda && coincideEstado;
    });

    // Ordenar
    viajesFiltrados.sort((a, b) => {
        switch (ordenamiento) {
            case 'fecha_desc':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'fecha_asc':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'nombre_asc':
                return a.nombre.localeCompare(b.nombre);
            case 'nombre_desc':
                return b.nombre.localeCompare(a.nombre);
            default:
                return 0;
        }
    });

    renderizarViajes();
}

// ============================================
// RENDERIZAR VIAJES
// ============================================
function renderizarViajes() {
    const viajesGrid = document.getElementById('viajesGrid');

    if (viajesFiltrados.length === 0) {
        viajesGrid.innerHTML = `
            <div class="estado-vacio" style="grid-column: 1/-1;">
                <div class="empty-icon">🔍</div>
                <h2>No se encontraron viajes</h2>
                <p>Intenta con otros términos de búsqueda o filtros</p>
            </div>
        `;
        return;
    }

    viajesGrid.innerHTML = viajesFiltrados.map(viaje => {
        const estadoRaw  = obtenerEstadoViaje(viaje);
        // Normalizar clase CSS: proximos→proximo, en_curso→en-curso, finalizados→finalizado
        const estadoMap  = { proximos: 'proximo', en_curso: 'en-curso', finalizados: 'finalizado' };
        const estado     = estadoMap[estadoRaw] || estadoRaw;

        const diasInfo   = calcularDiasInfo(viaje);
        const progreso   = calcularProgreso(viaje);
        const tipoViaje  = detectarTipoViaje(viaje);
        const totalGastos = calcularTotalGastos(viaje);
        const alerta     = verificarAlerta(viaje, estadoRaw);

        // Tipos como pills del header
        const tiposPills = tipoViaje.map(t =>
            `<span class="viaje-tipo">${t.icono} ${t.label}</span>`
        ).join('');

        // Links directos según qué tiene el viaje (Ruta va como miniatura en el header)
        let links = '';
        if (viaje.tiene_crucero) {
            links += `<a class="viaje-link" onclick="event.stopPropagation(); verSeccion('${viaje.link_unico}','crucero')">⚓ Crucero</a>`;
            links += `<a class="viaje-link" onclick="event.stopPropagation(); window.location.href='crucero/crucero.html?link=${viaje.link_unico}'">🗺️ Puertos</a>`;
        } else {
            links += `<a class="viaje-link" onclick="event.stopPropagation(); window.location.href='itinerario/itinerario.html?link=${viaje.link_unico}'">🗺️ Itinerario</a>`;
        }
        links += `<a class="viaje-link gastos" onclick="event.stopPropagation(); verSeccion('${viaje.link_unico}','gastos')">💰 Gastos</a>`;

        // Badge de estado (solo desktop, oculto en móvil por CSS)
        const estadoTextos = { proximo: '🔜 Próximo', 'en-curso': '✈️ En curso', finalizado: '✅ Finalizado' };

        return `
            <div class="viaje-card" onclick="verViaje('${viaje.link_unico}')">
                ${alerta ? `<div class="alerta-pendientes">⚠️ <strong>¡${diasInfo.numero} días!</strong> ${alerta} pendiente(s)</div>` : ''}

                <div class="viaje-header ${estado}">
                    <!-- Engranaje top-right -->
                    <button class="btn-editar" onclick="event.stopPropagation(); editarViaje('${viaje.link_unico}')" title="Editar">⚙️</button>

                    <!-- Miniatura mapa debajo del engranaje (solo si existe) -->
                    ${viaje.crucero_mapa_url ? `
                    <div class="card-mapa-thumb" onclick="event.stopPropagation(); abrirMapaViaje('${viaje.crucero_mapa_url}')" title="Ver mapa del itinerario">
                        <img src="${viaje.crucero_mapa_url}" alt="Ruta">
                        <span class="card-mapa-label">🗺 RUTA</span>
                    </div>` : ''}

                    <!-- Días — izquierda -->
                    <div class="viaje-header-dias">
                        <div class="viaje-dias-num">${diasInfo.numero}</div>
                        <div class="viaje-dias-lbl">${diasInfo.texto.replace(' ', '<br>')}</div>
                    </div>

                    <!-- Nombre / fecha / tipos / badge -->
                    <div class="viaje-header-left">
                        <div class="viaje-nombre">${viaje.nombre}</div>
                        <div class="viaje-fechas">📅 ${formatearFechaLocal(viaje.fecha_inicio)} → ${formatearFechaLocal(viaje.fecha_fin)}</div>
                        <div class="viaje-tipos">${tiposPills}</div>
                        <span class="viaje-estado-badge">${estadoTextos[estado] || ''}</span>
                    </div>
                </div>

                <div class="viaje-prog-bar">
                    <div class="viaje-prog-fill" style="width:${progreso}%"></div>
                </div>

                <div class="viaje-stats">
                    <div class="viaje-stat">
                        <span class="viaje-stat-val">🌎 ${viaje.destinos?.length || 0}</span>
                        <span class="viaje-stat-lbl">Destinos</span>
                    </div>
                    <div class="viaje-stat">
                        <span class="viaje-stat-val">👥 ${viaje.participantes_count || 0}</span>
                        <span class="viaje-stat-lbl">Personas</span>
                    </div>
                    <div class="viaje-stat">
                        <span class="viaje-stat-val">💰 $${formatearNumeroCorto(totalGastos)}</span>
                        <span class="viaje-stat-lbl">Gastos</span>
                    </div>
                </div>

                <div class="viaje-footer">
                    <div class="viaje-links">${links}</div>
                    <div class="viaje-footer-actions">
                        <button class="btn-ver" onclick="event.stopPropagation(); verViaje('${viaje.link_unico}')">Ver →</button>
                        <button class="btn-eliminar-card" onclick="event.stopPropagation(); confirmarEliminarViaje('${viaje.id}')" title="Eliminar">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FORMATEAR FECHA LOCAL (sin desfase timezone)
// ============================================
function formatearFechaLocal(fechaStr) {
    if (!fechaStr) return '';
    // Agregar tiempo para evitar desfase de timezone
    const fecha = new Date(fechaStr + 'T00:00:00');
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}-${mes}-${anio}`;
}

// ============================================
// CALCULAR TOTAL DE GASTOS EN CLP
// ============================================
function calcularTotalGastos(viaje) {
    if (!viaje.gastos || viaje.gastos.length === 0) return 0;

    // Sumar todos los gastos en CLP
    return viaje.gastos.reduce((total, gasto) => {
        return total + (parseFloat(gasto.monto_clp) || 0);
    }, 0);
}

// ============================================
// DETECTAR TIPO DE VIAJE
// ============================================
function detectarTipoViaje(viaje) {
    const tipos = [];

    // Verificar si es crucero
    if (viaje.tiene_crucero) {
        tipos.push({ tipo: 'crucero', icono: '🛳️', label: 'Crucero' });
    }

    // Detectar tipo por destinos (básico)
    if (viaje.destinos && viaje.destinos.length > 0) {
        const primerDestino = viaje.destinos[0];
        if (primerDestino && primerDestino.nombre) {
            const destino = primerDestino.nombre.toLowerCase();

            if (destino.includes('playa') || destino.includes('beach') || destino.includes('costa')) {
                tipos.push({ tipo: 'playa', icono: '🏖️', label: 'Playa' });
            } else if (destino.includes('montaña') || destino.includes('cordillera') || destino.includes('sierra')) {
                tipos.push({ tipo: 'montana', icono: '🏔️', label: 'Montaña' });
            } else if (destino.includes('aventura') || destino.includes('trek') || destino.includes('camping')) {
                tipos.push({ tipo: 'aventura', icono: '🎒', label: 'Aventura' });
            }
        }
    }

    // Si no se detectó nada específico, es ciudad por defecto
    if (tipos.length === 0) {
        tipos.push({ tipo: 'ciudad', icono: '🏙️', label: 'Ciudad' });
    }

    return tipos;
}

// ============================================
// GENERAR BADGES DE TIPO
// ============================================
function generarBadgesTipo(tipos) {
    if (!tipos || tipos.length === 0) return '';

    return `
        <div class="viaje-badges">
            ${tipos.map(t => `
                <span class="tipo-badge badge-${t.tipo}">
                    ${t.icono} ${t.label}
                </span>
            `).join('')}
        </div>
    `;
}

// ============================================
// OBTENER ESTADO DE TRANSPORTES
// ============================================
function obtenerTransportesEstado(viaje) {
    if (!viaje.transportes || viaje.transportes.length === 0) return [];

    const iconos = {
        'avion': '✈️',
        'crucero': '🛳️',
        'auto': '🚗',
        'bus': '🚌',
        'tren': '🚂'
    };

    const documentosSubidos = viaje.documentos_count || 0;

    return viaje.transportes.map((t, index) => ({
        tipo: t.tipo,
        icono: iconos[t.tipo] || '🚗',
        documentoSubido: index < documentosSubidos // Simplificación: asume documentos en orden
    }));
}

// ============================================
// VERIFICAR ALERTA DE PENDIENTES
// ============================================
function verificarAlerta(viaje, estado) {
    if (estado !== 'proximos') return null;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaInicio = new Date(viaje.fecha_inicio + 'T00:00:00');
    const diasRestantes = Math.ceil((fechaInicio - hoy) / (1000 * 60 * 60 * 24));

    if (diasRestantes > 7) return null;

    // Contar pendientes
    let pendientes = 0;
    const transportes = viaje.transportes?.length || 0;
    const documentos = viaje.documentos_count || 0;

    if (transportes > documentos) {
        pendientes = transportes - documentos;
    }

    return pendientes > 0 ? pendientes : null;
}

// ============================================
// OBTENER ESTADO DEL VIAJE
// ============================================
function obtenerEstadoViaje(viaje) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaInicio = new Date(viaje.fecha_inicio + 'T00:00:00');
    const fechaFin = new Date(viaje.fecha_fin + 'T00:00:00');

    if (hoy < fechaInicio) {
        return 'proximos';
    } else if (hoy >= fechaInicio && hoy <= fechaFin) {
        return 'en_curso';
    } else {
        return 'finalizados';
    }
}

function obtenerClaseBadge(estado) {
    switch (estado) {
        case 'proximos':
            return 'badge-proximo';
        case 'en_curso':
            return 'badge-en-curso';
        case 'finalizados':
            return 'badge-finalizado';
        default:
            return '';
    }
}

function obtenerTextoEstado(estado) {
    switch (estado) {
        case 'proximos':
            return '🔜 Próximo';
        case 'en_curso':
            return '✈️ En Curso';
        case 'finalizados':
            return '✅ Finalizado';
        default:
            return '';
    }
}

// ============================================
// CALCULAR DÍAS INFO
// ============================================
function calcularDiasInfo(viaje) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaInicio = new Date(viaje.fecha_inicio + 'T00:00:00');
    const fechaFin = new Date(viaje.fecha_fin + 'T00:00:00');

    const estado = obtenerEstadoViaje(viaje);

    if (estado === 'proximos') {
        const dias = Math.ceil((fechaInicio - hoy) / (1000 * 60 * 60 * 24));
        return {
            numero: dias,
            texto: dias === 1 ? 'día para el viaje' : 'días para el viaje'
        };
    } else if (estado === 'en_curso') {
        const dias = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));
        return {
            numero: dias,
            texto: dias === 1 ? 'día restante' : 'días restantes'
        };
    } else {
        const dias = Math.ceil((hoy - fechaFin) / (1000 * 60 * 60 * 24));
        return {
            numero: dias,
            texto: dias === 1 ? 'día desde que finalizó' : 'días desde que finalizó'
        };
    }
}

// ============================================
// CALCULAR PROGRESO DEL VIAJE
// ============================================
function calcularProgreso(viaje) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fechaInicio = new Date(viaje.fecha_inicio + 'T00:00:00');
    const fechaFin = new Date(viaje.fecha_fin + 'T00:00:00');

    const estado = obtenerEstadoViaje(viaje);

    if (estado === 'proximos') {
        return 0;
    } else if (estado === 'finalizados') {
        return 100;
    } else {
        const duracionTotal = fechaFin - fechaInicio;
        const transcurrido = hoy - fechaInicio;
        const progreso = Math.round((transcurrido / duracionTotal) * 100);
        return Math.min(Math.max(progreso, 0), 100);
    }
}

// ============================================
// LIGHTBOX MAPA CRUCERO
// ============================================
function abrirMapaViaje(url) {
    document.getElementById('lightboxMapaImg').src = url;
    document.getElementById('lightboxMapaIndex').classList.add('show');
}

function cerrarMapaViaje() {
    document.getElementById('lightboxMapaIndex').classList.remove('show');
    document.getElementById('lightboxMapaImg').src = '';
}

// ============================================
// VER VIAJE
// ============================================
function verViaje(linkUnico) {
    window.location.href = `dashboard/dashboard.html?link=${linkUnico}`;
}

// Navegar directo a una sección del dashboard
function verSeccion(linkUnico, seccion) {
    window.location.href = `dashboard/dashboard.html?link=${linkUnico}&seccion=${seccion}`;
}

// Formatear número corto (2400000 → $2.4M, 890000 → $890K)
function formatearNumeroCorto(n) {
    if (!n || n === 0) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(0) + 'K';
    return formatearNumero(n);
}

// ============================================
// EDITAR VIAJE
// ============================================
function editarViaje(linkUnico) {
    event.stopPropagation();
    window.location.href = `wizard/wizard.html?link=${linkUnico}`;
}

// ============================================
// CONFIRMAR ELIMINAR VIAJE
// ============================================
function confirmarEliminarViaje(viajeId) {
    event.stopPropagation();
    viajeEliminarId = viajeId;
    document.getElementById('modalEliminar').classList.add('active');
}

// ============================================
// ELIMINAR VIAJE
// ============================================
async function eliminarViaje() {
    if (!viajeEliminarId) return;

    const modal       = document.getElementById('modalEliminar');
    const btnConfirmar = document.getElementById('btnConfirmarEliminar');
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Eliminando...';

    try {
        if (navigator.onLine) {
            const { error } = await supabaseClient
                .from('v3_viajes')
                .delete()
                .eq('id', viajeEliminarId);
            if (error) throw error;
        } else {
            // Sin red: encolar para sync posterior
            const viaje = viajesData.find(v => v.id === viajeEliminarId);
            guardarPendienteOffline('eliminar', { id: viajeEliminarId, link_unico: viaje?.link_unico });
            mostrarNotificacion('Sin conexión — eliminación registrada, se sincronizará al conectar', 'warning');
        }

        // Quitar del cache local y de la vista inmediatamente
        const viaje = viajesData.find(v => v.id === viajeEliminarId);
        if (viaje) await eliminarViajeLocal(viaje.link_unico);
        viajesData = viajesData.filter(v => v.id !== viajeEliminarId);
        viajesFiltrados = viajesFiltrados.filter(v => v.id !== viajeEliminarId);

        modal.classList.remove('active');
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Eliminar';

        if (navigator.onLine) mostrarNotificacion('Viaje eliminado correctamente', 'success');

        // Re-renderizar sin recargar toda la red
        if (viajesData.length === 0) {
            document.getElementById('estadoVacio').style.display = 'block';
            document.getElementById('viajesGrid').innerHTML = '';
        } else {
            filtrarViajes();
        }

    } catch (error) {
        console.error('Error eliminando viaje:', error);
        mostrarNotificacion('Error al eliminar el viaje', 'error');
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Eliminar';
    }
}

// fin index.js
