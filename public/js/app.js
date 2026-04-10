let currentFilters = { mes: null, anio: null, encargado: null, dia: null, ambiente: null, estado: null };
let estadosCache = [];

document.addEventListener('DOMContentLoaded', () => {
  initializeFilters();
  loadInstalaciones();
  loadEncargados();
  loadTipos();
  loadEstados();
  setupEventListeners();
});

function initializeFilters() {
  const currentDate = new Date();
  const currentDay = String(currentDate.getDate()).padStart(2, '0');
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
  const currentYear = currentDate.getFullYear();

  document.getElementById('filter-dia').value = currentDay;
  document.getElementById('filter-mes').value = currentMonth;
  
  const anioSelect = document.getElementById('filter-anio');
  const startYear = currentYear - 5;
  for (let year = currentYear; year >= startYear; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYear) option.selected = true;
    anioSelect.appendChild(option);
  }

  const reporteMes = document.getElementById('reporte-mes');
  const reporteAnio = document.getElementById('reporte-anio');
  reporteMes.innerHTML = document.getElementById('filter-mes').innerHTML;
  reporteMes.value = currentMonth;
  reporteAnio.innerHTML = anioSelect.innerHTML;

  currentFilters.dia = currentDay;
  currentFilters.mes = currentMonth;
  currentFilters.anio = currentYear;
}

function setupEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('btn-filtrar').addEventListener('click', () => {
    currentFilters.mes = document.getElementById('filter-mes').value;
    currentFilters.anio = document.getElementById('filter-anio').value;
    currentFilters.encargado = document.getElementById('filter-encargado').value;
    currentFilters.dia = document.getElementById('filter-dia').value;
    currentFilters.ambiente = document.getElementById('filter-ambiente').value;
    currentFilters.estado = document.getElementById('filter-estado').value;
    loadInstalaciones();
  });

  document.getElementById('btn-todos').addEventListener('click', () => {
    currentFilters = { mes: null, anio: null, encargado: null, dia: null, ambiente: null, estado: null };
    document.getElementById('filter-encargado').value = '';
    document.getElementById('filter-dia').value = '';
    document.getElementById('filter-ambiente').value = '';
    document.getElementById('filter-estado').value = '';
    loadInstalaciones();
  });

  document.getElementById('btn-nueva').addEventListener('click', async () => {
    await loadSelects();
    openModal();
  });

  document.getElementById('btn-reportes').addEventListener('click', () => {
    document.getElementById('modal-reportes').style.display = 'block';
  });

  document.getElementById('usa_pipeline').addEventListener('change', (e) => {
    const pipelineGroup = document.getElementById('pipeline-group');
    pipelineGroup.style.display = e.target.value === '1' ? 'flex' : 'none';
  });

  document.getElementById('form-instalacion').addEventListener('submit', saveInstalacion);

  document.getElementById('btn-cancelar').addEventListener('click', closeModal);

  document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    });
  });

  document.getElementById('btn-generar-reporte').addEventListener('click', generateReport);

  document.getElementById('btn-nuevo-encargado').addEventListener('click', () => {
    openEncargadoModal();
  });

  document.getElementById('form-encargado').addEventListener('submit', saveEncargado);

  document.getElementById('btn-cancelar-encargado').addEventListener('click', () => {
    document.getElementById('modal-encargado').style.display = 'none';
  });

  document.querySelector('.close-encargado').addEventListener('click', () => {
    document.getElementById('modal-encargado').style.display = 'none';
  });

  document.getElementById('btn-nuevo-tipo').addEventListener('click', () => {
    openTipoModal();
  });

  document.getElementById('form-tipo').addEventListener('submit', saveTipo);

  document.getElementById('btn-cancelar-tipo').addEventListener('click', () => {
    document.getElementById('modal-tipo').style.display = 'none';
  });

  document.querySelector('.close-tipo').addEventListener('click', () => {
    document.getElementById('modal-tipo').style.display = 'none';
  });

  document.getElementById('btn-nuevo-estado').addEventListener('click', () => {
    openEstadoModal();
  });

  document.getElementById('form-estado').addEventListener('submit', saveEstado);

  document.getElementById('btn-cancelar-estado').addEventListener('click', () => {
    document.getElementById('modal-estado').style.display = 'none';
  });

  document.querySelector('.close-estado').addEventListener('click', () => {
    document.getElementById('modal-estado').style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.style.display = 'none';
    }
  });
}

