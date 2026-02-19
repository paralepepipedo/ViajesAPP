// ============================================
// WIZARD - Creación de Viajes
// ============================================

// Variables globales
let pasoActual = 1;
let destinosTemp = [];
let participantesTemp = [];
let transportesSeleccionados = [];
let modoEdicion = false;
let viajeEditandoId = null;

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    inicializarWizard();
    inicializarTransportes();
    inicializarModales();
    inicializarBotones();

    // Verificar si estamos en modo edición
    const linkViaje = obtenerParametroURL('link');
    if (linkViaje) {
        modoEdicion = true;
        await cargarDatosViaje(linkViaje);
    }
});

// ============================================
// INICIALIZAR WIZARD
// ============================================
function inicializarWizard() {
    // Configurar fecha mínima (hoy)
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaInicio').min = hoy;
    document.getElementById('fechaFin').min = hoy;

    // Validar que fecha fin sea mayor a fecha inicio
    document.getElementById('fechaInicio').addEventListener('change', function () {
        document.getElementById('fechaFin').min = this.value;
    });
}

// ============================================
// INICIALIZAR TRANSPORTES
// ============================================
function inicializarTransportes() {
    const grid = document.getElementById('transportesGrid');
    grid.innerHTML = '';

    TIPOS_TRANSPORTE.forEach(transporte => {
        const card = document.createElement('div');
        card.className = 'transporte-card';
        card.dataset.tipo = transporte.id;
        card.innerHTML = `
            <span class="transporte-icon">${transporte.icon}</span>
            <div class="transporte-label">${transporte.label}</div>
        `;

        card.addEventListener('click', () => toggleTransporte(transporte.id, card));
        grid.appendChild(card);
    });
}

// Toggle selección de transporte
function toggleTransporte(tipo, card) {
    if (transportesSeleccionados.includes(tipo)) {
        transportesSeleccionados = transportesSeleccionados.filter(t => t !== tipo);
        card.classList.remove('selected');
    } else {
        transportesSeleccionados.push(tipo);
        card.classList.add('selected');
    }
}

// ============================================
// MODALES
// ============================================
function inicializarModales() {
    // Modal Destino
    const modalDestino = document.getElementById('modalDestino');
    const btnAgregarDestino = document.getElementById('btnAgregarDestino');
    const closeModalDestino = document.getElementById('closeModalDestino');
    const btnCancelarDestino = document.getElementById('btnCancelarDestino');
    const btnGuardarDestino = document.getElementById('btnGuardarDestino');

    btnAgregarDestino.addEventListener('click', () => {
        modalDestino.classList.add('active');
    });

    closeModalDestino.addEventListener('click', () => {
        modalDestino.classList.remove('active');
        limpiarFormularioDestino();
    });

    btnCancelarDestino.addEventListener('click', () => {
        modalDestino.classList.remove('active');
        limpiarFormularioDestino();
    });

    btnGuardarDestino.addEventListener('click', () => {
        agregarDestino();
    });

    // Modal Participante
    const modalParticipante = document.getElementById('modalParticipante');
    const btnAgregarParticipante = document.getElementById('btnAgregarParticipante');
    const closeModalParticipante = document.getElementById('closeModalParticipante');
    const btnCancelarParticipante = document.getElementById('btnCancelarParticipante');
    const btnGuardarParticipante = document.getElementById('btnGuardarParticipante');

    btnAgregarParticipante.addEventListener('click', () => {
        modalParticipante.classList.add('active');
    });

    closeModalParticipante.addEventListener('click', () => {
        modalParticipante.classList.remove('active');
        limpiarFormularioParticipante();
    });

    btnCancelarParticipante.addEventListener('click', () => {
        modalParticipante.classList.remove('active');
        limpiarFormularioParticipante();
    });

    btnGuardarParticipante.addEventListener('click', () => {
        agregarParticipante();
    });

    // Cerrar modales al hacer click fuera
    modalDestino.addEventListener('click', (e) => {
        if (e.target === modalDestino) {
            modalDestino.classList.remove('active');
            limpiarFormularioDestino();
        }
    });

    modalParticipante.addEventListener('click', (e) => {
        if (e.target === modalParticipante) {
            modalParticipante.classList.remove('active');
            limpiarFormularioParticipante();
        }
    });
}

