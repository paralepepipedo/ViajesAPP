// ============================================================
//  documentos.js  —  Módulo Documentos V3
// ============================================================

let viajeId = null;
let linkUnico = null;
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
    // Usar obtenerParametroURL de config.js — parámetro 'link'
    linkUnico = obtenerParametroURL('link');

    if (!linkUnico) {
        mostrarError('No se especificó un viaje. Vuelve al inicio.');
        return;
    }

    try {
        // Obtener viaje por link_unico
        const { data: viaje, error: errViaje } = await supabaseClient
            .from('v3_viajes')
            .select('id, nombre, tiene_crucero')
            .eq('link_unico', linkUnico)
            .single();

        if (errViaje || !viaje) {
            mostrarError('Viaje no encontrado.');
            return;
        }

        viajeId = viaje.id;
        document.title = `Documentos – ${viaje.nombre}`;

        await cargarParticipantes();
        await cargarDocumentos();
        inicializarEventos();

    } catch (err) {
        console.error('Error inicializando documentos:', err);
        mostrarError('Error al cargar el módulo de documentos.');
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

    if (error) { console.error('Error cargando documentos:', error); return; }
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

        const card = document.createElement('div');
        card.className = 'doc-card';
        card.dataset.id = doc.id;

        card.innerHTML = construirCardHTML(doc, cfg, meta, participantesDoc);
        grid.appendChild(card);
    });
}

