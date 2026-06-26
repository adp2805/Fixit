// ============================================================
//  FixIt.ro — Server principal (SQL Server Edition)
//  Rulează cu: node server.js
//  Apoi deschide: http://localhost:3000
// ============================================================

const express = require('express');
const session = require('express-session');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const path    = require('path');
const helmet  = require('helmet');
const cors    = require('cors');

// ── .env este incarcat de database.js la import ─────────────
const { get_p, all_p, run_p } = require('./database');
const { trimitEmailActivare, trimitEmailMesajNou } = require('./email');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── Rate limiting simplu (fara dependinte externe) ───────────
const _rateLimits = {};
function rateLimit(key, maxReq, windowMs) {
  const now = Date.now();
  if (!_rateLimits[key]) _rateLimits[key] = [];
  _rateLimits[key] = _rateLimits[key].filter(t => now - t < windowMs);
  if (_rateLimits[key].length >= maxReq) return false;
  _rateLimits[key].push(now);
  return true;
}
function rateLimitMiddleware(maxReq, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    if (!rateLimit(key, maxReq, windowMs))
      return res.status(429).json({ error: 'Prea multe cereri. Încearcă din nou în câteva minute.' });
    next();
  };
}

// ── Security headers ─────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Admin auth middleware ─────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'fixit-admin-2024';
function requireAdmin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!rateLimit('admin_auth_' + ip, 10, 5 * 60 * 1000)) {
    return res.status(429).send('Prea multe incercari. Asteapta cateva minute.');
  }
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="FixIt Admin"');
    return res.status(401).send('Autentificare necesară.');
  }
  const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    res.setHeader('WWW-Authenticate', 'Basic realm="FixIt Admin"');
    return res.status(401).send('Credențiale incorecte.');
  }
  next();
}

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Servire index.html fara interferenta Cloudflare ─────────
// Cloudflare din retea modifica fisierele HTML servite static.
// Solutie: servim index.html manual prin Express, nu static.
const fs = require('fs');

// ── Securitate: headere HTTP de baza (helmet) ────────────────
app.use(helmet({
  contentSecurityPolicy: false, // dezactivat ca sa nu rupa stilurile inline existente
  crossOriginEmbedderPolicy: false
}));

