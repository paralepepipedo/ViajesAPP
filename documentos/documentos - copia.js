// ============================================================
//  documentos.js  —  Módulo Documentos V3
// ============================================================

// ---- Config & estado ----
let supabaseClient = null;
let viajeId = null;
let participantes = [];
let documentos = [];
let tipoActivo = 'todos';
let editandoId = null;
let archivoSeleccionado = null;

const TIPO_CONFIG = {
    pasaje_avion:     { label: 'Pasaje de Avión',      icon: '✈️',  badge: 'badge-pasaje_avion' },
    tarjeta_embarque: { label: 'Tarjeta de Embarque',  icon: '🎫',  badge: 'badge-tarjeta_embarque' },
    pasaje_bus:       { label: 'Pasaje de Bus',        icon: '🚌',  badge: 'badge-pasaje_bus' },
    entrada:          { label: 'Boleto / Entrada',     icon: '🎟️', badge: 'badge-entrada' },
    alojamiento:      { label: 'Reserva Alojamiento',  icon: '🏨',  badge: 'badge-alojamiento' },
    seguro:           { label: 'Seguro de Viaje',      icon: '🛡️', badge: 'badge-seguro' },
    crucero:          { label: 'Doc. Crucero',         icon: '🚢',  badge: 'badge-crucero' },
    otro:             { label: 'Otro',                 icon: '📄',  badge: 'badge-otro' }
};

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const params = new URLSearchParams(window.location.search);
        const linkUnico = params.get('viaje');
        if (!linkUnico) return mostrarError('No se especificó un viaje.');

        supabaseClient = window.createSupabaseClient?.() ?? null;
        if (!supabaseClient) return mostrarError('Error al conectar con Supabase.');

        // Obtener viaje
        const { data: viaje, error: errViaje } = await supabaseClient
            .from('v3_viajes')
            .select('id, nombre, tiene_crucero')
            .eq('link_unico', linkUnico)
            .single();
        if (errViaje || !viaje) return mostrarError('Viaje no encontrado.');

        viajeId = viaje.id;
        document.title = `Documentos – ${viaje.nombre}`;

        // Cargar participantes
        await cargarParticipantes();

        // Cargar documentos
        await cargarDocumentos();

        // Eventos UI
        inicializarEventos();

    } catch (err) {
        console.error(err);
        mostrarError('Error al inicializar.');
    }
});

// ---- Cargar datos ----
async function cargarParticipantes() {
    const { data } = await supabaseClient
        .from('v3_participantes')
        .select('id, nombre')
        .eq('viaje_id', viajeId)
        .order('nombre');
    participantes = data || [];
}

async function cargarDocumentos() {
    const { data, error } = await supabaseClient
        .from('v3_documentos')
        .select('*')
        .eq('viaje_id', viajeId)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    documentos = data || [];
    renderDocumentos();
}

