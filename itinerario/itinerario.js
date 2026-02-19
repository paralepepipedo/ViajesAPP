// ============================================
// VARIABLES GLOBALES
// ============================================
let viajeData = null;
let linkViaje = null;
let actividadesData = [];
let destinosData = [];
let actividadEditandoId = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    linkViaje = obtenerParametroURL('link');

    if (!linkViaje) {
        mostrarNotificacion('No se especificó un viaje', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);
        return;
    }

    inicializarEventos();
    verificarEstadoConexion();
    await cargarDatosViaje();
    await cargarDestinos();
    await cargarActividades();
});

// ============================================
// INICIALIZAR EVENTOS
// ============================================
function inicializarEventos() {
    // Botones nueva actividad
    const btnNuevoDesktop = document.getElementById('btnNuevaActividadDesktop');
    if (btnNuevoDesktop) {
        btnNuevoDesktop.addEventListener('click', () => abrirModalActividad());
    }

    const btnNuevoMobile = document.getElementById('btnNuevaActividadMobile');
    if (btnNuevoMobile) {
        btnNuevoMobile.addEventListener('click', () => abrirModalActividad());
    }

    // Filtros
    const filtroFecha = document.getElementById('filtroFecha');
    if (filtroFecha) filtroFecha.addEventListener('change', filtrarActividades);

    const filtroDestino = document.getElementById('filtroDestino');
    if (filtroDestino) filtroDestino.addEventListener('change', filtrarActividades);

    const filtroCategoria = document.getElementById('filtroCategoria');
    if (filtroCategoria) filtroCategoria.addEventListener('change', filtrarActividades);

    // Modal actividad
    const closeModalActividad = document.getElementById('closeModalActividad');
    if (closeModalActividad) closeModalActividad.addEventListener('click', cerrarModalActividad);

    const btnCancelarActividad = document.getElementById('btnCancelarActividad');
    if (btnCancelarActividad) btnCancelarActividad.addEventListener('click', cerrarModalActividad);

    const formActividad = document.getElementById('formActividad');
    if (formActividad) formActividad.addEventListener('submit', guardarActividad);

    // Modal eliminar
    const closeModalEliminar = document.getElementById('closeModalEliminar');
    if (closeModalEliminar) closeModalEliminar.addEventListener('click', cerrarModalEliminar);

    const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
    if (btnCancelarEliminar) btnCancelarEliminar.addEventListener('click', cerrarModalEliminar);

    const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');
    if (btnConfirmarEliminar) btnConfirmarEliminar.addEventListener('click', confirmarEliminarActividad);

    // Cerrar modales al hacer click fuera
    const modalActividad = document.getElementById('modalActividad');
    if (modalActividad) {
        modalActividad.addEventListener('click', (e) => {
            if (e.target.id === 'modalActividad') cerrarModalActividad();
        });
    }

    const modalEliminar = document.getElementById('modalEliminar');
    if (modalEliminar) {
        modalEliminar.addEventListener('click', (e) => {
            if (e.target.id === 'modalEliminar') cerrarModalEliminar();
        });
    }
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
        cargarActividades();
    });
}

// ============================================
// CARGAR DATOS DEL VIAJE
// ============================================
// ============================================
// CARGAR DATOS DEL VIAJE
// ============================================
async function cargarDatosViaje() {
    try {
        const { data: viaje, error } = await supabaseClient
            .from('v3_viajes')
            .select('*')
            .eq('link_unico', linkViaje)
            .single();

        if (error) throw error;

        viajeData = viaje;
        // LÍNEA ELIMINADA: document.getElementById('viajeNombre').textContent = viaje.nombre;

        // Ya no necesitamos actualizar links manualmente, el header lo hace

    } catch (error) {
        console.error('Error cargando datos del viaje:', error);
        mostrarNotificacion('Error cargando datos del viaje', 'error');
    }
}


