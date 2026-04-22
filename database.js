// ============================================================
//  FixIt.ro — Configurare baza de date SQL Server
//  Schema se creeaza automat la prima pornire!
//  Nu trebuie sa rulezi nimic manual in SSMS.
// ============================================================

const sql  = require('mssql');
const bcrypt = require('bcryptjs');
const fs   = require('fs');
const path = require('path');

// ── Incarca .env ─────────────────────────────────────────────
function loadEnv() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n');
    lines.forEach(line => {
      const clean = line.split('#')[0].trim();
      const eq    = clean.indexOf('=');
      if (eq > 0) {
        const k = clean.slice(0, eq).trim();
        const v = clean.slice(eq + 1).trim();
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
  } catch(e) {
    console.warn('  ⚠️  .env nu a fost gasit — se folosesc variabilele de sistem');
  }
}
loadEnv();

// ── Validare configuratie ────────────────────────────────────
function getConfig() {
  const required = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASS'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`  ❌ Lipsesc variabile: ${missing.join(', ')} — verifica fisierul .env`);
    process.exit(1);
  }

  // Parseaza serverul si instanta din DB_SERVER (ex: localhost\SQLEXPRESS)
  const serverRaw = process.env.DB_SERVER;
  const parts     = serverRaw.split('\\');
  const server    = parts[0];
  const instance  = parts[1] || process.env.DB_INSTANCE || undefined;

  const config = {
    server,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    options: {
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
      instanceName:           instance,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000,
  };

  // Port explicit doar daca e setat si nu e named instance
  if (process.env.DB_PORT && process.env.DB_PORT.trim() && !instance) {
    config.port = parseInt(process.env.DB_PORT);
  }

  return config;
}

// ── Pool global ───────────────────────────────────────────────
let pool = null;

async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(getConfig());
  console.log(`  ✅ Conectat la SQL Server: ${process.env.DB_SERVER} → ${process.env.DB_NAME}`);
  return pool;
}

// ── Wrappers ──────────────────────────────────────────────────
async function query(sqlText, params = {}) {
  const p   = await getPool();
  const req = p.request();
  for (const [key, val] of Object.entries(params)) {
    if      (val === null || val === undefined) req.input(key, sql.NVarChar, null);
    else if (typeof val === 'number' && Number.isInteger(val)) req.input(key, sql.Int, val);
    else if (typeof val === 'number') req.input(key, sql.Decimal(10,2), val);
    else if (typeof val === 'boolean') req.input(key, sql.Bit, val ? 1 : 0);
    else req.input(key, sql.NVarChar, String(val));
  }
  return req.query(sqlText);
}

async function get_p(sqlText, params = {}) {
  const result = await query(sqlText, params);
  return result.recordset[0] || null;
}

async function all_p(sqlText, params = {}) {
  const result = await query(sqlText, params);
  return result.recordset;
}

async function run_p(sqlText, params = {}) {
  const isInsert = sqlText.trim().toUpperCase().startsWith('INSERT');
  const sqlFinal = isInsert
    ? sqlText.replace(/\)\s*VALUES/i, ') OUTPUT INSERTED.id VALUES')
    : sqlText;
  const result = await query(sqlFinal, params);
  const lastID = isInsert && result.recordset?.[0]?.id
    ? parseInt(result.recordset[0].id) : null;
  return { lastID, changes: result.rowsAffected[0] || 0 };
}