async function loadSelects() {
  const [encargados, tipos, estados] = await Promise.all([
    fetch('/api/encargados').then(r => r.json()),
    fetch('/api/tipos-instalacion').then(r => r.json()),
    fetch('/api/estados').then(r => r.json())
  ]);

  const encargadoSelect = document.getElementById('encargado');
  const tipoSelect = document.getElementById('tipo_instalacion');
  const estadoSelect = document.getElementById('estado');

  const filterEncargadoSelect = document.getElementById('filter-encargado');
  const filterEstadoSelect = document.getElementById('filter-estado');

  encargadoSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    encargados.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');

  tipoSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    tipos.map(t => `<option value="${t.nombre}">${t.descripcion || t.nombre}</option>`).join('');

  estadoSelect.innerHTML = '<option value="">Seleccionar...</option>' +
    estados.map(e => `<option value="${e.nombre}">${e.descripcion || e.nombre}</option>`).join('');

  filterEncargadoSelect.innerHTML = '<option value="">Todos</option>' +
    encargados.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');

  filterEstadoSelect.innerHTML = '<option value="">Todos</option>' +
    estados.map(e => `<option value="${e.nombre}">${e.descripcion || e.nombre}</option>`).join('');

  estadosCache = estados;
}

async function loadEstados() {
  try {
    const response = await fetch('/api/estados');
    const data = await response.json();
    renderEstadosTable(data);
    
    const filterEstadoSelect = document.getElementById('filter-estado');
    filterEstadoSelect.innerHTML = '<option value="">Todos</option>' +
      data.map(e => `<option value="${e.nombre}">${e.descripcion || e.nombre}</option>`).join('');
    
    estadosCache = data;
  } catch (error) {
    console.error('Error cargando estados:', error);
  }
}

async function loadInstalaciones() {
  let url = '/api/instalaciones?';
  const params = [];

  if (currentFilters.mes && currentFilters.anio) {
    params.push(`mes=${currentFilters.mes}`);
    params.push(`anio=${currentFilters.anio}`);
  }
  if (currentFilters.encargado) {
    params.push(`encargado=${encodeURIComponent(currentFilters.encargado)}`);
  }
  if (currentFilters.dia) {
    params.push(`dia=${currentFilters.dia}`);
  }
  if (currentFilters.ambiente) {
    params.push(`ambiente=${currentFilters.ambiente}`);
  }
  if (currentFilters.estado) {
    params.push(`estado=${currentFilters.estado}`);
  }

  url += params.join('&');

  try {
    const response = await fetch(url);
    const data = await response.json();
    renderTable(data);
  } catch (error) {
    console.error('Error cargando instalaciones:', error);
  }
}

function getEstadoColor(estadoNombre) {
  const estado = estadosCache.find(e => e.nombre === estadoNombre);
  return estado ? estado.color : '#6c757d';
}

function renderTable(data) {
  const tbody = document.getElementById('tabla-body');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No hay instalaciones registradas</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${formatDate(item.fecha)}</td>
      <td>${item.encargado}</td>
      <td><a href="${item.caso_url}" target="_blank" class="caso-link" title="Abrir caso en ServiceNow">${item.caso_asociado}</a></td>
      <td><span class="badge badge-${item.tipo_instalacion}">${formatTipo(item.tipo_instalacion)}</span></td>
      <td><span class="badge badge-${item.ambiente}">${item.ambiente === 'produccion' ? 'Producción' : 'QA'}</span></td>
      <td><span class="estado-badge" style="background-color: ${getEstadoColor(item.estado)}">${formatEstado(item.estado)}</span></td>
      <td>${item.usa_pipeline ? 'Sí' : 'No'}</td>
      <td>${item.usa_pipeline && item.herramienta_pipeline ? `<span class="badge badge-${item.herramienta_pipeline}">${formatHerramienta(item.herramienta_pipeline)}</span>` : '-'}</td>
      <td>${item.observaciones || '-'}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" onclick="editInstalacion(${item.id})">Editar</button>
          <button class="btn btn-danger" onclick="deleteInstalacion(${item.id})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTipo(tipo) {
  const tipos = {
    'servicio_web': 'Servicio Web',
    'api': 'API',
    'microservicio': 'Microservicio',
    'aplicacion': 'Aplicación',
    'base_datos': 'Base de Datos',
    'otro': 'Otro'
  };
  return tipos[tipo] || tipo;
}