// ============================================
// CARGAR DESTINOS
// ============================================
async function cargarDestinos() {
    try {
        const { data, error } = await supabaseClient
            .from('v3_destinos')
            .select('*')
            .eq('viaje_id', viajeData.id)
            .order('orden');

        if (error) throw error;

        destinosData = data || [];

        // Llenar selectores
        llenarSelectoresDestinos();
        llenarSelectoresMonedas();

    } catch (error) {
        console.error('Error cargando destinos:', error);
    }
}

// ============================================
// LLENAR SELECTORES DE DESTINOS
// ============================================
function llenarSelectoresDestinos() {
    // Selector en formulario
    const selectDestino = document.getElementById('actividadDestino');
    selectDestino.innerHTML = '<option value="">Sin destino específico</option>';
    selectDestino.innerHTML += destinosData.map(d =>
        `<option value="${d.id}">${d.nombre}</option>`
    ).join('');

    // Filtro de destinos
    const filtroDestino = document.getElementById('filtroDestino');
    filtroDestino.innerHTML = '<option value="todos">Todos los destinos</option>';
    filtroDestino.innerHTML += destinosData.map(d =>
        `<option value="${d.id}">${d.nombre}</option>`
    ).join('');
}

// ============================================
// LLENAR SELECTORES DE MONEDAS
// ============================================
function llenarSelectoresMonedas() {
    const selectMoneda = document.getElementById('actividadMoneda');

    // Obtener monedas únicas de destinos
    const monedasUnicas = new Set();

    // Siempre agregar CLP primero
    monedasUnicas.add('CLP');

    // Agregar monedas de destinos
    destinosData.forEach(d => {
        if (d.moneda_codigo) {
            monedasUnicas.add(d.moneda_codigo);
        }
    });

    // Crear opciones
    let options = '';
    monedasUnicas.forEach(moneda => {
        options += `<option value="${moneda}">${moneda}</option>`;
    });

    selectMoneda.innerHTML = options;

    // Seleccionar la moneda del primer destino por defecto
    if (destinosData.length > 0 && destinosData[0].moneda_codigo) {
        selectMoneda.value = destinosData[0].moneda_codigo;
    }
}

// ============================================
// CARGAR ACTIVIDADES
// ============================================
async function cargarActividades() {
    const loadingItinerario = document.getElementById('loadingItinerario');
    const itinerarioLista = document.getElementById('itinerarioLista');
    const estadoVacio = document.getElementById('estadoVacio');

    loadingItinerario.style.display = 'block';
    itinerarioLista.innerHTML = '';
    estadoVacio.style.display = 'none';

    try {
        const { data: actividades, error } = await supabaseClient
            .from('v3_itinerario')
            .select('*')
            .eq('viaje_id', viajeData.id)
            .order('fecha', { ascending: true })
            .order('hora_inicio', { ascending: true });

        if (error) throw error;

        actividadesData = actividades || [];

        loadingItinerario.style.display = 'none';

        if (actividadesData.length === 0) {
            estadoVacio.style.display = 'block';
        } else {
            filtrarActividades();
        }

    } catch (error) {
        console.error('Error cargando actividades:', error);
        loadingItinerario.style.display = 'none';
        estadoVacio.style.display = 'block';
        mostrarNotificacion('Error cargando actividades', 'error');
    }
}

// ============================================
// FILTRAR ACTIVIDADES
// ============================================
function filtrarActividades() {
    const fecha = document.getElementById('filtroFecha').value;
    const destino = document.getElementById('filtroDestino').value;
    const categoria = document.getElementById('filtroCategoria').value;

    const actividadesFiltradas = actividadesData.filter(act => {
        const coincideFecha = !fecha || act.fecha === fecha;
        const coincideDestino = destino === 'todos' || act.destino_id === destino;
        const coincideCategoria = categoria === 'todas' || act.categoria === categoria;

        return coincideFecha && coincideDestino && coincideCategoria;
    });

    renderizarActividades(actividadesFiltradas);
}

