// ============================================================
//  crucero.js  —  Módulo Crucero V3
// ============================================================

let viajeId = null;
let linkUnico = null;
let cruceroId = null;
let cruceroData = null;
let puertos = [];
let actividades = [];
let destinos = [];
let toursItinerario = [];
let editandoPuertoId = null;
let editandoActividadId = null;

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    linkUnico = obtenerParametroURL('link');
    if (!linkUnico) { mostrarError('No se especificó un viaje.'); return; }

    try {
        const { data: viaje, error } = await supabaseClient
            .from('v3_viajes')
            .select('id, nombre, tiene_crucero')
            .eq('link_unico', linkUnico)
            .single();

        if (error || !viaje) { mostrarError('Viaje no encontrado.'); return; }

        viajeId = viaje.id;
        document.title = `Crucero – ${viaje.nombre}`;

        await cargarDestinos();
        await cargarCrucero();
        inicializarEventos();

    } catch (err) {
        console.error('Error inicializando crucero:', err);
        mostrarError('Error al cargar el módulo.');
    }
});

// ================================================================
//  CARGAR DATOS
// ================================================================
async function cargarDestinos() {
    const { data } = await supabaseClient
        .from('v3_destinos').select('id, nombre')
        .eq('viaje_id', viajeId).order('orden');
    destinos = data || [];

    const sel = document.getElementById('puertoDestinoId');
    if (sel) {
        sel.innerHTML = '<option value="">Sin vincular</option>' +
            destinos.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    }
}

async function cargarCrucero() {
    const { data, error } = await supabaseClient
        .from('v3_cruceros').select('*')
        .eq('viaje_id', viajeId)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); mostrarNotificacion('Error al cargar crucero', 'error'); return; }

    if (!data || data.length === 0) {
        document.getElementById('emptyCrucero').style.display = 'block';
        document.getElementById('cruceroContent').style.display = 'none';
        return;
    }

    // Limpiar duplicados
    if (data.length > 1) {
        const sorted = data.sort((a, b) => {
            const sA = (a.nombre_barco !== 'Por definir' ? 10 : 0) + Object.keys(a.detalles || {}).length;
            const sB = (b.nombre_barco !== 'Por definir' ? 10 : 0) + Object.keys(b.detalles || {}).length;
            return sB - sA;
        });
        for (const dup of sorted.slice(1))
            await supabaseClient.from('v3_cruceros').delete().eq('id', dup.id);
        cruceroData = sorted[0]; cruceroId = sorted[0].id;
    } else {
        cruceroData = data[0]; cruceroId = data[0].id;
    }

    document.getElementById('emptyCrucero').style.display = 'none';
    document.getElementById('cruceroContent').style.display = 'block';

    renderHero();
    await cargarActividades();
    await cargarPuertos();         // ← primero carga puertos (renderPuertos se llama internamente)
    await cargarToursItinerario(); // ← ahora renderTours() ya tiene puertos disponibles
    renderInfoTab();
}

async function cargarPuertos() {
    const { data } = await supabaseClient
        .from('v3_puertos_crucero').select('*')
        .eq('crucero_id', cruceroId).order('orden');
    puertos = data || [];
    renderPuertos();
}

async function cargarActividades() {
    const { data } = await supabaseClient
        .from('v3_actividades_crucero').select('*')
        .eq('crucero_id', cruceroId)
        .order('fecha').order('hora_inicio');
    actividades = data || [];
    renderActividades();
    poblarFiltroFechas();
}

async function cargarToursItinerario() {
    if (!cruceroData) return;
    const fi = cruceroData.fecha_embarque?.substring(0, 10);
    const ff = cruceroData.fecha_desembarque?.substring(0, 10);
    if (!fi || !ff) return;

    const { data } = await supabaseClient
        .from('v3_itinerario').select('*')
        .eq('viaje_id', viajeId).eq('categoria', 'Tour')
        .gte('fecha', fi).lte('fecha', ff)
        .order('fecha').order('hora_inicio');

    toursItinerario = data || [];
    renderTours();
    renderPuertos(); // re-render puertos para actualizar tours en el timeline
}