// ── Schema completa — se aplica automat ──────────────────────
async function createSchema() {
  const p = await getPool();

  // Helper: executa fara eroare daca obiectul deja exista
  const exec = async (sql_text) => {
    try { await p.request().query(sql_text); }
    catch(e) {
      // Ignora erorile de tip "obiect deja exista"
      if (!e.message.includes('already exists') && !e.message.includes('There is already')) {
        throw e;
      }
    }
  };

  console.log('  🔧 Verific si creez schema bazei de date...');

  // ── UTILIZATORI ──────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='utilizatori')
    CREATE TABLE utilizatori (
      id               INT           NOT NULL IDENTITY(1,1),
      email            NVARCHAR(255) NOT NULL,
      parola_hash      NVARCHAR(255) NOT NULL,
      tip_cont         NVARCHAR(10)  NOT NULL,
      nume_complet     NVARCHAR(200) NOT NULL,
      prenume          NVARCHAR(100) NULL,
      nume             NVARCHAR(100) NULL,
      activ            BIT           NOT NULL DEFAULT 0,
      token_activare   NVARCHAR(100) NULL,
      token_expira     DATETIME      NULL,
      creat_la         DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_utilizatori PRIMARY KEY (id),
      CONSTRAINT UQ_utilizatori_email UNIQUE (email),
      CONSTRAINT CK_utilizatori_tip CHECK (tip_cont IN ('client','firma','ambele'))
    )`);

  // ── FIRME ────────────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='firme')
    CREATE TABLE firme (
      id               INT           NOT NULL IDENTITY(1,1),
      utilizator_id    INT           NOT NULL,
      nume_firma       NVARCHAR(200) NOT NULL,
      categorie        NVARCHAR(100) NOT NULL DEFAULT 'General',
      oras             NVARCHAR(100) NULL,
      raza_km          INT           NOT NULL DEFAULT 50,
      descriere        NVARCHAR(1000) NULL,
      telefon          NVARCHAR(30)  NULL,
      zone_activitate  NVARCHAR(500) NULL,
      creat_la         DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_firme PRIMARY KEY (id),
      CONSTRAINT UQ_firme_utilizator UNIQUE (utilizator_id),
      CONSTRAINT FK_firme_utilizator FOREIGN KEY (utilizator_id) REFERENCES utilizatori(id) ON DELETE CASCADE
    )`);

  // ── LUCRARI ──────────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='lucrari')
    CREATE TABLE lucrari (
      id               INT           NOT NULL IDENTITY(1,1),
      client_id        INT           NOT NULL,
      titlu            NVARCHAR(300) NOT NULL,
      descriere        NVARCHAR(2000) NULL,
      categorie        NVARCHAR(100) NOT NULL,
      oras             NVARCHAR(100) NOT NULL,
      adresa           NVARCHAR(300) NULL,
      urgenta          BIT           NOT NULL DEFAULT 0,
      status           NVARCHAR(20)  NOT NULL DEFAULT 'activa',
      finalizata_la    DATETIME      NULL,
      creat_la         DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_lucrari PRIMARY KEY (id),
      CONSTRAINT FK_lucrari_client FOREIGN KEY (client_id) REFERENCES utilizatori(id) ON DELETE CASCADE,
      CONSTRAINT CK_lucrari_status CHECK (status IN ('activa','in_lucru','finalizata','anulata'))
    )`);

  // ── OFERTE ───────────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='oferte')
    CREATE TABLE oferte (
      id                  INT           NOT NULL IDENTITY(1,1),
      lucrare_id          INT           NOT NULL,
      firma_id            INT           NOT NULL,
      pret                DECIMAL(10,2) NOT NULL,
      descriere_oferta    NVARCHAR(1000) NULL,
      disponibilitate     NVARCHAR(300) NULL,
      status              NVARCHAR(20)  NOT NULL DEFAULT 'trimisa',
      pret_contraoferta   DECIMAL(10,2) NULL,
      mesaj_contraoferta  NVARCHAR(500) NULL,
      firma_a_initiat     BIT           NULL,
      creat_la            DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_oferte PRIMARY KEY (id),
      CONSTRAINT UQ_oferta_unica UNIQUE (lucrare_id, firma_id),
      CONSTRAINT FK_oferte_lucrare FOREIGN KEY (lucrare_id) REFERENCES lucrari(id) ON DELETE CASCADE,
      CONSTRAINT FK_oferte_firma FOREIGN KEY (firma_id) REFERENCES firme(id),
      CONSTRAINT CK_oferte_status CHECK (status IN ('trimisa','acceptata','refuzata','negociere'))
    )`);

  // ── MESAJE ───────────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='mesaje')
    CREATE TABLE mesaje (
      id               INT           NOT NULL IDENTITY(1,1),
      oferta_id        INT           NOT NULL,
      sender_id        INT           NOT NULL,
      mesaj            NVARCHAR(MAX) NOT NULL,
      citit            BIT           NOT NULL DEFAULT 0,
      creat_la         DATETIME      NOT NULL DEFAULT GETDATE(),
      CONSTRAINT PK_mesaje PRIMARY KEY (id),
      CONSTRAINT FK_mesaje_oferta FOREIGN KEY (oferta_id) REFERENCES oferte(id) ON DELETE CASCADE,
      CONSTRAINT FK_mesaje_sender FOREIGN KEY (sender_id) REFERENCES utilizatori(id)
    )`);

  // ── REVIEWS ──────────────────────────────────────────────────
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='reviews')
    CREATE TABLE reviews (
      id                   INT            NOT NULL IDENTITY(1,1),
      lucrare_id           INT            NOT NULL,
      reviewer_id          INT            NOT NULL,
      reviewee_id          INT            NOT NULL,
      tip_reviewer         NVARCHAR(10)   NOT NULL,
      rating_general       TINYINT        NOT NULL,
      comentariu           NVARCHAR(1000) NULL,
      punctualitate        TINYINT        NULL,
      calitate_lucrare     TINYINT        NULL,
      comunicare           TINYINT        NULL,
      raport_calitate_pret TINYINT        NULL,
      seriozitate          TINYINT        NULL,
      promptitudine        TINYINT        NULL,
      comunicare_client    TINYINT        NULL,
      corectitudine_pret   TINYINT        NULL,
      [public]             BIT            NOT NULL DEFAULT 0,
      creat_la             DATETIME       NOT NULL DEFAULT GETDATE(),
      devine_public_la     DATETIME       NOT NULL,
      CONSTRAINT PK_reviews PRIMARY KEY (id),
      CONSTRAINT UQ_review_unic UNIQUE (lucrare_id, reviewer_id),
      CONSTRAINT FK_reviews_lucrare FOREIGN KEY (lucrare_id) REFERENCES lucrari(id) ON DELETE CASCADE,
      CONSTRAINT FK_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES utilizatori(id),
      CONSTRAINT FK_reviews_reviewee FOREIGN KEY (reviewee_id) REFERENCES utilizatori(id),
      CONSTRAINT CK_reviews_tip CHECK (tip_reviewer IN ('client','firma')),
      CONSTRAINT CK_reviews_general CHECK (rating_general BETWEEN 1 AND 5)
    )`);

  // ── Coloane noi (pentru instalari existente) ─────────────────
  // Adauga coloane care pot lipsi pe instalari mai vechi
  const addColumnIfMissing = async (table, column, definition) => {
    const exists = await get_p(
      `SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID(@t) AND name=@c`,
      { t: table, c: column }
    );
    if (!exists) {
      await p.request().query(`ALTER TABLE ${table} ADD ${column} ${definition}`);
      console.log(`  ➕ Coloana adaugata: ${table}.${column}`);
    }
  };

  await addColumnIfMissing('utilizatori', 'prenume',         'NVARCHAR(100) NULL');
  await addColumnIfMissing('utilizatori', 'nume',            'NVARCHAR(100) NULL');
  await addColumnIfMissing('utilizatori', 'telefon',         'NVARCHAR(20) NULL');
  await addColumnIfMissing('utilizatori', 'telefon_prefix',  'NVARCHAR(10) NULL');
  await addColumnIfMissing('utilizatori', 'reset_token',     'NVARCHAR(100) NULL');
  await addColumnIfMissing('utilizatori', 'reset_expira',    'DATETIME NULL');
  await addColumnIfMissing('firme',       'zone_activitate', 'NVARCHAR(500) NULL');
  await addColumnIfMissing('lucrari',     'finalizata_la',   'DATETIME NULL');
  await addColumnIfMissing('oferte',      'pret_contraoferta','DECIMAL(10,2) NULL');
  await addColumnIfMissing('oferte',      'mesaj_contraoferta','NVARCHAR(500) NULL');
  await addColumnIfMissing('oferte',      'firma_a_initiat', 'BIT NULL');
  await addColumnIfMissing('oferte',      'citit_client',    'BIT NOT NULL DEFAULT 1');
  await addColumnIfMissing('oferte',      'citit_firma',     'BIT NOT NULL DEFAULT 0');
  await addColumnIfMissing('oferte',      'disponibilitate_de_la',  'DATETIME NULL');
  await addColumnIfMissing('oferte',      'disponibilitate_pana_la','DATETIME NULL');
  await addColumnIfMissing('reviews',     'citit_reviewee',  'BIT NOT NULL DEFAULT 0');

  // ── Indecsi pentru performanta ───────────────────────────────
  const createIndex = async (name, table, columns) => {
    const exists = await get_p(
      `SELECT 1 FROM sys.indexes WHERE name=@n AND object_id=OBJECT_ID(@t)`,
      { n: name, t: table }
    );
    if (!exists) {
      await p.request().query(`CREATE INDEX ${name} ON ${table}(${columns})`);
    }
  };

  await createIndex('IX_lucrari_client',    'lucrari',  'client_id');
  await createIndex('IX_lucrari_status',    'lucrari',  'status');
  await createIndex('IX_oferte_lucrare',    'oferte',   'lucrare_id');
  await createIndex('IX_oferte_firma',      'oferte',   'firma_id');
  await createIndex('IX_mesaje_oferta',     'mesaje',   'oferta_id');
  await createIndex('IX_reviews_lucrare',   'reviews',  'lucrare_id');
  await createIndex('IX_reviews_reviewee',  'reviews',  'reviewee_id');
  await createIndex('IX_reviews_public',    'reviews',  '[public], devine_public_la');

  console.log('  ✅ Schema verificata si actualizata!');
}