// ── Securitate: CORS - permite doar domeniul propriu ─────────
const allowedOrigins = [
  'https://fixitall.ro',
  'https://www.fixitall.ro',
  process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : null
].filter(Boolean);
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.get('/', function(req, res) {
  try {
    var html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(html);
  } catch(e) {
    res.status(500).send('Eroare la incarcarea paginii: ' + e.message);
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1); // Necesar pentru Railway/Heroku - HTTPS proxy

if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ SESSION_SECRET lipseste din variabilele de mediu. Serverul nu poate porni in siguranta.');
    process.exit(1);
  } else {
    console.warn('⚠️  SESSION_SECRET lipseste — folosesc un secret temporar doar pentru dev local.');
  }
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(session({
  secret: sessionSecret,
  resave: true,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure:   process.env.NODE_ENV === 'production'
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Trebuie sa fii logat.' });
  next();
}

// ==============================================================
//  AUTENTIFICARE
// ==============================================================

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  try {
    const user = await get_p(
      'SELECT id, email, tip_cont, nume_complet, telefon, telefon_prefix FROM utilizatori WHERE id = @id',
      { id: req.session.userId }
    );
    if (!user) return res.json({ loggedIn: false });

    // Determina modul activ pentru conturi cu ambele roluri
    let modActiv = req.session.modActiv;
    if (!modActiv) {
      modActiv = user.tip_cont === 'ambele' ? 'client' : user.tip_cont;
      req.session.modActiv = modActiv;
    }

    res.json({
      loggedIn: true,
      user: { ...user, mod_activ: modActiv }
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.post('/api/register', rateLimitMiddleware(5, 10 * 60 * 1000), async (req, res) => {
  const { email, parola, tip_cont, nume_complet, prenume, nume_familie, nume_firma,
          categorie, oras, raza_km, telefon, telefon_prefix } = req.body;
  if (!email || !parola || !tip_cont || !nume_complet)
    return res.status(400).json({ error: 'Toate campurile sunt obligatorii.' });
  if (!['client','firma'].includes(tip_cont))
    return res.status(400).json({ error: 'Tip cont invalid.' });
  if (parola.length < 8)
    return res.status(400).json({ error: 'Parola trebuie să aibă minim 8 caractere.' });
  if (!/[A-Z]/.test(parola) || !/[0-9]/.test(parola))
    return res.status(400).json({ error: 'Parola trebuie să conțină cel puțin o literă mare și o cifră.' });
  if (!telefon)
    return res.status(400).json({ error: 'Numărul de telefon este obligatoriu.' });

  // Validare format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Adresa de email nu este validă.' });

  // Normalizare telefon - pastram doar cifrele pentru comparatie
  const telefonNormalizat = telefon.replace(/\D/g, '');
  if (telefonNormalizat.length < 9)
    return res.status(400).json({ error: 'Numărul de telefon nu este valid.' });

  try {
    // Verificare email duplicat
    const existentEmail = await get_p(
      'SELECT id FROM utilizatori WHERE email = @email', { email }
    );
    if (existentEmail)
      return res.status(409).json({ error: 'Există deja un cont cu această adresă de email.' });

    // Verificare telefon duplicat
    const existentTelefon = await get_p(
      `SELECT id FROM utilizatori WHERE telefon IS NOT NULL
       AND REGEXP_REPLACE(REGEXP_REPLACE(telefon, '[^0-9]', '', 'g'), '\\s', '', 'g') LIKE @tel`,
      { tel: '%' + telefonNormalizat + '%' }
    );
    if (existentTelefon)
      return res.status(409).json({ error: 'Există deja un cont cu acest număr de telefon.' });

    const token    = crypto.randomBytes(32).toString('hex');
    const expiraLa = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const hash     = bcrypt.hashSync(parola, 10);

    const { lastID } = await run_p(
      `INSERT INTO utilizatori (email,parola_hash,tip_cont,nume_complet,prenume,nume,telefon,telefon_prefix,activ,token_activare,token_expira)
       VALUES (@email,@hash,@tip,@numeComplet,@prenume,@numeFamilie,@telefon,@prefix,FALSE,@token,@expira)`,
      { email, hash, tip: tip_cont, numeComplet: nume_complet,
        prenume: prenume || '', numeFamilie: nume_familie || '',
        telefon: telefon || null, prefix: telefon_prefix || '+40',
        token, expira: expiraLa }
    );

    if (tip_cont === 'firma') {
      await run_p(
        `INSERT INTO firme (utilizator_id,nume_firma,categorie,oras,raza_km)
         VALUES (@uid,@nf,@cat,@oras,@raza)`,
        { uid: lastID, nf: nume_firma || nume_complet,
          cat: categorie || 'General', oras: oras || '', raza: raza_km || 50 }
      );
    }

    const rezultatEmail = await trimitEmailActivare(email, nume_complet, token);
    res.json({
      success: true,
      mesaj: rezultatEmail.devMode
        ? 'Cont creat! Foloseste link-ul de mai jos pentru activare.'
        : `Cont creat! Verifica emailul (${email}) pentru link-ul de activare.`,
      devMode: rezultatEmail.devMode || false,
      linkActivare: rezultatEmail.devMode ? rezultatEmail.link : null
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.post('/api/login', rateLimitMiddleware(10, 5 * 60 * 1000), async (req, res) => {
  const { email, parola } = req.body;
  if (!email || !parola) return res.status(400).json({ error: 'Email si parola sunt obligatorii.' });
  try {
    const user = await get_p('SELECT * FROM utilizatori WHERE email = @email', { email });
    if (!user || !bcrypt.compareSync(parola, user.parola_hash))
      return res.status(401).json({ error: 'Email sau parola incorecte.' });
    if (!user.activ)
      return res.status(403).json({ error: 'Contul nu este activat. Verifica emailul.', neactivat: true });

    req.session.userId   = user.id;
    req.session.tipCont  = user.tip_cont;
    req.session.modActiv = user.tip_cont === 'ambele' ? 'client' : user.tip_cont;

    // Salveaza sesiunea explicit inainte sa trimitem raspunsul
    // Fara asta, urmatoarele request-uri pot sosi inainte ca sesiunea sa fie scrisa
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Eroare sesiune.' });
      res.json({ success: true, tip_cont: user.tip_cont, nume_complet: user.nume_complet });
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.post('/api/logout', (req, res) => {
  try {
    req.session.destroy(() => res.json({ success: true }));
  } catch(e) { res.json({ success: true }); }
});

// ==============================================================
//  RESET PAROLĂ
// ==============================================================

// POST /api/forgot-password — trimite email cu link de reset
app.post('/api/forgot-password', rateLimitMiddleware(3, 10 * 60 * 1000), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Emailul este obligatoriu.' });

  try {
    const user = await get_p('SELECT * FROM utilizatori WHERE email = @email', { email });
    // Raspundem mereu cu succes pentru securitate (nu dezvaluim daca emailul exista)
    if (!user) return res.json({ success: true, mesaj: 'Dacă emailul există, vei primi un link de resetare.' });

    const token    = crypto.randomBytes(32).toString('hex');
    const expiraLa = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 ora

    await run_p(
      'UPDATE utilizatori SET reset_token=@token, reset_expira=@expira WHERE id=@id',
      { token, expira: expiraLa, id: user.id }
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const link    = `${baseUrl}/reset-parola/${token}`;

    // Trimite email
    const { trimitEmailActivare } = require('./email');
    await trimitEmailReset(email, user.nume_complet, link).catch(() => {});

    if (!process.env.EMAIL_USER && process.env.NODE_ENV !== 'production') {
      console.log('  🔑 Link reset parolă (dev mode):', link);
    }
    res.json({
      success: true,
      mesaj: 'Dacă emailul există, vei primi un link de resetare.'
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /reset-parola/:token — pagina de reset parola
app.get('/reset-parola/:token', async (req, res) => {
  try {
    const user = await get_p(
      'SELECT * FROM utilizatori WHERE reset_token = @token',
      { token: req.params.token }
    );
    if (!user || new Date(user.reset_expira) < new Date()) {
      return res.send(paginaResetParola(false, req.params.token));
    }
    res.send(paginaResetParola(true, req.params.token));
  } catch(e) { res.send(paginaResetParola(false, '')); }
});

// POST /api/reset-parola — seteaza parola noua
app.post('/api/reset-parola', async (req, res) => {
  const { token, parola } = req.body;
  if (!token || !parola) return res.status(400).json({ error: 'Date invalide.' });
  if (parola.length < 8) return res.status(400).json({ error: 'Parola trebuie să aibă minim 8 caractere.' });
  if (!/[A-Z]/.test(parola) || !/[0-9]/.test(parola))
    return res.status(400).json({ error: 'Parola trebuie să conțină cel puțin o literă mare și o cifră.' });

  try {
    const user = await get_p(
      'SELECT * FROM utilizatori WHERE reset_token = @token',
      { token }
    );
    if (!user) return res.status(400).json({ error: 'Link invalid sau deja folosit.' });
    if (new Date(user.reset_expira) < new Date())
      return res.status(400).json({ error: 'Link-ul a expirat. Solicită unul nou.' });

    const hash = bcrypt.hashSync(parola, 10);
    await run_p(
      'UPDATE utilizatori SET parola_hash=@hash, reset_token=NULL, reset_expira=NULL WHERE id=@id',
      { hash, id: user.id }
    );
    res.json({ success: true, mesaj: 'Parola a fost schimbată cu succes!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

async function trimitEmailReset(email, nume, link) {
  // Daca nu e configurat emailul, logam link-ul in consola
  if (!process.env.EMAIL_USER) {
    console.log('  🔑 Link reset parolă (dev mode):', link);
    return { devMode: true, link };
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  await transporter.sendMail({
    from: `"FixIt.ro" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Resetare parolă — FixIt.ro',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
        <h2 style="color:#1B4FD8;">Fix<span style="color:#E8341A;">It</span>.ro</h2>
        <p>Salut, <strong>${nume}</strong>!</p>
        <p>Ai solicitat resetarea parolei. Apasă butonul de mai jos:</p>
        <a href="${link}" style="display:inline-block;background:#1B4FD8;color:#fff;
          padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;margin:16px 0;">
          Resetează parola →
        </a>
        <p style="color:#6B7280;font-size:13px;">Link-ul expiră în 1 oră. Dacă nu ai solicitat resetarea, ignoră acest email.</p>
      </div>`
  });
}

function paginaResetParola(valid, token) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  if (!valid) {
    return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">
      <title>Link expirat — FixIt.ro</title>
      <style>body{font-family:Arial,sans-serif;background:#F8F9FB;display:flex;
        align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .box{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;
        text-align:center;border:1px solid rgba(0,0,0,.07);}
      .logo{font-size:22px;font-weight:800;color:#1B4FD8;margin-bottom:24px;}
      .logo span{color:#E8341A;}</style></head>
      <body><div class="box"><div class="logo">Fix<span>It</span>.ro</div>
      <div style="font-size:48px;margin-bottom:16px;">❌</div>
      <h2 style="color:#DC2626;margin-bottom:10px;">Link invalid sau expirat</h2>
      <p style="color:#6B7280;margin-bottom:24px;">Solicită un nou link de resetare de pe pagina de login.</p>
      <a href="${baseUrl}" style="background:#1B4FD8;color:#fff;padding:12px 28px;
        border-radius:10px;text-decoration:none;">Mergi la FixIt.ro →</a>
      </div></body></html>`;
  }
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">
    <title>Resetare parolă — FixIt.ro</title>
    <style>
      body{font-family:Arial,sans-serif;background:#F8F9FB;display:flex;
        align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .box{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;
        width:100%;border:1px solid rgba(0,0,0,.07);}
      .logo{font-size:22px;font-weight:800;color:#1B4FD8;margin-bottom:8px;text-align:center;}
      .logo span{color:#E8341A;}
      h2{text-align:center;color:#0D1117;margin-bottom:4px;}
      p{text-align:center;color:#6B7280;margin-bottom:28px;font-size:14px;}
      label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:#0D1117;}
      input{width:100%;padding:11px 14px;font-size:14px;border:1.5px solid rgba(0,0,0,.12);
        border-radius:10px;box-sizing:border-box;outline:none;font-family:Arial;}
      input:focus{border-color:#1B4FD8;}
      button{width:100%;background:#1B4FD8;color:#fff;border:none;padding:13px;
        border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;margin-top:16px;}
      button:hover{background:#3D6EF5;}
      .alert{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;display:none;}
      .alert.error{background:#FEE2E2;color:#991B1B;}
      .alert.success{background:#DCFCE7;color:#14532D;}
    </style></head>
    <body>
    <div class="box">
      <div class="logo">Fix<span>It</span>.ro</div>
      <h2>Resetare parolă</h2>
      <p>Introdu noua ta parolă mai jos.</p>
      <div class="alert" id="alert"></div>
      <div style="margin-bottom:14px;">
        <label>Parolă nouă</label>
        <input type="password" id="parola" placeholder="Minim 6 caractere" />
      </div>
      <div style="margin-bottom:14px;">
        <label>Confirmă parola</label>
        <input type="password" id="confirmare" placeholder="Repetă parola nouă" />
      </div>
      <button onclick="resetParola()">Salvează parola nouă</button>
    </div>
    <script>
    async function resetParola() {
      var p1 = document.getElementById('parola').value;
      var p2 = document.getElementById('confirmare').value;
      var al = document.getElementById('alert');
      al.style.display='none'; al.className='alert';
      if (p1.length < 6) { al.textContent='Parola trebuie să aibă minim 6 caractere.'; al.className='alert error'; al.style.display='block'; return; }
      if (p1 !== p2) { al.textContent='Parolele nu coincid.'; al.className='alert error'; al.style.display='block'; return; }
      var res = await fetch('/api/reset-parola', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: '${token}', parola: p1 })
      });
      var data = await res.json();
      if (res.ok) {
        al.textContent='Parolă schimbată cu succes! Te redirecționăm...';
        al.className='alert success'; al.style.display='block';
        setTimeout(function(){ window.location.href='${baseUrl}'; }, 2000);
      } else {
        al.textContent=data.error||'Eroare.'; al.className='alert error'; al.style.display='block';
      }
    }
    </script>
    </body></html>`;
}

app.get('/api/activeaza/:token', async (req, res) => {
  try {
    const user = await get_p(
      'SELECT * FROM utilizatori WHERE token_activare = @token',
      { token: req.params.token }
    );
    if (!user) return res.send(paginaActivare(false, 'Link invalid sau deja folosit.', null));
    if (new Date(user.token_expira) < new Date())
      return res.send(paginaActivare(false, 'Link-ul a expirat. Poti cere un nou email de activare.', user.email));
    if (user.activ)
      return res.send(paginaActivare(true, 'Contul era deja activat. Te poti loga!', null));

    await run_p(
      'UPDATE utilizatori SET activ=TRUE, token_activare=NULL, token_expira=NULL WHERE id=@id',
      { id: user.id }
    );
    res.send(paginaActivare(true, `Contul tau a fost activat, ${user.nume_complet}! Te poti loga acum.`, null));
  } catch(e) { res.send(paginaActivare(false, 'Eroare: ' + e.message, null)); }
});

// Retrimitere email activare
app.post('/api/retrimite-activare', rateLimitMiddleware(3, 10 * 60 * 1000), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ ok: false, mesaj: 'Email lipsa.' });

    const user = await get_p(
      'SELECT * FROM utilizatori WHERE email = @email',
      { email: email.toLowerCase().trim() }
    );

    // Nu dezvaluim daca emailul exista sau nu (previne user enumeration)
    if (!user || user.activ) return res.json({ ok: true, mesaj: 'Dacă adresa există și contul nu e activat, vei primi un email.' });

    // Generam token nou valabil 24h
    const crypto = require('crypto');
    const tokenNou = crypto.randomBytes(32).toString('hex');
    const expiraNou = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await run_p(
      'UPDATE utilizatori SET token_activare=@token, token_expira=@expira WHERE id=@id',
      { token: tokenNou, expira: expiraNou, id: user.id }
    );

    await trimitEmailActivare(user.email, user.nume_complet, tokenNou);

    res.json({ ok: true, mesaj: 'Email de activare retrimis! Verifica inbox-ul.' });
  } catch(e) {
    console.error('Eroare retrimite activare:', e.message);
    res.json({ ok: false, mesaj: 'Eroare la trimiterea emailului.' });
  }
});

function paginaActivare(succes, mesaj, emailPentruRetrimite) {
  const culoare = succes ? '#16A34A' : '#DC2626';
  const icon    = succes ? '✅' : '❌';
  const btnRetrimite = emailPentruRetrimite ? `
    <div style="margin-top:20px;">
      <p style="color:#6B7280;font-size:14px;margin-bottom:12px;">Vrei sa primesti un nou link de activare?</p>
      <button onclick="retrimite()" style="background:#1B4FD8;color:#fff;padding:12px 28px;
        border-radius:10px;border:none;cursor:pointer;font-size:15px;width:100%;">
        Retrimite email activare
      </button>
      <div id="msg-retrimite" style="margin-top:12px;font-size:14px;"></div>
    </div>
    <script>
    function retrimite() {
      var btn = document.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Se trimite...';
      fetch('/api/retrimite-activare', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email: '${emailPentruRetrimite}' })
      })
      .then(r => r.json())
      .then(d => {
        var msg = document.getElementById('msg-retrimite');
        msg.style.color = d.ok ? '#16A34A' : '#DC2626';
        msg.textContent = d.mesaj;
        btn.textContent = d.ok ? 'Email trimis!' : 'Incearca din nou';
        btn.disabled = d.ok;
      });
    }
    </script>` : '';

  return `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">
    <title>Activare cont — FixIt.ro</title>
    <style>body{font-family:Arial,sans-serif;background:#F8F9FB;display:flex;
      align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .box{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;
      text-align:center;border:1px solid rgba(0,0,0,.07);}
    .logo{font-size:22px;font-weight:800;color:#1B4FD8;margin-bottom:24px;}
    .logo span{color:#E8341A;}</style></head>
    <body><div class="box"><div class="logo">Fix<span>It</span>.ro</div>
    <div style="font-size:48px;margin-bottom:16px;">${icon}</div>
    <h2 style="color:${culoare};margin-bottom:10px;">${succes ? 'Cont activat!' : 'Activare esuata'}</h2>
    <p style="color:#6B7280;margin-bottom:24px;">${mesaj}</p>
    ${btnRetrimite}
    ${!emailPentruRetrimite ? `<a href="/" style="background:#1B4FD8;color:#fff;padding:12px 28px;
      border-radius:10px;text-decoration:none;display:inline-block;margin-top:8px;">Mergi la FixIt.ro →</a>` : ''}
    </div></body></html>`;
}

// ==============================================================
//  LUCRĂRI
// ==============================================================

app.get('/api/lucrari', async (req, res) => {
  const { categorie, oras } = req.query;
  const uid      = (req.session && req.session.userId) ? req.session.userId : 0;
  const eLogat   = uid > 0;
  const adresaCol    = eLogat ? 'l.adresa,' : 'NULL AS adresa,';
  const clientNume   = eLogat ? 'u.nume_complet AS client_nume,' : "'Client' AS client_nume,";
  const clientEmail  = eLogat
    ? 'u.email AS client_email, u.telefon AS client_telefon, u.telefon_prefix AS client_telefon_prefix,'
    : 'NULL AS client_email, NULL AS client_telefon, NULL AS client_telefon_prefix,';
  let sqlText = `SELECT l.id, l.client_id, l.titlu, l.descriere, l.categorie, l.oras,
                   ${adresaCol}
                   l.urgenta, l.status, l.finalizata_la, l.creat_la,
                   ${clientNume}
                   ${clientEmail}
                   (SELECT COUNT(*) FROM oferte o WHERE o.lucrare_id = l.id) AS nr_oferte,
                   CASE WHEN EXISTS(
                     SELECT 1 FROM reviews r WHERE r.lucrare_id=l.id AND r.reviewer_id=l.client_id
                   ) THEN TRUE ELSE FALSE END AS review_scris,
                   COALESCE((SELECT r2.public FROM reviews r2
                     WHERE r2.lucrare_id=l.id AND r2.reviewer_id=l.client_id), FALSE) AS review_public,
                   (SELECT EXTRACT(DAY FROM r3.devine_public_la - NOW())::INT FROM reviews r3
                     WHERE r3.lucrare_id=l.id AND r3.reviewer_id=l.client_id) AS zile_pana_public,
                   (SELECT o2.status FROM oferte o2
                     JOIN firme f2 ON o2.firma_id = f2.id
                     WHERE o2.lucrare_id = l.id AND f2.utilizator_id = @uid
                     LIMIT 1) AS oferta_mea_status,
                   (SELECT o3.disponibilitate_de_la FROM oferte o3
                     JOIN firme f3 ON o3.firma_id = f3.id
                     WHERE o3.lucrare_id = l.id AND o3.status = 'acceptata'
                     AND f3.utilizator_id = @uid
                     LIMIT 1) AS disponibilitate_acceptata,
                   (SELECT o4.disponibilitate_pana_la FROM oferte o4
                     JOIN firme f4 ON o4.firma_id = f4.id
                     WHERE o4.lucrare_id = l.id AND o4.status = 'acceptata'
                     AND f4.utilizator_id = @uid
                     LIMIT 1) AS disp_pana_la_acceptata
                 FROM lucrari l
                 JOIN utilizatori u ON l.client_id = u.id
                 WHERE (
                   l.status = 'activa'
                   OR l.client_id = @uid
                   OR EXISTS (
                     SELECT 1 FROM oferte o_check
                     JOIN firme f_check ON o_check.firma_id = f_check.id
                     WHERE o_check.lucrare_id = l.id
                     AND f_check.utilizator_id = @uid
                     AND o_check.status IN ('acceptata', 'negociere', 'trimisa')
                   )
                 )`;
  const params = { uid };
  if (categorie) { sqlText += ' AND l.categorie = @cat'; params.cat = categorie; }
  if (oras)      { sqlText += ' AND l.oras LIKE @oras';  params.oras = `%${oras}%`; }
  sqlText += ' ORDER BY l.creat_la DESC';
  try {
    const rows = await all_p(sqlText, params);
    res.json(rows);
  } catch(e) {
    console.error('EROARE /api/lucrari:', e.message);
    res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' });
  }
});

app.get('/api/lucrari/:id', async (req, res) => {
  try {
    const uid    = (req.session && req.session.userId) ? req.session.userId : 0;
    const eLogat = uid > 0;
    const adresaCol = eLogat ? 'l.adresa,' : 'NULL AS adresa,';
    const lucrare = await get_p(
      `SELECT l.id, l.client_id, l.titlu, l.descriere, l.categorie, l.oras,
              ${adresaCol}
              l.urgenta, l.status, l.finalizata_la, l.creat_la,
              u.nume_complet AS client_nume
       FROM lucrari l JOIN utilizatori u ON l.client_id = u.id
       WHERE l.id = @id`, { id: req.params.id }
    );
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });

    const oferte = await all_p(
      `SELECT o.id, o.lucrare_id, o.firma_id, o.pret, o.descriere_oferta,
              o.disponibilitate_de_la, o.disponibilitate_pana_la,
              o.status, o.pret_contraoferta, o.mesaj_contraoferta,
              o.citit_client, o.citit_firma, o.creat_la,
              COALESCE(o.firma_a_initiat, FALSE)::INT AS firma_a_initiat,
              f.nume_firma, f.oras AS firma_oras, f.categorie AS firma_categorie
       FROM oferte o JOIN firme f ON o.firma_id = f.id
       WHERE o.lucrare_id = @id ORDER BY o.creat_la DESC`, { id: req.params.id }
    );
    res.json({ ...lucrare, oferte });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.post('/api/lucrari', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot posta lucrari.' });
  const { titlu, descriere, categorie, oras, adresa, urgenta } = req.body;
  if (!titlu || !categorie || !oras)
    return res.status(400).json({ error: 'Titlu, categorie si oras sunt obligatorii.' });
  try {
    const { lastID } = await run_p(
      `INSERT INTO lucrari (client_id,titlu,descriere,categorie,oras,adresa,urgenta,status)
       VALUES (@cid,@titlu,@desc,@cat,@oras,@adr,@urg,'activa')`,
      { cid: req.session.userId, titlu, desc: descriere||'',
        cat: categorie, oras, adr: adresa||'', urg: urgenta ? true : false }
    );
    res.json({ success: true, lucrare_id: lastID, mesaj: 'Lucrare postata cu succes!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.delete('/api/lucrari/:id', requireAuth, async (req, res) => {
  try {
    const lucrare = await get_p('SELECT * FROM lucrari WHERE id = @id', { id: req.params.id });
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });
    if (lucrare.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti sterge lucrarea altuia.' });
    await run_p('DELETE FROM lucrari WHERE id = @id', { id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// ==============================================================
//  OFERTE
// ==============================================================

app.post('/api/oferte', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot trimite oferte.' });
  const { lucrare_id, pret, descriere_oferta,
          disponibilitate_de_la, disponibilitate_pana_la } = req.body;
  if (!lucrare_id || !pret)
    return res.status(400).json({ error: 'Lucrarea si pretul sunt obligatorii.' });
  if (isNaN(pret) || parseFloat(pret) <= 0 || parseFloat(pret) > 999999)
    return res.status(400).json({ error: 'Prețul trebuie să fie între 1 și 999.999 lei.' });
  try {
    const firma = await get_p(
      'SELECT * FROM firme WHERE utilizator_id = @uid', { uid: req.session.userId }
    );
    if (!firma) return res.status(404).json({ error: 'Profilul de firma nu exista.' });

    const existent = await get_p(
      'SELECT id, status FROM oferte WHERE lucrare_id = @lid AND firma_id = @fid',
      { lid: lucrare_id, fid: firma.id }
    );
    if (existent) {
      if (existent.status === 'acceptata') {
        return res.status(409).json({ error: 'Oferta ta a fost deja acceptată pentru această lucrare.' });
      }
      if (existent.status === 'trimisa' || existent.status === 'negociere') {
        return res.status(409).json({ error: 'Ai deja o ofertă activă pentru această lucrare.' });
      }
      // Status 'refuzata' — permite retrimiterea, stergem oferta veche
      await run_p('DELETE FROM oferte WHERE id = @id', { id: existent.id });
    }

    const { lastID } = await run_p(
      `INSERT INTO oferte (lucrare_id,firma_id,pret,descriere_oferta,disponibilitate_de_la,disponibilitate_pana_la,status,citit_client,citit_firma)
       VALUES (@lid,@fid,@pret,@desc,@dela,@panala,'trimisa',FALSE,TRUE)`,
      { lid: lucrare_id, fid: firma.id, pret,
        desc: descriere_oferta||'',
        dela: disponibilitate_de_la||null, panala: disponibilitate_pana_la||null }
    );
    res.json({ success: true, oferta_id: lastID, mesaj: 'Oferta trimisa cu succes!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.get('/api/ofertele-mele', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot vedea ofertele lor.' });
  try {
    const firma = await get_p(
      'SELECT * FROM firme WHERE utilizator_id = @uid', { uid: req.session.userId }
    );
    if (!firma) return res.status(404).json({ error: 'Profil firma negasit.' });
    const oferte = await all_p(
      `SELECT o.id, o.lucrare_id, o.firma_id, o.pret, o.descriere_oferta,
              o.disponibilitate_de_la, o.disponibilitate_pana_la,
              o.status, o.pret_contraoferta, o.mesaj_contraoferta,
              o.citit_client, o.citit_firma, o.creat_la,
              COALESCE(o.firma_a_initiat, FALSE)::INT AS firma_a_initiat,
              l.titlu AS lucrare_titlu, l.oras AS lucrare_oras, l.categorie AS lucrare_categorie,
              CASE WHEN EXISTS(
                SELECT 1 FROM reviews r WHERE r.lucrare_id = o.lucrare_id AND r.reviewer_id = @uid AND r.tip_reviewer = 'firma'
              ) THEN TRUE ELSE FALSE END AS review_scris_firma
       FROM oferte o JOIN lucrari l ON o.lucrare_id = l.id
       WHERE o.firma_id = @fid ORDER BY o.creat_la DESC`, { fid: firma.id, uid: req.session.userId }
    );
    res.json(oferte);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.patch('/api/oferte/:id/accepta', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot accepta oferte.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id, l.status AS lucrare_status FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti accepta oferte pentru lucrarile altora.' });
    if (oferta.lucrare_status === 'in_lucru')
      return res.status(409).json({ error: 'Ai acceptat deja o ofertă pentru această lucrare.' });
    if (oferta.lucrare_status === 'finalizata')
      return res.status(409).json({ error: 'Lucrarea este deja finalizată.' });

    await run_p("UPDATE oferte  SET status='acceptata', citit_firma=FALSE WHERE id=@id",    { id: req.params.id });
    await run_p("UPDATE lucrari SET status='in_lucru'  WHERE id=@id",    { id: oferta.lucrare_id });
    // Refuza automat toate celelalte oferte active pentru aceeasi lucrare
    await run_p(
      "UPDATE oferte SET status='refuzata' WHERE lucrare_id=@lid AND id!=@oid AND status IN ('trimisa','negociere')",
      { lid: oferta.lucrare_id, oid: req.params.id }
    );
    res.json({ success: true, mesaj: 'Oferta acceptata!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// ==============================================================
//  RUTE NOI: REFUZ, CONTRAOFERTA, CHAT
// ==============================================================

// PATCH /api/oferte/:id/refuza — client refuza oferta
app.patch('/api/oferte/:id/refuza', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot refuza oferte.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti refuza oferte pentru lucrarile altora.' });

    await run_p("UPDATE oferte SET status='refuzata' WHERE id=@id", { id: req.params.id });
    res.json({ success: true, mesaj: 'Oferta refuzata.' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// PATCH /api/oferte/:id/contraoferta — client trimite contraoferta
app.patch('/api/oferte/:id/contraoferta', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot trimite contraoferte.' });
  const { pret_contraoferta, mesaj_contraoferta } = req.body;
  if (!pret_contraoferta || pret_contraoferta <= 0 || parseFloat(pret_contraoferta) > 999999)
    return res.status(400).json({ error: 'Prețul trebuie să fie între 1 și 999.999 lei.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti face contraoferta pentru lucrarile altora.' });

    await run_p(
      `UPDATE oferte SET status='negociere', firma_a_initiat=FALSE,
        pret_contraoferta=@pret, mesaj_contraoferta=@mesaj, citit_firma=FALSE
       WHERE id=@id`,
      { id: req.params.id, pret: pret_contraoferta, mesaj: mesaj_contraoferta || '' }
    );
    res.json({ success: true, mesaj: 'Contraoferta trimisa!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// PATCH /api/oferte/:id/accepta-contraoferta — firma accepta contraoferta clientului
app.patch('/api/oferte/:id/accepta-contraoferta', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot accepta contraoferte.' });
  try {
    const firma = await get_p('SELECT * FROM firme WHERE utilizator_id=@uid', { uid: req.session.userId });
    const oferta = await get_p(`SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id=@id`, { id: req.params.id });
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.firma_id !== firma.id)
      return res.status(403).json({ error: 'Aceasta oferta nu iti apartine.' });

    await run_p(
      `UPDATE oferte SET status='acceptata', pret=pret_contraoferta, citit_client=FALSE WHERE id=@id`,
      { id: req.params.id }
    );
    await run_p("UPDATE lucrari SET status='in_lucru' WHERE id=@id", { id: oferta.lucrare_id });
    // Refuza automat toate celelalte oferte active pentru aceeasi lucrare
    await run_p(
      "UPDATE oferte SET status='refuzata' WHERE lucrare_id=@lid AND id!=@oid AND status IN ('trimisa','negociere')",
      { lid: oferta.lucrare_id, oid: req.params.id }
    );
    res.json({ success: true, mesaj: 'Contraoferta acceptata! Lucrarea e in lucru.' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/chat/:oferta_id — mesajele unui chat
app.get('/api/chat/:oferta_id', requireAuth, async (req, res) => {
  try {
    // Verifica ca userul e participant la aceasta conversatie
    const ofertaAcces = await get_p(
      `SELECT o.id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN firme f ON o.firma_id = f.id
       WHERE o.id = @oid
       AND (l.client_id = @uid OR f.utilizator_id = @uid)`,
      { oid: req.params.oferta_id, uid: req.session.userId }
    );
    if (!ofertaAcces) return res.status(403).json({ error: 'Acces interzis.' });

    const mesaje = await all_p(
      `SELECT m.*, u.nume_complet AS sender_nume, u.tip_cont AS sender_tip
       FROM mesaje m
       JOIN utilizatori u ON m.sender_id = u.id
       WHERE m.oferta_id = @oid
       ORDER BY m.creat_la ASC`,
      { oid: req.params.oferta_id }
    );
    // Marcheaza mesajele ca citite pentru userul curent
    await run_p(
      `UPDATE mesaje SET citit=TRUE
       WHERE oferta_id=@oid AND sender_id != @uid AND citit=FALSE`,
      { oid: req.params.oferta_id, uid: req.session.userId }
    );
    res.json(mesaje);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// POST /api/chat/:oferta_id — trimite mesaj + notificare email destinatar
app.post('/api/chat/:oferta_id', requireAuth, async (req, res) => {
  const { mesaj } = req.body;
  if (!mesaj || !mesaj.trim())
    return res.status(400).json({ error: 'Mesajul nu poate fi gol.' });
  if (mesaj.length > 2000)
    return res.status(400).json({ error: 'Mesajul nu poate depăși 2000 de caractere.' });
  try {
    // Verifica ca userul e participant la aceasta conversatie
    const ofertaAcces = await get_p(
      `SELECT o.id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN firme f ON o.firma_id = f.id
       WHERE o.id = @oid
       AND (l.client_id = @uid OR f.utilizator_id = @uid)`,
      { oid: req.params.oferta_id, uid: req.session.userId }
    );
    if (!ofertaAcces) return res.status(403).json({ error: 'Acces interzis.' });

    await run_p(
      'INSERT INTO mesaje (oferta_id, sender_id, mesaj) VALUES (@oid, @uid, @msg)',
      { oid: req.params.oferta_id, uid: req.session.userId, msg: mesaj.trim() }
    );

    // Trimite notificare email destinatarului (async, nu blocheaza raspunsul)
    notificaDestinatarMesaj(req.params.oferta_id, req.session.userId).catch(() => {});

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// Functie helper: gaseste destinatarul si trimite email notificare
async function notificaDestinatarMesaj(ofertaId, senderUserId) {
  try {
    // Obtine contextul ofertei: client + firma + titlu lucrare
    const context = await get_p(
      `SELECT o.id,
              l.titlu AS lucrare_titlu,
              u_client.id    AS client_id,
              u_client.email AS client_email,
              u_client.nume_complet AS client_nume,
              u_firma.id    AS firma_user_id,
              u_firma.email AS firma_email,
              u_firma.nume_complet AS firma_nume,
              f.nume_firma
       FROM oferte o
       JOIN lucrari    l        ON o.lucrare_id  = l.id
       JOIN utilizatori u_client ON l.client_id   = u_client.id
       JOIN firme       f        ON o.firma_id    = f.id
       JOIN utilizatori u_firma  ON f.utilizator_id = u_firma.id
       WHERE o.id = @id`,
      { id: ofertaId }
    );
    if (!context) return;

    const senderEsteClient = senderUserId === context.client_id;
    const sender           = senderEsteClient ? context.client_nume  : context.firma_nume;
    const destEmail        = senderEsteClient ? context.firma_email  : context.client_email;
    const destNume         = senderEsteClient ? context.firma_nume   : context.client_nume;
    const titlu            = context.lucrare_titlu;

    // Nu trimite email daca destinatarul e offline mai putin de 2 minute
    // (evita spam daca ambii sunt online in acelasi timp)
    const mesajeRecente = await get_p(
      `SELECT COUNT(*) AS n FROM mesaje
       WHERE oferta_id = @oid AND sender_id != @uid
         AND citit = FALSE
         AND creat_la > NOW() - INTERVAL '2 minutes'`,
      { oid: ofertaId, uid: senderUserId }
    );

    // Trimite email doar daca nu mai sunt mesaje necitite recente
    // (prima notificare dintr-un bloc de mesaje)
    if (mesajeRecente && parseInt(mesajeRecente.n) <= 1) {
      await trimitEmailMesajNou(destEmail, destNume, sender, titlu);
    }
  } catch(e) {
    console.error('Eroare notificare email mesaj:', e.message);
  }
}

// GET /api/mesaje-necitite — numarul de mesaje necitite (pentru badge in navbar)
app.get('/api/mesaje-necitite', requireAuth, async (req, res) => {
  try {
    const row = await get_p(
      `SELECT COUNT(*) AS n FROM mesaje m
       JOIN oferte o ON m.oferta_id = o.id
       WHERE m.sender_id != @uid AND m.citit = FALSE
         AND (
           EXISTS(SELECT 1 FROM lucrari l JOIN utilizatori u ON l.client_id=u.id
                  WHERE l.id=o.lucrare_id AND u.id=@uid)
           OR
           EXISTS(SELECT 1 FROM firme f WHERE f.id=o.firma_id AND f.utilizator_id=@uid)
         )`,
      { uid: req.session.userId }
    );
    res.json({ count: parseInt(row?.n || 0) });
  } catch(e) { res.json({ count: 0 }); }
});


// GET /api/oferta-detalii/:id — titlul contextual pentru chat/contraoferta
// Returneaza informatii despre oferta fara sa expuna date sensibile
app.get('/api/oferta-detalii/:id', requireAuth, async (req, res) => {
  try {
    const oferta = await get_p(
      `SELECT o.id, o.pret, o.status,
              l.titlu AS lucrare_titlu, l.oras,
              f.nume_firma, f.categorie
       FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN firme   f ON o.firma_id   = f.id
       WHERE o.id = @id`,
      { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });

    // Titlul difera in functie de tipul contului
    const titlu = req.session.modActiv === 'firma'
      ? oferta.lucrare_titlu
      : oferta.nume_firma;

    res.json({
      id:     oferta.id,
      titlu,
      pret:   oferta.pret,
      status: oferta.status,
      oras:   oferta.oras
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// GET /api/conversatii — toate conversatiile utilizatorului cu mesaje necitite
app.get('/api/conversatii', requireAuth, async (req, res) => {
  try {
    const conversatii = await all_p(
      `SELECT
         o.id AS oferta_id,
         o.pret,
         o.status AS oferta_status,
         l.titlu AS lucrare_titlu,
         l.oras,
         f.nume_firma,
         f.categorie,
         -- Ultimul mesaj
         (SELECT m2.mesaj FROM mesaje m2
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC LIMIT 1) AS ultim_mesaj,
         (SELECT m2.creat_la FROM mesaje m2
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC LIMIT 1) AS ultima_data,
         (SELECT u2.nume_complet FROM mesaje m2
          JOIN utilizatori u2 ON m2.sender_id = u2.id
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC LIMIT 1) AS ultim_sender,
         -- Mesaje necitite
         (SELECT COUNT(*) FROM mesaje m3
          WHERE m3.oferta_id = o.id
            AND m3.sender_id != @uid
            AND m3.citit = FALSE) AS necitite
       FROM oferte o
       JOIN lucrari     l ON o.lucrare_id  = l.id
       JOIN firme       f ON o.firma_id    = f.id
       JOIN utilizatori uc ON l.client_id  = uc.id
       WHERE (uc.id = @uid OR f.utilizator_id = @uid)
         AND EXISTS (SELECT 1 FROM mesaje WHERE oferta_id = o.id)
       ORDER BY ultima_data DESC`,
      { uid: req.session.userId }
    );
    res.json(conversatii);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/mesaje-necitite-total — total notificari necitite
app.get('/api/mesaje-necitite-total', requireAuth, async (req, res) => {
  try {
    const uid      = req.session.userId;
    const modActiv = req.session.modActiv;

    // 1. Mesaje necitite
    const mesaje = await get_p(
      `SELECT COUNT(*) AS n FROM mesaje m
       JOIN oferte o ON m.oferta_id = o.id
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN firme f ON o.firma_id = f.id
       WHERE m.sender_id != @uid AND m.citit = FALSE
         AND (l.client_id = @uid OR f.utilizator_id = @uid)`,
      { uid }
    );

    let oferte   = { n: 0 };
    let reviews  = { n: 0 };
    let acceptari = { n: 0 };

    if (modActiv === 'client') {
      oferte = await get_p(
        `SELECT COUNT(*) AS n FROM oferte o
         JOIN lucrari l ON o.lucrare_id = l.id
         WHERE l.client_id = @uid
           AND o.citit_client = FALSE
           AND o.status IN ('trimisa','negociere','acceptata')`,
        { uid }
      );
      reviews = await get_p(
        `SELECT COUNT(*) AS n FROM reviews
         WHERE reviewee_id = @uid AND tip_reviewer = 'firma' AND citit_reviewee = FALSE`,
        { uid }
      );
    } else if (modActiv === 'firma') {
      const firma = await get_p('SELECT id FROM firme WHERE utilizator_id=@uid', { uid });
      if (firma) {
        oferte = await get_p(
          `SELECT COUNT(*) AS n FROM oferte
           WHERE firma_id = @fid
             AND citit_firma = FALSE
             AND status = 'negociere'
             AND firma_a_initiat = FALSE`,
          { fid: firma.id }
        );
        acceptari = await get_p(
          `SELECT COUNT(*) AS n FROM oferte
           WHERE firma_id = @fid
             AND citit_firma = FALSE
             AND status = 'acceptata'`,
          { fid: firma.id }
        );
        reviews = await get_p(
          `SELECT COUNT(*) AS n FROM reviews
           WHERE reviewee_id = @uid AND tip_reviewer = 'client' AND citit_reviewee = FALSE`,
          { uid }
        );
      }
    }

    const n = (r) => parseInt(r?.n || 0);
    const total = n(mesaje) + n(oferte) + n(acceptari) + n(reviews);
    res.json({
      total,
      mesaje:    n(mesaje),
      oferte:    n(oferte),
      acceptari: n(acceptari),
      reviews:   n(reviews)
    });
  } catch(e) { res.json({ total: 0, mesaje: 0, oferte: 0, acceptari: 0, reviews: 0 }); }
});

// POST /api/marcheaza-citit — marcheaza notificarile ca vazute
app.post('/api/marcheaza-citit', requireAuth, async (req, res) => {
  try {
    const uid      = req.session.userId;
    const modActiv = req.session.modActiv;
    if (modActiv === 'client') {
      await run_p(
        `UPDATE oferte SET citit_client = TRUE
         FROM lucrari l
         WHERE oferte.lucrare_id = l.id AND l.client_id = @uid AND oferte.citit_client = FALSE`,
        { uid }
      );
      await run_p(
        `UPDATE reviews SET citit_reviewee = TRUE
         WHERE reviewee_id = @uid AND tip_reviewer = 'firma' AND citit_reviewee = FALSE`,
        { uid }
      );
    } else if (modActiv === 'firma') {
      const firma = await get_p('SELECT id FROM firme WHERE utilizator_id=@uid', { uid });
      if (firma) {
        await run_p(
          `UPDATE oferte SET citit_firma = TRUE
           WHERE firma_id = @fid AND citit_firma = FALSE`,
          { fid: firma.id }
        );
        await run_p(
          `UPDATE reviews SET citit_reviewee = TRUE
           WHERE reviewee_id = @uid AND tip_reviewer = 'client' AND citit_reviewee = FALSE`,
          { uid }
        );
      }
    }
    res.json({ success: true });
  } catch(e) { res.json({ success: false }); }
});


// PATCH /api/oferte/:id/refuza-contraoferta — firma refuza contraoferta clientului
app.patch('/api/oferte/:id/refuza-contraoferta', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot refuza contraoferte.' });
  try {
    const firma  = await get_p('SELECT * FROM firme WHERE utilizator_id=@uid', { uid: req.session.userId });
    const oferta = await get_p(
      `SELECT o.*, l.client_id, l.titlu,
              u.email AS client_email, u.nume_complet AS client_nume
       FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN utilizatori u ON l.client_id = u.id
       WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.firma_id !== firma.id)
      return res.status(403).json({ error: 'Aceasta oferta nu iti apartine.' });
    if (oferta.status !== 'negociere')
      return res.status(400).json({ error: 'Oferta nu este in negociere.' });

    // Revine la status trimisa cu pretul original, sterge contraoferta
    await run_p(
      `UPDATE oferte SET status='trimisa', pret_contraoferta=NULL, mesaj_contraoferta=NULL
       WHERE id=@id`,
      { id: req.params.id }
    );

    // Notifica clientul prin email
    const numeFirma = firma.nume_firma;
    if (oferta.client_email) {
      trimitEmailMesajNou(
        oferta.client_email,
        oferta.client_nume,
        numeFirma,
        oferta.titlu + ' — contraofertă refuzată'
      ).catch(() => {});
    }

    res.json({ success: true, mesaj: 'Contraoferta refuzata. Clientul a fost notificat.' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// PATCH /api/oferte/:id/contraoferta-firma — firma trimite contraoferta catre client
app.patch('/api/oferte/:id/contraoferta-firma', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot folosi aceasta ruta.' });

  const { pret_contraoferta, mesaj_contraoferta } = req.body;
  if (!pret_contraoferta || pret_contraoferta <= 0 || parseFloat(pret_contraoferta) > 999999)
    return res.status(400).json({ error: 'Prețul trebuie să fie între 1 și 999.999 lei.' });

  try {
    const firma  = await get_p('SELECT * FROM firme WHERE utilizator_id=@uid', { uid: req.session.userId });
    const oferta = await get_p(
      `SELECT o.*, l.client_id, l.titlu,
              u.email AS client_email, u.nume_complet AS client_nume
       FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN utilizatori u ON l.client_id = u.id
       WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.firma_id !== firma.id)
      return res.status(403).json({ error: 'Aceasta oferta nu iti apartine.' });

    // Firma trimite contraoferta — status devine negociere, firma_a_initiat=1
    await run_p(
      `UPDATE oferte SET status='negociere', firma_a_initiat=TRUE,
        pret_contraoferta=@pret, mesaj_contraoferta=@mesaj, citit_client=FALSE
       WHERE id=@id`,
      { id: req.params.id, pret: pret_contraoferta, mesaj: mesaj_contraoferta || '' }
    );

    // Notifica clientul prin email
    trimitEmailMesajNou(
      oferta.client_email,
      oferta.client_nume,
      firma.nume_firma,
      oferta.titlu + ' — contraofertă nouă'
    ).catch(() => {});

    res.json({ success: true, mesaj: 'Contraoferta trimisa clientului!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// PATCH /api/oferte/:id/accepta-contraoferta-firma — client accepta pretul propus de firma
app.patch('/api/oferte/:id/accepta-contraoferta-firma', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot accepta oferte.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`,
      { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti accepta oferte pentru lucrarile altora.' });
    if (!oferta.firma_a_initiat)
      return res.status(400).json({ error: 'Contraoferta nu a fost trimisa de firma.' });

    // Actualizeaza pretul la pretul propus de firma si accepta
    await run_p(
      `UPDATE oferte SET status='acceptata', pret=pret_contraoferta,
        pret_contraoferta=NULL, mesaj_contraoferta=NULL, firma_a_initiat=NULL,
        citit_firma=FALSE
       WHERE id=@id`,
      { id: req.params.id }
    );
    await run_p(
      "UPDATE lucrari SET status='in_lucru' WHERE id=@id",
      { id: oferta.lucrare_id }
    );
    // Refuza automat toate celelalte oferte active pentru aceeasi lucrare
    await run_p(
      "UPDATE oferte SET status='refuzata' WHERE lucrare_id=@lid AND id!=@oid AND status IN ('trimisa','negociere')",
      { lid: oferta.lucrare_id, oid: req.params.id }
    );
    res.json({ success: true, mesaj: 'Oferta acceptata la noul pret!' });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// ============================================================
//  REVIEW SISTEM
// ============================================================

// PATCH /api/lucrari/:id/finalizeaza — client marcheaza lucrarea ca finalizata
app.patch('/api/lucrari/:id/finalizeaza', requireAuth, async (req, res) => {
  if (req.session.modActiv !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot finaliza lucrari.' });
  try {
    const lucrare = await get_p('SELECT * FROM lucrari WHERE id=@id', { id: req.params.id });
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });
    if (lucrare.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti finaliza lucrarile altora.' });
    if (lucrare.status !== 'in_lucru')
      return res.status(400).json({ error: 'Lucrarea trebuie sa fie in lucru pentru a fi finalizata.' });

    // Verificam data_sfarsit pe server
    const ofertaAcceptata = await get_p(
      `SELECT disponibilitate_pana_la FROM oferte
       WHERE lucrare_id=@id AND status='acceptata'`,
      { id: req.params.id }
    );
    if (ofertaAcceptata?.disponibilitate_pana_la) {
      // Data e stocata ca ora locala Romania (fara timezone), o tratam ca atare
      const rawStr = ofertaAcceptata.disponibilitate_pana_la instanceof Date
        ? ofertaAcceptata.disponibilitate_pana_la.toISOString().replace('T', ' ').substring(0, 16)
        : String(ofertaAcceptata.disponibilitate_pana_la).substring(0, 16);
      const acumRomania = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Bucharest' }));
      const sfarsitRomania = new Date(rawStr.replace(' ', 'T'));
      if (acumRomania < sfarsitRomania)
        return res.status(400).json({
          error: `Lucrarea poate fi finalizată după ${sfarsitRomania.toLocaleString('ro-RO')}.`
        });
    }

    await run_p(
      "UPDATE lucrari SET status='finalizata', finalizata_la=NOW() WHERE id=@id",
      { id: req.params.id }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// POST /api/lucrari/:id/review — trimite review (client sau firma)
app.post('/api/lucrari/:id/review', requireAuth, async (req, res) => {
  try {
    const lucrare = await get_p(
      `SELECT l.*, o.firma_id, f.utilizator_id AS firma_user_id
       FROM lucrari l
       LEFT JOIN oferte o ON o.lucrare_id = l.id AND o.status = 'acceptata'
       LEFT JOIN firme f ON o.firma_id = f.id
       WHERE l.id = @id`, { id: req.params.id }
    );
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });
    if (lucrare.status !== 'finalizata')
      return res.status(400).json({ error: 'Lucrarea trebuie sa fie finalizata pentru review.' });

    const { tip_reviewer, rating_general, comentariu,
            punctualitate, calitate_lucrare, comunicare, raport_calitate_pret,
            seriozitate, promptitudine, comunicare_client, corectitudine_pret } = req.body;

    // Verifica ca userul curent e cel corect
    const esteClient = req.session.modActiv === 'client' && lucrare.client_id === req.session.userId;
    const esteFirma  = req.session.modActiv === 'firma'  && lucrare.firma_user_id === req.session.userId;
    if (!esteClient && !esteFirma)
      return res.status(403).json({ error: 'Nu ai dreptul sa lasi review pentru aceasta lucrare.' });

    // Verifica daca a mai lasat deja review
    const existent = await get_p(
      'SELECT id FROM reviews WHERE lucrare_id=@lid AND reviewer_id=@uid',
      { lid: req.params.id, uid: req.session.userId }
    );
    if (existent) return res.status(400).json({ error: 'Ai lasat deja un review pentru aceasta lucrare.' });

    // Reviewee = cel evaluat
    const revieweeId = esteClient ? lucrare.firma_user_id : lucrare.client_id;

    // Verifica daca cealalta parte a scris deja review pentru aceasta lucrare
    const reviewCealaltaParte = await get_p(
      'SELECT id FROM reviews WHERE lucrare_id=@lid AND reviewer_id=@rid',
      { lid: req.params.id, rid: revieweeId }
    );

    // Logica Airbnb:
    // - Daca ambii au scris -> ambele review-uri devin publice IMEDIAT
    // - Daca doar unul a scris -> devine public dupa 10 zile
    const ambiiiAuScris = !!reviewCealaltaParte;
    const acum = new Date();
    const devinePublicLa = ambiiiAuScris ? acum : new Date(acum.getTime() + 10 * 24 * 60 * 60 * 1000);
    const estePublicAcum = ambiiiAuScris ? true : false;

    await run_p(
      `INSERT INTO reviews
        (lucrare_id, reviewer_id, reviewee_id, tip_reviewer, rating_general, comentariu,
         punctualitate, calitate_lucrare, comunicare, raport_calitate_pret,
         seriozitate, promptitudine, comunicare_client, corectitudine_pret,
         public, devine_public_la, citit_reviewee)
       VALUES
        (@lid, @rid, @eid, @tip, @gen, @com,
         @pct, @cal, @comf, @rap,
         @ser, @pro, @comc, @corp,
         @pub, @dpla, FALSE)`,
      {
        lid: req.params.id, rid: req.session.userId, eid: revieweeId,
        tip: tip_reviewer, gen: rating_general, com: comentariu || null,
        pct: punctualitate || null, cal: calitate_lucrare || null,
        comf: comunicare || null, rap: raport_calitate_pret || null,
        ser: seriozitate || null, pro: promptitudine || null,
        comc: comunicare_client || null, corp: corectitudine_pret || null,
        pub: estePublicAcum, dpla: devinePublicLa.toISOString()
      }
    );

    // Daca ambii au scris acum, publica si review-ul celeilalte parti imediat
    if (ambiiiAuScris) {
      await run_p(
        'UPDATE reviews SET public=TRUE, devine_public_la=NOW() WHERE lucrare_id=@lid AND reviewer_id=@rid',
        { lid: req.params.id, rid: revieweeId }
      );
    }

    // Notifica cealalta parte
    const altUser = await get_p(
      'SELECT email, nume_complet FROM utilizatori WHERE id=@id', { id: revieweeId }
    );
    if (altUser) {
      const subiect = ambiiiAuScris
        ? 'Ambele review-uri sunt acum publice pentru "' + lucrare.titlu + '"'
        : 'Ai primit un review pentru "' + lucrare.titlu + '" — scrie si tu unul!';
      trimitEmailMesajNou(
        altUser.email, altUser.nume_complet, 'FixIt.ro', subiect
      ).catch(() => {});
    }

    res.json({ success: true, ambiiiAuScris });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/reviews/firma/:firma_id — reviews publice ale unei firme
app.get('/api/reviews/firma/:firma_id', async (req, res) => {
  try {
    // Actualizeaza mai intai reviews care au trecut de 10 zile
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()",
      {}
    );

    const reviews = await all_p(
      `SELECT r.id, r.lucrare_id, r.rating_general, r.comentariu,
              r.punctualitate, r.calitate_lucrare, r.comunicare,
              r.raport_calitate_pret, r.creat_la,
              SUBSTRING(u.nume_complet, 1, 1) || '.' AS reviewer_initial
       FROM reviews r
       JOIN utilizatori u ON r.reviewer_id = u.id
       JOIN firme f ON r.reviewee_id = f.utilizator_id
       WHERE f.id = @fid AND r.public = TRUE AND r.tip_reviewer = 'client'
       ORDER BY r.creat_la DESC`,
      { fid: req.params.firma_id }
    );
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/lucrari/:id/review-status — verifica daca userul a scris deja review
app.get('/api/lucrari/:id/review-status', requireAuth, async (req, res) => {
  try {
    const r = await get_p(
      'SELECT id, public, devine_public_la FROM reviews WHERE lucrare_id=@lid AND reviewer_id=@uid',
      { lid: req.params.id, uid: req.session.userId }
    );
    const zile = r ? Math.max(0, Math.ceil((new Date(r.devine_public_la) - new Date()) / 86400000)) : null;
    res.json({ scris: !!r, public: r ? !!r.public : false, zile_pana_public: zile });
  } catch(e) { res.json({ scris: false, public: false, zile_pana_public: null }); }
});


// GET /api/lucrari/:id/review-status-cealalta-parte
// Verifica daca cealalta entitate a scris deja review (fara sa dezvaluie continutul)
app.get('/api/lucrari/:id/review-status-cealalta-parte', requireAuth, async (req, res) => {
  try {
    const lucrare = await get_p(
      `SELECT l.client_id, o.firma_id, f.utilizator_id AS firma_user_id
       FROM lucrari l
       LEFT JOIN oferte o ON o.lucrare_id = l.id AND o.status = 'acceptata'
       LEFT JOIN firme f ON o.firma_id = f.id
       WHERE l.id = @id`, { id: req.params.id }
    );
    if (!lucrare) return res.status(404).json({ a_scris: false });

    // Cealalta parte = daca userul curent e clientul, cealalta parte e firma si invers
    const esteClient = lucrare.client_id === req.session.userId;
    const cealaltaParteId = esteClient ? lucrare.firma_user_id : lucrare.client_id;

    const r = await get_p(
      'SELECT id FROM reviews WHERE lucrare_id=@lid AND reviewer_id=@rid',
      { lid: req.params.id, rid: cealaltaParteId }
    );
    res.json({ a_scris: !!r });
  } catch(e) { res.json({ a_scris: false }); }
});


// GET /api/reviews/client-meu — review-urile primite de clientul logat de la firme
app.get('/api/reviews/client-meu', requireAuth, async (req, res) => {
  try {
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()",
      {}
    );
    const reviews = await all_p(
      `SELECT r.*, u.nume_complet AS reviewer_nume, l.titlu AS lucrare_titlu
       FROM reviews r
       JOIN utilizatori u ON r.reviewer_id = u.id
       JOIN lucrari l ON r.lucrare_id = l.id
       WHERE r.reviewee_id = @uid AND r.public = TRUE AND r.tip_reviewer = 'firma'
       ORDER BY r.creat_la DESC`,
      { uid: req.session.userId }
    );
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/reviews/client/:client_id — reviews publice ale unui client
app.get('/api/reviews/client/:client_id', async (req, res) => {
  try {
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()", {}
    );
    const reviews = await all_p(
      `SELECT r.id, r.lucrare_id, r.rating_general, r.comentariu,
              r.seriozitate, r.promptitudine, r.comunicare_client,
              r.corectitudine_pret, r.creat_la,
              u.nume_firma AS reviewer_nume
       FROM reviews r
       JOIN firme u ON r.reviewer_id = u.utilizator_id
       WHERE r.reviewee_id = @uid AND r.public = TRUE AND r.tip_reviewer = 'firma'
       ORDER BY r.creat_la DESC`,
      { uid: req.params.client_id }
    );
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// GET /api/reviews/ale-mele — toate review-urile mele (primite si trimise)
app.get('/api/reviews/ale-mele', requireAuth, async (req, res) => {
  try {
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()", {}
    );
    const primite = await all_p(
      `SELECT r.*, u.nume_complet AS reviewer_nume, l.titlu AS lucrare_titlu, 'primit' AS directie
       FROM reviews r
       JOIN utilizatori u ON r.reviewer_id = u.id
       JOIN lucrari l ON r.lucrare_id = l.id
       WHERE r.reviewee_id = @uid AND r.public = TRUE
       ORDER BY r.creat_la DESC`,
      { uid: req.session.userId }
    );
    const trimise = await all_p(
      `SELECT r.*, u.nume_complet AS reviewer_nume, l.titlu AS lucrare_titlu, 'trimis' AS directie
       FROM reviews r
       JOIN utilizatori u ON r.reviewee_id = u.id
       JOIN lucrari l ON r.lucrare_id = l.id
       WHERE r.reviewer_id = @uid AND r.public = TRUE
       ORDER BY r.creat_la DESC`,
      { uid: req.session.userId }
    );
    res.json({ primite, trimise });
  } catch(e) { res.status(500).json({ primite: [], trimise: [] }); }
});


// GET /api/reviews/rating-client/:user_id — rating mediu al unui client
app.get('/api/reviews/rating-client/:user_id', async (req, res) => {
  try {
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()",
      {}
    );
    const row = await get_p(
      `SELECT
         ROUND(AVG(CAST(rating_general AS FLOAT))::numeric, 1) AS rating_mediu,
         COUNT(*) AS nr_reviews
       FROM reviews
       WHERE reviewee_id = @uid AND public = TRUE AND tip_reviewer = 'firma'`,
      { uid: req.params.user_id }
    );
    res.json({
      rating_mediu: row?.rating_mediu || 0,
      nr_reviews:   row?.nr_reviews  || 0
    });
  } catch(e) { res.json({ rating_mediu: 0, nr_reviews: 0 }); }
});


// ============================================================
//  CONTUL MEU — rute API
// ============================================================

// PATCH /api/cont/profil — actualizeaza nume + email + telefon
app.patch('/api/cont/profil', requireAuth, async (req, res) => {
  const { prenume, nume, email, telefon, telefon_prefix } = req.body;
  if (!prenume || !nume || !email)
    return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii.' });
  try {
    const numeComplet = prenume.trim() + ' ' + nume.trim();
    const existent = await get_p(
      'SELECT id FROM utilizatori WHERE email=@email AND id!=@uid',
      { email: email.trim(), uid: req.session.userId }
    );
    if (existent) return res.status(400).json({ error: 'Emailul este deja folosit de alt cont.' });

    await run_p(
      `UPDATE utilizatori SET nume_complet=@nume, prenume=@prenume, nume=@numeF,
        email=@email, telefon=@tel, telefon_prefix=@prefix WHERE id=@uid`,
      { nume: numeComplet, prenume: prenume.trim(), numeF: nume.trim(),
        email: email.trim(), tel: telefon || null, prefix: telefon_prefix || '+40',
        uid: req.session.userId }
    );
    res.json({ success: true, nume_complet: numeComplet });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// PATCH /api/cont/parola — schimba parola
app.patch('/api/cont/parola', requireAuth, async (req, res) => {
  const { parola_veche, parola_noua } = req.body;
  if (!parola_veche || !parola_noua)
    return res.status(400).json({ error: 'Date invalide.' });
  if (parola_noua.length < 8 || !/[A-Z]/.test(parola_noua) || !/[0-9]/.test(parola_noua))
    return res.status(400).json({ error: 'Parola nouă trebuie să aibă minim 8 caractere, o literă mare și o cifră.' });
  try {
    const user = await get_p('SELECT * FROM utilizatori WHERE id=@uid', { uid: req.session.userId });
    const bcrypt = require('bcryptjs');
    const ok = await bcrypt.compare(parola_veche, user.parola_hash);
    if (!ok) return res.status(400).json({ error: 'Parola actuala este incorecta.' });

    const hash = await bcrypt.hash(parola_noua, 10);
    await run_p('UPDATE utilizatori SET parola_hash=@hash WHERE id=@uid', { hash, uid: req.session.userId });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// PATCH /api/cont/firma — actualizeaza datele firmei
app.patch('/api/cont/firma', requireAuth, async (req, res) => {
  const tipCont = req.session.tipCont;
  if (tipCont !== 'firma' && tipCont !== 'ambele')
    return res.status(403).json({ error: 'Nu ai un cont de firmă activ.' });
  const { nume_firma, categorie, oras, raza_km, telefon, descriere } = req.body;
  if (!nume_firma || !oras)
    return res.status(400).json({ error: 'Numele firmei si orasul sunt obligatorii.' });
  try {
    const { zone_activitate } = req.body;
    await run_p(
      `UPDATE firme SET nume_firma=@nf, categorie=@cat, oras=@oras,
        raza_km=@raza, telefon=@tel, descriere=@desc, zone_activitate=@zone
       WHERE utilizator_id=@uid`,
      { nf: nume_firma, cat: categorie, oras, raza: parseInt(raza_km)||50,
        tel: telefon||null, desc: descriere||null,
        zone: zone_activitate||null, uid: req.session.userId }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// DELETE /api/cont/sterge-firma — sterge doar contul de firma, userul ramane client
app.delete('/api/cont/sterge-firma', requireAuth, async (req, res) => {
  const { parola } = req.body;
  if (!parola) return res.status(400).json({ error: 'Parola este necesara pentru confirmare.' });
  try {
    const bcrypt = require('bcryptjs');
    const user = await get_p('SELECT * FROM utilizatori WHERE id=@uid', { uid: req.session.userId });
    if (!user) return res.status(404).json({ error: 'Utilizator negasit.' });
    const ok = await bcrypt.compare(parola, user.parola_hash);
    if (!ok) return res.status(400).json({ error: 'Parola incorecta.' });

    if (user.tip_cont !== 'firma' && user.tip_cont !== 'ambele')
      return res.status(400).json({ error: 'Nu ai un cont de firma activ.' });

    // Sterge firma si datele asociate (oferte, reviews ca firma)
    await run_p('DELETE FROM firme WHERE utilizator_id=@uid', { uid: req.session.userId });

    // Actualizeaza tip_cont la 'client'
    await run_p("UPDATE utilizatori SET tip_cont='client' WHERE id=@uid", { uid: req.session.userId });

    req.session.tipCont  = 'client';
    req.session.modActiv = 'client';
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// DELETE /api/cont/sterge — sterge contul definitiv
app.delete('/api/cont/sterge', requireAuth, async (req, res) => {
  const { parola } = req.body;
  if (!parola) return res.status(400).json({ error: 'Parola este necesara pentru confirmare.' });
  try {
    const bcrypt = require('bcryptjs');
    const user = await get_p('SELECT * FROM utilizatori WHERE id=@uid', { uid: req.session.userId });
    const ok = await bcrypt.compare(parola, user.parola_hash);
    if (!ok) return res.status(400).json({ error: 'Parola incorecta.' });

    await run_p('DELETE FROM utilizatori WHERE id=@uid', { uid: req.session.userId });
    req.session.destroy();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});


// GET /api/rating-meu — ratingul utilizatorului logat
app.get('/api/rating-meu', requireAuth, async (req, res) => {
  try {
    await run_p(
      "UPDATE reviews SET public=TRUE WHERE public=FALSE AND devine_public_la <= NOW()",
      {}
    );
    // Tip reviewer care evalueaza userul curent
    // Daca e firma -> clientii scriu tip_reviewer='client' despre el
    // Daca e client -> firmele scriu tip_reviewer='firma' despre el
    const tip = req.session.modActiv === 'firma' ? 'client' : 'firma';
    const row = await get_p(
      `SELECT
         ROUND(AVG(CAST(rating_general AS FLOAT))::numeric, 1) AS rating_mediu,
         COUNT(*) AS nr_reviews
       FROM reviews
       WHERE reviewee_id = @uid AND public = TRUE AND tip_reviewer = @tip`,
      { uid: req.session.userId, tip }
    );
    res.json({
      rating_mediu: row?.rating_mediu || 0,
      nr_reviews:   row?.nr_reviews   || 0
    });
  } catch(e) { res.json({ rating_mediu: 0, nr_reviews: 0 }); }
});


// ============================================================
//  SWITCH CONT — client <-> firma
// ============================================================

// GET /api/are-firma — verifica daca userul are si cont de firma
app.get('/api/are-firma', requireAuth, async (req, res) => {
  try {
    const firma = await get_p(
      'SELECT id, nume_firma, categorie FROM firme WHERE utilizator_id=@uid',
      { uid: req.session.userId }
    );
    res.json({ are_firma: !!firma, firma: firma || null });
  } catch(e) { res.json({ are_firma: false, firma: null }); }
});

// POST /api/activeaza-firma — adauga rolul de firma la contul existent
app.post('/api/activeaza-firma', requireAuth, async (req, res) => {
  const { nume_firma, categorie, oras, raza_km, telefon, descriere, zone_activitate } = req.body;
  if (!nume_firma || !categorie)
    return res.status(400).json({ error: 'Numele firmei și categoria sunt obligatorii.' });
  try {
    // Verifica daca are deja firma
    const existing = await get_p(
      'SELECT id FROM firme WHERE utilizator_id=@uid',
      { uid: req.session.userId }
    );
    if (existing)
      return res.status(400).json({ error: 'Ai deja un cont de firmă activat.' });

    // Creeaza firma
    await run_p(
      `INSERT INTO firme (utilizator_id, nume_firma, categorie, oras, raza_km, telefon, descriere, zone_activitate)
       VALUES (@uid, @nf, @cat, @oras, @raza, @tel, @desc, @zone)`,
      { uid: req.session.userId, nf: nume_firma, cat: categorie,
        oras: oras||null, raza: parseInt(raza_km)||50,
        tel: telefon||null, desc: descriere||null,
        zone: zone_activitate||null }
    );

    // Actualizeaza tip_cont la 'ambele'
    await run_p(
      "UPDATE utilizatori SET tip_cont='ambele' WHERE id=@uid",
      { uid: req.session.userId }
    );

    req.session.tipCont = 'ambele';
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// POST /api/switch-mod — schimba modul activ (client/firma)
app.post('/api/switch-mod', requireAuth, async (req, res) => {
  const { mod } = req.body; // 'client' sau 'firma'
  if (!['client','firma'].includes(mod))
    return res.status(400).json({ error: 'Mod invalid.' });
  try {
    const user = await get_p(
      'SELECT tip_cont FROM utilizatori WHERE id=@uid',
      { uid: req.session.userId }
    );
    if (user.tip_cont !== 'ambele' && user.tip_cont !== mod)
      return res.status(403).json({ error: 'Nu ai acces la acest mod.' });

    req.session.modActiv = mod;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Eroare sesiune.' });
      res.json({ success: true, mod });
    });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// ==============================================================
//  FIRME
// ==============================================================

app.get('/api/firme', async (req, res) => {
  const { categorie, oras } = req.query;
  const params = {};
  let where = '';
  if (categorie) { where += ' AND f.categorie = @cat'; params.cat = categorie; }
  if (oras)      { where += ' AND f.oras LIKE @oras';  params.oras = `%${oras}%`; }
  try {
    const firme = await all_p(
      `SELECT f.id, f.nume_firma, f.categorie, f.oras, f.raza_km,
         f.descriere, f.zone_activitate, f.creat_la,
         ROUND(AVG(CAST(rv.rating_general AS FLOAT))::numeric,1) AS rating_mediu,
         COUNT(rv.id) AS nr_recenzii
       FROM firme f
       JOIN utilizatori u ON u.id = f.utilizator_id AND u.activ = TRUE
       LEFT JOIN reviews rv ON rv.reviewee_id = f.utilizator_id
                            AND rv.tip_reviewer = 'client'
                            AND rv.public = TRUE
       WHERE 1=1 ${where}
       GROUP BY f.id
       ORDER BY rating_mediu DESC NULLS LAST`, params
    );
    res.json(firme);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.get('/api/profil-firma', requireAuth, async (req, res) => {
  try {
    const firma = await get_p(
      `SELECT f.*,
         ROUND(AVG(CAST(rv.rating_general AS FLOAT))::numeric,1) AS rating_mediu,
         COUNT(rv.id) AS nr_recenzii
       FROM firme f
       LEFT JOIN reviews rv ON rv.reviewee_id = f.utilizator_id
                            AND rv.tip_reviewer = 'client'
                            AND rv.public = TRUE
       WHERE f.utilizator_id = @uid
       GROUP BY f.id`,
      { uid: req.session.userId }
    );
    if (!firma) return res.status(403).json({ error: 'Nu ai un cont de firmă activ.' });
    res.json(firma);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// ==============================================================
//  ADMIN
// ==============================================================

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/api/counts', requireAdmin, async (req, res) => {
  try {
    const tabele = ['utilizatori','firme','lucrari','oferte','reviews'];
    const result = {};
    for (const t of tabele) {
      const row = await get_p(`SELECT COUNT(*) AS n FROM ${t}`);
      result[t] = parseInt(row?.n || 0);
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.get('/admin/api/table/:tabel', requireAdmin, async (req, res) => {
  const PERMISE = ['utilizatori','firme','lucrari','oferte','reviews'];
  const { tabel } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  if (!PERMISE.includes(tabel))
    return res.status(400).json({ error: 'Tabel nepermis.' });
  try {
    const rows = await all_p(
      `SELECT * FROM ${tabel} ORDER BY id DESC LIMIT @lim`, { lim: limit }
    );
    res.json({ rows, count: rows.length });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

app.post('/admin/api/sql', requireAdmin, async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Query lipsa.' });
  const sqlCurat = sql.trim().toLowerCase();
  const interzise = ['insert','update','delete','drop','alter','create','truncate'];
  for (const op of interzise) {
    if (sqlCurat.startsWith(op)) {
      return res.status(403).json({ error: `Operatia "${op.toUpperCase()}" nu este permisa in Admin UI.` });
    }
  }
  if (sqlCurat.includes('parola_hash')) {
    return res.status(403).json({ error: 'Accesul la coloana parola_hash nu este permis, nici pentru citire.' });
  }
  try {
    const rows = await all_p(sql);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: 'Eroare internă. Te rugăm să încerci din nou.' }); }
});

// ==============================================================
//  PORNIRE SERVER
// ==============================================================
setTimeout(() => {
  // ── Catch-all: toate rutele frontend returneza index.html ──
  // Permite refresh si navigare directa la /dashboard, /cont, /mesaje etc.
  app.get(['/dashboard', '/mesaje', '/cont', '/login', '/inregistrare'], function(req, res) {
    const fs   = require('fs');
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  });

  app.listen(PORT, () => {
    console.log('');
    console.log('  ✅ FixIt.ro ruleaza la:   http://localhost:' + PORT);
    console.log('  🔍 Admin DB Explorer la:  http://localhost:' + PORT + '/admin');
    console.log('  🛑 Oprire server:          Ctrl + C');
    console.log('');
  });

  // Sterge automat conturile neactivate mai vechi de 48h
  async function stergeConturiNeactivate() {
    try {
      const result = await run_p(
        `DELETE FROM utilizatori
         WHERE activ = FALSE
           AND token_expira < NOW() - INTERVAL '48 hours'`
      );
      if (result.changes > 0) {
        console.log(`  🧹 Curatare automata: ${result.changes} cont(uri) neactivate sterse.`);
      }
    } catch(e) {
      console.error('  ⚠️  Eroare curatare conturi:', e.message);
    }
  }

  // Ruleaza la pornire si apoi la fiecare 24h
  stergeConturiNeactivate();
  setInterval(stergeConturiNeactivate, 24 * 60 * 60 * 1000);
}, 800);
