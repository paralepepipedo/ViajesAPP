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
    // Búsqueda
    const inputBuscar = document.getElementById('buscarViaje');
    inputBuscar.addEventListener('input', (e) => {
        filtrarViajes();
    });

    // Filtros
    const filtroEstado = document.getElementById('filtroEstado');
    filtroEstado.addEventListener('change', () => {
        filtrarViajes();
    });

    const ordenar = document.getElementById('ordenar');
    ordenar.addEventListener('change', () => {
        filtrarViajes();
    });

    // Modal eliminar
    const modalEliminar = document.getElementById('modalEliminar');
    const closeModalEliminar = document.getElementById('closeModalEliminar');
    const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
    const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');

    closeModalEliminar.addEventListener('click', () => {
        modalEliminar.classList.remove('active');
    });

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
}

// ============================================
// VERIFICAR ESTADO DE CONEXIÓN
// ============================================
function verificarEstadoConexion() {
    const banner = document.getElementById('offlineBanner');

    if (!navigator.onLine) {
        banner.classList.add('show');
    }

    window.addEventListener('offline', () => {
        banner.classList.add('show');
    });

    window.addEventListener('online', () => {
        banner.classList.remove('show');
        // Recargar viajes al recuperar conexión
        cargarViajes();
    });
}

// ============================================
// CARGAR VIAJES
// ============================================
async function cargarViajes() {
    const loadingViajes = document.getElementById('loadingViajes');
    const viajesGrid = document.getElementById('viajesGrid');
    const estadoVacio = document.getElementById('estadoVacio');

    loadingViajes.style.display = 'block';
    viajesGrid.innerHTML = '';
    estadoVacio.style.display = 'none';

    try {
        // Intentar cargar desde Supabase
        if (navigator.onLine) {
            // Cargar viajes
            const { data: viajes, error: errorViajes } = await supabaseClient
                .from('v3_viajes')
                .select('*')
                .order('created_at', { ascending: false });

            if (errorViajes) throw errorViajes;

            // Para cada viaje, cargar datos relacionados
            for (let viaje of viajes) {
                // Cargar destinos
                const { data: destinos } = await supabaseClient
                    .from('v3_destinos')
                    .select('*')
                    .eq('viaje_id', viaje.id);

                viaje.destinos = destinos || [];

                // Cargar participantes (solo count)
                const { count: countParticipantes } = await supabaseClient
                    .from('v3_participantes')
                    .select('*', { count: 'exact', head: true })
                    .eq('viaje_id', viaje.id);

                viaje.participantes_count = countParticipantes || 0;

                // Cargar gastos
                const { data: gastos } = await supabaseClient
                    .from('v3_gastos')
                    .select('monto_clp')
                    .eq('viaje_id', viaje.id);

                viaje.gastos = gastos || [];

                // Cargar transportes
                const { data: transportes } = await supabaseClient
                    .from('v3_transportes')
                    .select('tipo')
                    .eq('viaje_id', viaje.id);

                viaje.transportes = transportes || [];

                // Cargar documentos (solo count)
                const { count: countDocumentos } = await supabaseClient
                    .from('v3_documentos')
                    .select('*', { count: 'exact', head: true })
                    .eq('viaje_id', viaje.id);

                viaje.documentos_count = countDocumentos || 0;
            }

            // Guardar en cache local
            for (const viaje of viajes) {
                await guardarViajeLocal(viaje);
            }

            viajesData = viajes;
        } else {
            // Cargar desde cache local si estamos offline
            viajesData = await cargarViajesLocales();
        }

        loadingViajes.style.display = 'none';

        if (viajesData.length === 0) {
            estadoVacio.style.display = 'block';
        } else {
            filtrarViajes();
        }

    } catch (error) {
        console.error('Error cargando viajes:', error);
        loadingViajes.style.display = 'none';

        // Intentar cargar desde cache local
        viajesData = await cargarViajesLocales();

        if (viajesData.length === 0) {
            estadoVacio.style.display = 'block';
        } else {
            filtrarViajes();
            mostrarNotificacion('Cargando viajes desde cache local', 'info');
        }
    }
}

