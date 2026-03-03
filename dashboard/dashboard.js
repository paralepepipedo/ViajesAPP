// ============================================
// DASHBOARD - Vista Principal del Viaje
// ============================================

let viajeData = null;
let linkViaje = null;
let countdownInterval = null;

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

    verificarEstadoConexion();
    await cargarDashboard();
});

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
        cargarDashboard();
    });
}

// ============================================
// CARGAR DASHBOARD
// ============================================
async function cargarDashboard() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');

    try {
        // Cargar viaje
        const { data: viaje, error: errorViaje } = await supabaseClient
            .from('v3_viajes')
            .select('*')
            .eq('link_unico', linkViaje)
            .single();

        if (errorViaje) throw errorViaje;

        viajeData = viaje;

        // Cargar todas las tablas relacionadas EN PARALELO
        // Nota: NO usar .single() dentro de Promise.all — si falla rompe todo
        const queries = [
            supabaseClient.from('v3_destinos').select('*').eq('viaje_id', viaje.id).order('orden'),
            supabaseClient.from('v3_participantes').select('*').eq('viaje_id', viaje.id),
            supabaseClient.from('v3_transportes').select('*').eq('viaje_id', viaje.id),
            supabaseClient.from('v3_gastos').select('*').eq('viaje_id', viaje.id).order('fecha', { ascending: false }),
            supabaseClient.from('v3_itinerario').select('*').eq('viaje_id', viaje.id).order('fecha', { ascending: true }).order('hora_inicio', { ascending: true }),
            supabaseClient.from('v3_documentos').select('*').eq('viaje_id', viaje.id),
            supabaseClient.from('v3_cruceros').select('*').eq('viaje_id', viaje.id).order('created_at', { ascending: false }).limit(1),
        ];

        const resultados = await Promise.all(queries);

        viajeData.destinos      = resultados[0].data || [];
        viajeData.participantes = resultados[1].data || [];
        viajeData.transportes   = resultados[2].data || [];
        viajeData.gastos        = resultados[3].data || [];
        viajeData.itinerario    = resultados[4].data || [];
        viajeData.documentos    = resultados[5].data || [];
        // Tomar el primer crucero del array (no .single() para evitar errores)
        viajeData.crucero       = (resultados[6].data && resultados[6].data.length > 0)
                                    ? resultados[6].data[0]
                                    : null;

        // Guardar en cache localStorage
        try {
            const cacheActual = JSON.parse(localStorage.getItem('viajes_cache_v3') || '[]');
            const idx = cacheActual.findIndex(v => v.link_unico === viajeData.link_unico);
            if (idx >= 0) cacheActual[idx] = viajeData; else cacheActual.push(viajeData);
            localStorage.setItem('viajes_cache_v3', JSON.stringify(cacheActual));
        } catch(e) { console.warn('Cache write error:', e); }

        // Renderizar dashboard
        renderizarHero();
        renderizarAccionesRapidas(); // ← MOVIDO AQUÍ (antes era después de stats)
        renderizarStats();
        renderizarTransportes();
        renderizarChecklist();
        renderizarProximasActividades();
        renderizarUltimosGastos();

        // Iniciar cuenta regresiva
        iniciarCuentaRegresiva();

        loadingOverlay.classList.remove('active');

    } catch (error) {
        console.error('Error cargando dashboard:', error);
        loadingOverlay.classList.remove('active');

        // Intentar cargar desde cache localStorage
        try {
            const cacheActual = JSON.parse(localStorage.getItem('viajes_cache_v3') || '[]');
            const viajeCache = cacheActual.find(v => v.link_unico === linkViaje);
            if (viajeCache) {
                viajeData = viajeCache;
                renderizarHero();
                renderizarAccionesRapidas();
                renderizarStats();
                renderizarTransportes();
                renderizarChecklist();
                renderizarProximasActividades();
                renderizarUltimosGastos();
                iniciarCuentaRegresiva();
                mostrarNotificacion('Cargando desde cache local', 'info');
            } else {
                mostrarNotificacion('Error cargando el viaje', 'error');
                setTimeout(() => { window.location.href = '../index.html'; }, 2000);
            }
        } catch(e) {
            mostrarNotificacion('Error cargando el viaje', 'error');
            setTimeout(() => { window.location.href = '../index.html'; }, 2000);
        }
    }
}