// ============================================
// AGREGAR DESTINO
// ============================================
function agregarDestino() {
    const nombre = document.getElementById('inputDestinoNombre').value.trim();
    const moneda = document.getElementById('inputDestinoMoneda').value.trim().toUpperCase();
    const tipoCambio = parseFloat(document.getElementById('inputDestinoTipoCambio').value);

    // Validaciones
    if (!nombre) {
        mostrarNotificacion('Ingresa el nombre del destino', 'error');
        return;
    }

    if (!moneda || moneda.length !== 3) {
        mostrarNotificacion('Ingresa un código de moneda válido (3 letras)', 'error');
        return;
    }

    if (!tipoCambio || tipoCambio <= 0) {
        mostrarNotificacion('Ingresa un tipo de cambio válido', 'error');
        return;
    }

    // Agregar destino
    destinosTemp.push({
        id: Date.now(),
        nombre,
        moneda,
        tipoCambio
    });

    renderizarDestinos();
    document.getElementById('modalDestino').classList.remove('active');
    limpiarFormularioDestino();
    mostrarNotificacion('Destino agregado correctamente', 'success');
}

function limpiarFormularioDestino() {
    document.getElementById('inputDestinoNombre').value = '';
    document.getElementById('inputDestinoMoneda').value = '';
    document.getElementById('inputDestinoTipoCambio').value = '';
}

function renderizarDestinos() {
    const lista = document.getElementById('listaDestinos');

    if (destinosTemp.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🗺️</span>
                <p>No hay destinos agregados</p>
            </div>
        `;
        return;
    }

    lista.innerHTML = destinosTemp.map(destino => `
        <div class="item-card">
            <div class="item-info">
                <h4>${destino.nombre}</h4>
                <p>1 ${destino.moneda} = ${formatearNumero(destino.tipoCambio)} CLP</p>
            </div>
            <button class="btn-eliminar" onclick="eliminarDestino(${destino.id})">Eliminar</button>
        </div>
    `).join('');
}

function eliminarDestino(id) {
    if (!confirmarAccion('¿Eliminar este destino?')) return;
    destinosTemp = destinosTemp.filter(d => d.id !== id);
    renderizarDestinos();
    mostrarNotificacion('Destino eliminado', 'info');
}

// ============================================
// AGREGAR PARTICIPANTE
// ============================================
function agregarParticipante() {
    const nombre = document.getElementById('inputParticipanteNombre').value.trim();

    if (!nombre) {
        mostrarNotificacion('Ingresa el nombre del participante', 'error');
        return;
    }

    participantesTemp.push({
        id: Date.now(),
        nombre
    });

    renderizarParticipantes();
    document.getElementById('modalParticipante').classList.remove('active');
    limpiarFormularioParticipante();
    mostrarNotificacion('Participante agregado correctamente', 'success');
}

function limpiarFormularioParticipante() {
    document.getElementById('inputParticipanteNombre').value = '';
}

function renderizarParticipantes() {
    const lista = document.getElementById('listaParticipantes');

    if (participantesTemp.length === 0) {
        lista.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">👤</span>
                <p>No hay participantes agregados (opcional)</p>
            </div>
        `;
        return;
    }

    lista.innerHTML = participantesTemp.map(participante => `
        <div class="item-card">
            <div class="item-info">
                <h4>${participante.nombre}</h4>
            </div>
            <button class="btn-eliminar" onclick="eliminarParticipante(${participante.id})">Eliminar</button>
        </div>
    `).join('');
}

function eliminarParticipante(id) {
    if (!confirmarAccion('¿Eliminar este participante?')) return;
    participantesTemp = participantesTemp.filter(p => p.id !== id);
    renderizarParticipantes();
    mostrarNotificacion('Participante eliminado', 'info');
}

