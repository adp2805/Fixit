// ============================================================
//  FixIt.ro — Configurare baza de date PostgreSQL
//  Schema se creeaza automat la prima pornire!
// ============================================================

const { Pool } = require('pg');
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

// ── Pool global ───────────────────────────────────────────────
let pool = null;

function getPool() {
  if (pool) return pool;

  // Railway furnizeaza DATABASE_URL automat
  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });
  } else {
    const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'];
    const missing  = required.filter(k => !process.env[k]);
    if (missing.length) {
      console.error(`  ❌ Lipsesc variabile: ${missing.join(', ')} — verifica fisierul .env`);
      process.exit(1);
    }
    pool = new Pool({
      host:     process.env.DB_HOST,
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASS,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });
  }

  pool.on('error', (err) => {
    console.error('  ❌ Eroare pool PostgreSQL:', err.message);
  });

  return pool;
}

// ── Conversia parametrilor de la sintaxa @param la $1,$2 ─────
function convertParams(sqlText, params = {}) {
  const keys = Object.keys(params);
  if (keys.length === 0) return { text: sqlText, values: [] };

  const values = [];
  const usedKeys = [];
  const text = sqlText.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    const idx = usedKeys.indexOf(key);
    if (idx !== -1) return `$${idx + 1}`;
    usedKeys.push(key);
    values.push(params[key] !== undefined ? params[key] : null);
    return `$${usedKeys.length}`;
  });

  return { text, values };
}

async function query(sqlText, params = {}) {
  const p = getPool();
  const { text, values } = convertParams(sqlText, params);
  try {
    return await p.query(text, values);
  } catch(e) {
    console.error('  ❌ Eroare query:', e.message);
    console.error('     SQL:', text);
    throw e;
  }
}

async function get_p(sqlText, params = {}) {
  const result = await query(sqlText, params);
  return result.rows[0] || null;
}

async function all_p(sqlText, params = {}) {
  const result = await query(sqlText, params);
  return result.rows;
}

// ── Executor READ ONLY (pentru Admin SQL runner) ─────────────
// Ruleaza query-ul intr-o tranzactie READ ONLY: orice incercare
// de scriere (INSERT/UPDATE/DELETE/DROP/...) esueaza la nivel de
// PostgreSQL, indiferent daca a trecut de filtrele din server.js.
async function query_readonly(sqlText) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const result = await client.query(sqlText);
    await client.query('ROLLBACK');
    return Array.isArray(result) ? result[result.length - 1].rows : result.rows;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

async function run_p(sqlText, params = {}) {
  const isInsert = sqlText.trim().toUpperCase().startsWith('INSERT');
  let finalSql = sqlText;

  if (isInsert) {
    finalSql = sqlText.replace(/;?\s*$/, ' RETURNING id');
  }

  const result = await query(finalSql, params);
  const lastID = isInsert && result.rows?.[0]?.id
    ? parseInt(result.rows[0].id) : null;
  return { lastID, changes: result.rowCount || 0 };
}