// ============================================
// RENDERIZAR ACTIVIDADES
// ============================================
function renderizarActividades(actividades) {
    const itinerarioLista = document.getElementById('itinerarioLista');
    const estadoVacio = document.getElementById('estadoVacio');

    if (actividades.length === 0) {
        itinerarioLista.innerHTML = '';
        if (actividadesData.length === 0) {
            estadoVacio.style.display = 'block';
        } else {
            itinerarioLista.innerHTML = `
                <div class="estado-vacio">
                    <div class="empty-icon">🔍</div>
                    <h2>No se encontraron actividades</h2>
                    <p>Intenta con otros filtros de búsqueda</p>
                </div>
            `;
        }
        return;
    }

    estadoVacio.style.display = 'none';

    // Agrupar actividades por fecha
    const actividadesPorFecha = {};
    actividades.forEach(act => {
        if (!actividadesPorFecha[act.fecha]) {
            actividadesPorFecha[act.fecha] = [];
        }
        actividadesPorFecha[act.fecha].push(act);
    });

    // Ordenar fechas
    const fechasOrdenadas = Object.keys(actividadesPorFecha).sort();

    // Construir HTML
    let html = '';
    fechasOrdenadas.forEach(fecha => {
        const actividadesDia = actividadesPorFecha[fecha];
        const totalCosto = actividadesDia.reduce((sum, act) => {
            return sum + parseFloat(act.costo_estimado || 0);
        }, 0);

        html += `
            <div class="dia-container">
                <div class="dia-header" onclick="toggleDia(this)">
                    <div class="dia-info">
                        <h3>${formatearFechaCompleta(fecha)}</h3>
                        <p>${obtenerDiaSemana(fecha)}</p>
                    </div>
                    <div class="dia-stats">
                        <div class="stat-item">
                            <span>📍</span>
                            <span>${actividadesDia.length} actividad${actividadesDia.length !== 1 ? 'es' : ''}</span>
                        </div>
                        ${totalCosto > 0 ? `
                            <div class="stat-item">
                                <span>💰</span>
                                <span>${formatearNumero(totalCosto)}</span>
                            </div>
                        ` : ''}
                        <span class="collapse-icon">▼</span>
                    </div>
                </div>
                <div class="actividades-container">
                    ${actividadesDia.map(act => renderizarActividadCard(act)).join('')}
                </div>
            </div>
        `;
    });

    itinerarioLista.innerHTML = html;
}

// ============================================
// RENDERIZAR TARJETA DE ACTIVIDAD
// ============================================
function renderizarActividadCard(actividad) {
    const destino = destinosData.find(d => d.id === actividad.destino_id);
    const categoriaClase = actividad.categoria
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Calcular costo en moneda original y en CLP
    let bloqueCosto = '';
    if (actividad.costo_estimado && parseFloat(actividad.costo_estimado) > 0) {
        const costo = parseFloat(actividad.costo_estimado);
        const moneda = actividad.costo_moneda || 'CLP';

        let textoPrincipal = `${moneda} ${formatearNumero(costo)}`;
        let textoClp = '';

        // Si ya es CLP, solo mostramos CLP
        if (moneda === 'CLP') {
            textoClp = `$${formatearNumero(costo)} CLP`;
        } else {
            // Buscar destino con esa moneda para tipo de cambio
            const destinoMoneda = destinosData.find(d => d.moneda_codigo === moneda);
            if (destinoMoneda && destinoMoneda.tipo_cambio_clp) {
                const costoClp = costo * destinoMoneda.tipo_cambio_clp;
                textoClp = `$${formatearNumero(costoClp)} CLP`;
            }
        }

        bloqueCosto = `
            <div class="meta-item">
                <span class="actividad-costo">
                    💰 ${textoPrincipal}
                </span>
                ${textoClp ? `
                    <span class="actividad-costo-secundario">
                        (${textoClp})
                    </span>
                ` : ''}
            </div>
        `;
    }

    return `
        <div class="actividad-card categoria-${categoriaClase}">
            ${actividad.hora_inicio ? `
                <div class="actividad-hora">
                    <div class="hora-inicio">${formatearHora(actividad.hora_inicio)}</div>
                    ${actividad.hora_fin ? `
                        <div class="hora-separador">→</div>
                        <div class="hora-fin">${formatearHora(actividad.hora_fin)}</div>
                    ` : ''}
                </div>
            ` : ''}

            <div class="actividad-info">
                <span class="actividad-categoria">
                    ${obtenerIconoCategoria(actividad.categoria)} ${actividad.categoria}
                </span>
                <h4 class="actividad-titulo">${actividad.titulo}</h4>

                ${actividad.descripcion ? `
                    <p class="actividad-descripcion">${actividad.descripcion}</p>
                ` : ''}

                <div class="actividad-meta">
                    ${destino ? `
                        <div class="meta-item">
                            <span>📍</span>
                            <span>${destino.nombre}</span>
                        </div>
                    ` : ''}

                    ${bloqueCosto}
                </div>
            </div>

            <div class="actividad-acciones">
                <button class="btn-icon edit" onclick="editarActividad('${actividad.id}')" title="Editar">
                    ✏️
                </button>
                <button class="btn-icon delete" onclick="eliminarActividad('${actividad.id}')" title="Eliminar">
                    🗑️
                </button>
            </div>
        </div>
    `;
}