// ============================================
// NAVEGACIÓN ENTRE PASOS
// ============================================
function inicializarBotones() {
    // Paso 1
    document.getElementById('btnSiguiente1').addEventListener('click', () => {
        if (validarPaso1()) {
            irAPaso(2);
        }
    });

    // Paso 2
    document.getElementById('btnAtras2').addEventListener('click', () => irAPaso(1));
    document.getElementById('btnSiguiente2').addEventListener('click', () => {
        if (validarPaso2()) {
            irAPaso(3);
        }
    });

    // Paso 3
    document.getElementById('btnAtras3').addEventListener('click', () => irAPaso(2));
    document.getElementById('btnSiguiente3').addEventListener('click', () => {
        if (validarPaso3()) {
            mostrarResumen();
            irAPaso(4);
        }
    });

    // Paso 4
    document.getElementById('btnAtras4').addEventListener('click', () => irAPaso(3));
    document.getElementById('btnCrearViaje').addEventListener('click', crearViaje);
}

function irAPaso(numeroPaso) {
    // Ocultar paso actual
    document.querySelector('.wizard-page.active').classList.remove('active');
    document.querySelector('.step.active').classList.remove('active');

    // Marcar pasos completados
    for (let i = 1; i < numeroPaso; i++) {
        document.querySelector(`.step[data-step="${i}"]`).classList.add('completed');
    }

    // Mostrar nuevo paso
    document.getElementById(`paso${numeroPaso}`).classList.add('active');
    document.querySelector(`.step[data-step="${numeroPaso}"]`).classList.add('active');

    pasoActual = numeroPaso;
    window.scrollTo(0, 0);
}

// ============================================
// VALIDACIONES
// ============================================
function validarPaso1() {
    const nombre = document.getElementById('nombreViaje').value.trim();
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const creadorNombre = document.getElementById('creadorNombre').value.trim();
    const creadorEmail = document.getElementById('creadorEmail').value.trim();

    if (!nombre) {
        mostrarNotificacion('Ingresa el nombre del viaje', 'error');
        return false;
    }

    if (!fechaInicio || !fechaFin) {
        mostrarNotificacion('Ingresa las fechas del viaje', 'error');
        return false;
    }

    if (new Date(fechaFin) < new Date(fechaInicio)) {
        mostrarNotificacion('La fecha de fin debe ser posterior a la fecha de inicio', 'error');
        return false;
    }

    if (!creadorNombre) {
        mostrarNotificacion('Ingresa tu nombre', 'error');
        return false;
    }

    if (creadorEmail && !validarEmail(creadorEmail)) {
        mostrarNotificacion('Ingresa un email válido', 'error');
        return false;
    }

    return true;
}

function validarPaso2() {
    if (destinosTemp.length === 0) {
        mostrarNotificacion('Agrega al menos un destino', 'error');
        return false;
    }
    return true;
}

function validarPaso3() {
    // Los participantes son opcionales, no hay validación obligatoria
    return true;
}

// ============================================
// MOSTRAR RESUMEN
// ============================================
function mostrarResumen() {
    const nombre = document.getElementById('nombreViaje').value.trim();
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;
    const creadorNombre = document.getElementById('creadorNombre').value.trim();

    const dias = calcularDias(fechaInicio, fechaFin);

    // Información general
    document.getElementById('resumenNombre').textContent = nombre;
    document.getElementById('resumenDuracion').textContent = `${dias} día${dias !== 1 ? 's' : ''}`;
    document.getElementById('resumenFechas').textContent = `${formatearFecha(fechaInicio)} - ${formatearFecha(fechaFin)}`;
    document.getElementById('resumenCreador').textContent = creadorNombre;

    // Destinos
    document.getElementById('resumenDestinosCount').textContent = destinosTemp.length;
    document.getElementById('resumenDestinos').innerHTML = destinosTemp.map(d =>
        `• ${d.nombre} - 1 ${d.moneda} = ${formatearNumero(d.tipoCambio)} CLP`
    ).join('<br>');

    // Participantes (incluyendo creador)
    const totalParticipantes = participantesTemp.length + 1;
    document.getElementById('resumenParticipantesCount').textContent = totalParticipantes;
    document.getElementById('resumenParticipantes').innerHTML =
        `• ${creadorNombre} (tú)<br>` +
        participantesTemp.map(p => `• ${p.nombre}`).join('<br>');

    // Transportes
    if (transportesSeleccionados.length === 0) {
        document.getElementById('resumenTransportes').textContent = 'No se seleccionaron transportes';
    } else {
        const transportesTexto = transportesSeleccionados.map(t => {
            const transporte = TIPOS_TRANSPORTE.find(tipo => tipo.id === t);
            return `${transporte.icon} ${transporte.label}`;
        }).join('<br>');
        document.getElementById('resumenTransportes').innerHTML = transportesTexto;
    }
}