function formatEstado(estado) {
  const estados = {
    'pendiente': 'Pendiente',
    'previo_mesa': 'Previo a Mesa',
    'en_curso': 'En Curso',
    'retornado': 'Retornado',
    'cancelado': 'Cancelado',
    'rollback': 'Rollback',
    'finalizado': 'Finalizado'
  };
  return estados[estado] || estado;
}

function formatHerramienta(herramienta) {
  const herramientas = {
    'gitlab': 'GitLab',
    'jenkins': 'Jenkins',
    'azure_devops': 'Azure DevOps',
    'github_actions': 'GitHub Actions',
    'otro': 'Otro'
  };
  return herramientas[herramienta] || herramienta;
}

async function openModal(data = null) {
  const modal = document.getElementById('modal-form');
  const form = document.getElementById('form-instalacion');
  const title = document.getElementById('modal-title');

  form.reset();
  document.getElementById('pipeline-group').style.display = 'none';

  if (data) {
    title.textContent = 'Editar Instalación';
    document.getElementById('id-instalacion').value = data.id;
    document.getElementById('encargado').value = data.encargado;
    document.getElementById('fecha').value = data.fecha;
    document.getElementById('caso_asociado').value = data.caso_asociado || '';
    document.getElementById('tipo_instalacion').value = data.tipo_instalacion;
    document.getElementById('ambiente').value = data.ambiente;
    document.getElementById('estado').value = data.estado || 'pendiente';
    document.getElementById('usa_pipeline').value = data.usa_pipeline ? '1' : '0';
    document.getElementById('herramienta_pipeline').value = data.herramienta_pipeline || '';
    document.getElementById('observaciones').value = data.observaciones || '';
    
    if (data.usa_pipeline) {
      document.getElementById('pipeline-group').style.display = 'flex';
    }
  } else {
    title.textContent = 'Nueva Instalación';
    const hoy = new Date();
    document.getElementById('fecha').value = hoy.getFullYear() + '-' + 
      String(hoy.getMonth() + 1).padStart(2, '0') + '-' + 
      String(hoy.getDate()).padStart(2, '0');
    document.getElementById('estado').value = 'pendiente';
  }

  modal.style.display = 'block';
}

function closeModal() {
  document.getElementById('modal-form').style.display = 'none';
}

async function editInstalacion(id) {
  await loadSelects();
  try {
    const response = await fetch(`/api/instalaciones`);
    const data = await response.json();
    const instalacion = data.find(item => item.id === id);
    if (instalacion) {
      openModal(instalacion);
    }
  } catch (error) {
    console.error('Error editando:', error);
  }
}

async function saveInstalacion(e) {
  e.preventDefault();

  const id = document.getElementById('id-instalacion').value;
  const data = {
    encargado: document.getElementById('encargado').value,
    fecha: document.getElementById('fecha').value,
    caso_asociado: document.getElementById('caso_asociado').value,
    tipo_instalacion: document.getElementById('tipo_instalacion').value,
    ambiente: document.getElementById('ambiente').value,
    estado: document.getElementById('estado').value,
    usa_pipeline: document.getElementById('usa_pipeline').value === '1',
    herramienta_pipeline: document.getElementById('herramienta_pipeline').value,
    observaciones: document.getElementById('observaciones').value
  };

  try {
    const url = id ? `/api/instalaciones/${id}` : '/api/instalaciones';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Error al guardar');
      return;
    }

    closeModal();
    loadInstalaciones();
  } catch (error) {
    console.error('Error guardando:', error);
  }
}

