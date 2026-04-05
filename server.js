const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'instalaciones',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS encargados (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL UNIQUE,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tipos_instalacion (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS instalaciones (
        id SERIAL PRIMARY KEY,
        encargado TEXT NOT NULL,
        fecha TEXT NOT NULL,
        caso_asociado TEXT,
        tipo_instalacion TEXT NOT NULL,
        ambiente TEXT NOT NULL,
        usa_pipeline BOOLEAN DEFAULT false,
        herramienta_pipeline TEXT,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const { rows: countEncargados } = await client.query('SELECT COUNT(*) as count FROM encargados');
    if (parseInt(countEncargados[0].count) === 0) {
      const insertEncargado = 'INSERT INTO encargados (nombre) VALUES ($1)';
      ['Administrador', 'Desarrollador', 'Técnico'].forEach(async (nombre) => {
        await client.query(insertEncargado, [nombre]);
      });
    }

    const { rows: countTipos } = await client.query('SELECT COUNT(*) as count FROM tipos_instalacion');
    if (parseInt(countTipos[0].count) === 0) {
      const insertTipo = 'INSERT INTO tipos_instalacion (nombre, descripcion) VALUES ($1, $2)';
      const tipos = [
        ['servicio_web', 'Servicio Web'],
        ['api', 'API'],
        ['microservicio', 'Microservicio'],
        ['aplicacion', 'Aplicación'],
        ['base_datos', 'Base de Datos'],
        ['otro', 'Otro']
      ];
      for (const [nombre, descripcion] of tipos) {
        await client.query(insertTipo, [nombre, descripcion]);
      }
    }

    console.log('Base de datos inicializada correctamente');
  } finally {
    client.release();
  }
}

async function waitForDatabase(maxRetries = 30, retryInterval = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Conexión a PostgreSQL establecida');
      return true;
    } catch (err) {
      console.log(`Intentando conectar a PostgreSQL... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL después de múltiples intentos');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/api/encargados', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM encargados WHERE activo = true ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/encargados', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  
  try {
    const result = await pool.query(
      'INSERT INTO encargados (nombre) VALUES ($1) RETURNING id, nombre, activo',
      [nombre]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El encargado ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/encargados/:id', async (req, res) => {
  const { nombre } = req.body;
  try {
    await pool.query('UPDATE encargados SET nombre = $1 WHERE id = $2', [nombre, req.params.id]);
    res.json({ id: req.params.id, nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/encargados/:id', async (req, res) => {
  try {
    await pool.query('UPDATE encargados SET activo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Encargado eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tipos-instalacion', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tipos_instalacion WHERE activo = true ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tipos-instalacion', async (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  
  try {
    const result = await pool.query(
      'INSERT INTO tipos_instalacion (nombre, descripcion) VALUES ($1, $2) RETURNING id, nombre, descripcion, activo',
      [nombre, descripcion || nombre]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El tipo de instalación ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tipos-instalacion/:id', async (req, res) => {
  const { nombre, descripcion } = req.body;
  try {
    await pool.query(
      'UPDATE tipos_instalacion SET nombre = $1, descripcion = $2 WHERE id = $3',
      [nombre, descripcion, req.params.id]
    );
    res.json({ id: req.params.id, nombre, descripcion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tipos-instalacion/:id', async (req, res) => {
  try {
    await pool.query('UPDATE tipos_instalacion SET activo = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tipo de instalación eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/instalaciones', async (req, res) => {
  const { mes, anio } = req.query;
  
  try {
    let query = 'SELECT * FROM instalaciones';
    let params = [];
    
    if (mes && anio) {
      query += ' WHERE TO_CHAR(fecha::date, \'MM\') = $1 AND TO_CHAR(fecha::date, \'YYYY\') = $2';
      params = [mes.padStart(2, '0'), anio];
    }
    
    query += ' ORDER BY fecha DESC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/instalaciones', async (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO instalaciones (encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline || false, usa_pipeline ? herramienta_pipeline : null, observaciones]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/instalaciones/:id', async (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE instalaciones 
       SET encargado = $1, fecha = $2, caso_asociado = $3, tipo_instalacion = $4, ambiente = $5, usa_pipeline = $6, herramienta_pipeline = $7, observaciones = $8
       WHERE id = $9 RETURNING *`,
      [encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline || false, usa_pipeline ? herramienta_pipeline : null, observaciones, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/instalaciones/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM instalaciones WHERE id = $1', [req.params.id]);
    res.json({ message: 'Eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/mensual', async (req, res) => {
  const { mes, anio } = req.query;
  
  try {
    const query = `
      SELECT 
        TO_CHAR(fecha::date, 'YYYY-MM') as mes,
        COUNT(*) as total_instalaciones,
        SUM(CASE WHEN ambiente = 'produccion' THEN 1 ELSE 0 END) as produccion,
        SUM(CASE WHEN ambiente = 'qa' THEN 1 ELSE 0 END) as qa,
        SUM(CASE WHEN usa_pipeline = true THEN 1 ELSE 0 END) as con_pipeline,
        SUM(CASE WHEN usa_pipeline = false THEN 1 ELSE 0 END) as sin_pipeline
      FROM instalaciones
      WHERE TO_CHAR(fecha::date, 'MM') = $1 AND TO_CHAR(fecha::date, 'YYYY') = $2
      GROUP BY TO_CHAR(fecha::date, 'YYYY-MM')
    `;
    
    const { rows } = await pool.query(query, [mes.padStart(2, '0'), anio]);
    if (rows.length === 0) {
      return res.json({ mes: `${anio}-${mes}`, total_instalaciones: 0, produccion: 0, qa: 0, con_pipeline: 0, sin_pipeline: 0 });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reportes/encargados', async (req, res) => {
  const { mes, anio } = req.query;
  
  try {
    const query = `
      SELECT 
        encargado,
        COUNT(*) as total_instalaciones,
        SUM(CASE WHEN ambiente = 'produccion' THEN 1 ELSE 0 END) as produccion,
        SUM(CASE WHEN ambiente = 'qa' THEN 1 ELSE 0 END) as qa
      FROM instalaciones
      WHERE TO_CHAR(fecha::date, 'MM') = $1 AND TO_CHAR(fecha::date, 'YYYY') = $2
      GROUP BY encargado
      ORDER BY total_instalaciones DESC
    `;
    
    const { rows } = await pool.query(query, [mes.padStart(2, '0'), anio]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await waitForDatabase();
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar el servidor:', err.message);
    process.exit(1);
  }
}

startServer();