// ============================================
// CREAR VIAJE
// ============================================
async function crearViaje() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');

    try {
        const nombre = document.getElementById('nombreViaje').value.trim();
        const fechaInicio = document.getElementById('fechaInicio').value;
        const fechaFin = document.getElementById('fechaFin').value;
        const creadorNombre = document.getElementById('creadorNombre').value.trim();
        const creadorEmail = document.getElementById('creadorEmail').value.trim();

        const tieneCrucero = transportesSeleccionados.includes('crucero');

        let viajeId = viajeEditandoId;
        let linkUnico = obtenerParametroURL('link');

        if (modoEdicion) {
            // ACTUALIZAR VIAJE EXISTENTE
            const { error: errorViaje } = await supabaseClient
                .from('v3_viajes')  // ← minúsculas
                .update({
                    nombre,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    creador_nombre: creadorNombre,
                    creador_email: creadorEmail || null,
                    tiene_crucero: tieneCrucero
                })
                .eq('id', viajeId);

            if (errorViaje) throw errorViaje;

            // Eliminar destinos, participantes y transportes existentes
            await supabaseClient.from('v3_destinos').delete().eq('viaje_id', viajeId);  // ← minúsculas
            await supabaseClient.from('v3_participantes').delete().eq('viaje_id', viajeId);  // ← minúsculas
            await supabaseClient.from('v3_transportes').delete().eq('viaje_id', viajeId);  // ← minúsculas

        } else {
            // CREAR NUEVO VIAJE
            const { data: viaje, error: errorViaje } = await supabaseClient
                .from('v3_viajes')  // ← minúsculas
                .insert({
                    nombre,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    creador_nombre: creadorNombre,
                    creador_email: creadorEmail || null,
                    tiene_crucero: tieneCrucero
                })
                .select()
                .single();

            if (errorViaje) throw errorViaje;

            viajeId = viaje.id;
            linkUnico = viaje.link_unico;
        }

        // Insertar destinos
        const destinosInsert = destinosTemp.map((d, index) => ({
            viaje_id: viajeId,
            nombre: d.nombre,
            moneda_codigo: d.moneda,
            tipo_cambio_clp: d.tipoCambio,
            orden: index
        }));

        const { error: errorDestinos } = await supabaseClient
            .from('v3_destinos')  // ← minúsculas
            .insert(destinosInsert);

        if (errorDestinos) throw errorDestinos;

        // Insertar participantes (creador + adicionales)
        const participantesInsert = [
            {
                viaje_id: viajeId,
                nombre: creadorNombre,
                es_creador: true
            },
            ...participantesTemp.map(p => ({
                viaje_id: viajeId,
                nombre: p.nombre,
                es_creador: false
            }))
        ];

        const { error: errorParticipantes } = await supabaseClient
            .from('v3_participantes')  // ← minúsculas
            .insert(participantesInsert);

        if (errorParticipantes) throw errorParticipantes;

        // Insertar transportes
        if (transportesSeleccionados.length > 0) {
            const transportesInsert = transportesSeleccionados.map(t => ({
                viaje_id: viajeId,
                tipo: t,
                detalles: {}
            }));

            const { error: errorTransportes } = await supabaseClient
                .from('v3_transportes')  // ← minúsculas
                .insert(transportesInsert);

            if (errorTransportes) throw errorTransportes;
        }

        // Si el viaje tiene crucero, crear registro en v3_cruceros
        if (tieneCrucero) {
            const { error: errorCrucero } = await supabaseClient
                .from('v3_cruceros')  // ← minúsculas
                .insert({
                    viaje_id: viajeId,
                    nombre_barco: 'Por definir',
                    naviera: 'Por definir',
                    fecha_embarque: fechaInicio,
                    fecha_desembarque: fechaFin
                });

            if (errorCrucero) throw errorCrucero;
        }

        loadingOverlay.classList.remove('active');

        // Redirigir al dashboard
        mostrarNotificacion(modoEdicion ? 'Viaje actualizado correctamente' : 'Viaje creado correctamente', 'success');

        setTimeout(() => {
            window.location.href = `../dashboard/dashboard.html?link=${linkUnico}`;
        }, 1500);

    } catch (error) {
        loadingOverlay.classList.remove('active');
        console.error('Error creando viaje:', error);
        mostrarNotificacion('Error al crear el viaje. Intenta nuevamente', 'error');
    }
}