async function deleteInstalacion(id) {
  if (!confirm('¿Está seguro de eliminar esta instalación?')) return;

  try {
    await fetch(`/api/instalaciones/${id}`, { method: 'DELETE' });
    loadInstalaciones();
  } catch (error) {
    console.error('Error eliminando:', error);
  }
}

async function loadEncargados() {
  try {
    const response = await fetch('/api/encargados');
    const data = await response.json();
    renderEncargadosTable(data);
    
    const filterEncargadoSelect = document.getElementById('filter-encargado');
    filterEncargadoSelect.innerHTML = '<option value="">Todos</option>' +
      data.map(e => `<option value="${e.nombre}">${e.nombre}</option>`).join('');
  } catch (error) {
    console.error('Error cargando encargados:', error);
  }
}

function renderEncargadosTable(data) {
  const tbody = document.getElementById('tabla-encargados');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No hay encargados registrados</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${item.id}</td>
      <td>${item.nombre}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" onclick="editEncargado(${item.id}, '${item.nombre}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteEncargado(${item.id})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openEncargadoModal(data = null) {
  const modal = document.getElementById('modal-encargado');
  const title = document.getElementById('modal-title-encargado');
  
  document.getElementById('form-encargado').reset();
  
  if (data) {
    title.textContent = 'Editar Encargado';
    document.getElementById('id-encargado').value = data.id;
    document.getElementById('nombre-encargado').value = data.nombre;
  } else {
    title.textContent = 'Nuevo Encargado';
    document.getElementById('id-encargado').value = '';
  }
  
  modal.style.display = 'block';
}

function editEncargado(id, nombre) {
  openEncargadoModal({ id, nombre });
}

async function saveEncargado(e) {
  e.preventDefault();
  
  const id = document.getElementById('id-encargado').value;
  const nombre = document.getElementById('nombre-encargado').value;
  
  try {
    const url = id ? `/api/encargados/${id}` : '/api/encargados';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    
    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Error al guardar');
      return;
    }
    
    document.getElementById('modal-encargado').style.display = 'none';
    loadEncargados();
  } catch (error) {
    console.error('Error guardando:', error);
  }
}

async function deleteEncargado(id) {
  if (!confirm('¿Está seguro de eliminar este encargado?')) return;

  try {
    await fetch(`/api/encargados/${id}`, { method: 'DELETE' });
    loadEncargados();
  } catch (error) {
    console.error('Error eliminando:', error);
  }
}

async function loadTipos() {
  try {
    const response = await fetch('/api/tipos-instalacion');
    const data = await response.json();
    renderTiposTable(data);
  } catch (error) {
    console.error('Error cargando tipos:', error);
  }
}

function renderTiposTable(data) {
  const tbody = document.getElementById('tabla-tipos');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay tipos de instalación registrados</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${item.id}</td>
      <td><span class="badge badge-${item.nombre}">${item.nombre}</span></td>
      <td>${item.descripcion || item.nombre}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" onclick="editTipo(${item.id}, '${item.nombre}', '${item.descripcion || item.nombre}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteTipo(${item.id})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openTipoModal(data = null) {
  const modal = document.getElementById('modal-tipo');
  const title = document.getElementById('modal-title-tipo');
  
  document.getElementById('form-tipo').reset();
  
  if (data) {
    title.textContent = 'Editar Tipo de Instalación';
    document.getElementById('id-tipo').value = data.id;
    document.getElementById('nombre-tipo').value = data.nombre;
    document.getElementById('descripcion-tipo').value = data.descripcion;
  } else {
    title.textContent = 'Nuevo Tipo de Instalación';
    document.getElementById('id-tipo').value = '';
  }
  
  modal.style.display = 'block';
}

function editTipo(id, nombre, descripcion) {
  openTipoModal({ id, nombre, descripcion });
}

async function saveTipo(e) {
  e.preventDefault();
  
  const id = document.getElementById('id-tipo').value;
  const nombre = document.getElementById('nombre-tipo').value.toLowerCase().replace(/\s+/g, '_');
  const descripcion = document.getElementById('descripcion-tipo').value;
  
  try {
    const url = id ? `/api/tipos-instalacion/${id}` : '/api/tipos-instalacion';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, descripcion })
    });
    
    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Error al guardar');
      return;
    }
    
    document.getElementById('modal-tipo').style.display = 'none';
    loadTipos();
  } catch (error) {
    console.error('Error guardando:', error);
  }
}