// ============================================
// TOGGLE DÍA (EXPANDIR/COLAPSAR)
// ============================================
function toggleDia(header) {
    header.classList.toggle('collapsed');
    const container = header.nextElementSibling;
    container.classList.toggle('collapsed');
}

// ============================================
// ABRIR MODAL ACTIVIDAD
// ============================================
function abrirModalActividad(actividadId = null) {
    const modal = document.getElementById('modalActividad');
    const titulo = document.getElementById('modalActividadTitulo');
    const form = document.getElementById('formActividad');

    form.reset();
    actividadEditandoId = actividadId;

    if (actividadId) {
        titulo.textContent = 'Editar Actividad';
        cargarDatosActividad(actividadId);
    } else {
        titulo.textContent = 'Agregar Actividad';

        // Fecha actual por defecto
        document.getElementById('actividadFecha').valueAsDate = new Date();

        // Moneda del primer destino por defecto
        if (destinosData.length > 0 && destinosData[0].moneda_codigo) {
            document.getElementById('actividadMoneda').value = destinosData[0].moneda_codigo;
        }
    }

    modal.classList.add('active');
}

// ============================================
// CARGAR DATOS DE ACTIVIDAD PARA EDITAR
// ============================================
function cargarDatosActividad(actividadId) {
    const actividad = actividadesData.find(a => a.id === actividadId);
    if (!actividad) return;

    document.getElementById('actividadTitulo').value = actividad.titulo;
    document.getElementById('actividadFecha').value = actividad.fecha;
    document.getElementById('actividadCategoria').value = actividad.categoria;
    document.getElementById('actividadHoraInicio').value = actividad.hora_inicio || '';
    document.getElementById('actividadHoraFin').value = actividad.hora_fin || '';
    document.getElementById('actividadDestino').value = actividad.destino_id || '';
    document.getElementById('actividadCosto').value = actividad.costo_estimado || '';
    document.getElementById('actividadMoneda').value = actividad.costo_moneda || 'CLP';
    document.getElementById('actividadDescripcion').value = actividad.descripcion || '';
}

// ============================================
// CERRAR MODAL ACTIVIDAD
// ============================================
function cerrarModalActividad() {
    document.getElementById('modalActividad').classList.remove('active');
    actividadEditandoId = null;
}