// ── Schema completa — se aplica automat ──────────────────────
async function createSchema() {
  const p = getPool();
  const exec = async (sql_text) => {
    try { await p.query(sql_text); }
    catch(e) {
      if (!e.message.includes('already exists')) throw e;
    }
  };

  console.log('  🔧 Verific si creez schema bazei de date...');

  await exec(`
    CREATE TABLE IF NOT EXISTS utilizatori (
      id               SERIAL        NOT NULL,
      email            VARCHAR(255)  NOT NULL,
      parola_hash      VARCHAR(255)  NOT NULL,
      tip_cont         VARCHAR(10)   NOT NULL,
      nume_complet     VARCHAR(200)  NOT NULL,
      prenume          VARCHAR(100)  NULL,
      nume             VARCHAR(100)  NULL,
      activ            BOOLEAN       NOT NULL DEFAULT FALSE,
      token_activare   VARCHAR(100)  NULL,
      token_expira     TIMESTAMPTZ   NULL,
      creat_la         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_utilizatori PRIMARY KEY (id),
      CONSTRAINT UQ_utilizatori_email UNIQUE (email),
      CONSTRAINT CK_utilizatori_tip CHECK (tip_cont IN ('client','firma','ambele'))
    )`);

  await exec(`
    CREATE TABLE IF NOT EXISTS firme (
      id               SERIAL        NOT NULL,
      utilizator_id    INT           NOT NULL,
      nume_firma       VARCHAR(200)  NOT NULL,
      categorie        VARCHAR(100)  NOT NULL DEFAULT 'General',
      oras             VARCHAR(100)  NULL,
      raza_km          INT           NOT NULL DEFAULT 50,
      descriere        VARCHAR(1000) NULL,
      telefon          VARCHAR(30)   NULL,
      zone_activitate  VARCHAR(500)  NULL,
      creat_la         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_firme PRIMARY KEY (id),
      CONSTRAINT UQ_firme_utilizator UNIQUE (utilizator_id),
      CONSTRAINT FK_firme_utilizator FOREIGN KEY (utilizator_id) REFERENCES utilizatori(id) ON DELETE CASCADE
    )`);

  await exec(`
    CREATE TABLE IF NOT EXISTS lucrari (
      id               SERIAL        NOT NULL,
      client_id        INT           NOT NULL,
      titlu            VARCHAR(300)  NOT NULL,
      descriere        VARCHAR(2000) NULL,
      categorie        VARCHAR(100)  NOT NULL,
      oras             VARCHAR(100)  NOT NULL,
      adresa           VARCHAR(300)  NULL,
      urgenta          BOOLEAN       NOT NULL DEFAULT FALSE,
      status           VARCHAR(20)   NOT NULL DEFAULT 'activa',
      finalizata_la    TIMESTAMPTZ   NULL,
      creat_la         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_lucrari PRIMARY KEY (id),
      CONSTRAINT FK_lucrari_client FOREIGN KEY (client_id) REFERENCES utilizatori(id) ON DELETE CASCADE,
      CONSTRAINT CK_lucrari_status CHECK (status IN ('activa','in_lucru','finalizata','anulata'))
    )`);

  await exec(`
    CREATE TABLE IF NOT EXISTS oferte (
      id                      SERIAL        NOT NULL,
      lucrare_id              INT           NOT NULL,
      firma_id                INT           NOT NULL,
      pret                    DECIMAL(10,2) NOT NULL,
      descriere_oferta        VARCHAR(1000) NULL,
      disponibilitate_de_la   TIMESTAMP     NULL,
      disponibilitate_pana_la TIMESTAMP     NULL,
      status                  VARCHAR(20)   NOT NULL DEFAULT 'trimisa',
      pret_contraoferta       DECIMAL(10,2) NULL,
      mesaj_contraoferta      VARCHAR(500)  NULL,
      firma_a_initiat         BOOLEAN       NULL,
      citit_client            BOOLEAN       NOT NULL DEFAULT TRUE,
      citit_firma             BOOLEAN       NOT NULL DEFAULT FALSE,
      data_inceput            DATE          NULL,
      data_sfarsit            DATE          NULL,
      creat_la                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_oferte PRIMARY KEY (id),
      CONSTRAINT UQ_oferta_unica UNIQUE (lucrare_id, firma_id),
      CONSTRAINT FK_oferte_lucrare FOREIGN KEY (lucrare_id) REFERENCES lucrari(id) ON DELETE CASCADE,
      CONSTRAINT FK_oferte_firma FOREIGN KEY (firma_id) REFERENCES firme(id),
      CONSTRAINT CK_oferte_status CHECK (status IN ('trimisa','acceptata','refuzata','negociere'))
    )`);

  await exec(`
    CREATE TABLE IF NOT EXISTS mesaje (
      id               SERIAL        NOT NULL,
      oferta_id        INT           NOT NULL,
      sender_id        INT           NOT NULL,
      mesaj            TEXT          NOT NULL,
      citit            BOOLEAN       NOT NULL DEFAULT FALSE,
      creat_la         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_mesaje PRIMARY KEY (id),
      CONSTRAINT FK_mesaje_oferta FOREIGN KEY (oferta_id) REFERENCES oferte(id) ON DELETE CASCADE,
      CONSTRAINT FK_mesaje_sender FOREIGN KEY (sender_id) REFERENCES utilizatori(id)
    )`);

  await exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id                   SERIAL         NOT NULL,
      lucrare_id           INT            NOT NULL,
      reviewer_id          INT            NOT NULL,
      reviewee_id          INT            NOT NULL,
      tip_reviewer         VARCHAR(10)    NOT NULL,
      rating_general       NUMERIC(3,1)   NOT NULL,
      comentariu           VARCHAR(1000)  NULL,
      punctualitate        SMALLINT       NULL,
      calitate_lucrare     SMALLINT       NULL,
      comunicare           SMALLINT       NULL,
      raport_calitate_pret SMALLINT       NULL,
      seriozitate          SMALLINT       NULL,
      promptitudine        SMALLINT       NULL,
      comunicare_client    SMALLINT       NULL,
      corectitudine_pret   SMALLINT       NULL,
      public               BOOLEAN        NOT NULL DEFAULT FALSE,
      citit_reviewee       BOOLEAN        NOT NULL DEFAULT FALSE,
      creat_la             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      devine_public_la     TIMESTAMPTZ    NOT NULL,
      CONSTRAINT PK_reviews PRIMARY KEY (id),
      CONSTRAINT UQ_review_unic UNIQUE (lucrare_id, reviewer_id),
      CONSTRAINT FK_reviews_lucrare FOREIGN KEY (lucrare_id) REFERENCES lucrari(id) ON DELETE CASCADE,
      CONSTRAINT FK_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES utilizatori(id),
      CONSTRAINT FK_reviews_reviewee FOREIGN KEY (reviewee_id) REFERENCES utilizatori(id),
      CONSTRAINT CK_reviews_tip CHECK (tip_reviewer IN ('client','firma')),
      CONSTRAINT CK_reviews_general CHECK (rating_general BETWEEN 1 AND 5)
    )`);

  // ── Coloane noi (pentru instalari existente) ─────────────────
  const addColIfMissing = async (table, column, definition) => {
    await p.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  };

  await addColIfMissing('utilizatori', 'prenume',              'VARCHAR(100) NULL');
  await addColIfMissing('utilizatori', 'nume',                 'VARCHAR(100) NULL');
  await addColIfMissing('utilizatori', 'telefon',              'VARCHAR(20) NULL');
  await addColIfMissing('utilizatori', 'telefon_prefix',       'VARCHAR(10) NULL');
  await addColIfMissing('utilizatori', 'reset_token',          'VARCHAR(100) NULL');
  await addColIfMissing('utilizatori', 'reset_expira',         'TIMESTAMPTZ NULL');
  await addColIfMissing('firme',       'zone_activitate',      'VARCHAR(500) NULL');
  await addColIfMissing('lucrari',     'finalizata_la',        'TIMESTAMPTZ NULL');
  await addColIfMissing('oferte',      'pret_contraoferta',    'DECIMAL(10,2) NULL');
  await addColIfMissing('oferte',      'mesaj_contraoferta',   'VARCHAR(500) NULL');
  await addColIfMissing('oferte',      'firma_a_initiat',      'BOOLEAN NULL');
  await addColIfMissing('oferte',      'citit_client',         'BOOLEAN NOT NULL DEFAULT TRUE');
  await addColIfMissing('oferte',      'citit_firma',          'BOOLEAN NOT NULL DEFAULT FALSE');
  await addColIfMissing('oferte',      'data_inceput',         'DATE NULL');
  await addColIfMissing('oferte',      'data_sfarsit',         'DATE NULL');
  await addColIfMissing('reviews',     'citit_reviewee',       'BOOLEAN NOT NULL DEFAULT FALSE');

  // Migrare: rating_general de la SMALLINT la NUMERIC(3,1) pentru a suporta zecimale
  try {
    await p.query(`ALTER TABLE reviews ALTER COLUMN rating_general TYPE NUMERIC(3,1) USING rating_general::NUMERIC(3,1)`);
    // Actualizeaza constraint-ul
    await p.query(`ALTER TABLE reviews DROP CONSTRAINT IF EXISTS CK_reviews_general`);
    await p.query(`ALTER TABLE reviews ADD CONSTRAINT CK_reviews_general CHECK (rating_general BETWEEN 1 AND 5)`);
  } catch(e) {
    if (!e.message.includes('already') && !e.message.includes('numeric')) {
      console.error('  ⚠️  Migrare rating_general:', e.message);
    }
  }

  // Migram disponibilitate_de_la si disponibilitate_pana_la la TIMESTAMP (fara timezone)
  try {
    await p.query(`ALTER TABLE oferte ALTER COLUMN disponibilitate_de_la TYPE TIMESTAMP USING disponibilitate_de_la::TIMESTAMP`);
    await p.query(`ALTER TABLE oferte ALTER COLUMN disponibilitate_pana_la TYPE TIMESTAMP USING disponibilitate_pana_la::TIMESTAMP`);
  } catch(e) {
    // Ignora daca deja sunt TIMESTAMP
  }

  // ── Indecsi pentru performanta ───────────────────────────────
  await exec(`CREATE INDEX IF NOT EXISTS IX_lucrari_client   ON lucrari(client_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_lucrari_status   ON lucrari(status)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_oferte_lucrare   ON oferte(lucrare_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_oferte_firma     ON oferte(firma_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_mesaje_oferta    ON mesaje(oferta_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_reviews_lucrare  ON reviews(lucrare_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_reviews_reviewee ON reviews(reviewee_id)`);
  await exec(`CREATE INDEX IF NOT EXISTS IX_reviews_public   ON reviews(public, devine_public_la)`);

  console.log('  ✅ Schema verificata si actualizata!');
}

// ── Date de test (doar la prima instalare) ───────────────────
async function seedData() {
  const row = await get_p('SELECT COUNT(*) AS n FROM utilizatori');
  if (row && parseInt(row.n) > 0) {
    console.log(`  📦 Baza de date: (${row.n} utilizatori existenti)`);
    return;
  }

  console.log('  🌱 Prima instalare — inserez date de test...');
  const hash = await bcrypt.hash('Test1234', 10);

  const ins = (email, tip, nume) => run_p(
    `INSERT INTO utilizatori (email,parola_hash,tip_cont,nume_complet,activ)
     VALUES (@email,@hash,@tip,@nume,TRUE)`,
    { email, hash, tip, nume }
  );

  const r3 = await ins('firma1@test.ro',  'firma',  'Termo Install SRL');
  const r4 = await ins('firma2@test.ro',  'firma',  'Electro Pro SRL');
  const r5 = await ins('firma3@test.ro',  'firma',  'Zugrav Expert SRL');
  await ins('client1@test.ro', 'client', 'Ion Popescu');
  await ins('client2@test.ro', 'client', 'Maria Ionescu');

  const insF = (uid, nf, cat, oras, raza, desc) => run_p(
    `INSERT INTO firme (utilizator_id,nume_firma,categorie,oras,raza_km,descriere)
     VALUES (@uid,@nf,@cat,@oras,@raza,@desc)`,
    { uid, nf, cat, oras, raza, desc }
  );

  await insF(r3.lastID, 'Termo Install Campina',  'Instalator',  'Prahova',   40, 'Instalatii termice si sanitare, urgente 24h');
  await insF(r4.lastID, 'Electro Pro Ploiesti',   'Electrician', 'Prahova',   60, 'Instalatii electrice, tablouri, prize');
  await insF(r5.lastID, 'Zugrav Expert Bucuresti','Zugrav',      'București', 30, 'Zugraveli interioare si exterioare');

  console.log('  ✅ Date de test inserate!');
  console.log('     Conturi test (parola: Test1234):');
  console.log('     client1@test.ro, client2@test.ro');
  console.log('     firma1@test.ro, firma2@test.ro, firma3@test.ro');
}

// ── Initializare ──────────────────────────────────────────────
async function initDB() {
  try {
    const p = getPool();
    await p.query('SELECT 1');
    console.log('  ✅ Conectat la PostgreSQL');
    await createSchema();
    await seedData();
  } catch(err) {
    console.error('  ❌ Eroare baza de date:', err.message);
    console.error('  💡 Verifica .env: DATABASE_URL sau DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME');
    process.exit(1);
  }
}

initDB();
module.exports = { get_p, all_p, run_p, query, query_readonly };
