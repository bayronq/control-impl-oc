const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('./instalaciones.db');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS encargados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tipos_instalacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS instalaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      encargado TEXT NOT NULL,
      fecha TEXT NOT NULL,
      caso_asociado TEXT,
      tipo_instalacion TEXT NOT NULL,
      ambiente TEXT NOT NULL,
      usa_pipeline INTEGER DEFAULT 0,
      herramienta_pipeline TEXT,
      observaciones TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const countEncargados = db.prepare('SELECT COUNT(*) as count FROM encargados');
  countEncargados.get((err, row) => {
    if (row.count === 0) {
      const insertEncargado = db.prepare('INSERT INTO encargados (nombre) VALUES (?)');
      ['Administrador', 'Desarrollador', 'Técnico'].forEach(nombre => {
        insertEncargado.run(nombre);
      });
      insertEncargado.finalize();
    }
  });
  countEncargados.finalize();

  const countTipos = db.prepare('SELECT COUNT(*) as count FROM tipos_instalacion');
  countTipos.get((err, row) => {
    if (row.count === 0) {
      const insertTipo = db.prepare('INSERT INTO tipos_instalacion (nombre, descripcion) VALUES (?, ?)');
      [
        ['servicio_web', 'Servicio Web'],
        ['api', 'API'],
        ['microservicio', 'Microservicio'],
        ['aplicacion', 'Aplicación'],
        ['base_datos', 'Base de Datos'],
        ['otro', 'Otro']
      ].forEach(([nombre, descripcion]) => {
        insertTipo.run(nombre, descripcion);
      });
      insertTipo.finalize();
    }
  });
  countTipos.finalize();
});

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/encargados', (req, res) => {
  db.all('SELECT * FROM encargados WHERE activo = 1 ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/encargados', (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  
  db.run('INSERT INTO encargados (nombre) VALUES (?)', [nombre], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El encargado ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, nombre, activo: 1 });
  });
});

app.put('/api/encargados/:id', (req, res) => {
  const { nombre } = req.body;
  db.run('UPDATE encargados SET nombre = ? WHERE id = ?', [nombre, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, nombre });
  });
});

app.delete('/api/encargados/:id', (req, res) => {
  db.run('UPDATE encargados SET activo = 0 WHERE id = ?', req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Encargado eliminado' });
  });
});

app.get('/api/tipos-instalacion', (req, res) => {
  db.all('SELECT * FROM tipos_instalacion WHERE activo = 1 ORDER BY nombre', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/tipos-instalacion', (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  
  db.run('INSERT INTO tipos_instalacion (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion || nombre], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El tipo de instalación ya existe' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, nombre, descripcion: descripcion || nombre, activo: 1 });
  });
});

app.put('/api/tipos-instalacion/:id', (req, res) => {
  const { nombre, descripcion } = req.body;
  db.run('UPDATE tipos_instalacion SET nombre = ?, descripcion = ? WHERE id = ?', [nombre, descripcion, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, nombre, descripcion });
  });
});

app.delete('/api/tipos-instalacion/:id', (req, res) => {
  db.run('UPDATE tipos_instalacion SET activo = 0 WHERE id = ?', req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Tipo de instalación eliminado' });
  });
});

app.get('/api/instalaciones', (req, res) => {
  const { mes, anio } = req.query;
  
  let query = 'SELECT * FROM instalaciones';
  let params = [];
  
  if (mes && anio) {
    query += ' WHERE strftime("%m", fecha) = ? AND strftime("%Y", fecha) = ?';
    params = [mes.padStart(2, '0'), anio];
  }
  
  query += ' ORDER BY fecha DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/instalaciones', (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones } = req.body;
  
  const stmt = db.prepare(`
    INSERT INTO instalaciones (encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline ? 1 : 0, usa_pipeline ? herramienta_pipeline : null, observaciones, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, ...req.body });
  });
  stmt.finalize();
});

app.put('/api/instalaciones/:id', (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones } = req.body;
  
  const stmt = db.prepare(`
    UPDATE instalaciones 
    SET encargado = ?, fecha = ?, caso_asociado = ?, tipo_instalacion = ?, ambiente = ?, usa_pipeline = ?, herramienta_pipeline = ?, observaciones = ?
    WHERE id = ?
  `);
  
  stmt.run(encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline ? 1 : 0, usa_pipeline ? herramienta_pipeline : null, observaciones, req.params.id, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: req.params.id, ...req.body });
  });
  stmt.finalize();
});

app.delete('/api/instalaciones/:id', (req, res) => {
  db.run('DELETE FROM instalaciones WHERE id = ?', req.params.id, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Eliminado correctamente' });
  });
});

app.get('/api/reportes/mensual', (req, res) => {
  const { mes, anio } = req.query;
  
  const query = `
    SELECT 
      strftime("%Y-%m", fecha) as mes,
      COUNT(*) as total_instalaciones,
      SUM(CASE WHEN ambiente = 'produccion' THEN 1 ELSE 0 END) as produccion,
      SUM(CASE WHEN ambiente = 'qa' THEN 1 ELSE 0 END) as qa,
      SUM(CASE WHEN usa_pipeline = 1 THEN 1 ELSE 0 END) as con_pipeline,
      SUM(CASE WHEN usa_pipeline = 0 THEN 1 ELSE 0 END) as sin_pipeline
    FROM instalaciones
    WHERE strftime("%m", fecha) = ? AND strftime("%Y", fecha) = ?
    GROUP BY strftime("%Y-%m", fecha)
  `;
  
  db.get(query, [mes.padStart(2, '0'), anio], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(row || { mes: `${anio}-${mes}`, total_instalaciones: 0, produccion: 0, qa: 0, con_pipeline: 0, sin_pipeline: 0 });
  });
});

app.get('/api/reportes/encargados', (req, res) => {
  const { mes, anio } = req.query;
  
  const query = `
    SELECT 
      encargado,
      COUNT(*) as total_instalaciones,
      SUM(CASE WHEN ambiente = 'produccion' THEN 1 ELSE 0 END) as produccion,
      SUM(CASE WHEN ambiente = 'qa' THEN 1 ELSE 0 END) as qa
    FROM instalaciones
    WHERE strftime("%m", fecha) = ? AND strftime("%Y", fecha) = ?
    GROUP BY encargado
    ORDER BY total_instalaciones DESC
  `;
  
  db.all(query, [mes.padStart(2, '0'), anio], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