// ============================================
// RENDERIZAR HERO CON CUENTA REGRESIVA
// ============================================
function renderizarHero() {
    const heroContainer = document.getElementById('dashboardHero');
    const estado = obtenerEstadoViaje(viajeData);
    const diasInfo = calcularDiasInfo(viajeData);
    const tipoViaje = detectarTipoViaje(viajeData);

    heroContainer.innerHTML = `
        <div class="hero-content">
            <div class="hero-header">
                <div class="hero-title">
                    <h1>${viajeData.nombre}</h1>
                    <div class="hero-subtitle">
                        📅 ${formatearFechaLocal(viajeData.fecha_inicio)} - ${formatearFechaLocal(viajeData.fecha_fin)}
                        <span>•</span>
                        <span>${calcularDias(viajeData.fecha_inicio, viajeData.fecha_fin)} días</span>
                    </div>
                </div>
                <button class="btn-edit-viaje" onclick="editarViaje()">
                    ⚙️ Editar Viaje
                </button>
            </div>
            
            <div class="hero-badges">
                ${generarBadgesEstado(estado)}
                ${generarBadgesTipo(tipoViaje)}
            </div>
            
            <div class="hero-countdown">
                <div class="countdown-main">
                    <div class="countdown-days" id="countdownDays">${diasInfo.numero}</div>
                    <div class="countdown-days-label">${diasInfo.textoCorto || 'DÍAS'}</div>
                </div>
                <div class="countdown-clock">
                    <div class="clock-display" id="clockDisplay">00:00:00</div>
                    <div class="clock-labels">H  M  S</div>
                </div>
            </div>
        </div>
    `;
}


