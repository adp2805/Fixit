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

// ── .env este incarcat de database.js la import ─────────────
// Toate valorile de configurare vin din process.env

const { get_p, all_p, run_p } = require('./database');
const { trimitEmailActivare, trimitEmailMesajNou } = require('./email');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fixit-secret-schimba-in-productie',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
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
      'SELECT id, email, tip_cont, nume_complet FROM utilizatori WHERE id = @id',
      { id: req.session.userId }
    );
    if (!user) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, user });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
  const { email, parola, tip_cont, nume_complet, prenume, nume_familie, nume_firma, categorie, oras, raza_km } = req.body;
  if (!email || !parola || !tip_cont || !nume_complet)
    return res.status(400).json({ error: 'Toate campurile sunt obligatorii.' });
  if (!['client','firma'].includes(tip_cont))
    return res.status(400).json({ error: 'Tip cont invalid.' });
  if (parola.length < 6)
    return res.status(400).json({ error: 'Parola trebuie sa aiba minim 6 caractere.' });

  try {
    const existent = await get_p(
      'SELECT id FROM utilizatori WHERE email = @email', { email }
    );
    if (existent) return res.status(409).json({ error: 'Exista deja un cont cu acest email.' });

    const token    = crypto.randomBytes(32).toString('hex');
    const expiraLa = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const hash     = bcrypt.hashSync(parola, 10);

    // ===== MODIFICARE: salveaza si prenume/nume separate =====
    const { lastID } = await run_p(
      `INSERT INTO utilizatori (email,parola_hash,tip_cont,nume_complet,prenume,nume,activ,token_activare,token_expira)
       VALUES (@email,@hash,@tip,@numeComplet,@prenume,@numeFamilie,0,@token,@expira)`,
      { email, hash, tip: tip_cont, numeComplet: nume_complet,
        prenume: prenume || '', numeFamilie: nume_familie || '',
        token, expira: expiraLa }
    );
    // ===== SFARSIT MODIFICARE =====

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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  const { email, parola } = req.body;
  if (!email || !parola) return res.status(400).json({ error: 'Email si parola sunt obligatorii.' });
  try {
    const user = await get_p('SELECT * FROM utilizatori WHERE email = @email', { email });
    if (!user || !bcrypt.compareSync(parola, user.parola_hash))
      return res.status(401).json({ error: 'Email sau parola incorecte.' });
    if (!user.activ)
      return res.status(403).json({ error: 'Contul nu este activat. Verifica emailul.', neactivat: true });

    req.session.userId  = user.id;
    req.session.tipCont = user.tip_cont;
    res.json({ success: true, tip_cont: user.tip_cont, nume_complet: user.nume_complet });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/activeaza/:token', async (req, res) => {
  try {
    const user = await get_p(
      'SELECT * FROM utilizatori WHERE token_activare = @token',
      { token: req.params.token }
    );
    if (!user) return res.send(paginaActivare(false, 'Link invalid sau deja folosit.'));
    if (new Date(user.token_expira) < new Date())
      return res.send(paginaActivare(false, 'Link-ul a expirat. Creeaza un cont nou.'));
    if (user.activ)
      return res.send(paginaActivare(true, 'Contul era deja activat. Te poti loga!'));

    await run_p(
      'UPDATE utilizatori SET activ=1, token_activare=NULL, token_expira=NULL WHERE id=@id',
      { id: user.id }
    );
    res.send(paginaActivare(true, `Contul tau a fost activat, ${user.nume_complet}! Te poti loga acum.`));
  } catch(e) { res.send(paginaActivare(false, 'Eroare: ' + e.message)); }
});