function construirCardHTML(doc, cfg, meta, participantesDoc) {
    const tieneArchivo = doc.archivo_url && doc.archivo_url !== '';
    const nombresParticipantes = participantesDoc
        .map(pid => { const p = participantes.find(x => x.id === pid); return p ? p.nombre : null; })
        .filter(Boolean);

    const header = `
        <div class="doc-card-header">
            <span class="doc-type-badge ${cfg.badge}">${cfg.icon} ${cfg.label}</span>
            <div class="doc-card-actions">
                ${tieneArchivo ? `<button class="btn-icon" onclick="abrirVisor('${doc.id}')" title="Ver archivo">📎</button>` : ''}
                <button class="btn-icon" onclick="editarDocumento('${doc.id}')" title="Editar">✏️</button>
                <button class="btn-icon" onclick="eliminarDocumento('${doc.id}')" title="Eliminar">🗑️</button>
            </div>
        </div>
        <div class="doc-card-name">${doc.nombre}</div>`;

    const footer = `
        ${nombresParticipantes.length > 0 ? `
            <div class="doc-participants">
                ${nombresParticipantes.map(n => `<span class="participant-chip">👤 ${n}</span>`).join('')}
            </div>` : ''}
        ${meta.notas ? `<div class="doc-card-notas">${meta.notas}</div>` : ''}`;

    const sep = `<div class="bp-separator"></div>`;

    // Helper para fila de datos destacados
    function datoDestacado(label, valor, claseExtra = '') {
        if (!valor) return '';
        return `<div class="bp-dato">
            <div class="bp-dato-label">${label}</div>
            <div class="bp-dato-valor ${claseExtra}">${valor}</div>
        </div>`;
    }

    // Helper para pills secundarios
    function pill(icono, valor) {
        if (!valor) return '';
        return `<span>${icono} ${valor}</span>`;
    }

    // ── ✈️ PASAJE DE AVIÓN ──────────────────────────────────────
    if (doc.tipo === 'pasaje_avion') {
        const ruta = (meta.origen && meta.destino) ? `${meta.origen} → ${meta.destino}` : (meta.origen || meta.destino || '');
        // Extraer fecha y hora de fecha_salida (datetime-local)
        let fechaStr = '', horaStr = '';
        if (meta.fecha_salida) {
            const dt = new Date(meta.fecha_salida);
            if (!isNaN(dt)) {
                fechaStr = dt.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
                horaStr  = dt.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12: false });
            }
        }
        return `${header}
            ${ruta ? `<div class="bp-ruta">${ruta}</div>` : ''}
            ${sep}
            <div class="bp-datos-principales">
                ${datoDestacado('VUELO', meta.num_vuelo, 'bp-vuelo-badge')}
                ${datoDestacado('ASIENTO', meta.asiento)}
                ${datoDestacado('PUERTA', meta.puerta)}
                ${horaStr ? datoDestacado('SALIDA', horaStr, 'bp-hora') : ''}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('✈️', meta.aerolinea)}
                ${fechaStr ? pill('📅', fechaStr) : ''}
                ${pill('🖥️', meta.terminal ? 'Terminal ' + meta.terminal : '')}
                ${pill('🔖', meta.reserva)}
                ${pill('🧳', meta.equipaje)}
            </div>
            ${footer}`;
    }

    // ── 🎫 TARJETA DE EMBARQUE ───────────────────────────────────
    if (doc.tipo === 'tarjeta_embarque') {
        // hora_embarque viene del campo embHora (type="time")
        const horaEmbarque = meta.hora_embarque || '';
        return `${header}
            ${sep}
            <div class="bp-datos-principales">
                ${datoDestacado('VUELO', meta.num_vuelo, 'bp-vuelo-badge')}
                ${datoDestacado('ASIENTO', meta.asiento)}
                ${datoDestacado('PUERTA', meta.puerta)}
                ${datoDestacado('EMBARQUE', horaEmbarque, 'bp-embarque')}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('✈️', meta.aerolinea)}
                ${pill('👤', meta.pasajero)}
            </div>
            ${footer}`;
    }

    // ── 🚌 PASAJE DE BUS ─────────────────────────────────────────
    if (doc.tipo === 'pasaje_bus') {
        const ruta = (meta.origen && meta.destino) ? `${meta.origen} → ${meta.destino}` : (meta.origen || meta.destino || '');
        let fechaStr = '', horaStr = '';
        if (meta.fecha) {
            const dt = new Date(meta.fecha);
            if (!isNaN(dt)) {
                fechaStr = dt.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
                horaStr  = dt.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12: false });
            }
        }
        return `${header}
            ${ruta ? `<div class="bp-ruta">${ruta}</div>` : ''}
            ${sep}
            <div class="bp-datos-principales">
                ${datoDestacado('SERVICIO', meta.servicio)}
                ${datoDestacado('ASIENTO', meta.asiento)}
                ${horaStr ? datoDestacado('HORA', horaStr, 'bp-hora') : ''}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('🚌', meta.empresa)}
                ${fechaStr ? pill('📅', fechaStr) : ''}
                ${pill('🚉', meta.anden)}
            </div>
            ${footer}`;
    }

    // ── 🎟️ BOLETO / ENTRADA ──────────────────────────────────────
    if (doc.tipo === 'entrada') {
        return `${header}
            ${sep}
            <div class="bp-datos-principales">
                ${datoDestacado('FECHA', meta.fecha ? formatearFecha(meta.fecha) : '')}
                ${datoDestacado('HORA', meta.hora, 'bp-hora')}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('🎫', meta.nombre_lugar)}
                ${pill('🔖', meta.ticket ? 'Ticket ' + meta.ticket : '')}
                ${pill('📍', meta.lugar)}
            </div>
            ${footer}`;
    }

    // ── 🏨 RESERVA ALOJAMIENTO ───────────────────────────────────
    if (doc.tipo === 'alojamiento') {
        let checkinStr = '', checkoutStr = '';
        if (meta.checkin) {
            const dt = new Date(meta.checkin);
            if (!isNaN(dt)) checkinStr = dt.toLocaleDateString('es-CL', { day:'2-digit', month:'short' })
                + ' ' + dt.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12: false });
        }
        if (meta.checkout) {
            const dt = new Date(meta.checkout);
            if (!isNaN(dt)) checkoutStr = dt.toLocaleDateString('es-CL', { day:'2-digit', month:'short' })
                + ' ' + dt.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12: false });
        }
        return `${header}
            ${meta.hotel ? `<div class="bp-ruta">🏨 ${meta.hotel}</div>` : ''}
            ${sep}
            <div class="bp-datos-principales">
                ${checkinStr  ? datoDestacado('CHECK-IN',  checkinStr,  'bp-hora') : ''}
                ${checkoutStr ? datoDestacado('CHECK-OUT', checkoutStr, 'bp-hora') : ''}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('🔖', meta.reserva)}
                ${pill('📍', meta.direccion)}
            </div>
            ${footer}`;
    }

    // ── 🛡️ SEGURO DE VIAJE ───────────────────────────────────────
    if (doc.tipo === 'seguro') {
        const vigencia = (meta.desde && meta.hasta)
            ? `${formatearFecha(meta.desde)} → ${formatearFecha(meta.hasta)}` : '';
        return `${header}
            ${meta.aseguradora ? `<div class="bp-ruta">🛡️ ${meta.aseguradora}</div>` : ''}
            ${sep}
            <div class="bp-datos-principales">
                ${datoDestacado('PÓLIZA', meta.poliza)}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${vigencia ? pill('📅', vigencia) : ''}
                ${pill('📞', meta.telefono)}
            </div>
            ${footer}`;
    }

    // ── 🚢 DOCUMENTO CRUCERO ─────────────────────────────────────
    if (doc.tipo === 'crucero') {
        let embarqueStr = '';
        if (meta.embarque) {
            const dt = new Date(meta.embarque);
            if (!isNaN(dt)) embarqueStr = dt.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' })
                + ' ' + dt.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12: false });
        }
        return `${header}
            ${meta.barco ? `<div class="bp-ruta">⚓ ${meta.barco}</div>` : ''}
            ${sep}
            <div class="bp-datos-principales">
                ${embarqueStr ? datoDestacado('EMBARQUE', embarqueStr, 'bp-hora') : ''}
            </div>
            ${sep}
            <div class="bp-datos-secundarios">
                ${pill('🚢', meta.naviera)}
                ${pill('🔖', meta.reserva)}
            </div>
            ${footer}`;
    }

    // ── 📄 OTRO ──────────────────────────────────────────────────
    return `${header}
        ${meta.descripcion ? `<div class="doc-card-meta"><span>${meta.descripcion}</span></div>` : ''}
        ${footer}`;
}