// ---- Render ----
function renderDocumentos() {
    const grid = document.getElementById('docsGrid');
    const empty = document.getElementById('emptyState');

    const filtrados = tipoActivo === 'todos'
        ? documentos
        : documentos.filter(d => d.tipo === tipoActivo);

    // Limpiar tarjetas anteriores (mantener emptyState)
    grid.querySelectorAll('.doc-card').forEach(c => c.remove());

    if (filtrados.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    filtrados.forEach(doc => {
        const cfg = TIPO_CONFIG[doc.tipo] || TIPO_CONFIG.otro;
        const meta = doc.metadata || {};
        const participantesDoc = meta.participantes || [];
        const metaTexto = construirMetaTexto(doc.tipo, meta);

        const card = document.createElement('div');
        card.className = 'doc-card';
        card.dataset.id = doc.id;

        card.innerHTML = `
            <div class="doc-card-header">
                <span class="doc-type-badge ${cfg.badge}">${cfg.icon} ${cfg.label}</span>
                <div class="doc-card-actions">
                    ${doc.archivo_url ? `<button class="btn-icon" onclick="abrirVisor('${doc.id}')" title="Ver archivo">👁️</button>` : ''}
                    <button class="btn-icon" onclick="editarDocumento('${doc.id}')" title="Editar">✏️</button>
                    <button class="btn-icon" onclick="eliminarDocumento('${doc.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
            <div class="doc-card-name">${doc.nombre}</div>
            ${metaTexto ? `<div class="doc-card-meta">${metaTexto}</div>` : ''}
            ${doc.archivo_url ? `<div class="doc-has-file">📎 Archivo adjunto</div>` : ''}
            ${participantesDoc.length > 0 ? `
                <div class="doc-participants">
                    ${participantesDoc.map(pid => {
                        const p = participantes.find(x => x.id === pid);
                        return p ? `<span class="participant-chip">👤 ${p.nombre}</span>` : '';
                    }).join('')}
                </div>` : ''}
            ${doc.descripcion ? `<div style="font-size:12px;color:#64748b;">${doc.descripcion}</div>` : ''}
        `;
        grid.appendChild(card);
    });
}

function construirMetaTexto(tipo, meta) {
    const partes = [];
    switch (tipo) {
        case 'pasaje_avion':
        case 'tarjeta_embarque':
            if (meta.aerolinea) partes.push(`<span>✈️ ${meta.aerolinea}</span>`);
            if (meta.num_vuelo) partes.push(`<span>🔢 ${meta.num_vuelo}</span>`);
            if (meta.origen && meta.destino) partes.push(`<span>📍 ${meta.origen} → ${meta.destino}</span>`);
            if (meta.fecha_salida) partes.push(`<span>📅 ${formatFecha(meta.fecha_salida)}</span>`);
            if (meta.asiento) partes.push(`<span>💺 Asiento ${meta.asiento}</span>`);
            break;
        case 'pasaje_bus':
            if (meta.empresa) partes.push(`<span>🚌 ${meta.empresa}</span>`);
            if (meta.origen && meta.destino) partes.push(`<span>📍 ${meta.origen} → ${meta.destino}</span>`);
            if (meta.fecha) partes.push(`<span>📅 ${formatFecha(meta.fecha)}</span>`);
            break;
        case 'entrada':
            if (meta.nombre_lugar) partes.push(`<span>🎫 ${meta.nombre_lugar}</span>`);
            if (meta.fecha) partes.push(`<span>📅 ${formatFecha(meta.fecha)}</span>`);
            if (meta.hora) partes.push(`<span>🕐 ${meta.hora}</span>`);
            break;
        case 'alojamiento':
            if (meta.hotel) partes.push(`<span>🏨 ${meta.hotel}</span>`);
            if (meta.checkin && meta.checkout) partes.push(`<span>📅 ${formatFecha(meta.checkin)} → ${formatFecha(meta.checkout)}</span>`);
            break;
        case 'seguro':
            if (meta.aseguradora) partes.push(`<span>🛡️ ${meta.aseguradora}</span>`);
            if (meta.desde && meta.hasta) partes.push(`<span>📅 ${formatFecha(meta.desde)} – ${formatFecha(meta.hasta)}</span>`);
            if (meta.telefono) partes.push(`<span>📞 ${meta.telefono}</span>`);
            break;
        case 'crucero':
            if (meta.naviera) partes.push(`<span>🚢 ${meta.naviera}</span>`);
            if (meta.barco) partes.push(`<span>⚓ ${meta.barco}</span>`);
            if (meta.embarque) partes.push(`<span>📅 ${formatFecha(meta.embarque)}</span>`);
            break;
    }
    return partes.join('');
}

// ---- Inicializar eventos ----
function inicializarEventos() {
    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tipoActivo = btn.dataset.tipo;
            renderDocumentos();
        });
    });

    // Abrir modal nuevo
    document.getElementById('btnAgregarDoc').addEventListener('click', abrirModalNuevo);
    document.getElementById('fabAgregarDoc').addEventListener('click', abrirModalNuevo);

    // Cerrar modales
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalDocumento);
    document.getElementById('btnCancelarForm').addEventListener('click', cerrarModalDocumento);
    document.getElementById('btnCerrarVisor').addEventListener('click', cerrarVisor);
    document.getElementById('modalDocumento').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarModalDocumento();
    });
    document.getElementById('modalVisor').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarVisor();
    });

    // Selección de tipo
    document.querySelectorAll('.tipo-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTipo(btn.dataset.tipo));
    });

    // Upload
    const uploadArea = document.getElementById('uploadArea');
    const inputFile = document.getElementById('docArchivo');
    uploadArea.addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', e => manejarArchivo(e.target.files[0]));
    document.getElementById('btnRemoveFile').addEventListener('click', e => {
        e.stopPropagation();
        limpiarArchivo();
    });
    uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--color-primary)'; });
    uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        if (e.dataTransfer.files[0]) manejarArchivo(e.dataTransfer.files[0]);
    });

    // Guardar
    document.getElementById('formDocumento').addEventListener('submit', guardarDocumento);
}

