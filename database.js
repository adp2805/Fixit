// ============================================================
//  FixIt.ro — Configurare baza de date SQL Server
//  TOATE valorile vin din .env — fara hardcodare!
// ============================================================

const sql    = require('mssql');
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');

// ── Incarca .env ─────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    const lines   = fs.readFileSync(envPath, 'utf8').split('\n');
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
    console.error(`  ❌ Lipsesc variabile de configurare: ${missing.join(', ')}`);
    console.error('  💡 Completeaza fisierul .env cu toate valorile necesare');
    process.exit(1);
  }

  return {
    server:   process.env.DB_SERVER,
    port:     parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    options: {
      //
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
  };
}

// ── Pool global de conexiuni ─────────────────────────────────
let pool = null;

async function getPool() {
  if (pool) return pool;
  const config = getConfig();
  pool = await sql.connect(config);
  console.log(`  ✅ Conectat la SQL Server: ${process.env.DB_SERVER} → ${process.env.DB_NAME}`);
  return pool;
}

// ── Wrapper promises ─────────────────────────────────────────
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
    ? parseInt(result.recordset[0].id)
    : null;

  return { lastID, changes: result.rowsAffected[0] || 0 };
}

// ── Initializare date de test ─────────────────────────────────
async function initDB() {
  try {
    await getPool();
    const row = await get_p('SELECT COUNT(*) AS n FROM utilizatori');
    if (row && row.n > 0) {
      console.log(`  📦 Baza de date: ${process.env.DB_NAME} (${row.n} utilizatori existenti)`);
      return;
    }

    console.log('  🌱 Prima rulare — inserez date de test...');
    const hash = bcrypt.hashSync('Test1234', 10);

    const ins = (email, tip, nume) => run_p(
      `INSERT INTO utilizatori (email,parola_hash,tip_cont,nume_complet,activ)
       VALUES (@email,@hash,@tip,@nume,1)`,
      { email, hash, tip, nume }
    );

    const r1  = await ins('client1@test.ro',  'client', 'Ion Popescu');
    const r2  = await ins('client2@test.ro',  'client', 'Maria Ionescu');
    const r3  = await ins('firma1@test.ro',   'firma',  'Termo Install SRL');
    const r4  = await ins('firma2@test.ro',   'firma',  'Electro Pro SRL');
    const r5  = await ins('firma3@test.ro',   'firma',  'Zugrav Expert SRL');

    const insF = (uid, nf, cat, oras, raza, desc) => run_p(
      `INSERT INTO firme (utilizator_id,nume_firma,categorie,oras,raza_km,descriere)
       VALUES (@uid,@nf,@cat,@oras,@raza,@desc)`,
      { uid, nf, cat, oras, raza, desc }
    );

    const f1 = await insF(r3.lastID, 'Termo Install Campina',  'Instalator',  'Campina',   40, 'Instalatii termice si sanitare, urgente 24h');
    const f2 = await insF(r4.lastID, 'Electro Pro Ploiesti',   'Electrician', 'Ploiesti',  60, 'Instalatii electrice, tablouri, prize');
    await      insF(r5.lastID, 'Zugrav Expert Bucuresti', 'Zugrav',      'Bucuresti', 30, 'Zugraveli interioare si exterioare');

    const l1 = await run_p(
      `INSERT INTO lucrari (client_id,titlu,descriere,categorie,oras,adresa,urgenta)
       VALUES (@cid,@titlu,@desc,@cat,@oras,@adr,@urg)`,
      { cid:r1.lastID, titlu:'Instalare centrala termica',
        desc:'Montaj centrala noua Bosch 24kW', cat:'Instalator',
        oras:'Campina', adr:'Str. Republicii 10', urg:false }
    );
    const l2 = await run_p(
      `INSERT INTO lucrari (client_id,titlu,descriere,categorie,oras,adresa,urgenta)
       VALUES (@cid,@titlu,@desc,@cat,@oras,@adr,@urg)`,
      { cid:r2.lastID, titlu:'Tablou electric stricat',
        desc:'Sigurantele sar des', cat:'Electrician',
        oras:'Ploiesti', adr:'Bld. Bucuresti 5', urg:true }
    );

    await run_p(
      `INSERT INTO oferte (lucrare_id,firma_id,pret,descriere_oferta,disponibilitate)
       VALUES (@lid,@fid,@pret,@desc,@disp)`,
      { lid:l1.lastID, fid:f1.lastID, pret:1200,
        desc:'Manopera + materiale incluse, garantie 2 ani', disp:'Luni-Vineri 9-17' }
    );
    await run_p(
      `INSERT INTO oferte (lucrare_id,firma_id,pret,descriere_oferta,disponibilitate)
       VALUES (@lid,@fid,@pret,@desc,@disp)`,
      { lid:l1.lastID, fid:f2.lastID, pret:980,
        desc:'Fara materiale, disponibil oricand', disp:'Oricand' }
    );
    await run_p(
      `INSERT INTO oferte (lucrare_id,firma_id,pret,descriere_oferta,disponibilitate)
       VALUES (@lid,@fid,@pret,@desc,@disp)`,
      { lid:l2.lastID, fid:f2.lastID, pret:350,
        desc:'Verificare completa + inlocuire sigurante', disp:'Urgent, vin azi' }
    );

    console.log('  ✅ Date de test inserate!');
    console.log('');
    console.log('  📋 Conturi de test (parola: Test1234):');
    console.log('     client1@test.ro  — client');
    console.log('     client2@test.ro  — client');
    console.log('     firma1@test.ro   — Instalator, Campina');
    console.log('     firma2@test.ro   — Electrician, Ploiesti');
    console.log('     firma3@test.ro   — Zugrav, Bucuresti');

  } catch(err) {
    console.error('  ❌ Eroare conexiune baza de date:', err.message);
    console.error('  💡 Verifica valorile din .env: DB_SERVER, DB_PORT, DB_USER, DB_PASS, DB_NAME');
    process.exit(1);
  }
}

initDB();

module.exports = { get_p, all_p, run_p, query, sql };