function construirMetaTexto(tipo, meta) {
    const partes = [];
    switch (tipo) {
        case 'pasaje_avion':
            if (meta.aerolinea) partes.push(`<span>✈️ ${meta.aerolinea}</span>`);
            if (meta.num_vuelo) partes.push(`<span class="meta-vuelo-destacado">🔢 <strong>${meta.num_vuelo}</strong></span>`);
            if (meta.origen && meta.destino) partes.push(`<span>📍 ${meta.origen} → ${meta.destino}</span>`);
            if (meta.fecha_salida) partes.push(`<span>📅 ${formatearFecha(meta.fecha_salida)}</span>`);
            if (meta.asiento) partes.push(`<span>💺 Asiento ${meta.asiento}</span>`);
            break;
        case 'tarjeta_embarque':
            if (meta.aerolinea) partes.push(`<span>✈️ ${meta.aerolinea}</span>`);
            if (meta.num_vuelo) partes.push(`<span class="meta-vuelo-destacado">🔢 <strong>${meta.num_vuelo}</strong></span>`);
            if (meta.pasajero) partes.push(`<span>👤 ${meta.pasajero}</span>`);
            if (meta.asiento) partes.push(`<span>💺 Asiento ${meta.asiento}</span>`);
            if (meta.puerta) partes.push(`<span>🚪 Puerta ${meta.puerta}</span>`);
            if (meta.hora_embarque) partes.push(`<span class="meta-hora-destacada">🕐 <strong>Embarque: ${meta.hora_embarque}</strong></span>`);
            break;
        case 'pasaje_bus':
            if (meta.empresa) partes.push(`<span>🚌 ${meta.empresa}</span>`);
            if (meta.origen && meta.destino) partes.push(`<span>📍 ${meta.origen} → ${meta.destino}</span>`);
            if (meta.fecha) partes.push(`<span>📅 ${formatearFecha(meta.fecha)}</span>`);
            break;
        case 'entrada':
            if (meta.nombre_lugar) partes.push(`<span>🎫 ${meta.nombre_lugar}</span>`);
            if (meta.fecha) partes.push(`<span>📅 ${formatearFecha(meta.fecha)}</span>`);
            if (meta.hora) partes.push(`<span>🕐 ${meta.hora}</span>`);
            break;
        case 'alojamiento':
            if (meta.hotel) partes.push(`<span>🏨 ${meta.hotel}</span>`);
            if (meta.checkin && meta.checkout) partes.push(`<span>📅 ${formatearFecha(meta.checkin)} → ${formatearFecha(meta.checkout)}</span>`);
            break;
        case 'seguro':
            if (meta.aseguradora) partes.push(`<span>🛡️ ${meta.aseguradora}</span>`);
            if (meta.desde && meta.hasta) partes.push(`<span>📅 ${formatearFecha(meta.desde)} – ${formatearFecha(meta.hasta)}</span>`);
            if (meta.telefono) partes.push(`<span>📞 ${meta.telefono}</span>`);
            break;
        case 'crucero':
            if (meta.naviera) partes.push(`<span>🚢 ${meta.naviera}</span>`);
            if (meta.barco) partes.push(`<span>⚓ ${meta.barco}</span>`);
            if (meta.embarque) partes.push(`<span>📅 ${formatearFecha(meta.embarque)}</span>`);
            break;
    }
    return partes.join('');
}

