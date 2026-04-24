const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

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

const LOGS_DIR = process.env.LOGS_DIR || '/logs';
const ENABLE_DOMAIN_LOGIN = process.env.ENABLE_DOMAIN_LOGIN === 'true';
const SERVICENOW_URL = process.env.SERVICENOW_URL || 'https://mesadeservicio.banrural.com.gt/ui/changes';
const LDAP_URL = process.env.LDAP_URL || 'ldap://dc.gfbanrural.local:389';
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'dc=gfbanrural,dc=local';
const LDAP_BIND_DN = process.env.LDAP_BIND_DN || '';
const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD || '';

let LdapAuth = null;
try {
  LdapAuth = require('ldapauth-fork');
} catch (e) {
  console.log('LdapAuth no disponible, usando autenticación local');
}

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true, mode: 0o777 });
      console.log(`Directorio de logs creado: ${LOGS_DIR}`);
    }
  } catch (err) {
    console.warn('No se pudo crear directorio de logs:', err.message);
  }
}

async function saveLog(action, details, user) {
  try {
    const logDir = LOGS_DIR;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o777 });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      app: 'control-instalaciones',
      action: action,
      user: user || 'system',
      details: details
    };

    const logFile = path.join(logDir, `logs-${new Date().toISOString().split('T')[0]}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.warn('No se pudo guardar log:', err.message);
  }
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        apellido TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS encargados (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) UNIQUE,
        nombre TEXT NOT NULL,
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
      CREATE TABLE IF NOT EXISTS estados (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        color TEXT DEFAULT '#6c757d',
        activo BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS instalaciones (
        id SERIAL PRIMARY KEY,
        encargado TEXT NOT NULL,
        fecha TEXT NOT NULL,
        caso_asociado TEXT NOT NULL,
        tipo_instalacion TEXT NOT NULL,
        ambiente TEXT NOT NULL,
        estado TEXT DEFAULT 'pendiente',
        usa_pipeline BOOLEAN DEFAULT false,
        herramienta_pipeline TEXT,
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    const { rows: countEstados } = await client.query('SELECT COUNT(*) as count FROM estados');
    if (parseInt(countEstados[0].count) === 0) {
      const insertEstado = 'INSERT INTO estados (nombre, descripcion, color) VALUES ($1, $2, $3)';
      const estados = [
        ['pendiente', 'Pendiente', '#ffc107'],
        ['previo_mesa', 'Previo a Mesa', '#17a2b8'],
        ['en_curso', 'En Curso', '#007bff'],
        ['retornado', 'Retornado', '#fd7e14'],
        ['cancelado', 'Cancelado', '#dc3545'],
        ['rollback', 'Rollback', '#6f42c1'],
        ['finalizado', 'Finalizado', '#28a745']
      ];
      for (const [nombre, descripcion, color] of estados) {
        await client.query(insertEstado, [nombre, descripcion, color]);
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

app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || uuidv4(),
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

function getServiceNowUrl(casoId) {
  return `${SERVICENOW_URL}?entity_id=${casoId}&mode=detail`;
}

app.get('/login', (req, res) => {
  const registered = req.query.registered === 'true';
  res.render('login', { error: null, registered });
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { username, nombre, apellido, email, password, confirmPassword } = req.body;

  if (!username || !nombre || !apellido || !email || !password) {
    return res.render('register', { error: 'Todos los campos son requeridos' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Las contraseñas no coinciden' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (username, nombre, apellido, email, password) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, nombre, apellido, email, hashedPassword]
    );

    const fullName = `${nombre} ${apellido}`;
    await pool.query(
      'INSERT INTO encargados (usuario_id, nombre) VALUES ($1, $2)',
      [result.rows[0].id, fullName]
    );

    await saveLog('registro_usuario', { username, email }, username);

    res.redirect('/login?registered=true');
  } catch (err) {
    console.error('Error registrando usuario:', err.message);
    if (err.code === '23505') {
      if (err.constraint.includes('username')) {
        return res.render('register', { error: 'El nombre de usuario ya existe' });
      }
      if (err.constraint.includes('email')) {
        return res.render('register', { error: 'El correo electrónico ya está registrado' });
      }
    }
    res.render('register', { error: 'Error al registrar usuario' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Usuario y contraseña son requeridos' });
  }

  try {
    let userValid = false;
    let userData = null;

    if (ENABLE_DOMAIN_LOGIN && LdapAuth) {
      const ldap = new LdapAuth({
        url: LDAP_URL,
        baseDN: LDAP_BASE_DN,
        bindDN: LDAP_BIND_DN || `cn=${username},${LDAP_BASE_DN}`,
        bindPassword: LDAP_BIND_PASSWORD || password,
        searchFilter: `(sAMAccountName=${username})`,
        searchAttributes: ['displayName', 'mail', 'sAMAccountName']
      });

      await new Promise((resolve, reject) => {
        ldap.authenticate(username, password, (err, user) => {
          if (err) reject(err);
          else resolve(user);
        });
      });
      userValid = true;
    } else {
      const result = await pool.query(
        'SELECT id, username, nombre, apellido FROM usuarios WHERE username = $1 AND activo = true',
        [username]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, (await pool.query('SELECT password FROM usuarios WHERE id = $1', [user.id])).rows[0].password);
        
        if (passwordMatch) {
          userValid = true;
          userData = user;
        }
      } else {
        return res.render('login', { error: 'El usuario no existe' });
      }
    }

    if (userValid) {
      req.session.user = {
        username: userData ? userData.username : username,
        displayName: userData ? `${userData.nombre} ${userData.apellido}` : username
      };
      await saveLog('login', { username }, username);
      return res.redirect('/');
    }
  } catch (err) {
    console.error('Error de autenticación:', err.message);
    return res.render('login', { error: 'Credenciales inválidas' });
  }

  return res.render('login', { error: 'Credenciales inválidas' });
});

app.get('/logout', (req, res) => {
  const username = req.session.user?.username;
  req.session.destroy();
  res.redirect('/login');
  if (username) {
    saveLog('logout', { username }, username);
  }
});

app.get('/', requireAuth, (req, res) => {
  res.render('index', { user: req.session.user });
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
  
  const user = req.session.user?.username || 'unknown';
  try {
    const result = await pool.query(
      'INSERT INTO encargados (nombre) VALUES ($1) RETURNING id, nombre, activo',
      [nombre]
    );
    await saveLog('crear_encargado', { id: result.rows[0].id, nombre }, user);
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
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query('UPDATE encargados SET nombre = $1 WHERE id = $2', [nombre, req.params.id]);
    await saveLog('editar_encargado', { id: req.params.id, nombre }, user);
    res.json({ id: req.params.id, nombre });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/encargados/:id', async (req, res) => {
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query('UPDATE encargados SET activo = false WHERE id = $1', [req.params.id]);
    await saveLog('eliminar_encargado', { id: req.params.id }, user);
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
  
  const user = req.session.user?.username || 'unknown';
  try {
    const result = await pool.query(
      'INSERT INTO tipos_instalacion (nombre, descripcion) VALUES ($1, $2) RETURNING id, nombre, descripcion, activo',
      [nombre, descripcion || nombre]
    );
    await saveLog('crear_tipo', { id: result.rows[0].id, nombre }, user);
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
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query(
      'UPDATE tipos_instalacion SET nombre = $1, descripcion = $2 WHERE id = $3',
      [nombre, descripcion, req.params.id]
    );
    await saveLog('editar_tipo', { id: req.params.id, nombre }, user);
    res.json({ id: req.params.id, nombre, descripcion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tipos-instalacion/:id', async (req, res) => {
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query('UPDATE tipos_instalacion SET activo = false WHERE id = $1', [req.params.id]);
    await saveLog('eliminar_tipo', { id: req.params.id }, user);
    res.json({ message: 'Tipo de instalación eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/estados', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM estados WHERE activo = true ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/estados', async (req, res) => {
  const { nombre, descripcion, color } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  
  const user = req.session.user?.username || 'unknown';
  try {
    const result = await pool.query(
      'INSERT INTO estados (nombre, descripcion, color) VALUES ($1, $2, $3) RETURNING *',
      [nombre, descripcion || nombre, color || '#6c757d']
    );
    await saveLog('crear_estado', { id: result.rows[0].id, nombre }, user);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'El estado ya existe' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/estados/:id', async (req, res) => {
  const { nombre, descripcion, color } = req.body;
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query(
      'UPDATE estados SET nombre = $1, descripcion = $2, color = $3 WHERE id = $4',
      [nombre, descripcion, color, req.params.id]
    );
    await saveLog('editar_estado', { id: req.params.id, nombre }, user);
    res.json({ id: req.params.id, nombre, descripcion, color });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/estados/:id', async (req, res) => {
  const user = req.session.user?.username || 'unknown';
  try {
    await pool.query('UPDATE estados SET activo = false WHERE id = $1', [req.params.id]);
    await saveLog('eliminar_estado', { id: req.params.id }, user);
    res.json({ message: 'Estado eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/instalaciones', async (req, res) => {
  const { mes, anio, encargado, dia, ambiente, estado } = req.query;
  
  try {
    let query = 'SELECT * FROM instalaciones WHERE 1=1';
    let params = [];
    let paramIndex = 1;
    
    if (mes && anio) {
      query += ` AND TO_CHAR(fecha::date, 'MM') = $${paramIndex} AND TO_CHAR(fecha::date, 'YYYY') = $${paramIndex + 1}`;
      params.push(mes.padStart(2, '0'), anio);
      paramIndex += 2;
    }
    
    if (encargado) {
      query += ` AND encargado = $${paramIndex}`;
      params.push(encargado);
      paramIndex++;
    }
    
    if (dia) {
      query += ` AND TO_CHAR(fecha::date, 'DD') = $${paramIndex}`;
      params.push(dia.padStart(2, '0'));
      paramIndex++;
    }
    
    if (ambiente) {
      query += ` AND ambiente = $${paramIndex}`;
      params.push(ambiente);
      paramIndex++;
    }
    
    if (estado) {
      query += ` AND estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }
    
    query += ' ORDER BY fecha DESC, created_at DESC';
    
    const { rows } = await pool.query(query, params);
    const result = rows.map(row => ({
      ...row,
      caso_url: getServiceNowUrl(row.caso_asociado)
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/instalaciones', async (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones, estado } = req.body;
  
  if (!caso_asociado) {
    return res.status(400).json({ error: 'El caso asociado es requerido' });
  }
  
  const user = req.session.user?.username || 'unknown';
  try {
    const result = await pool.query(
      `INSERT INTO instalaciones (encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline || false, usa_pipeline ? herramienta_pipeline : null, observaciones, estado || 'pendiente']
    );
    await saveLog('crear_instalacion', { id: result.rows[0].id, caso: caso_asociado }, user);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/instalaciones/:id', async (req, res) => {
  const { encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline, herramienta_pipeline, observaciones, estado } = req.body;
  
  if (!caso_asociado) {
    return res.status(400).json({ error: 'El caso asociado es requerido' });
  }
  
  const user = req.session.user?.username || 'unknown';
  try {
    const result = await pool.query(
      `UPDATE instalaciones 
       SET encargado = $1, fecha = $2, caso_asociado = $3, tipo_instalacion = $4, ambiente = $5, usa_pipeline = $6, herramienta_pipeline = $7, observaciones = $8, estado = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 RETURNING *`,
      [encargado, fecha, caso_asociado, tipo_instalacion, ambiente, usa_pipeline || false, usa_pipeline ? herramienta_pipeline : null, observaciones, estado || 'pendiente', req.params.id]
    );
    await saveLog('editar_instalacion', { id: req.params.id, caso: caso_asociado }, user);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/instalaciones/:id', async (req, res) => {
  const user = req.session.user?.username || 'unknown';
  try {
    const { rows } = await pool.query('SELECT caso_asociado FROM instalaciones WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM instalaciones WHERE id = $1', [req.params.id]);
    await saveLog('eliminar_instalacion', { id: req.params.id, caso: rows[0]?.caso_asociado }, user);
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
    ensureLogDir();
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