// ============================================
// INICIAR CUENTA REGRESIVA
// ============================================
function iniciarCuentaRegresiva() {
    // Limpiar intervalo anterior si existe
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    const estado = obtenerEstadoViaje(viajeData);

    // Solo mostrar cuenta regresiva para viajes próximos o en curso
    if (estado === 'finalizados') {
        return;
    }

    const fechaObjetivo = estado === 'proximos'
        ? new Date(viajeData.fecha_inicio + 'T00:00:00')
        : new Date(viajeData.fecha_fin + 'T23:59:59');

    function actualizarReloj() {
        const ahora = new Date();
        const diferencia = fechaObjetivo - ahora;

        if (diferencia <= 0) {
            clearInterval(countdownInterval);
            // Recargar dashboard cuando cambie el estado
            cargarDashboard();
            return;
        }

        const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);

        document.getElementById('countdownDays').textContent = dias;
        document.getElementById('clockDisplay').textContent =
            `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }

    // Actualizar inmediatamente
    actualizarReloj();

    // Actualizar cada segundo
    countdownInterval = setInterval(actualizarReloj, 1000);
}

// ============================================
// GENERAR BADGES DE ESTADO
// ============================================
function generarBadgesEstado(estado) {
    const clases = {
        'proximos': 'badge-proximo',
        'en_curso': 'badge-en-curso',
        'finalizados': 'badge-finalizado'
    };

    const textos = {
        'proximos': '🔜 Próximo',
        'en_curso': '✈️ En Curso',
        'finalizados': '✅ Finalizado'
    };

    return `<span class="hero-badge ${clases[estado]}">${textos[estado]}</span>`;
}

// ============================================
// GENERAR BADGES DE TIPO
// ============================================
function generarBadgesTipo(tipos) {
    if (!tipos || tipos.length === 0) return '';

    return tipos.map(t => `
        <span class="hero-badge badge-${t.tipo}">
            ${t.icono} ${t.label}
        </span>
    `).join('');
}

// ============================================
// DETECTAR TIPO DE VIAJE
// ============================================
function detectarTipoViaje(viaje) {
    const tipos = [];

    if (viaje.tiene_crucero) {
        tipos.push({ tipo: 'crucero', icono: '🛳️', label: 'Crucero' });
    }

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

    if (tipos.length === 0) {
        tipos.push({ tipo: 'ciudad', icono: '🏙️', label: 'Ciudad' });
    }

    return tipos;
}

// ============================================
// RENDERIZAR ESTADÍSTICAS COMPACTAS
// ============================================
function renderizarStats() {
    const statsContainer = document.getElementById('statsGrid');

    const totalDestinos = viajeData.destinos?.length || 0;
    const totalParticipantes = viajeData.participantes?.length || 0;
    const totalGastos = calcularTotalGastos(viajeData.gastos);
    const gastosCount = viajeData.gastos?.length || 0;
    const actividadesCount = viajeData.itinerario?.length || 0;
    const documentosCount = viajeData.documentos?.length || 0;
    const transportesCount = viajeData.transportes?.length || 0;
    const duracionDias = calcularDias(viajeData.fecha_inicio, viajeData.fecha_fin);

    // Calcular progreso de documentos
    const documentosPendientes = Math.max(0, transportesCount - documentosCount);
    const progresoDocumentos = transportesCount > 0
        ? Math.round((documentosCount / transportesCount) * 100)
        : 0;

    statsContainer.innerHTML = `
        <!-- FICHA 1: Resumen del Viaje -->
        <div class="stat-card">
            <div class="stat-card-header">
                <div class="stat-card-title">📍 Resumen del Viaje</div>
                <div class="stat-card-icon">🗺️</div>
            </div>
            <div class="stat-card-content">
                <div class="stat-item">
                    <span class="stat-item-label">Destinos</span>
                    <span class="stat-item-value">${totalDestinos}</span>
                </div>
                <div class="destinos-flags">
                    ${viajeData.destinos.map(d => `
                        <span class="flag-item">🌎 ${d.nombre}</span>
                    `).join('')}
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Viajeros</span>
                    <span class="stat-item-value">${totalParticipantes}</span>
                </div>
                <div class="participantes-avatars">
                    ${viajeData.participantes.slice(0, 5).map(p => `
                        <div class="avatar" title="${p.nombre}">
                            ${obtenerIniciales(p.nombre)}
                        </div>
                    `).join('')}
                    ${totalParticipantes > 5 ? `<div class="avatar">+${totalParticipantes - 5}</div>` : ''}
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Duración</span>
                    <span class="stat-item-value">${duracionDias} días</span>
                </div>
            </div>
        </div>
        
        <!-- FICHA 2: Presupuesto & Gastos -->
        <div class="stat-card" onclick="irAGastos()">
            <div class="stat-card-header">
                <div class="stat-card-title">💳 Presupuesto & Gastos</div>
                <div class="stat-card-icon">📊</div>
            </div>
            <div class="stat-card-content">
                <div class="stat-main-value">$${formatearNumero(totalGastos)}</div>
                <div class="stat-item">
                    <span class="stat-item-label">Total gastado (CLP)</span>
                    <span class="stat-item-value">${gastosCount} registros</span>
                </div>
                ${gastosCount > 0 ? generarMiniGraficoGastos() : '<p style="text-align:center;color:var(--text-gray);font-size:0.9rem;margin-top:1rem;">Sin gastos registrados</p>'}
            </div>
        </div>
        
        <!-- FICHA 3: Planificación -->
        <div class="stat-card" onclick="irAItinerario()">
            <div class="stat-card-header">
                <div class="stat-card-title">📋 Planificación</div>
                <div class="stat-card-icon">✅</div>
            </div>
            <div class="stat-card-content">
                <div class="stat-item">
                    <span class="stat-item-label">Actividades</span>
                    <span class="stat-item-value">${actividadesCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-item-label">Documentos</span>
                    <span class="stat-item-value">${documentosCount}/${transportesCount}</span>
                </div>
                <div class="stat-progress-container">
                    <div class="progress-text">
                        <span>Progreso</span>
                        <strong>${progresoDocumentos}%</strong>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progresoDocumentos}%"></div>
                    </div>
                </div>
                ${documentosPendientes > 0 ? `
                    <div style="color:var(--warning);font-size:0.85rem;margin-top:0.5rem;text-align:center;">
                        ⚠️ ${documentosPendientes} documento(s) pendiente(s)
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// ============================================
// GENERAR MINI GRÁFICO DE GASTOS
// ============================================
function generarMiniGraficoGastos() {
    if (!viajeData.gastos || viajeData.gastos.length === 0) return '';

    // Agrupar gastos por categoría
    const gastosPorCategoria = {};
    viajeData.gastos.forEach(gasto => {
        const cat = gasto.categoria || 'Otro';
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + parseFloat(gasto.monto_clp || 0);
    });

    // Obtener top 5 categorías
    const topCategorias = Object.entries(gastosPorCategoria)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const maxMonto = Math.max(...topCategorias.map(c => c[1]));

    return `
        <div class="stat-mini-chart">
            ${topCategorias.map(([cat, monto]) => {
        const altura = (monto / maxMonto) * 100;
        return `<div class="chart-bar" style="height: ${altura}%" title="${cat}: $${formatearNumero(monto)}"></div>`;
    }).join('')}
        </div>
    `;
}

// ============================================
// OBTENER INICIALES
// ============================================
function obtenerIniciales(nombre) {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ============================================
// CALCULAR TOTAL DE GASTOS
// ============================================
function calcularTotalGastos(gastos) {
    if (!gastos || gastos.length === 0) return 0;

    return gastos.reduce((total, gasto) => {
        return total + (parseFloat(gasto.monto_clp) || 0);
    }, 0);
}

// ============================================
// RENDERIZAR TRANSPORTES
// ============================================
function renderizarTransportes() {
    const transportesSection = document.createElement('div');
    transportesSection.className = 'transportes-section';
    transportesSection.innerHTML = `
        <h2 class="section-title">✈️ Tus Vuelos y Transportes</h2>
        <div class="transporte-timeline" id="transporteTimeline">
            <!-- Se llenará dinámicamente -->
        </div>
    `;

    // Insertar después de stats
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.parentNode.insertBefore(transportesSection, statsGrid.nextSibling);

    const timeline = document.getElementById('transporteTimeline');

    if (!viajeData.transportes || viajeData.transportes.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚗</div>
                <p>No hay transportes registrados</p>
            </div>
        `;
        return;
    }

    const iconos = {
        'avion': '✈️',
        'crucero': '🛳️',
        'auto': '🚗',
        'bus': '🚌',
        'tren': '🚂'
    };

    // Helpers para leer documentos relacionados
    const docs = viajeData.documentos || [];

    // Busca todos los documentos de un tipo dado (puede haber varios, ej: ida y vuelta)
    function buscarDocsPorTipo(...tipos) {
        return docs.filter(d => tipos.includes(d.tipo));
    }

    // Formatea un datetime string a fecha legible
    function formatearDatetime(datetimeStr) {
        if (!datetimeStr) return null;
        const dt = new Date(datetimeStr);
        if (isNaN(dt)) return null;
        const fecha = dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
        const hora  = dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${fecha} ${hora}`;
    }

    timeline.innerHTML = viajeData.transportes.map((t) => {
        const detalles = t.detalles || {};
        let contenidoDetalle = '';
        let tieneDocumento = false;

        if (t.tipo === 'avion') {
            // Leer todos los pasajes de avión subidos en documentos
            const pasajes = buscarDocsPorTipo('pasaje_avion', 'tarjeta_embarque');
            tieneDocumento = pasajes.length > 0;

            if (pasajes.length > 0) {
                // Mostrar cada pasaje encontrado (puede haber ida y vuelta)
                contenidoDetalle = pasajes.map(doc => {
                    const m = doc.metadata || {};
                    const ruta = (m.origen && m.destino) ? `${m.origen} → ${m.destino}` : '';
                    const salida = formatearDatetime(m.fecha_salida);
                    const tieneArchivo = doc.archivo_url && doc.archivo_url !== '';
                    const docIdEscapado = doc.id.replace(/'/g, "\\'");
                    return `
                        <div class="transporte-sub-item">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <strong>${doc.nombre}</strong>
                                ${tieneArchivo ? `
                                    <button
                                        onclick="abrirVisorDashboard('${docIdEscapado}')"
                                        title="Ver documento"
                                        style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:8px;padding:4px 10px;font-size:0.8rem;cursor:pointer;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:4px;">
                                        🎫 Ver pasaje
                                    </button>` : ''}
                            </div>
                            ${ruta ? `<div>🗺️ <strong>Ruta:</strong> ${ruta}</div>` : ''}
                            ${m.aerolinea ? `<div>✈️ <strong>Aerolínea:</strong> ${m.aerolinea}</div>` : ''}
                            ${m.num_vuelo ? `<div>🔢 <strong>N° Vuelo:</strong> ${m.num_vuelo}</div>` : ''}
                            ${salida ? `<div>🕐 <strong>Salida:</strong> ${salida}</div>` : ''}
                            ${m.asiento ? `<div>💺 <strong>Asiento:</strong> ${m.asiento}</div>` : ''}
                            ${m.terminal ? `<div>🖥️ <strong>Terminal:</strong> ${m.terminal}</div>` : ''}
                            ${m.puerta ? `<div>🚪 <strong>Puerta:</strong> ${m.puerta}</div>` : ''}
                            ${m.reserva ? `<div>🔖 <strong>Reserva:</strong> ${m.reserva}</div>` : ''}
                        </div>
                    `;
                }).join('<hr style="border:none;border-top:1px solid var(--border-color);margin:0.5rem 0;">');
            } else {
                // Sin documentos: mostrar lo que haya en detalles del wizard (puede estar vacío)
                contenidoDetalle = `
                    <div><strong>Aerolínea:</strong> ${detalles.aerolinea || 'Por definir'}</div>
                    <div><strong>N° Vuelo:</strong> ${detalles.numero_vuelo || 'Por definir'}</div>
                    ${detalles.origen || detalles.destino ? `<div><strong>Ruta:</strong> ${detalles.origen || '?'} → ${detalles.destino || '?'}</div>` : ''}
                    ${detalles.fecha ? `<div><strong>Fecha:</strong> ${formatearFechaLocal(detalles.fecha)}${detalles.hora ? ` a las ${detalles.hora}` : ''}</div>` : ''}
                    <div style="color:var(--text-gray);font-size:0.85rem;margin-top:0.5rem;">Sube el pasaje en Documentos para ver los detalles aquí.</div>
                `;
            }

        } else if (t.tipo === 'crucero') {
            // Datos base del wizard (v3_cruceros)
            const crucero = viajeData.crucero;

            // Complementar con documento de crucero si existe
            const docCrucero = buscarDocsPorTipo('crucero')[0];
            tieneDocumento = !!docCrucero;
            const mc = docCrucero?.metadata || {};

            const nombreBarco    = crucero?.nombre_barco    || mc.barco    || 'Por definir';
            const naviera        = crucero?.naviera         || mc.naviera  || 'Por definir';
            const cabina         = crucero?.numero_cabina   || 'Por asignar';
            const reserva        = mc.reserva               || detalles.numero_reserva || null;
            const embarque       = crucero?.fecha_embarque
                                    ? formatearFechaLocal(crucero.fecha_embarque)
                                    : (mc.embarque ? formatearDatetime(mc.embarque) : 'Por definir');
            const desembarque    = crucero?.fecha_desembarque
                                    ? formatearFechaLocal(crucero.fecha_desembarque)
                                    : 'Por definir';
            const tieneArchivoCrucero = docCrucero?.archivo_url && docCrucero.archivo_url !== '';
            const cruceroDocId = docCrucero?.id || '';

            contenidoDetalle = `
                ${tieneArchivoCrucero ? `
                    <div style="margin-bottom:8px;">
                        <button
                            onclick="abrirVisorDashboard('${cruceroDocId.replace(/'/g, "\\'")}')"
                            title="Ver documento del crucero"
                            style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;border:none;border-radius:8px;padding:4px 12px;font-size:0.8rem;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
                            🚢 Ver documento
                        </button>
                    </div>` : ''}
                <div>🚢 <strong>Barco:</strong> ${nombreBarco}</div>
                <div>🏢 <strong>Naviera:</strong> ${naviera}</div>
                <div>🛏️ <strong>Cabina:</strong> ${cabina}</div>
                <div>⚓ <strong>Embarque:</strong> ${embarque}</div>
                <div>🏁 <strong>Desembarque:</strong> ${desembarque}</div>
                ${reserva ? `<div>🔖 <strong>Reserva:</strong> ${reserva}</div>` : ''}
            `;

        } else {
            // Otros transportes: bus, auto, tren, etc.
            const tiposDoc = t.tipo === 'bus' ? ['pasaje_bus'] : ['otro'];
            const docOtro = buscarDocsPorTipo(...tiposDoc)[0];
            tieneDocumento = !!docOtro || !!t.archivo_url;
            const mo = docOtro?.metadata || {};

            contenidoDetalle = `
                <div><strong>Tipo:</strong> ${t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1)}</div>
                ${(detalles.empresa || mo.empresa) ? `<div><strong>Empresa:</strong> ${detalles.empresa || mo.empresa}</div>` : ''}
                ${(detalles.numero_reserva || mo.reserva) ? `<div><strong>Reserva:</strong> ${detalles.numero_reserva || mo.reserva}</div>` : ''}
                ${(mo.origen && mo.destino) ? `<div><strong>Ruta:</strong> ${mo.origen} → ${mo.destino}</div>` : ''}
                ${(detalles.fecha || mo.fecha) ? `<div><strong>Fecha:</strong> ${formatearFechaLocal(detalles.fecha || mo.fecha)}</div>` : (!detalles.empresa && !mo.empresa ? '<div style="color:var(--text-gray);font-size:0.85rem;">Detalles por completar</div>' : '')}
            `;
        }

        return `
            <div class="transporte-item">
                <div class="transporte-header">
                    <div class="transporte-title">
                        ${iconos[t.tipo] || '🚗'} ${t.tipo === 'avion' ? 'Vuelo' : t.tipo.charAt(0).toUpperCase() + t.tipo.slice(1)}
                    </div>
                    <span class="transporte-status ${tieneDocumento ? 'status-completo' : 'status-pendiente'}">
                        ${tieneDocumento ? '✓ Documento subido' : '⚠️ Pendiente'}
                    </span>
                </div>
                <div class="transporte-details">
                    ${contenidoDetalle}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDERIZAR ACCIONES RÁPIDAS
// ============================================
function renderizarAccionesRapidas() {
    const actionsContainer = document.getElementById('actionsGrid');

    const acciones = [
        { icono: '💳', label: 'Agregar Gasto', url: `../gastos/gastos.html?link=${linkViaje}` },
        { icono: '📅', label: 'Nueva Actividad', url: `../itinerario/itinerario.html?link=${linkViaje}` },
        { icono: '📄', label: 'Subir Documento', url: `../documentos/documentos.html?link=${linkViaje}` }
    ];

    if (viajeData.tiene_crucero) {
        acciones.push({ icono: '🛳️', label: 'Gestionar Crucero', url: `../crucero/crucero.html?link=${linkViaje}` });
    }

    actionsContainer.innerHTML = acciones.map(accion => `
        <a href="${accion.url}" class="action-card">
            <span class="action-icon">${accion.icono}</span>
            <div class="action-label">${accion.label}</div>
        </a>
    `).join('');
}

// ============================================
// RENDERIZAR CHECKLIST
// ============================================
function renderizarChecklist() {
    const checklistContainer = document.getElementById('checklistContainer');

    const checklist = [
        { id: 'destinos', label: 'Destinos configurados', completado: viajeData.destinos?.length > 0 },
        { id: 'participantes', label: 'Participantes agregados', completado: viajeData.participantes?.length > 1 },
        { id: 'transportes', label: 'Transportes definidos', completado: viajeData.transportes?.length > 0 },
        { id: 'documentos', label: 'Documentos de viaje subidos', completado: viajeData.documentos?.length > 0 },
        { id: 'itinerario', label: 'Itinerario planificado', completado: viajeData.itinerario?.length > 0 }
    ];

    const pendientes = checklist.filter(item => !item.completado).length;

    if (pendientes === 0) {
        checklistContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✅</div>
                <p><strong>¡Todo listo!</strong> Has completado todos los preparativos.</p>
            </div>
        `;
        return;
    }

    checklistContainer.innerHTML = checklist.map(item => `
        <div class="checklist-item ${item.completado ? 'completed' : ''}">
            <div class="checklist-checkbox">
                ${item.completado ? '✓' : ''}
            </div>
            <div class="checklist-text">${item.label}</div>
        </div>
    `).join('');
}

// ============================================
// RENDERIZAR PRÓXIMAS ACTIVIDADES
// ============================================
function renderizarProximasActividades() {
    const upcomingContainer = document.getElementById('upcomingContainer');

    if (!viajeData.itinerario || viajeData.itinerario.length === 0) {
        upcomingContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <p>No hay actividades programadas aún</p>
            </div>
        `;
        return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const proximasActividades = viajeData.itinerario
        .filter(act => {
            const fechaAct = new Date(act.fecha + 'T00:00:00');
            return fechaAct >= hoy;
        })
        .slice(0, 5);

    if (proximasActividades.length === 0) {
        upcomingContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✅</div>
                <p>No hay actividades próximas programadas</p>
            </div>
        `;
        return;
    }

    upcomingContainer.innerHTML = proximasActividades.map(act => {
        const fecha = new Date(act.fecha + 'T00:00:00');
        const dia = fecha.getDate();
        const mes = fecha.toLocaleDateString('es-CL', { month: 'short' }).toUpperCase();

        return `
            <div class="upcoming-item">
                <div class="upcoming-date">
                    <div class="upcoming-day">${dia}</div>
                    <div class="upcoming-month">${mes}</div>
                </div>
                <div class="upcoming-info">
                    <div class="upcoming-title">${act.titulo}</div>
                    <div class="upcoming-time">
                        ${act.hora_inicio ? act.hora_inicio.substring(0, 5) : 'Sin hora'} 
                        ${act.categoria ? `• ${act.categoria}` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDERIZAR ÚLTIMOS GASTOS
// ============================================
function renderizarUltimosGastos() {
    const expensesContainer = document.getElementById('expensesContainer');

    if (!viajeData.gastos || viajeData.gastos.length === 0) {
        expensesContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💳</div>
                <p>No hay gastos registrados aún</p>
            </div>
        `;
        return;
    }

    const ultimosGastos = viajeData.gastos.slice(0, 5);

    expensesContainer.innerHTML = ultimosGastos.map(gasto => `
        <div class="expense-item">
            <div class="expense-info">
                <div class="expense-description">${gasto.descripcion}</div>
                <div class="expense-meta">
                    ${formatearFechaLocal(gasto.fecha)} • ${gasto.categoria}
                </div>
            </div>
            <div class="expense-amount">
                <div class="expense-value">$${formatearNumero(gasto.monto_clp)}</div>
                <span class="expense-currency">CLP</span>
            </div>
        </div>
    `).join('');
}

// ============================================
// FUNCIONES DE NAVEGACIÓN
// ============================================
function irAGastos() {
    window.location.href = `../gastos/gastos.html?link=${linkViaje}`;
}

function irAItinerario() {
    window.location.href = `../itinerario/itinerario.html?link=${linkViaje}`;
}

function editarViaje() {
    window.location.href = `../wizard/wizard.html?link=${linkViaje}`;
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================
function formatearFechaLocal(fechaStr) {
    if (!fechaStr) return '';
    const fecha = new Date(fechaStr + 'T00:00:00');
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}-${mes}-${anio}`;
}

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
            texto: dias === 1 ? 'día para el viaje' : 'días para el viaje',
            textoCorto: 'DÍAS PARA EL VIAJE'
        };
    } else if (estado === 'en_curso') {
        const dias = Math.ceil((fechaFin - hoy) / (1000 * 60 * 60 * 24));
        return {
            numero: dias,
            texto: dias === 1 ? 'día restante' : 'días restantes',
            textoCorto: 'DÍAS RESTANTES'
        };
    } else {
        const dias = Math.ceil((hoy - fechaFin) / (1000 * 60 * 60 * 24));
        return {
            numero: dias,
            texto: dias === 1 ? 'día desde que finalizó' : 'días desde que finalizó',
            textoCorto: 'DÍAS DESDE QUE FINALIZÓ'
        };
    }
}

// Limpiar intervalo al salir de la página
window.addEventListener('beforeunload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});

// ============================================
// VISOR DE DOCUMENTOS DESDE EL DASHBOARD
// ============================================
function abrirVisorDashboard(docId) {
    const doc = (viajeData.documentos || []).find(d => d.id === docId);
    if (!doc || !doc.archivo_url) return;

    const TIPO_CONFIG_LOCAL = {
        pasaje_avion:     { label: 'Pasaje de Avión',      icon: '✈️'  },
        tarjeta_embarque: { label: 'Tarjeta de Embarque',  icon: '🎫'  },
        pasaje_bus:       { label: 'Pasaje de Bus',        icon: '🚌'  },
        crucero:          { label: 'Doc. Crucero',         icon: '🚢'  },
        alojamiento:      { label: 'Reserva Alojamiento',  icon: '🏨'  },
        seguro:           { label: 'Seguro de Viaje',      icon: '🛡️' },
        entrada:          { label: 'Boleto / Entrada',     icon: '🎟️' },
        otro:             { label: 'Otro',                 icon: '📄'  }
    };

    const cfg = TIPO_CONFIG_LOCAL[doc.tipo] || TIPO_CONFIG_LOCAL.otro;
    document.getElementById('visorDashboardTitulo').textContent = `${cfg.icon} ${doc.nombre}`;

    const btnDescargar = document.getElementById('visorDashboardDescargar');
    btnDescargar.href = doc.archivo_url;
    btnDescargar.download = doc.nombre;

    const btnExterno = document.getElementById('visorDashboardExterno');
    btnExterno.href = doc.archivo_url;

    const content = document.getElementById('visorDashboardContent');
    const esImagen = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(doc.archivo_url);
    const esPDF    = /\.pdf(\?|$)/i.test(doc.archivo_url) || doc.archivo_url.includes('.pdf');

    if (esImagen) {
        content.innerHTML = `
            <img src="${doc.archivo_url}" alt="${doc.nombre}"
                 style="max-width:100%;max-height:70vh;border-radius:8px;display:block;margin:0 auto;">`;
    } else if (esPDF) {
        const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(doc.archivo_url)}&embedded=true`;
        content.innerHTML = `
            <div style="width:100%;height:70vh;position:relative;">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;" id="visorDashboardLoading">
                    <div style="font-size:2.5rem;margin-bottom:8px;">⏳</div>
                    <p style="font-size:0.9rem;">Cargando PDF...</p>
                </div>
                <iframe
                    src="${googleViewerUrl}"
                    style="width:100%;height:100%;border:none;border-radius:8px;"
                    allowfullscreen
                    onload="const l=document.getElementById('visorDashboardLoading');if(l)l.style.display='none';"
                ></iframe>
            </div>`;
    } else {
        content.innerHTML = `
            <div style="text-align:center;color:#94a3b8;padding:60px 20px;">
                <div style="font-size:5rem;margin-bottom:16px;">📄</div>
                <p style="font-size:1rem;margin-bottom:24px;">Vista previa no disponible para este tipo de archivo</p>
                <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
                    <a href="${doc.archivo_url}" download="${doc.nombre}"
                       style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">⬇️ Descargar</a>
                    <a href="${doc.archivo_url}" target="_blank" rel="noopener"
                       style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">↗️ Abrir en nueva pestaña</a>
                </div>
            </div>`;
    }

    const modal = document.getElementById('modalVisorDashboard');
    modal.style.display = 'flex';
    // Cerrar al hacer click fuera del contenedor
    modal.onclick = (e) => { if (e.target === modal) cerrarVisorDashboard(); };
}

function cerrarVisorDashboard() {
    const modal = document.getElementById('modalVisorDashboard');
    modal.style.display = 'none';
    document.getElementById('visorDashboardContent').innerHTML = '';
}

// Cerrar con tecla Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarVisorDashboard();
});