async function deleteTipo(id) {
  if (!confirm('¿Está seguro de eliminar este tipo de instalación?')) return;

  try {
    await fetch(`/api/tipos-instalacion/${id}`, { method: 'DELETE' });
    loadTipos();
  } catch (error) {
    console.error('Error eliminando:', error);
  }
}

function renderEstadosTable(data) {
  const tbody = document.getElementById('tabla-estados');
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay estados registrados</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${item.id}</td>
      <td><span class="estado-badge" style="background-color: ${item.color}">${item.nombre}</span></td>
      <td>${item.descripcion || item.nombre}</td>
      <td><input type="color" value="${item.color}" disabled></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-secondary" onclick="editEstado(${item.id}, '${item.nombre}', '${item.descripcion || item.nombre}', '${item.color}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteEstado(${item.id})">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openEstadoModal(data = null) {
  const modal = document.getElementById('modal-estado');
  const title = document.getElementById('modal-title-estado');
  
  document.getElementById('form-estado').reset();
  
  if (data) {
    title.textContent = 'Editar Estado';
    document.getElementById('id-estado').value = data.id;
    document.getElementById('nombre-estado').value = data.nombre;
    document.getElementById('descripcion-estado').value = data.descripcion;
    document.getElementById('color-estado').value = data.color;
  } else {
    title.textContent = 'Nuevo Estado';
    document.getElementById('id-estado').value = '';
    document.getElementById('color-estado').value = '#6c757d';
  }
  
  modal.style.display = 'block';
}

function editEstado(id, nombre, descripcion, color) {
  openEstadoModal({ id, nombre, descripcion, color });
}

async function saveEstado(e) {
  e.preventDefault();
  
  const id = document.getElementById('id-estado').value;
  const nombre = document.getElementById('nombre-estado').value.toLowerCase().replace(/\s+/g, '_');
  const descripcion = document.getElementById('descripcion-estado').value;
  const color = document.getElementById('color-estado').value;
  
  try {
    const url = id ? `/api/estados/${id}` : '/api/estados';
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, descripcion, color })
    });
    
    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Error al guardar');
      return;
    }
    
    document.getElementById('modal-estado').style.display = 'none';
    loadEstados();
    loadSelects();
  } catch (error) {
    console.error('Error guardando:', error);
  }
}

async function deleteEstado(id) {
  if (!confirm('¿Está seguro de eliminar este estado?')) return;

  try {
    await fetch(`/api/estados/${id}`, { method: 'DELETE' });
    loadEstados();
    loadSelects();
  } catch (error) {
    console.error('Error eliminando:', error);
  }
}

async function generateReport() {
  const mes = document.getElementById('reporte-mes').value;
  const anio = document.getElementById('reporte-anio').value;

  try {
    const [resumenRes, encargadosRes] = await Promise.all([
      fetch(`/api/reportes/mensual?mes=${mes}&anio=${anio}`),
      fetch(`/api/reportes/encargados?mes=${mes}&anio=${anio}`)
    ]);

    const resumen = await resumenRes.json();
    const encargados = await encargadosRes.json();

    document.getElementById('stat-total').textContent = resumen.total_instalaciones || 0;
    document.getElementById('stat-produccion').textContent = resumen.produccion || 0;
    document.getElementById('stat-qa').textContent = resumen.qa || 0;
    document.getElementById('stat-con-pipeline').textContent = resumen.con_pipeline || 0;
    document.getElementById('stat-sin-pipeline').textContent = resumen.sin_pipeline || 0;

    const tbodyEncargados = document.getElementById('reporte-encargados-body');
    if (encargados.length === 0) {
      tbodyEncargados.innerHTML = '<tr><td colspan="4" class="empty-state">Sin datos para este período</td></tr>';
    } else {
      tbodyEncargados.innerHTML = encargados.map(e => `
        <tr>
          <td>${e.encargado}</td>
          <td>${e.total_instalaciones}</td>
          <td>${e.produccion}</td>
          <td>${e.qa}</td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Error generando reporte:', error);
  }
}
