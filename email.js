// ============================================================
//  FixIt.ro — Configurare email (Nodemailer)
//
//  SETUP NECESAR (o singură dată):
//  1. Deschide fișierul .env din același folder
//  2. Completează EMAIL_USER și EMAIL_PASS cu datele tale Gmail
//  3. Pentru EMAIL_PASS folosești o "Parolă de aplicație" Google,
//     NU parola contului Gmail!
//
//  Cum obții parola de aplicație Google:
//  → myaccount.google.com → Securitate → Verificare în 2 pași (activează)
//  → myaccount.google.com/apppasswords → Selectează "Mail" → Generează
//  → Copiază parola de 16 caractere în .env
// ============================================================

const nodemailer = require('nodemailer');

// Citim configurarea din .env (dacă există)
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const BASE_URL   = process.env.BASE_URL   || 'http://localhost:3000';

// ── Creează transporter-ul SMTP ──────────────────────────────
let transporter = null;

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
  console.log(`  📧 Email configurat: ${EMAIL_USER}`);
} else {
  console.log('  ⚠️  Email NECONFIGURAT — activarea contului se face automat (mod dev).');
  console.log('     Pentru email real, completează EMAIL_USER și EMAIL_PASS în fișierul .env');
}

// ── Funcție principală: trimite email de activare ────────────
async function trimitEmailActivare(email, numeComplet, token) {
  const linkActivare = `${BASE_URL}/api/activeaza/${token}`;

  // Dacă emailul nu e configurat, afișăm link-ul în consolă (mod dev)
  if (!transporter) {
    console.log('');
    console.log('  🔗 LINK ACTIVARE (mod dev — nu se trimite email):');
    console.log(`     ${linkActivare}`);
    console.log('');
    return { ok: true, devMode: true, link: linkActivare };
  }

  const mailOptions = {
    from: `"FixIt.ro" <${EMAIL_USER}>`,
    to: email,
    subject: 'Activează-ți contul FixIt.ro',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #F8F9FB; margin: 0; padding: 0; }
          .wrap { max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid rgba(0,0,0,.07); }
          .header { background: #1B4FD8; padding: 32px 36px; }
          .logo { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
          .logo span { color: #FF6B6B; }
          .body { padding: 32px 36px; }
          h2 { font-size: 22px; font-weight: 700; color: #0D1117; margin: 0 0 12px; }
          p { font-size: 15px; color: #6B7280; line-height: 1.65; margin: 0 0 20px; }
          .btn { display: inline-block; background: #1B4FD8; color: #fff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 15px; font-weight: 600; margin-bottom: 24px; }
          .link-box { background: #F3F4F6; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #6B7280; word-break: break-all; }
          .footer { padding: 20px 36px; border-top: 1px solid rgba(0,0,0,.06); font-size: 12px; color: #9CA3AF; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="header">
            <div class="logo">Fix<span>It</span>.ro</div>
          </div>
          <div class="body">
            <h2>Salut, ${numeComplet}! 👋</h2>
            <p>Contul tău FixIt.ro a fost creat cu succes. Apasă butonul de mai jos pentru a-l activa:</p>
            <a href="${linkActivare}" class="btn">Activează contul →</a>
            <p style="font-size:13px;color:#9CA3AF;">Sau copiază link-ul în browser:</p>
            <div class="link-box">${linkActivare}</div>
          </div>
          <div class="footer">
            Link-ul este valabil 24 de ore. Dacă nu ai creat tu acest cont, ignoră acest email.
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch (err) {
    console.error('  ❌ Eroare trimitere email:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { trimitEmailActivare, BASE_URL };

// ============================================================
//  Functie: trimite email de notificare mesaj nou
// ============================================================
async function trimitEmailMesajNou(emailDestinat, numeDestinat, numeSender, titluConversatie) {
  if (!transporter) {
    console.log(`  💬 [dev] Mesaj nou de la ${numeSender} catre ${emailDestinat}`);
    return { ok: true, devMode: true };
  }

  const mailOptions = {
    from: `"FixIt.ro" <${EMAIL_USER}>`,
    to:   emailDestinat,
    subject: `💬 Mesaj nou de la ${numeSender} — FixIt.ro`,
    html: `
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>
        body{font-family:'Helvetica Neue',Arial,sans-serif;background:#F8F9FB;margin:0;padding:0;}
        .wrap{max-width:520px;margin:40px auto;background:#fff;border-radius:16px;
          overflow:hidden;border:1px solid rgba(0,0,0,.07);}
        .header{background:#1B4FD8;padding:28px 36px;}
        .logo{font-size:22px;font-weight:800;color:#fff;}
        .logo span{color:#FF6B6B;}
        .body{padding:28px 36px;}
        h2{font-size:20px;font-weight:700;color:#0D1117;margin:0 0 10px;}
        p{font-size:14px;color:#6B7280;line-height:1.65;margin:0 0 16px;}
        .btn{display:inline-block;background:#1B4FD8;color:#fff!important;
          text-decoration:none;padding:12px 28px;border-radius:10px;
          font-size:14px;font-weight:600;}
        .footer{padding:16px 36px;border-top:1px solid rgba(0,0,0,.06);
          font-size:12px;color:#9CA3AF;}
      </style></head><body>
      <div class="wrap">
        <div class="header"><div class="logo">Fix<span>It</span>.ro</div></div>
        <div class="body">
          <h2>Salut, ${numeDestinat}! 💬</h2>
          <p>Ai primit un mesaj nou de la <strong>${numeSender}</strong>
             în conversația despre <strong>${titluConversatie}</strong>.</p>
          <p>Intră în cont pentru a vedea și răspunde la mesaj:</p>
          <a href="${BASE_URL}" class="btn">Vezi mesajul →</a>
        </div>
        <div class="footer">
          Primești acest email deoarece ai o conversație activă pe FixIt.ro.
        </div>
      </div></body></html>`
  };

  try {
    await transporter.sendMail(mailOptions);
    return { ok: true };
  } catch(err) {
    console.error('  ❌ Eroare email mesaj nou:', err.message);
    return { ok: false };
  }
}

module.exports = { trimitEmailActivare, trimitEmailMesajNou, BASE_URL };