function paginaActivare(succes, mesaj) {
  const culoare = succes ? '#16A34A' : '#DC2626';
  const icon    = succes ? '✅' : '❌';
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
    <a href="/" style="background:#1B4FD8;color:#fff;padding:12px 28px;
      border-radius:10px;text-decoration:none;">Mergi la FixIt.ro →</a>
    </div></body></html>`;
}

// ==============================================================
//  LUCRĂRI
// ==============================================================

app.get('/api/lucrari', async (req, res) => {
  const { categorie, oras } = req.query;
  let sqlText = `SELECT l.*, u.nume_complet AS client_nume,
                   CASE WHEN EXISTS(
                     SELECT 1 FROM reviews r WHERE r.lucrare_id=l.id AND r.reviewer_id=l.client_id
                   ) THEN 1 ELSE 0 END AS review_scris,
                   ISNULL((SELECT r2.[public] FROM reviews r2
                     WHERE r2.lucrare_id=l.id AND r2.reviewer_id=l.client_id), 0) AS review_public,
                   (SELECT DATEDIFF(day, GETDATE(), r3.devine_public_la) FROM reviews r3
                     WHERE r3.lucrare_id=l.id AND r3.reviewer_id=l.client_id) AS zile_pana_public
                 FROM lucrari l
                 JOIN utilizatori u ON l.client_id = u.id
                 WHERE 1=1`;
  const params = {};
  if (categorie) { sqlText += ' AND l.categorie = @cat'; params.cat = categorie; }
  if (oras)      { sqlText += ' AND l.oras LIKE @oras';  params.oras = `%${oras}%`; }
  sqlText += ' ORDER BY l.creat_la DESC';
  try {
    const rows = await all_p(sqlText, params);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/lucrari/:id', async (req, res) => {
  try {
    const lucrare = await get_p(
      `SELECT l.*, u.nume_complet AS client_nume
       FROM lucrari l JOIN utilizatori u ON l.client_id = u.id
       WHERE l.id = @id`, { id: req.params.id }
    );
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });

    const oferte = await all_p(
      `SELECT o.*, f.nume_firma, f.oras AS firma_oras, f.categorie AS firma_categorie,
              ISNULL(o.firma_a_initiat, 0) AS firma_a_initiat
       FROM oferte o JOIN firme f ON o.firma_id = f.id
       WHERE o.lucrare_id = @id ORDER BY o.creat_la DESC`, { id: req.params.id }
    );
    res.json({ ...lucrare, oferte });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lucrari', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot posta lucrari.' });
  const { titlu, descriere, categorie, oras, adresa, urgenta } = req.body;
  if (!titlu || !categorie || !oras)
    return res.status(400).json({ error: 'Titlu, categorie si oras sunt obligatorii.' });
  try {
    const { lastID } = await run_p(
      `INSERT INTO lucrari (client_id,titlu,descriere,categorie,oras,adresa,urgenta,status)
       VALUES (@cid,@titlu,@desc,@cat,@oras,@adr,@urg,'activa')`,
      { cid: req.session.userId, titlu, desc: descriere||'',
        cat: categorie, oras, adr: adresa||'', urg: urgenta ? 1 : 0 }
    );
    res.json({ success: true, lucrare_id: lastID, mesaj: 'Lucrare postata cu succes!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lucrari/:id', requireAuth, async (req, res) => {
  try {
    const lucrare = await get_p('SELECT * FROM lucrari WHERE id = @id', { id: req.params.id });
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });
    if (lucrare.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti sterge lucrarea altuia.' });
    await run_p('DELETE FROM lucrari WHERE id = @id', { id: req.params.id });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==============================================================
//  OFERTE
// ==============================================================

app.post('/api/oferte', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot trimite oferte.' });
  const { lucrare_id, pret, descriere_oferta, disponibilitate } = req.body;
  if (!lucrare_id || !pret)
    return res.status(400).json({ error: 'Lucrarea si pretul sunt obligatorii.' });
  try {
    const firma = await get_p(
      'SELECT * FROM firme WHERE utilizator_id = @uid', { uid: req.session.userId }
    );
    if (!firma) return res.status(404).json({ error: 'Profilul de firma nu exista.' });

    const existent = await get_p(
      'SELECT id FROM oferte WHERE lucrare_id = @lid AND firma_id = @fid',
      { lid: lucrare_id, fid: firma.id }
    );
    if (existent) return res.status(409).json({ error: 'Ai trimis deja o oferta pentru aceasta lucrare.' });

    const { lastID } = await run_p(
      `INSERT INTO oferte (lucrare_id,firma_id,pret,descriere_oferta,disponibilitate,status)
       VALUES (@lid,@fid,@pret,@desc,@disp,'trimisa')`,
      { lid: lucrare_id, fid: firma.id, pret,
        desc: descriere_oferta||'', disp: disponibilitate||'' }
    );
    res.json({ success: true, oferta_id: lastID, mesaj: 'Oferta trimisa cu succes!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ofertele-mele', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot vedea ofertele lor.' });
  try {
    const firma = await get_p(
      'SELECT * FROM firme WHERE utilizator_id = @uid', { uid: req.session.userId }
    );
    if (!firma) return res.status(404).json({ error: 'Profil firma negasit.' });
    const oferte = await all_p(
      `SELECT o.*, l.titlu AS lucrare_titlu, l.oras AS lucrare_oras, l.categorie AS lucrare_categorie
       FROM oferte o JOIN lucrari l ON o.lucrare_id = l.id
       WHERE o.firma_id = @fid ORDER BY o.creat_la DESC`, { fid: firma.id }
    );
    res.json(oferte);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/oferte/:id/accepta', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot accepta oferte.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti accepta oferte pentru lucrarile altora.' });

    await run_p("UPDATE oferte  SET status='acceptata' WHERE id=@id",    { id: req.params.id });
    await run_p("UPDATE lucrari SET status='in_lucru'  WHERE id=@id",    { id: oferta.lucrare_id });
    res.json({ success: true, mesaj: 'Oferta acceptata!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ==============================================================
//  RUTE NOI: REFUZ, CONTRAOFERTA, CHAT
// ==============================================================

// PATCH /api/oferte/:id/refuza — client refuza oferta
app.patch('/api/oferte/:id/refuza', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/oferte/:id/contraoferta — client trimite contraoferta
app.patch('/api/oferte/:id/contraoferta', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot trimite contraoferte.' });
  const { pret_contraoferta, mesaj_contraoferta } = req.body;
  if (!pret_contraoferta || pret_contraoferta <= 0)
    return res.status(400).json({ error: 'Pretul contraofertei trebuie sa fie pozitiv.' });
  try {
    const oferta = await get_p(
      `SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id = @id`, { id: req.params.id }
    );
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti face contraoferta pentru lucrarile altora.' });

    await run_p(
      `UPDATE oferte SET status='negociere', firma_a_initiat=0,
        pret_contraoferta=@pret, mesaj_contraoferta=@mesaj
       WHERE id=@id`,
      { id: req.params.id, pret: pret_contraoferta, mesaj: mesaj_contraoferta || '' }
    );
    res.json({ success: true, mesaj: 'Contraoferta trimisa!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/oferte/:id/accepta-contraoferta — firma accepta contraoferta clientului
app.patch('/api/oferte/:id/accepta-contraoferta', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot accepta contraoferte.' });
  try {
    const firma = await get_p('SELECT * FROM firme WHERE utilizator_id=@uid', { uid: req.session.userId });
    const oferta = await get_p(`SELECT o.*, l.client_id FROM oferte o
       JOIN lucrari l ON o.lucrare_id = l.id WHERE o.id=@id`, { id: req.params.id });
    if (!oferta) return res.status(404).json({ error: 'Oferta nu exista.' });
    if (oferta.firma_id !== firma.id)
      return res.status(403).json({ error: 'Aceasta oferta nu iti apartine.' });

    await run_p(
      `UPDATE oferte SET status='acceptata', pret=pret_contraoferta WHERE id=@id`,
      { id: req.params.id }
    );
    await run_p("UPDATE lucrari SET status='in_lucru' WHERE id=@id", { id: oferta.lucrare_id });
    res.json({ success: true, mesaj: 'Contraoferta acceptata! Lucrarea e in lucru.' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/chat/:oferta_id — mesajele unui chat
app.get('/api/chat/:oferta_id', requireAuth, async (req, res) => {
  try {
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
      `UPDATE mesaje SET citit=1
       WHERE oferta_id=@oid AND sender_id != @uid AND citit=0`,
      { oid: req.params.oferta_id, uid: req.session.userId }
    );
    res.json(mesaje);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/chat/:oferta_id — trimite mesaj + notificare email destinatar
app.post('/api/chat/:oferta_id', requireAuth, async (req, res) => {
  const { mesaj } = req.body;
  if (!mesaj || !mesaj.trim())
    return res.status(400).json({ error: 'Mesajul nu poate fi gol.' });
  try {
    await run_p(
      'INSERT INTO mesaje (oferta_id, sender_id, mesaj) VALUES (@oid, @uid, @msg)',
      { oid: req.params.oferta_id, uid: req.session.userId, msg: mesaj.trim() }
    );

    // Trimite notificare email destinatarului (async, nu blocheaza raspunsul)
    notificaDestinatarMesaj(req.params.oferta_id, req.session.userId).catch(() => {});

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
         AND citit = 0
         AND creat_la > DATEADD(minute, -2, GETDATE())`,
      { oid: ofertaId, uid: senderUserId }
    );

    // Trimite email doar daca nu mai sunt mesaje necitite recente
    // (prima notificare dintr-un bloc de mesaje)
    if (mesajeRecente && mesajeRecente.n <= 1) {
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
       WHERE m.sender_id != @uid AND m.citit = 0
         AND (
           EXISTS(SELECT 1 FROM lucrari l JOIN utilizatori u ON l.client_id=u.id
                  WHERE l.id=o.lucrare_id AND u.id=@uid)
           OR
           EXISTS(SELECT 1 FROM firme f WHERE f.id=o.firma_id AND f.utilizator_id=@uid)
         )`,
      { uid: req.session.userId }
    );
    res.json({ count: row?.n || 0 });
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
    const titlu = req.session.tipCont === 'firma'
      ? oferta.lucrare_titlu
      : oferta.nume_firma;

    res.json({
      id:     oferta.id,
      titlu,
      pret:   oferta.pret,
      status: oferta.status,
      oras:   oferta.oras
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
         (SELECT TOP 1 m2.mesaj FROM mesaje m2
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC) AS ultim_mesaj,
         (SELECT TOP 1 m2.creat_la FROM mesaje m2
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC) AS ultima_data,
         (SELECT TOP 1 u2.nume_complet FROM mesaje m2
          JOIN utilizatori u2 ON m2.sender_id = u2.id
          WHERE m2.oferta_id = o.id
          ORDER BY m2.creat_la DESC) AS ultim_sender,
         -- Mesaje necitite
         (SELECT COUNT(*) FROM mesaje m3
          WHERE m3.oferta_id = o.id
            AND m3.sender_id != @uid
            AND m3.citit = 0) AS necitite
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/mesaje-necitite-total — total mesaje necitite (pentru badge navbar)
app.get('/api/mesaje-necitite-total', requireAuth, async (req, res) => {
  try {
    const row = await get_p(
      `SELECT COUNT(*) AS n FROM mesaje m
       JOIN oferte o ON m.oferta_id = o.id
       JOIN lucrari l ON o.lucrare_id = l.id
       JOIN firme f ON o.firma_id = f.id
       WHERE m.sender_id != @uid AND m.citit = 0
         AND (l.client_id = @uid OR f.utilizator_id = @uid)`,
      { uid: req.session.userId }
    );
    res.json({ total: row?.n || 0 });
  } catch(e) { res.json({ total: 0 }); }
});


// PATCH /api/oferte/:id/refuza-contraoferta — firma refuza contraoferta clientului
app.patch('/api/oferte/:id/refuza-contraoferta', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// PATCH /api/oferte/:id/contraoferta-firma — firma trimite contraoferta catre client
app.patch('/api/oferte/:id/contraoferta-firma', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
    return res.status(403).json({ error: 'Doar firmele pot folosi aceasta ruta.' });

  const { pret_contraoferta, mesaj_contraoferta } = req.body;
  if (!pret_contraoferta || pret_contraoferta <= 0)
    return res.status(400).json({ error: 'Pretul contraofertei trebuie sa fie pozitiv.' });

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
      `UPDATE oferte SET status='negociere', firma_a_initiat=1,
        pret_contraoferta=@pret, mesaj_contraoferta=@mesaj
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// PATCH /api/oferte/:id/accepta-contraoferta-firma — client accepta pretul propus de firma
app.patch('/api/oferte/:id/accepta-contraoferta-firma', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
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
        pret_contraoferta=NULL, mesaj_contraoferta=NULL, firma_a_initiat=NULL
       WHERE id=@id`,
      { id: req.params.id }
    );
    await run_p(
      "UPDATE lucrari SET status='in_lucru' WHERE id=@id",
      { id: oferta.lucrare_id }
    );
    res.json({ success: true, mesaj: 'Oferta acceptata la noul pret!' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// ============================================================
//  REVIEW SISTEM
// ============================================================

// PATCH /api/lucrari/:id/finalizeaza — client marcheaza lucrarea ca finalizata
app.patch('/api/lucrari/:id/finalizeaza', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'client')
    return res.status(403).json({ error: 'Doar clientii pot finaliza lucrari.' });
  try {
    const lucrare = await get_p('SELECT * FROM lucrari WHERE id=@id', { id: req.params.id });
    if (!lucrare) return res.status(404).json({ error: 'Lucrarea nu exista.' });
    if (lucrare.client_id !== req.session.userId)
      return res.status(403).json({ error: 'Nu poti finaliza lucrarile altora.' });
    if (lucrare.status !== 'in_lucru')
      return res.status(400).json({ error: 'Lucrarea trebuie sa fie in lucru pentru a fi finalizata.' });

    await run_p(
      "UPDATE lucrari SET status='finalizata', finalizata_la=GETDATE() WHERE id=@id",
      { id: req.params.id }
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    const esteClient = req.session.tipCont === 'client' && lucrare.client_id === req.session.userId;
    const esteFirma  = req.session.tipCont === 'firma'  && lucrare.firma_user_id === req.session.userId;
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
    const estePublicAcum = ambiiiAuScris ? 1 : 0;

    await run_p(
      `INSERT INTO reviews
        (lucrare_id, reviewer_id, reviewee_id, tip_reviewer, rating_general, comentariu,
         punctualitate, calitate_lucrare, comunicare, raport_calitate_pret,
         seriozitate, promptitudine, comunicare_client, corectitudine_pret,
         [public], devine_public_la)
       VALUES
        (@lid, @rid, @eid, @tip, @gen, @com,
         @pct, @cal, @comf, @rap,
         @ser, @pro, @comc, @corp,
         @pub, @dpla)`,
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
        'UPDATE reviews SET [public]=1, devine_public_la=GETDATE() WHERE lucrare_id=@lid AND reviewer_id=@rid',
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
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reviews/firma/:firma_id — reviews publice ale unei firme
app.get('/api/reviews/firma/:firma_id', async (req, res) => {
  try {
    // Actualizeaza mai intai reviews care au trecut de 10 zile
    await run_p(
      "UPDATE reviews SET [public]=1 WHERE [public]=0 AND devine_public_la <= GETDATE()",
      {}
    );

    const reviews = await all_p(
      `SELECT r.*, u.nume_complet AS reviewer_nume,
              LEFT(u.nume_complet, 1) + '.' AS reviewer_initial
       FROM reviews r
       JOIN utilizatori u ON r.reviewer_id = u.id
       JOIN firme f ON r.reviewee_id = f.utilizator_id
       WHERE f.id = @fid AND r.[public] = 1 AND r.tip_reviewer = 'client'
       ORDER BY r.creat_la DESC`,
      { fid: req.params.firma_id }
    );
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/lucrari/:id/review-status — verifica daca userul a scris deja review
app.get('/api/lucrari/:id/review-status', requireAuth, async (req, res) => {
  try {
    const r = await get_p(
      'SELECT id, [public], devine_public_la FROM reviews WHERE lucrare_id=@lid AND reviewer_id=@uid',
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
      "UPDATE reviews SET [public]=1 WHERE [public]=0 AND devine_public_la <= GETDATE()",
      {}
    );
    const reviews = await all_p(
      `SELECT r.*, u.nume_complet AS reviewer_nume, l.titlu AS lucrare_titlu
       FROM reviews r
       JOIN utilizatori u ON r.reviewer_id = u.id
       JOIN lucrari l ON r.lucrare_id = l.id
       WHERE r.reviewee_id = @uid AND r.[public] = 1 AND r.tip_reviewer = 'firma'
       ORDER BY r.creat_la DESC`,
      { uid: req.session.userId }
    );
    res.json(reviews);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
      `SELECT f.*,
         ROUND(AVG(CAST(rv.rating_general AS FLOAT)),1) AS rating_mediu,
         COUNT(rv.id) AS nr_recenzii
       FROM firme f
       LEFT JOIN reviews rv ON rv.reviewee_id = f.utilizator_id
                            AND rv.tip_reviewer = 'client'
                            AND rv.[public] = 1
       WHERE 1=1 ${where}
       GROUP BY f.id,f.utilizator_id,f.nume_firma,f.categorie,
                f.oras,f.raza_km,f.descriere,f.telefon,f.creat_la
       ORDER BY rating_mediu DESC`, params
    );
    res.json(firme);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/profil-firma', requireAuth, async (req, res) => {
  if (req.session.tipCont !== 'firma')
    return res.status(403).json({ error: 'Doar firmele au profil de firma.' });
  try {
    const firma = await get_p(
      `SELECT f.*,
         ROUND(AVG(CAST(rv.rating_general AS FLOAT)),1) AS rating_mediu,
         COUNT(rv.id) AS nr_recenzii
       FROM firme f
       LEFT JOIN reviews rv ON rv.reviewee_id = f.utilizator_id
                            AND rv.tip_reviewer = 'client'
                            AND rv.[public] = 1
       WHERE f.utilizator_id = @uid
       GROUP BY f.id,f.utilizator_id,f.nume_firma,f.categorie,
                f.oras,f.raza_km,f.descriere,f.telefon,f.creat_la`,
      { uid: req.session.userId }
    );
    res.json(firma || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==============================================================
//  ADMIN
// ==============================================================

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/api/counts', async (req, res) => {
  try {
    const tabele = ['utilizatori','firme','lucrari','oferte','recenzii'];
    const result = {};
    for (const t of tabele) {
      const row = await get_p(`SELECT COUNT(*) AS n FROM ${t}`);
      result[t] = row?.n || 0;
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/api/table/:tabel', async (req, res) => {
  const PERMISE = ['utilizatori','firme','lucrari','oferte','recenzii'];
  const { tabel } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  if (!PERMISE.includes(tabel))
    return res.status(400).json({ error: 'Tabel nepermis.' });
  try {
    const rows = await all_p(
      `SELECT TOP (@lim) * FROM ${tabel} ORDER BY id DESC`, { lim: limit }
    );
    res.json({ rows, count: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/admin/api/sql', async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Query lipsa.' });
  const sqlCurat = sql.trim().toLowerCase();
  const interzise = ['insert','update','delete','drop','alter','create','truncate'];
  for (const op of interzise) {
    if (sqlCurat.startsWith(op)) {
      return res.status(403).json({ error: `Operatia "${op.toUpperCase()}" nu este permisa in Admin UI.` });
    }
  }
  try {
    const rows = await all_p(sql);
    res.json({ rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==============================================================
//  PORNIRE SERVER
// ==============================================================
setTimeout(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ✅ FixIt.ro ruleaza la:   http://localhost:' + PORT);
    console.log('  🔍 Admin DB Explorer la:  http://localhost:' + PORT + '/admin');
    console.log('  🛑 Oprire server:          Ctrl + C');
    console.log('');
  });
}, 800);