// ================================================================
//  HELPERS DE FECHA — fix UTC
// ================================================================
function parseFechaLocal(str) {
    // Para strings tipo "2026-04-07" (date puro) evitar rollback UTC
    if (!str) return null;
    if (str.length === 10) return new Date(str + 'T12:00:00');
    return new Date(str);
}

function fechaCorta(str) {
    if (!str) return '';
    const d = parseFechaLocal(str);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function horaCorta(str) {
    if (!str) return '';
    try {
        // Supabase guarda el valor tal cual sin convertir timezone
        // → leer directamente del string sin aplicar conversión UTC
        const match = str.match(/T(\d{2}):(\d{2})/);
        if (match) return `${match[1]}:${match[2]} hrs`;
        return str;
    } catch { return str; }
}


function calcularEscala(llegada, salida) {
    if (!llegada || !salida) return null;
    const diff = new Date(salida) - new Date(llegada);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.round((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m > 0 ? ' ' + m + 'm' : ''}` : `${m}m`;
}

function toursDelPuerto(puerto) {
    const fechaRef = puerto.fecha_llegada || puerto.fecha_salida;
    if (!fechaRef) return [];

    // Convierte timestamp UTC → fecha local Chile en formato YYYY-MM-DD
    const diaRef = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(fechaRef));

    return toursItinerario.filter(t => t.fecha === diaRef);
}


function toLocalDatetime(str) {
    if (!str) return '';
    try {
        const d = new Date(str);
        const pad = n => String(n).padStart(2, '0');
        // Convertir a hora local Chile
        const local = new Date(d.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
        return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    } catch { return ''; }
}

// ================================================================
//  RENDER
// ================================================================
function renderHero() {
    if (!cruceroData) return;
    const meta = cruceroData.detalles || {};

    document.getElementById('heroBarco').textContent = cruceroData.nombre_barco || '';
    document.getElementById('heroNaviera').textContent = cruceroData.naviera || '';

    const cabina = cruceroData.numero_cabina
        ? `🛏️ Cabina ${cruceroData.numero_cabina}${meta.deck ? ' · ' + meta.deck : ''}`
        : '🛏️ Cabina no especificada';
    document.getElementById('heroCabina').textContent = cabina;

    const fi = cruceroData.fecha_embarque ? fechaCorta(cruceroData.fecha_embarque) : '—';
    const ff = cruceroData.fecha_desembarque ? fechaCorta(cruceroData.fecha_desembarque) : '—';
    document.getElementById('heroFechas').textContent = `📅 ${fi} → ${ff}`;

    if (cruceroData.fecha_embarque && cruceroData.fecha_desembarque) {
        const diff = Math.round(
            (new Date(cruceroData.fecha_desembarque) - new Date(cruceroData.fecha_embarque)) / 86400000
        );
        document.getElementById('heroNoches').textContent = `🌙 ${diff} noche${diff !== 1 ? 's' : ''}`;
    }
}

function renderPuertos() {
    const container = document.getElementById('puertosTimeline');
    if (puertos.length === 0) {
        container.innerHTML = '<div class="empty-tab">No hay puertos registrados aún.<br>Agrega el primero con el botón de arriba.</div>';
        return;
    }

    container.innerHTML = puertos.map((p, i) => {
        const esUltimo = i === puertos.length - 1;
        const tipo = p.tipo_parada || 'escala';

        // Dot color según tipo
        const dotColor = tipo === 'salida' ? 'dot-salida' : tipo === 'llegada' ? 'dot-llegada' : 'dot-escala';

        // Badge tipo
        const badgeMap = {
            salida: '<span class="puerto-badge badge-salida">⚓ Puerto Inicial</span>',
            llegada: '<span class="puerto-badge badge-llegada">⚓ Puerto Final</span>',
            escala: ''
        };
        const badge = badgeMap[tipo] || '';

        // Horarios según tipo
        let horarios = '';
        if (tipo === 'salida') {
            horarios = p.fecha_salida
                ? `<span class="ph-item">⬆️ <strong>Salida</strong> ${horaCorta(p.fecha_salida)}</span>`
                : '';
        } else if (tipo === 'llegada') {
            horarios = p.fecha_llegada
                ? `<span class="ph-item">⬇️ <strong>Llegada</strong> ${horaCorta(p.fecha_llegada)}</span>`
                : '';
        } else {
            const escala = calcularEscala(p.fecha_llegada, p.fecha_salida);
            horarios = [
                p.fecha_llegada ? `<span class="ph-item">⬇️ ${horaCorta(p.fecha_llegada)}</span>` : '',
                p.fecha_salida ? `<span class="ph-item">⬆️ ${horaCorta(p.fecha_salida)}</span>` : '',
                escala ? `<span class="ph-item ph-escala">⏱️ ${escala}</span>` : ''
            ].filter(Boolean).join('<span class="ph-sep">·</span>');
        }

        // Fecha del puerto (referencia)
        const fechaRef = p.fecha_llegada || p.fecha_salida;
        const fechaDisplay = fechaRef ? fechaCorta(fechaRef) : '';

        // Tours vinculados
        const tours = toursDelPuerto(p);
        let toursHtml = '';
        if (tours.length > 0) {
            toursHtml = `
                <div class="puerto-tours-section">
                    <div class="puerto-tours-divider"></div>
                    ${tours.map(t => `
                        <div class="puerto-tour-item" onclick="abrirPopupTour('${t.id}')">
                            <span class="pto-icon">🗺️</span>
                            <span class="pto-titulo">${t.titulo}</span>
                            ${t.hora_inicio ? `<span class="pto-hora">${t.hora_inicio}${t.hora_fin ? '–' + t.hora_fin : ''}</span>` : ''}
                            <span class="pto-arrow">→</span>
                        </div>
                    `).join('')}
                </div>`;
        } else {
            toursHtml = `
                <div class="puerto-tours-section">
                    <div class="puerto-tours-divider"></div>
                    <div class="puerto-no-tours">🗺️ Sin tours programados</div>
                </div>`;
        }

        return `
        <div class="timeline-item ${esUltimo ? 'tl-last' : ''}">
            <div class="tl-left">
                <div class="tl-dot ${dotColor}"></div>
                ${!esUltimo ? '<div class="tl-line"></div>' : ''}
            </div>
            <div class="tl-connector"></div>
            <div class="tl-card">
                <div class="tl-card-header">
                    <div class="tl-card-title">
                        <span class="tl-nombre">${p.nombre_puerto}</span>
                        ${badge}
                    </div>
                    <div class="tl-card-meta">
                        <span class="tl-fecha">${fechaDisplay}</span>
                        <div class="tl-actions">
                            <button class="btn-icon-sm" onclick="editarPuerto('${p.id}')" title="Editar">✏️</button>
                            <button class="btn-icon-sm" onclick="eliminarPuerto('${p.id}')" title="Eliminar">🗑️</button>
                        </div>
                    </div>
                </div>
                <div class="tl-horarios">${horarios}</div>
                ${p.notas ? `<div class="tl-notas">📝 ${p.notas}</div>` : ''}
                ${toursHtml}
            </div>
        </div>`;
    }).join('');
}

function renderActividades(fechaFiltro = '') {
    const container = document.getElementById('actividadesGrid');
    const lista = fechaFiltro ? actividades.filter(a => a.fecha === fechaFiltro) : actividades;

    if (lista.length === 0) {
        container.innerHTML = '<div class="empty-tab">No hay actividades registradas aún.</div>';
        return;
    }

    container.innerHTML = lista.map(a => {
        const gratis = !a.costo || parseFloat(a.costo) === 0;
        return `
        <div class="actividad-card">
            <div class="act-header">
                <div class="act-titulo">${a.titulo}</div>
                <div class="act-actions">
                    <button class="btn-icon-sm" onclick="editarActividad('${a.id}')">✏️</button>
                    <button class="btn-icon-sm" onclick="eliminarActividad('${a.id}')">🗑️</button>
                </div>
            </div>
            <div class="act-meta">
                ${a.fecha ? `<span>📅 ${fechaCorta(a.fecha)}</span>` : ''}
                ${a.hora_inicio ? `<span>🕐 ${a.hora_inicio}${a.hora_fin ? '–' + a.hora_fin : ''}</span>` : ''}
                ${a.ubicacion ? `<span>📍 ${a.ubicacion}</span>` : ''}
            </div>
            <div class="act-costo ${gratis ? 'gratis' : ''}">
                ${gratis ? '✅ Gratuito' : `💰 ${formatearNumero(a.costo)} ${a.costo_moneda || ''}`}
            </div>
            ${a.requiere_reserva ? '<span class="reserva-badge">⚠️ Requiere reserva</span>' : ''}
            ${a.descripcion ? `<div class="act-desc">${a.descripcion}</div>` : ''}
        </div>`;
    }).join('');
}

function renderTours() {
    const container = document.getElementById('toursGrid');

    if (puertos.length === 0) {
        container.innerHTML = '<div class="empty-tab">Agrega puertos primero para ver los tours agrupados por destino.</div>';
        return;
    }

    // Agrupar tours por puerto (usando la fecha del tour vs fecha del puerto)
    let html = '';
    let toursAsignados = new Set();

    puertos.forEach(p => {
        const tours = toursDelPuerto(p);
        tours.forEach(t => toursAsignados.add(t.id));

        const fechaRef = p.fecha_llegada || p.fecha_salida;
        const fechaDisplay = fechaRef ? fechaCorta(fechaRef) : '';
        const tipo = p.tipo_parada || 'escala';
        const iconoPuerto = tipo === 'salida' ? '🚢' : tipo === 'llegada' ? '🏁' : '⚓';

        html += `
        <div class="tours-destino-group">
            <div class="tdg-header">
                <span class="tdg-icon">${iconoPuerto}</span>
                <span class="tdg-nombre">${p.nombre_puerto}</span>
                ${fechaDisplay ? `<span class="tdg-fecha">${fechaDisplay}</span>` : ''}
            </div>
            <div class="tdg-tours">
                ${tours.length > 0
                ? tours.map(t => renderTourCard(t)).join('')
                : '<div class="tdg-empty">Sin tours programados</div>'
            }
            </div>
        </div>`;
    });

    // Tours sin puerto asignado (fecha fuera de rango de puertos o sin fecha)
    const sinAsignar = toursItinerario.filter(t => !toursAsignados.has(t.id));
    if (sinAsignar.length > 0) {
        html += `
        <div class="tours-destino-group">
            <div class="tdg-header">
                <span class="tdg-icon">📋</span>
                <span class="tdg-nombre">Sin puerto asignado</span>
            </div>
            <div class="tdg-tours">
                ${sinAsignar.map(t => renderTourCard(t)).join('')}
            </div>
        </div>`;
    }

    if (html === '') {
        container.innerHTML = '<div class="empty-tab">No hay tours del itinerario durante las fechas del crucero.</div>';
    } else {
        container.innerHTML = html;
    }
}

function renderTourCard(t) {
    return `
    <div class="tour-card" onclick="abrirPopupTour('${t.id}')">
        <div class="tc-titulo">🗺️ ${t.titulo}</div>
        <div class="tc-meta">
            ${t.fecha ? `<span>📅 ${fechaCorta(t.fecha)}</span>` : ''}
            ${t.hora_inicio ? `<span>🕐 ${t.hora_inicio}${t.hora_fin ? '–' + t.hora_fin : ''}</span>` : ''}
        </div>
        ${t.costo_estimado ? `<div class="tc-costo">💰 ${formatearNumero(t.costo_estimado)} ${t.costo_moneda || ''}</div>` : ''}
        <span class="tc-arrow">Ver detalle →</span>
    </div>`;
}

function renderInfoTab() {
    if (!cruceroData) return;
    const meta = cruceroData.detalles || {};
    const tipos = { interior: 'Interior', oceanview: 'Vista al Mar', balcony: 'Balcón', suite: 'Suite', suite_royal: 'Suite Royal' };

    const filas = [
        ['🚢 Barco', cruceroData.nombre_barco],
        ['🏢 Naviera', cruceroData.naviera],
        ['🛏️ Cabina', cruceroData.numero_cabina],
        ['📦 Tipo Cabina', tipos[meta.tipo_cabina] || meta.tipo_cabina],
        ['🏗️ Deck', meta.deck],
        ['📋 N° Reserva', meta.reserva],
        ['📞 Tel. Naviera', meta.tel_naviera],
        ['🚢 Puerto Salida', meta.puerto_salida],
        ['🏁 Puerto Llegada', meta.puerto_llegada],
    ].filter(([, v]) => v);

    document.getElementById('infoBarco').innerHTML = filas.map(([l, v]) =>
        `<div class="info-row"><span class="info-label">${l}</span><span class="info-val">${v}</span></div>`
    ).join('');

    document.getElementById('infoNotas').textContent = cruceroData.notas || 'Sin notas adicionales.';
}

function poblarFiltroFechas() {
    const sel = document.getElementById('filtroFechaAct');
    const fechas = [...new Set(actividades.filter(a => a.fecha).map(a => a.fecha))].sort();
    sel.innerHTML = '<option value="">Todas las fechas</option>' +
        fechas.map(f => `<option value="${f}">${fechaCorta(f)}</option>`).join('');
}

// ================================================================
//  POPUP TOUR
// ================================================================
function abrirPopupTour(id) {
    const t = toursItinerario.find(x => x.id === id);
    if (!t) return;

    document.getElementById('popupTourTitulo').textContent = t.titulo;
    document.getElementById('popupTourFecha').textContent = t.fecha ? fechaCorta(t.fecha) : '—';
    document.getElementById('popupTourHora').textContent =
        t.hora_inicio ? `${t.hora_inicio}${t.hora_fin ? ' – ' + t.hora_fin : ''}` : '—';
    document.getElementById('popupTourDescripcion').textContent = t.descripcion || 'Sin descripción.';
    document.getElementById('popupTourCosto').textContent =
        t.costo_estimado ? `${formatearNumero(t.costo_estimado)} ${t.costo_moneda || ''}` : 'Sin costo';

    document.getElementById('modalPopupTour').classList.add('show');
}

function cerrarPopupTour() {
    document.getElementById('modalPopupTour').classList.remove('show');
}

function irATabTours() {
    cerrarPopupTour();
    document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ctab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.ctab[data-tab="tours"]').classList.add('active');
    document.getElementById('tab-tours').classList.add('active');
}

// ================================================================
//  EVENTOS
// ================================================================
function inicializarEventos() {
    // Tabs
    document.querySelectorAll('.ctab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.ctab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
    });

    // Crucero
    document.getElementById('btnConfigCrucero')?.addEventListener('click', abrirModalCrucero);
    document.getElementById('btnEditarCrucero')?.addEventListener('click', abrirModalCrucero);
    document.getElementById('btnCerrarModalCrucero').addEventListener('click', () => cerrarModal('modalCrucero'));
    document.getElementById('btnCancelarCrucero').addEventListener('click', () => cerrarModal('modalCrucero'));
    document.getElementById('formCrucero').addEventListener('submit', guardarCrucero);

    // Puertos
    document.getElementById('btnAgregarPuerto').addEventListener('click', () => abrirModalPuerto());
    document.getElementById('btnCerrarModalPuerto').addEventListener('click', () => cerrarModal('modalPuerto'));
    document.getElementById('btnCancelarPuerto').addEventListener('click', () => cerrarModal('modalPuerto'));
    document.getElementById('formPuerto').addEventListener('submit', guardarPuerto);

    // Mostrar/ocultar campos según tipo_parada
    document.querySelectorAll('input[name="tipoPuerto"]').forEach(radio => {
        radio.addEventListener('change', actualizarCamposPuerto);
    });

    // Actividades
    document.getElementById('btnAgregarActividad').addEventListener('click', () => abrirModalActividad());
    document.getElementById('btnCerrarModalActividad').addEventListener('click', () => cerrarModal('modalActividad'));
    document.getElementById('btnCancelarActividad').addEventListener('click', () => cerrarModal('modalActividad'));
    document.getElementById('formActividad').addEventListener('submit', guardarActividad);

    document.getElementById('filtroFechaAct').addEventListener('change', e => renderActividades(e.target.value));

    // Popup tour
    document.getElementById('btnCerrarPopupTour').addEventListener('click', cerrarPopupTour);
    document.getElementById('btnIrTours').addEventListener('click', irATabTours);
    document.getElementById('modalPopupTour').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarPopupTour();
    });

    // Click fuera cierra modales
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) cerrarModal(m.id); });
    });
}

function actualizarCamposPuerto() {
    const tipo = document.querySelector('input[name="tipoPuerto"]:checked')?.value || 'escala';
    document.getElementById('grupoPuertoLlegada').style.display = tipo === 'salida' ? 'none' : '';
    document.getElementById('grupoPuertoSalida').style.display = tipo === 'llegada' ? 'none' : '';
}

// ================================================================
//  MODALES
// ================================================================
function abrirModalCrucero() {
    document.getElementById('formCrucero').reset();
    if (cruceroData) {
        const meta = cruceroData.detalles || {};
        document.getElementById('crucBarco').value = cruceroData.nombre_barco || '';
        document.getElementById('crucNaviera').value = cruceroData.naviera || '';
        document.getElementById('crucCabina').value = cruceroData.numero_cabina || '';
        document.getElementById('crucTipoCabina').value = meta.tipo_cabina || '';
        document.getElementById('crucFechaEmbarque').value = toLocalDatetime(cruceroData.fecha_embarque);
        document.getElementById('crucFechaDesembarque').value = toLocalDatetime(cruceroData.fecha_desembarque);
        document.getElementById('crucPuertoSalida').value = meta.puerto_salida || '';
        document.getElementById('crucPuertoLlegada').value = meta.puerto_llegada || '';
        document.getElementById('crucNumReserva').value = meta.reserva || '';
        document.getElementById('crucDeck').value = meta.deck || '';
        document.getElementById('crucTelNaviera').value = meta.tel_naviera || '';
        document.getElementById('crucNotas').value = cruceroData.notas || '';
        document.getElementById('modalCruceroTitulo').textContent = 'Editar Crucero';
    } else {
        document.getElementById('modalCruceroTitulo').textContent = 'Configurar Crucero';
    }
    abrirModal('modalCrucero');
}

function abrirModalPuerto(id = null) {
    editandoPuertoId = id;
    document.getElementById('formPuerto').reset();
    document.getElementById('puertoId').value = '';

    // Default tipo escala
    document.querySelector('input[name="tipoPuerto"][value="escala"]').checked = true;
    actualizarCamposPuerto();

    if (id) {
        const p = puertos.find(x => x.id === id);
        if (p) {
            document.getElementById('puertoId').value = p.id;
            document.getElementById('puertoNombre').value = p.nombre_puerto;
            document.getElementById('puertoLlegada').value = toLocalDatetime(p.fecha_llegada);
            document.getElementById('puertoSalida').value = toLocalDatetime(p.fecha_salida);
            document.getElementById('puertoDestinoId').value = p.destino_id || '';
            document.getElementById('puertoNotas').value = p.notas || '';

            const tipo = p.tipo_parada || 'escala';
            const radio = document.querySelector(`input[name="tipoPuerto"][value="${tipo}"]`);
            if (radio) { radio.checked = true; actualizarCamposPuerto(); }
        }
        document.getElementById('modalPuertoTitulo').textContent = 'Editar Puerto';
    } else {
        document.getElementById('modalPuertoTitulo').textContent = 'Agregar Puerto';
    }
    abrirModal('modalPuerto');
}

function abrirModalActividad(id = null) {
    editandoActividadId = id;
    document.getElementById('formActividad').reset();
    document.getElementById('actividadId').value = '';

    if (id) {
        const a = actividades.find(x => x.id === id);
        if (a) {
            document.getElementById('actividadId').value = a.id;
            document.getElementById('actTitulo').value = a.titulo;
            document.getElementById('actFecha').value = a.fecha || '';
            document.getElementById('actUbicacion').value = a.ubicacion || '';
            document.getElementById('actHoraInicio').value = a.hora_inicio || '';
            document.getElementById('actHoraFin').value = a.hora_fin || '';
            document.getElementById('actCosto').value = a.costo || '';
            document.getElementById('actMoneda').value = a.costo_moneda || 'USD';
            document.getElementById('actReserva').checked = a.requiere_reserva || false;
            document.getElementById('actDescripcion').value = a.descripcion || '';
        }
        document.getElementById('modalActividadTitulo').textContent = 'Editar Actividad';
    } else {
        document.getElementById('modalActividadTitulo').textContent = 'Agregar Actividad';
    }
    abrirModal('modalActividad');
}

function abrirModal(id) { document.getElementById(id).classList.add('show'); }
function cerrarModal(id) { document.getElementById(id).classList.remove('show'); }

// ================================================================
//  CRUD
// ================================================================
async function guardarCrucero(e) {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; btn.textContent = '⏳ Guardando...';
    try {
        const payload = {
            viaje_id: viajeId,
            nombre_barco: document.getElementById('crucBarco').value.trim(),
            naviera: document.getElementById('crucNaviera').value.trim(),
            numero_cabina: document.getElementById('crucCabina').value.trim() || null,
            fecha_embarque: document.getElementById('crucFechaEmbarque').value || null,
            fecha_desembarque: document.getElementById('crucFechaDesembarque').value || null,
            notas: document.getElementById('crucNotas').value.trim() || null,
            detalles: {
                tipo_cabina: document.getElementById('crucTipoCabina').value || null,
                puerto_salida: document.getElementById('crucPuertoSalida').value.trim() || null,
                puerto_llegada: document.getElementById('crucPuertoLlegada').value.trim() || null,
                reserva: document.getElementById('crucNumReserva').value.trim() || null,
                deck: document.getElementById('crucDeck').value.trim() || null,
                tel_naviera: document.getElementById('crucTelNaviera').value.trim() || null
            }
        };

        if (cruceroId) {
            const { error } = await supabaseClient.from('v3_cruceros').update(payload).eq('id', cruceroId);
            if (error) throw error;
        } else {
            const { data: ex } = await supabaseClient.from('v3_cruceros').select('id').eq('viaje_id', viajeId).limit(1);
            if (ex && ex.length > 0) {
                cruceroId = ex[0].id;
                const { error } = await supabaseClient.from('v3_cruceros').update(payload).eq('id', cruceroId);
                if (error) throw error;
            } else {
                const { data, error } = await supabaseClient.from('v3_cruceros').insert(payload).select().single();
                if (error) throw error;
                cruceroId = data.id;
            }
            await supabaseClient.from('v3_viajes').update({ tiene_crucero: true }).eq('id', viajeId);
        }
        mostrarNotificacion('Crucero guardado ✓', 'success');
        cerrarModal('modalCrucero');
        await cargarCrucero();
    } catch (err) {
        console.error(err);
        mostrarNotificacion('Error: ' + (err.message || JSON.stringify(err)), 'error');
    } finally { btn.disabled = false; btn.textContent = '💾 Guardar'; }
}

async function guardarPuerto(e) {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; btn.textContent = '⏳';
    try {
        const tipo = document.querySelector('input[name="tipoPuerto"]:checked')?.value || 'escala';
        const payload = {
            crucero_id: cruceroId,
            nombre_puerto: document.getElementById('puertoNombre').value.trim(),
            tipo_parada: tipo,
            fecha_llegada: tipo !== 'salida' ? (document.getElementById('puertoLlegada').value || null) : null,
            fecha_salida: tipo !== 'llegada' ? (document.getElementById('puertoSalida').value || null) : null,
            destino_id: document.getElementById('puertoDestinoId').value || null,
            notas: document.getElementById('puertoNotas').value.trim() || null,
            orden: editandoPuertoId
                ? (puertos.find(p => p.id === editandoPuertoId)?.orden ?? 0)
                : puertos.length
        };

        if (editandoPuertoId) {
            const { error } = await supabaseClient.from('v3_puertos_crucero').update(payload).eq('id', editandoPuertoId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('v3_puertos_crucero').insert(payload);
            if (error) throw error;
        }
        mostrarNotificacion('Puerto guardado ✓', 'success');
        cerrarModal('modalPuerto');
        await cargarPuertos();
        renderTours(); // re-render tours agrupados
    } catch (err) {
        console.error(err);
        mostrarNotificacion('Error: ' + (err.message || JSON.stringify(err)), 'error');
    } finally { btn.disabled = false; btn.textContent = '💾 Guardar'; }
}

async function editarPuerto(id) { abrirModalPuerto(id); }
async function eliminarPuerto(id) {
    if (!confirmarAccion('¿Eliminar este puerto?')) return;
    const { error } = await supabaseClient.from('v3_puertos_crucero').delete().eq('id', id);
    if (error) { mostrarNotificacion('Error al eliminar', 'error'); return; }
    mostrarNotificacion('Puerto eliminado', 'success');
    await cargarPuertos();
    renderTours();
}

async function guardarActividad(e) {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true; btn.textContent = '⏳';
    try {
        const payload = {
            crucero_id: cruceroId,
            titulo: document.getElementById('actTitulo').value.trim(),
            descripcion: document.getElementById('actDescripcion').value.trim() || null,
            fecha: document.getElementById('actFecha').value || null,
            hora_inicio: document.getElementById('actHoraInicio').value || null,
            hora_fin: document.getElementById('actHoraFin').value || null,
            ubicacion: document.getElementById('actUbicacion').value.trim() || null,
            costo: parseFloat(document.getElementById('actCosto').value) || null,
            costo_moneda: document.getElementById('actMoneda').value || 'USD',
            requiere_reserva: document.getElementById('actReserva').checked
        };
        if (editandoActividadId) {
            const { error } = await supabaseClient.from('v3_actividades_crucero').update(payload).eq('id', editandoActividadId);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('v3_actividades_crucero').insert(payload);
            if (error) throw error;
        }
        mostrarNotificacion('Actividad guardada ✓', 'success');
        cerrarModal('modalActividad');
        await cargarActividades();
    } catch (err) {
        console.error(err);
        mostrarNotificacion('Error: ' + (err.message || JSON.stringify(err)), 'error');
    } finally { btn.disabled = false; btn.textContent = '💾 Guardar'; }
}

async function editarActividad(id) { abrirModalActividad(id); }
async function eliminarActividad(id) {
    if (!confirmarAccion('¿Eliminar esta actividad?')) return;
    const { error } = await supabaseClient.from('v3_actividades_crucero').delete().eq('id', id);
    if (error) { mostrarNotificacion('Error al eliminar', 'error'); return; }
    mostrarNotificacion('Actividad eliminada', 'success');
    await cargarActividades();
}

function mostrarError(msg) {
    document.querySelector('.main-content').innerHTML =
        `<div style="text-align:center;padding:80px 20px;color:#ef4444;">
            <div style="font-size:3rem;">⚠️</div><h2>${msg}</h2>
            <a href="../index.html" style="color:#6366f1;">← Volver al inicio</a>
        </div>`;
}