// ============================================
// CARGAR DATOS PARA EDICIÓN
// ============================================
async function cargarDatosViaje(linkViaje) {
    try {
        // Cargar viaje
        const { data: viaje, error: errorViaje } = await supabaseClient
            .from('v3_viajes')  // ← minúsculas
            .select('*')
            .eq('link_unico', linkViaje)
            .single();

        if (errorViaje) throw errorViaje;

        viajeEditandoId = viaje.id;

        // Llenar formulario paso 1
        document.getElementById('nombreViaje').value = viaje.nombre;
        document.getElementById('fechaInicio').value = viaje.fecha_inicio;
        document.getElementById('fechaFin').value = viaje.fecha_fin;
        document.getElementById('creadorNombre').value = viaje.creador_nombre;
        document.getElementById('creadorEmail').value = viaje.creador_email || '';

        // Cargar destinos
        const { data: destinos, error: errorDestinos } = await supabaseClient
            .from('v3_destinos')  // ← minúsculas
            .select('*')
            .eq('viaje_id', viaje.id)
            .order('orden');

        if (errorDestinos) throw errorDestinos;

        destinosTemp = destinos.map(d => ({
            id: Date.now() + Math.random(),
            nombre: d.nombre,
            moneda: d.moneda_codigo,
            tipoCambio: d.tipo_cambio_clp
        }));

        renderizarDestinos();

        // Cargar participantes (excepto creador)
        const { data: participantes, error: errorParticipantes } = await supabaseClient
            .from('v3_participantes')  // ← minúsculas
            .select('*')
            .eq('viaje_id', viaje.id)
            .eq('es_creador', false);

        if (errorParticipantes) throw errorParticipantes;

        participantesTemp = participantes.map(p => ({
            id: Date.now() + Math.random(),
            nombre: p.nombre
        }));

        renderizarParticipantes();

        // Cargar transportes
        const { data: transportes, error: errorTransportes } = await supabaseClient
            .from('v3_transportes')  // ← minúsculas
            .select('*')
            .eq('viaje_id', viaje.id);

        if (errorTransportes) throw errorTransportes;

        transportesSeleccionados = transportes.map(t => t.tipo);

        // Marcar transportes seleccionados visualmente
        setTimeout(() => {
            transportesSeleccionados.forEach(tipo => {
                const card = document.querySelector(`.transporte-card[data-tipo="${tipo}"]`);
                if (card) card.classList.add('selected');
            });
        }, 100);

        // Cambiar texto del botón final
        document.getElementById('btnCrearViaje').innerHTML = '💾 Actualizar Viaje';

    } catch (error) {
        console.error('Error cargando datos del viaje:', error);
        mostrarNotificacion('Error cargando datos del viaje', 'error');
    }
}