// ============================================
// GUARDAR ACTIVIDAD
// ============================================
async function guardarActividad(e) {
    e.preventDefault();

    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');

    try {
        const actividadData = {
            viaje_id: viajeData.id,
            titulo: document.getElementById('actividadTitulo').value.trim(),
            fecha: document.getElementById('actividadFecha').value,
            categoria: document.getElementById('actividadCategoria').value,
            hora_inicio: document.getElementById('actividadHoraInicio').value || null,
            hora_fin: document.getElementById('actividadHoraFin').value || null,
            destino_id: document.getElementById('actividadDestino').value || null,
            costo_estimado: parseFloat(document.getElementById('actividadCosto').value) || null,
            costo_moneda: document.getElementById('actividadMoneda').value,
            descripcion: document.getElementById('actividadDescripcion').value.trim() || null,
            vinculado_crucero: false
        };

        if (actividadEditandoId) {
            // Actualizar actividad existente
            const { error } = await supabaseClient
                .from('v3_itinerario')
                .update(actividadData)
                .eq('id', actividadEditandoId);

            if (error) throw error;

            mostrarNotificacion('Actividad actualizada correctamente', 'success');
        } else {
            // Crear nueva actividad
            const { error } = await supabaseClient
                .from('v3_itinerario')
                .insert(actividadData);

            if (error) throw error;

            mostrarNotificacion('Actividad creada correctamente', 'success');
        }

        loadingOverlay.classList.remove('active');
        cerrarModalActividad();
        await cargarActividades();

    } catch (error) {
        console.error('Error guardando actividad:', error);
        loadingOverlay.classList.remove('active');
        mostrarNotificacion('Error al guardar la actividad', 'error');
    }
}

// ============================================
// EDITAR ACTIVIDAD
// ============================================
function editarActividad(actividadId) {
    abrirModalActividad(actividadId);
}

// ============================================
// ELIMINAR ACTIVIDAD
// ============================================
let actividadEliminarId = null;

function eliminarActividad(actividadId) {
    actividadEliminarId = actividadId;
    document.getElementById('modalEliminar').classList.add('active');
}

function cerrarModalEliminar() {
    document.getElementById('modalEliminar').classList.remove('active');
    actividadEliminarId = null;
}

async function confirmarEliminarActividad() {
    if (!actividadEliminarId) return;

    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');

    try {
        const { error } = await supabaseClient
            .from('v3_itinerario')
            .delete()
            .eq('id', actividadEliminarId);

        if (error) throw error;

        loadingOverlay.classList.remove('active');
        cerrarModalEliminar();
        mostrarNotificacion('Actividad eliminada correctamente', 'success');
        await cargarActividades();

    } catch (error) {
        console.error('Error eliminando actividad:', error);
        loadingOverlay.classList.remove('active');
        mostrarNotificacion('Error al eliminar la actividad', 'error');
    }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function obtenerIconoCategoria(categoria) {
    const iconos = {
        'Transporte': '🚗',
        'Alojamiento': '🏨',
        'Comida': '🍽️',
        'Tour': '🎯',
        'Actividad': '🎭',
        'Compras': '🛍️',
        'Otro': '📌'
    };
    return iconos[categoria] || '📌';
}

function formatearFechaCompleta(fechaStr) {
    if (!fechaStr) return '';

    const fecha = new Date(fechaStr + 'T00:00:00');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const dia = fecha.getDate();
    const mes = meses[fecha.getMonth()];
    const anio = fecha.getFullYear();

    return `${dia} de ${mes}, ${anio}`;
}

function obtenerDiaSemana(fechaStr) {
    if (!fechaStr) return '';

    const fecha = new Date(fechaStr + 'T00:00:00');
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    return dias[fecha.getDay()];
}

function formatearHora(horaStr) {
    if (!horaStr) return '';

    const [horas, minutos] = horaStr.split(':');
    return `${horas}:${minutos}`;
}

function formatearNumero(numero) {
    return parseFloat(numero).toLocaleString('es-CL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function obtenerParametroURL(parametro) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(parametro);
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const colores = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6'
    };

    Toastify({
        text: mensaje,
        duration: 3000,
        gravity: "top",
        position: "right",
        style: {
            background: colores[tipo]
        }
    }).showToast();
}