// ---- Inicializar eventos ----
function inicializarEventos() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tipoActivo = btn.dataset.tipo;
            renderDocumentos();
        });
    });

    document.getElementById('btnAgregarDoc').addEventListener('click', abrirModalNuevo);
    document.getElementById('fabAgregarDoc').addEventListener('click', abrirModalNuevo);
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalDocumento);
    document.getElementById('btnCancelarForm').addEventListener('click', cerrarModalDocumento);
    document.getElementById('btnCerrarVisor').addEventListener('click', cerrarVisor);

    document.getElementById('modalDocumento').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarModalDocumento();
    });
    document.getElementById('modalVisor').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarVisor();
    });

    document.querySelectorAll('.tipo-btn').forEach(btn => {
        btn.addEventListener('click', () => seleccionarTipo(btn.dataset.tipo));
    });

    const uploadArea = document.getElementById('uploadArea');
    const inputFile = document.getElementById('docArchivo');
    uploadArea.addEventListener('click', () => inputFile.click());
    inputFile.addEventListener('change', e => manejarArchivo(e.target.files[0]));
    document.getElementById('btnRemoveFile').addEventListener('click', e => {
        e.stopPropagation();
        limpiarArchivo();
    });
    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--color-primary)';
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '';
    });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        if (e.dataTransfer.files[0]) manejarArchivo(e.dataTransfer.files[0]);
    });

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

    document.querySelectorAll('.campos-tipo').forEach(el => {
        el.classList.toggle('visible', el.dataset.tipo === tipo);
    });

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
        mostrarNotificacion('El archivo supera los 10 MB', 'error');
        return;
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

        // Si estamos editando, conservar la URL existente por defecto
        const docExistente = editandoId ? documentos.find(d => d.id === editandoId) : null;
        let archivo_url = docExistente?.archivo_url || '';

        if (archivoSeleccionado) {
            const ext = archivoSeleccionado.name.split('.').pop();
            const path = `documentos/${viajeId}/${Date.now()}.${ext}`;
            const { error: errUp } = await supabaseClient.storage
                .from('viajes-docs')
                .upload(path, archivoSeleccionado, { upsert: true });
            if (errUp) {
                console.warn('Storage error (continuando sin archivo):', errUp.message);
                mostrarNotificacion('No se pudo subir el archivo, pero se guardará el documento', 'warning');
            } else {
                const { data: urlData } = supabaseClient.storage.from('viajes-docs').getPublicUrl(path);
                archivo_url = urlData.publicUrl || '';
            }
        }

        const payload = {
            viaje_id: viajeId,
            tipo,
            nombre,
            descripcion: notas || '',
            archivo_url,
            metadata
        };

        if (editandoId) {
            const { error } = await supabaseClient
                .from('v3_documentos')
                .update(payload)
                .eq('id', editandoId);
            if (error) throw error;
            mostrarNotificacion('Documento actualizado ✓', 'success');
        } else {
            const { error } = await supabaseClient
                .from('v3_documentos')
                .insert(payload);
            if (error) throw error;
            mostrarNotificacion('Documento guardado ✓', 'success');
        }

        cerrarModalDocumento();
        await cargarDocumentos();

    } catch (err) {
        console.error('Error guardando documento:', err);
        mostrarNotificacion('Error al guardar: ' + (err.message || err), 'error');
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = '💾 Guardar';
    }
}