// ---- Modal ----
function abrirModalNuevo() {
    editandoId = null;
    archivoSeleccionado = null;
    limpiarFormulario();
    document.getElementById('modalDocTitulo').textContent = 'Agregar Documento';
    document.getElementById('tipoSelector').style.display = 'block';
    document.getElementById('formDocumento').style.display = 'none';
    document.getElementById('modalDocumento').classList.add('show');
}

function cerrarModalDocumento() {
    document.getElementById('modalDocumento').classList.remove('show');
    editandoId = null;
    archivoSeleccionado = null;
}

function seleccionarTipo(tipo) {
    document.getElementById('docTipo').value = tipo;
    document.getElementById('tipoSelector').style.display = 'none';

    // Mostrar solo campos del tipo seleccionado
    document.querySelectorAll('.campos-tipo').forEach(el => {
        el.classList.toggle('visible', el.dataset.tipo === tipo);
    });

    // Cargar checkboxes participantes
    const container = document.getElementById('participantesCheck');
    container.innerHTML = participantes.map(p => `
        <label class="checkbox-item">
            <input type="checkbox" name="participante" value="${p.id}"> ${p.nombre}
        </label>
    `).join('');

    document.getElementById('formDocumento').style.display = 'flex';
}

function limpiarFormulario() {
    document.getElementById('formDocumento').reset();
    document.getElementById('docId').value = '';
    document.getElementById('docTipo').value = '';
    document.querySelectorAll('.campos-tipo').forEach(el => el.classList.remove('visible'));
    limpiarArchivo();
}

function manejarArchivo(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        toast('El archivo supera los 10 MB', 'error'); return;
    }
    archivoSeleccionado = file;
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').style.display = 'flex';
    document.getElementById('previewName').textContent = file.name;
    document.getElementById('previewIcon').textContent = file.type === 'application/pdf' ? '📄' : '🖼️';
}

function limpiarArchivo() {
    archivoSeleccionado = null;
    document.getElementById('docArchivo').value = '';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('uploadPreview').style.display = 'none';
}