// ── Date de test (doar la prima instalare) ───────────────────
async function seedData() {
  const row = await get_p('SELECT COUNT(*) AS n FROM utilizatori');
  if (row && row.n > 0) {
    console.log(`  📦 Baza de date: ${process.env.DB_NAME} (${row.n} utilizatori existenti)`);
    return;
  }

  console.log('  🌱 Prima instalare — inserez date de test...');
  const hash = await bcrypt.hash('Test1234', 10);

  const ins = (email, tip, nume) => run_p(
    `INSERT INTO utilizatori (email,parola_hash,tip_cont,nume_complet,activ)
     VALUES (@email,@hash,@tip,@nume,1)`,
    { email, hash, tip, nume }
  );

  const r1 = await ins('client1@test.ro', 'client', 'Ion Popescu');
  const r2 = await ins('client2@test.ro', 'client', 'Maria Ionescu');
  const r3 = await ins('firma1@test.ro',  'firma',  'Termo Install SRL');
  const r4 = await ins('firma2@test.ro',  'firma',  'Electro Pro SRL');
  const r5 = await ins('firma3@test.ro',  'firma',  'Zugrav Expert SRL');

  const insF = (uid, nf, cat, oras, raza, desc) => run_p(
    `INSERT INTO firme (utilizator_id,nume_firma,categorie,oras,raza_km,descriere)
     VALUES (@uid,@nf,@cat,@oras,@raza,@desc)`,
    { uid, nf, cat, oras, raza, desc }
  );

  await insF(r3.lastID, 'Termo Install Campina',  'Instalator',  'Campina',   40, 'Instalatii termice si sanitare, urgente 24h');
  await insF(r4.lastID, 'Electro Pro Ploiesti',   'Electrician', 'Ploiesti',  60, 'Instalatii electrice, tablouri, prize');
  await insF(r5.lastID, 'Zugrav Expert Bucuresti','Zugrav',      'Bucuresti', 30, 'Zugraveli interioare si exterioare');

  console.log('  ✅ Date de test inserate!');
  console.log('     Conturi test (parola: Test1234):');
  console.log('     client1@test.ro, client2@test.ro');
  console.log('     firma1@test.ro, firma2@test.ro, firma3@test.ro');
}

// ── Initializare ──────────────────────────────────────────────
async function initDB() {
  try {
    await getPool();
    await createSchema();
    await seedData();
  } catch(err) {
    console.error('  ❌ Eroare baza de date:', err.message);
    console.error('  💡 Verifica .env: DB_SERVER, DB_PORT, DB_USER, DB_PASS, DB_NAME');
    process.exit(1);
  }
}

initDB();
module.exports = { get_p, all_p, run_p, query, sql };