function extraerMetadata(tipo) {
    const g = id => document.getElementById(id)?.value?.trim() || '';
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

    poblarCampos(doc.tipo, doc.metadata || {});

    (doc.metadata?.participantes || []).forEach(pid => {
        const cb = document.querySelector(`input[name="participante"][value="${pid}"]`);
        if (cb) cb.checked = true;
    });

    if (doc.archivo_url) {
        document.getElementById('uploadPlaceholder').style.display = 'none';
        document.getElementById('uploadPreview').style.display = 'flex';
        document.getElementById('previewName').textContent = 'Archivo existente (reemplazar para cambiar)';
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
    if (!confirmarAccion('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    const { error } = await supabaseClient.from('v3_documentos').delete().eq('id', id);
    if (error) { mostrarNotificacion('Error al eliminar', 'error'); return; }
    mostrarNotificacion('Documento eliminado', 'success');
    await cargarDocumentos();
}

// ---- Visor ----
function abrirVisor(id) {
    const doc = documentos.find(d => d.id === id);
    if (!doc || !doc.archivo_url) return;
    const cfg = TIPO_CONFIG[doc.tipo] || TIPO_CONFIG.otro;
    document.getElementById('visorTitulo').textContent = `${cfg.icon} ${doc.nombre}`;

    // Actualizar botones del visor
    const btnDescargar = document.getElementById('visorDescargar');
    btnDescargar.href = doc.archivo_url;
    btnDescargar.download = doc.nombre;

    const btnAbrir = document.getElementById('visorAbrirExterno');
    if (btnAbrir) btnAbrir.href = doc.archivo_url;

    const content = document.getElementById('visorContent');
    const esImagen = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.archivo_url);
    const esPDF = /\.pdf$/i.test(doc.archivo_url) || doc.archivo_url.includes('.pdf');

    if (esImagen) {
        content.innerHTML = `<img src="${doc.archivo_url}" alt="${doc.nombre}"
            style="max-width:100%;max-height:70vh;border-radius:8px;display:block;margin:0 auto;">`;
    } else if (esPDF) {
        // Google Docs Viewer embebido — funciona con URLs públicas, evita restricciones CORS/CSP de Supabase
        const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(doc.archivo_url)}&embedded=true`;
        content.innerHTML = `
            <div style="width:100%;height:70vh;position:relative;">
                <iframe
                    src="${googleViewerUrl}"
                    style="width:100%;height:100%;border:none;border-radius:8px;"
                    allowfullscreen
                    onload="this.previousElementSibling && (this.previousElementSibling.style.display='none')"
                ></iframe>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;pointer-events:none;" id="visorLoadingMsg">
                    <div style="font-size:2.5rem;margin-bottom:8px;">⏳</div>
                    <p style="font-size:0.9rem;">Cargando PDF...</p>
                </div>
            </div>
        `;
    } else {
        content.innerHTML = `
            <div style="text-align:center;color:#94a3b8;padding:60px 20px;">
                <div style="font-size:5rem;margin-bottom:16px;">📄</div>
                <p style="font-size:1rem;margin-bottom:24px;">Vista previa no disponible para este tipo de archivo</p>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                    <a href="${doc.archivo_url}" download="${doc.nombre}" class="btn-visor-accion" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">⬇️ Descargar</a>
                    <a href="${doc.archivo_url}" target="_blank" rel="noopener" class="btn-visor-accion" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">↗️ Abrir en nueva pestaña</a>
                </div>
            </div>`;
    }

    document.getElementById('modalVisor').classList.add('show');
}

function cerrarVisor() {
    document.getElementById('modalVisor').classList.remove('show');
    document.getElementById('visorContent').innerHTML = '';
}

// ---- Error pantalla completa ----
function mostrarError(msg) {
    document.querySelector('.main-content').innerHTML =
        `<div style="text-align:center;padding:80px 20px;color:#ef4444;">
            <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
            <h2>${msg}</h2>
            <a href="../index.html" style="display:inline-block;margin-top:20px;color:#6366f1;">← Volver al inicio</a>
        </div>`;
}