// ---- CRUD ----
async function guardarDocumento(e) {
    e.preventDefault();
    const btnGuardar = document.getElementById('btnGuardarDoc');
    btnGuardar.disabled = true;
    btnGuardar.textContent = '⏳ Guardando...';

    try {
        const tipo = document.getElementById('docTipo').value;
        const nombre = document.getElementById('docNombre').value.trim();
        const notas = document.getElementById('docNotas').value.trim();
        const participantesSelec = [...document.querySelectorAll('input[name="participante"]:checked')].map(i => i.value);
        const metadata = extraerMetadata(tipo);
        metadata.participantes = participantesSelec;
        if (notas) metadata.notas = notas;

        let archivo_url = null;
        if (archivoSeleccionado) {
            const ext = archivoSeleccionado.name.split('.').pop();
            const path = `documentos/${viajeId}/${Date.now()}.${ext}`;
            const { error: errUp } = await supabaseClient.storage
                .from('viajes-docs')
                .upload(path, archivoSeleccionado, { upsert: true });
            if (errUp) throw errUp;
            const { data: urlData } = supabaseClient.storage.from('viajes-docs').getPublicUrl(path);
            archivo_url = urlData.publicUrl;
        }

        const payload = { viaje_id: viajeId, tipo, nombre, metadata };
        if (archivo_url) { payload.archivo_url = archivo_url; payload.nombre = nombre; }

        if (editandoId) {
            const { error } = await supabaseClient.from('v3_documentos').update(payload).eq('id', editandoId);
            if (error) throw error;
            toast('Documento actualizado ✓', 'success');
        } else {
            const { error } = await supabaseClient.from('v3_documentos').insert(payload);
            if (error) throw error;
            toast('Documento guardado ✓', 'success');
        }

        cerrarModalDocumento();
        await cargarDocumentos();

    } catch (err) {
        console.error(err);
        toast('Error al guardar: ' + (err.message || err), 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar';
    }
}

function extraerMetadata(tipo) {
    const g = id => document.getElementById(id)?.value || '';
    switch (tipo) {
        case 'pasaje_avion':
            return { aerolinea: g('avionAerolinea'), num_vuelo: g('avionNumVuelo'), reserva: g('avionReserva'),
                     asiento: g('avionAsiento'), origen: g('avionOrigen'), destino: g('avionDestino'),
                     fecha_salida: g('avionSalida'), fecha_llegada: g('avionLlegada'),
                     terminal: g('avionTerminal'), puerta: g('avionPuerta'), equipaje: g('avionEquipaje') };
        case 'tarjeta_embarque':
            return { aerolinea: g('embAerolinea'), num_vuelo: g('embNumVuelo'), pasajero: g('embPasajero'),
                     asiento: g('embAsiento'), puerta: g('embPuerta'), hora_embarque: g('embHora') };
        case 'pasaje_bus':
            return { empresa: g('busEmpresa'), servicio: g('busServicio'), origen: g('busOrigen'),
                     destino: g('busDestino'), fecha: g('busFecha'), asiento: g('busAsiento'), anden: g('busAnden') };
        case 'entrada':
            return { nombre_lugar: g('entradaNombre'), ticket: g('entradaTicket'),
                     fecha: g('entradaFecha'), hora: g('entradaHora'), lugar: g('entradaLugar') };
        case 'alojamiento':
            return { hotel: g('aloNombre'), reserva: g('aloReserva'),
                     checkin: g('aloCheckin'), checkout: g('aloCheckout'), direccion: g('aloDireccion') };
        case 'seguro':
            return { aseguradora: g('segAseguradora'), poliza: g('segPoliza'),
                     desde: g('segDesde'), hasta: g('segHasta'), telefono: g('segTelefono') };
        case 'crucero':
            return { naviera: g('crucNaviera'), reserva: g('crucReserva'),
                     barco: g('crucBarco'), embarque: g('crucEmbarque') };
        case 'otro':
        default:
            return { descripcion: g('otroDescripcion') };
    }
}

async function editarDocumento(id) {
    const doc = documentos.find(d => d.id === id);
    if (!doc) return;
    editandoId = id;

    document.getElementById('modalDocTitulo').textContent = 'Editar Documento';
    document.getElementById('tipoSelector').style.display = 'none';
    seleccionarTipo(doc.tipo);

    document.getElementById('docId').value = doc.id;
    document.getElementById('docNombre').value = doc.nombre;
    document.getElementById('docNotas').value = doc.metadata?.notas || '';

    // Rellenar campos específicos
    const meta = doc.metadata || {};
    poblarCampos(doc.tipo, meta);

    // Participantes
    (meta.participantes || []).forEach(pid => {
        const cb = document.querySelector(`input[name="participante"][value="${pid}"]`);
        if (cb) cb.checked = true;
    });

    // Archivo existente
    if (doc.archivo_url) {
        document.getElementById('uploadPlaceholder').style.display = 'none';
        document.getElementById('uploadPreview').style.display = 'flex';
        document.getElementById('previewName').textContent = doc.nombre + ' (existente)';
        document.getElementById('previewIcon').textContent = '📎';
    }

    document.getElementById('modalDocumento').classList.add('show');
}

function poblarCampos(tipo, meta) {
    const s = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    switch (tipo) {
        case 'pasaje_avion':
            s('avionAerolinea', meta.aerolinea); s('avionNumVuelo', meta.num_vuelo); s('avionReserva', meta.reserva);
            s('avionAsiento', meta.asiento); s('avionOrigen', meta.origen); s('avionDestino', meta.destino);
            s('avionSalida', meta.fecha_salida); s('avionLlegada', meta.fecha_llegada);
            s('avionTerminal', meta.terminal); s('avionPuerta', meta.puerta); s('avionEquipaje', meta.equipaje);
            break;
        case 'tarjeta_embarque':
            s('embAerolinea', meta.aerolinea); s('embNumVuelo', meta.num_vuelo); s('embPasajero', meta.pasajero);
            s('embAsiento', meta.asiento); s('embPuerta', meta.puerta); s('embHora', meta.hora_embarque);
            break;
        case 'pasaje_bus':
            s('busEmpresa', meta.empresa); s('busServicio', meta.servicio); s('busOrigen', meta.origen);
            s('busDestino', meta.destino); s('busFecha', meta.fecha); s('busAsiento', meta.asiento); s('busAnden', meta.anden);
            break;
        case 'entrada':
            s('entradaNombre', meta.nombre_lugar); s('entradaTicket', meta.ticket);
            s('entradaFecha', meta.fecha); s('entradaHora', meta.hora); s('entradaLugar', meta.lugar);
            break;
        case 'alojamiento':
            s('aloNombre', meta.hotel); s('aloReserva', meta.reserva);
            s('aloCheckin', meta.checkin); s('aloCheckout', meta.checkout); s('aloDireccion', meta.direccion);
            break;
        case 'seguro':
            s('segAseguradora', meta.aseguradora); s('segPoliza', meta.poliza);
            s('segDesde', meta.desde); s('segHasta', meta.hasta); s('segTelefono', meta.telefono);
            break;
        case 'crucero':
            s('crucNaviera', meta.naviera); s('crucReserva', meta.reserva);
            s('crucBarco', meta.barco); s('crucEmbarque', meta.embarque);
            break;
        case 'otro':
            s('otroDescripcion', meta.descripcion); break;
    }
}

async function eliminarDocumento(id) {
    if (!confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    const { error } = await supabaseClient.from('v3_documentos').delete().eq('id', id);
    if (error) { toast('Error al eliminar', 'error'); return; }
    toast('Documento eliminado', 'success');
    await cargarDocumentos();
}

// ---- Visor ----
function abrirVisor(id) {
    const doc = documentos.find(d => d.id === id);
    if (!doc || !doc.archivo_url) return;
    const cfg = TIPO_CONFIG[doc.tipo] || TIPO_CONFIG.otro;
    document.getElementById('visorTitulo').textContent = `${cfg.icon} ${doc.nombre}`;
    document.getElementById('visorDescargar').href = doc.archivo_url;

    const content = document.getElementById('visorContent');
    const esImagen = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.archivo_url);
    if (esImagen) {
        content.innerHTML = `<img src="${doc.archivo_url}" alt="${doc.nombre}">`;
    } else if (/\.pdf$/i.test(doc.archivo_url)) {
        content.innerHTML = `<iframe src="${doc.archivo_url}"></iframe>`;
    } else {
        content.innerHTML = `<div class="visor-no-preview"><div class="big-icon">📄</div><p>Vista previa no disponible</p><a href="${doc.archivo_url}" target="_blank" class="btn-primary" style="display:inline-flex;margin-top:12px;">⬇️ Descargar archivo</a></div>`;
    }

    document.getElementById('modalVisor').classList.add('show');
}

function cerrarVisor() {
    document.getElementById('modalVisor').classList.remove('show');
    document.getElementById('visorContent').innerHTML = '';
}

// ---- Helpers ----
function formatFecha(str) {
    if (!str) return '';
    try {
        const d = new Date(str);
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return str; }
}

function toast(msg, tipo = 'success') {
    Toastify({
        text: msg,
        duration: 3000,
        gravity: 'top',
        position: 'right',
        backgroundColor: tipo === 'success' ? '#22c55e' : tipo === 'error' ? '#ef4444' : '#6366f1',
        stopOnFocus: true
    }).showToast();
}

function mostrarError(msg) {
    document.querySelector('.main-content').innerHTML =
        `<div style="text-align:center;padding:60px 20px;color:#ef4444;"><h2>⚠️ ${msg}</h2></div>`;
}