// ============================================
// CARGAR VIAJES DESDE CACHE LOCAL
// ============================================
async function cargarViajesLocales() {
    try {
        const db = await inicializarDB();
        const transaction = db.transaction(['viajes_cache'], 'readonly');
        const store = transaction.objectStore('viajes_cache');

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error cargando viajes locales:', error);
        return [];
    }
}

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
        const estado = obtenerEstadoViaje(viaje);
        const diasInfo = calcularDiasInfo(viaje);
        const progreso = calcularProgreso(viaje);
        const tipoViaje = detectarTipoViaje(viaje);
        const totalGastosClp = calcularTotalGastos(viaje);
        const transportesEstado = obtenerTransportesEstado(viaje);
        const alerta = verificarAlerta(viaje, estado);

        return `
            <div class="viaje-card" data-viaje-id="${viaje.id}">
                <div class="viaje-header">
                    <button class="btn-editar" onclick="editarViaje('${viaje.link_unico}')" title="Editar viaje">
                        ⚙️
                    </button>
                    <h3>${viaje.nombre}</h3>
                    <div class="viaje-fechas">
                        📅 ${formatearFechaLocal(viaje.fecha_inicio)} - ${formatearFechaLocal(viaje.fecha_fin)}
                    </div>
                </div>
                
                <div class="viaje-body">
                    ${generarBadgesTipo(tipoViaje)}
                    
                    ${alerta ? `
                    <div class="alerta-pendientes">
                        ⚠️ <strong>¡Faltan ${diasInfo.numero} días!</strong> Hay ${alerta} pendiente(s)
                    </div>
                    ` : ''}
                    
                    <div class="viaje-estado">
                        <div class="estado-info">
                            <span class="estado-badge ${obtenerClaseBadge(estado)}">
                                ${obtenerTextoEstado(estado)}
                            </span>
                        </div>
                        <div class="dias-container">
                            <div class="dias-restantes">${diasInfo.numero}</div>
                            <div class="dias-label">${diasInfo.texto}</div>
                        </div>
                    </div>
                    
                    <div class="viaje-info">
                        <div class="info-item">
                            <span class="info-label">Destinos</span>
                            <span class="info-value">
                                🌎 ${viaje.destinos?.length || 0}
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Participantes</span>
                            <span class="info-value">
                                👥 ${viaje.participantes_count || 0}
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Gastos totales</span>
                            <span class="info-value">
                                💰 $${formatearNumero(totalGastosClp)}
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Duración</span>
                            <span class="info-value">
                                ⏱️ ${calcularDias(viaje.fecha_inicio, viaje.fecha_fin)} días
                            </span>
                        </div>
                    </div>
                    
                    ${transportesEstado.length > 0 ? `
                    <div class="transportes-estado">
                        ${transportesEstado.map(t => `
                            <span class="transporte-icon-estado ${t.documentoSubido ? 'completo' : 'pendiente'}" 
                                  title="${t.tipo}: ${t.documentoSubido ? 'Documento subido' : 'Documento pendiente'}">
                                ${t.icono}
                            </span>
                        `).join('')}
                    </div>
                    ` : ''}
                    
                    <div class="viaje-progress">
                        <div class="progress-label">
                            <span>Progreso del viaje</span>
                            <span><strong>${progreso}%</strong></span>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${progreso}%"></div>
                        </div>
                    </div>
                </div>
                
                <div class="viaje-footer">
                    <button class="btn-ver" onclick="verViaje('${viaje.link_unico}')">
                        Ver Detalles →
                    </button>
                    <button class="btn-eliminar-card" onclick="confirmarEliminarViaje('${viaje.id}')" title="Eliminar viaje">
                        🗑️
                    </button>
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
// VER VIAJE
// ============================================
function verViaje(linkUnico) {
    window.location.href = `dashboard/dashboard.html?link=${linkUnico}`;
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

    try {
        const modal = document.getElementById('modalEliminar');
        const btnConfirmar = document.getElementById('btnConfirmarEliminar');
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Eliminando...';

        const { error } = await supabaseClient
            .from('v3_viajes')
            .delete()
            .eq('id', viajeEliminarId);

        if (error) throw error;

        const viaje = viajesData.find(v => v.id === viajeEliminarId);
        if (viaje) {
            await eliminarViajeLocal(viaje.link_unico);
        }

        modal.classList.remove('active');
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Eliminar';

        mostrarNotificacion('Viaje eliminado correctamente', 'success');
        await cargarViajes();

    } catch (error) {
        console.error('Error eliminando viaje:', error);
        mostrarNotificacion('Error al eliminar el viaje', 'error');

        const modal = document.getElementById('modalEliminar');
        const btnConfirmar = document.getElementById('btnConfirmarEliminar');
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Eliminar';
    }
}

// ============================================
// ELIMINAR VIAJE DE CACHE LOCAL
// ============================================
async function eliminarViajeLocal(linkUnico) {
    try {
        const db = await inicializarDB();
        const transaction = db.transaction(['viajes_cache'], 'readwrite');
        const store = transaction.objectStore('viajes_cache');

        return new Promise((resolve, reject) => {
            const request = store.delete(linkUnico);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error eliminando viaje local:', error);
    }
}
