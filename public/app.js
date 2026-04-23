
// ============================================================
//  STATE
// ============================================================
let currentUser = null;
let currentLucrareId = null;

// ============================================================
//  INIT
// ============================================================
// ===== MODIFICARE: init() cu auto-login daca sesiunea e activa =====
async function init() {
  // Initializeaza routing bazat pe URL curent (suporta refresh si Back)
  await navigaDupaUrl(false);

  // Pre-completeaza email salvat
  var emailSalvat = localStorage.getItem('fixit_email_salvat');
  if (emailSalvat) {
    var loginEl = document.getElementById('login-email');
    if (loginEl) loginEl.value = emailSalvat;
  }
  var tineMinte = localStorage.getItem('fixit_tine_minte');
  if (tineMinte) {
    var tmEl = document.getElementById('tine-minte');
    if (tmEl) tmEl.checked = true;
  }
}
// ===== SFARSIT MODIFICARE =====

// ============================================================
//  NAVIGARE
// ============================================================
function showPage(name) {
  navigaLa(name);
}

// ===== MODIFICARE 3: goHome() forteaza refresh complet al dashboard-ului =====
// ===== BUG FIX: goHome() - functioneaza corect si dupa refresh =====
// ===== goHome: arata landing page cu salut, nu dashboard-ul =====
async function goHome() {
  navigaLa('home');
}
// ===== SFARSIT goHome =====

// Navigare rapida la dashboard din home page
function mergiLaDashboard() {
  if (!currentUser) return;
  if (currentUser.tip_cont === 'client') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-client').classList.add('active');
    window.scrollTo(0, 0);
    loadClientDashboard();
  } else {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-firma').classList.add('active');
    window.scrollTo(0, 0);
    loadFirmaDashboard();
  }
}

function mergiLaDashboardTab(tab) {
  if (!currentUser) return;
  mergiLaDashboard();
  // Dupa ce se incarca, activeaza tab-ul corect
  setTimeout(function() {
    if (currentUser.tip_cont === 'firma') {
      var btn = document.querySelector('#page-firma .tab-btn:nth-child(' + (tab === 'oferte' ? '2' : '1') + ')');
      if (btn) { firmaTab(tab, btn); }
    }
  }, 300);
}

function deschideModalLucrare() {
  mergiLaDashboard();
  setTimeout(function() {
    var modal = document.getElementById('modal-lucrare');
    if (modal) openModal('modal-lucrare');
  }, 300);
}



// ============================================================
//  RATING NAVBAR — afiseaza ratingul utilizatorului logat
// ============================================================
async function incarcaRatingMeu() {
  try {
    var data = await (await fetch('/api/rating-meu')).json();
    var el   = document.getElementById('nav-user-rating');
    if (!el) return;

    if (!data.nr_reviews || data.nr_reviews === 0) {
      el.innerHTML = '<span class="nav-rating-nou">Nou pe platformă</span>';
    } else {
      var rating = parseFloat(data.rating_mediu) || 0;
      // Stele simple: pline si goale
      var stele = '';
      for (var i = 1; i <= 5; i++) {
        stele += i <= Math.round(rating) ? '★' : '☆';
      }
      el.innerHTML = '<span class="nav-rating-stars">' + stele + '</span>'
        + '<span style="font-size:11px;color:var(--gray);margin-left:3px;">'
        + rating.toFixed(1)
        + ' <span style="color:#ccc;">(' + data.nr_reviews + ')</span>'
        + '</span>';
    }
  } catch(e) {
    var el = document.getElementById('nav-user-rating');
    if (el) el.textContent = '';
  }
}

// ============================================================
//  NAV
// ============================================================
function updateNav(user) {
  // nav-user e inlocuit cu dropdown — folosim null-safe access
  var _navUser = document.getElementById('nav-user');
  if (_navUser) { _navUser.style.display = 'inline'; _navUser.innerHTML = 'Salut, <strong>' + user.nume_complet.split(' ')[0] + '</strong>'; }
  var _btnLogout = document.getElementById('btn-logout');
  if (_btnLogout) _btnLogout.style.display = 'none'; // ascuns - inlocuit de dropdown
  document.getElementById('btn-login-nav').style.display = 'none';
  document.getElementById('btn-register-nav').style.display = 'none';
  document.getElementById('home-guest').style.display = 'none';
  document.getElementById('home-logged').style.display = 'block';
  var _t = document.getElementById('home-logged-title');
  if (_t) _t.textContent = 'Salut, ' + user.nume_complet.split(' ')[0] + '! 👋';
  var _btnP = document.getElementById('btn-go-dashboard');
  var _btnS = document.getElementById('btn-go-secondary');
  if (user.tip_cont === 'client') {
    if (_btnP) { _btnP.textContent = '+ Posteaźă o lucrare'; _btnP.onclick = deschideModalLucrare; }
    if (_btnS) { _btnS.textContent = 'Lucrările mele →'; _btnS.onclick = mergiLaDashboard; _btnS.style.display = 'inline-block'; }
  } else {
    if (_btnP) { _btnP.textContent = 'Lucrări disponibile →'; _btnP.onclick = mergiLaDashboard; }
    if (_btnS) { _btnS.textContent = 'Ofertele mele →'; _btnS.onclick = function(){ mergiLaDashboardTab('oferte'); }; _btnS.style.display = 'inline-block'; }
  }
  // ── Arata dropdown-ul cu numele utilizatorului ──
  var prenume  = user.nume_complet ? user.nume_complet.split(' ')[0] : 'Cont';
  var initial  = prenume.charAt(0).toUpperCase();
  var _nameEl  = document.getElementById('nav-user-name');
  var _avatarEl = document.getElementById('nav-avatar');
  var _wrapEl  = document.getElementById('nav-user-wrap');
  if (_nameEl)   _nameEl.textContent  = prenume;
  if (_avatarEl) _avatarEl.textContent = initial;
  if (_wrapEl)   _wrapEl.style.display = 'inline-block';
  incarcaRatingMeu(); // Afiseaza ratingul in navbar
  actualizeazaSwitchDropdown(user); // Buton switch client/firma

  // Ascunde butonul vechi de mesaje (e acum in dropdown)
  var _mesajeWrap = document.getElementById('nav-mesaje-wrap');
  if (_mesajeWrap) _mesajeWrap.style.display = 'none';

  // Porneste polling pentru mesaje necitite (badge pe dropdown)
  startPollingMesaje();
}

// ============================================================
//  AUTH
// ============================================================
// ===== MODIFICARE 4: functie show/hide password =====
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '&#128584;';
  } else {
    input.type = 'password';
    btn.innerHTML = '&#128065;';
  }
}
// ===== SFARSIT MODIFICARE 4 =====

function fillTest(email) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-parola').value = 'Test1234';
}

function selectTip(tip) {
  document.getElementById('reg-tip').value = tip;
  document.getElementById('opt-client').classList.toggle('selected', tip === 'client');
  document.getElementById('opt-firma').classList.toggle('selected', tip === 'firma');
  document.getElementById('firma-extra').style.display  = tip === 'firma'  ? 'block' : 'none';
  document.getElementById('client-fields').style.display = tip === 'client' ? 'block' : 'none';
  if (tip === 'firma') {
    initCategorieSelect('reg-categorie', false);
    initOrasSelect('reg-oras', false);
  }
}

// ===== MODIFICARE: doLogin cu Tine-ma minte =====
async function doLogin() {
  const email     = document.getElementById('login-email').value.trim();
  const parola    = document.getElementById('login-parola').value;
  const tineMinte = document.getElementById('tine-minte')?.checked || false;
  showAlert('login-alert', '', '');

  const res  = await fetch('/api/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email, parola })
  });
  const data = await res.json();

  if (!res.ok) { showAlert('login-alert', data.error, 'error'); return; }

  // Salveaza emailul in localStorage pentru auto-completare
  localStorage.setItem('fixit_email_salvat', email);

  // Daca "Tine-ma minte" e bifat, salveaza preferinta
  if (tineMinte) {
    localStorage.setItem('fixit_tine_minte', '1');
  } else {
    localStorage.removeItem('fixit_tine_minte');
  }

  currentUser = { email, tip_cont: data.tip_cont, nume_complet: data.nume_complet, id: data.id };
  updateNav(currentUser);

  // Dupa login, arata homepage-ul personalizat (nu dashboard-ul)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('home-guest').style.display  = 'none';
  document.getElementById('home-logged').style.display = 'block';
  window.scrollTo(0, 0);
}
// ===== SFARSIT MODIFICARE =====

async function doRegister() {
  const tip = document.getElementById('reg-tip').value;
  showAlert('register-alert', '', '');

  var prenume, numeSimple, email, parola;

  if (tip === 'firma') {
    prenume    = document.getElementById('reg-prenume').value.trim();
    numeSimple = document.getElementById('reg-nume').value.trim();
    email      = document.getElementById('reg-email').value.trim();
    parola     = document.getElementById('reg-parola').value;
  } else {
    prenume    = document.getElementById('reg-prenume-client').value.trim();
    numeSimple = document.getElementById('reg-nume-client').value.trim();
    email      = document.getElementById('reg-email-client').value.trim();
    parola     = document.getElementById('reg-parola-client').value;

    const prefixClient   = document.getElementById('reg-prefix-client')?.value || '+40';
    const telefonNrClient = document.getElementById('reg-telefon-client')?.value.trim();
    var telValClient = validatePhone('reg-telefon-client', 'reg-prefix-client');
    if (!telValClient.valid) { showAlert('register-alert', telValClient.mesaj, 'error'); return; }
    body.telefon        = prefixClient + ' ' + telefonNrClient;
    body.telefon_prefix = prefixClient;
  }

  const nume = prenume + ' ' + numeSimple;

  if (!prenume || !numeSimple) {
    showAlert('register-alert', 'Prenumele și numele sunt obligatorii.', 'error');
    return;
  }

  var body = { tip_cont:tip, nume_complet:nume, prenume, nume_familie:numeSimple, email, parola };

  if (tip === 'firma') {
    const numeFirma  = document.getElementById('reg-numefirma')?.value.trim();
    const categorie  = document.getElementById('reg-categorie')?.value;
    const oras       = document.getElementById('reg-oras')?.value;
    const raza       = document.getElementById('reg-raza')?.value;
    const prefix     = document.getElementById('reg-prefix')?.value || '+40';
    const telefonNr  = document.getElementById('reg-telefon')?.value.trim();

    if (!numeFirma) { showAlert('register-alert', 'Numele firmei este obligatoriu.', 'error'); return; }
    if (!categorie)  { showAlert('register-alert', 'Selectează o categorie.', 'error'); return; }
    if (!oras)       { showAlert('register-alert', 'Selectează județul.', 'error'); return; }

    var telValidare = validatePhone('reg-telefon', 'reg-prefix');
    if (!telValidare.valid) { showAlert('register-alert', telValidare.mesaj, 'error'); return; }

    const telefon = prefix + ' ' + telefonNr;
    body = { ...body, telefon, telefon_prefix: prefix,
      nume_firma: numeFirma, categorie, oras, raza_km: raza };
  }

  const res  = await fetch('/api/register', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (!res.ok) { showAlert('register-alert', data.error, 'error'); return; }

  // ── Cont creat — afișăm mesaj de confirmare, NU facem login automat ──
  if (data.devMode && data.linkActivare) {
    // Mod development: email neconfigurat, afișăm link direct
    document.getElementById('page-register').innerHTML = `
      <div class="auth-wrap" style="max-width:520px;">
        <div class="card" style="padding:32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">📧</div>
          <div style="font-family:var(--font-d);font-size:22px;font-weight:800;margin-bottom:10px;">Cont creat!</div>
          <div style="font-size:14px;color:var(--gray);margin-bottom:24px;line-height:1.6;">
            Emailul nu este configurat (mod development).<br>
            Apasă butonul de mai jos pentru a activa contul direct:
          </div>
          <a href="${data.linkActivare}" class="btn btn-primary btn-full" style="margin-bottom:16px;display:block;padding:13px;">
            ✅ Activează contul acum →
          </a>
          <div style="font-size:12px;color:var(--gray);">
            Sau copiază link-ul manual:<br>
            <code style="font-size:11px;background:var(--gray-light);padding:4px 8px;border-radius:6px;word-break:break-all;display:inline-block;margin-top:6px;">${data.linkActivare}</code>
          </div>
        </div>
        <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray);">
          <a href="#" onclick="showPage('login')" style="color:var(--blue);">Mergi la login →</a>
        </div>
      </div>`;
  } else {
    // Mod producție: email trimis
    document.getElementById('page-register').innerHTML = `
      <div class="auth-wrap" style="max-width:480px;">
        <div class="card" style="padding:32px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">📬</div>
          <div style="font-family:var(--font-d);font-size:22px;font-weight:800;margin-bottom:10px;">Verifică emailul!</div>
          <div style="font-size:14px;color:var(--gray);margin-bottom:8px;line-height:1.6;">
            Am trimis un email la <strong style="color:var(--dark);">${email}</strong><br>
            cu un link de activare a contului tău.
          </div>
          <div style="background:var(--blue-light);border-radius:var(--r);padding:14px;font-size:13px;color:var(--blue);margin:20px 0;line-height:1.6;">
            📌 Verifică și folderul <strong>Spam/Junk</strong> dacă nu găsești emailul în Inbox.
          </div>
          <div style="font-size:13px;color:var(--gray);">Link-ul este valabil <strong>24 de ore</strong>.</div>
        </div>
        <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--gray);">
          Ai activat contul? <a href="#" onclick="showPage('login')" style="color:var(--blue);">Intră în cont →</a>
        </div>
      </div>`;
  }
}

async function logout() {
  await fetch('/api/logout', { method:'POST' });
  currentUser = null;
  stopPollingMesaje();
  var _nu = document.getElementById('nav-user'); if(_nu) _nu.style.display = 'none';
  document.getElementById('btn-login-nav').style.display = 'inline-block';
  document.getElementById('btn-register-nav').style.display = 'inline-block';
  document.getElementById('home-guest').style.display = 'block';
  document.getElementById('home-logged').style.display = 'none';
  var _wrapEl2 = document.getElementById('nav-user-wrap');
  if (_wrapEl2) { _wrapEl2.style.display = 'none'; }
  document.getElementById('badge-necitite').style.display = 'none';
  showPage('home');
}

// ============================================================
//  SISTEM MESAGERIE — Polling + Notificari + Pagina conversatii
// ============================================================
let pollingInterval  = null;
let ultimeleNecitite = 0;
let ultimeleConvIds  = new Set();

function startPollingMesaje() {
  clearInterval(pollingInterval);
  verificaMesaje(); // verificare imediata
  pollingInterval = setInterval(verificaMesaje, 5000); // la fiecare 5 secunde
}

function stopPollingMesaje() {
  clearInterval(pollingInterval);
  pollingInterval = null;
}

async function verificaMesaje() {
  if (!currentUser) return;
  try {
    const res  = await fetch('/api/mesaje-necitite-total');
    const data = await res.json();
    const total = data.total || 0;

    actualizaBadge(total);

    // Daca au aparut mesaje noi fata de ultima verificare, arata pop-up
    if (total > ultimeleNecitite && ultimeleNecitite !== -1) {
      const diff = total - ultimeleNecitite;
      arataPopup(diff);
    }
    ultimeleNecitite = total;
  } catch(e) { /* ignora erorile de retea */ }
}

function actualizaBadge(total) {
  var badge = document.getElementById('badge-necitite');
  if (!badge) return;
  if (total > 0) {
    badge.style.display = 'flex';
    badge.textContent   = total > 99 ? '99+' : total;
    // Pozitioneaza badge-ul pe avatar in navbar
    var wrap = document.getElementById('nav-user-wrap');
    if (wrap && !wrap.querySelector('.badge-necitite')) {
      wrap.style.position = 'relative';
    }
  } else {
    badge.style.display = 'none';
  }
}

function arataPopup(nrMesaje) {
  const container = document.getElementById('notif-container');
  const id        = 'notif-' + Date.now();

  const div = document.createElement('div');
  div.id        = id;
  div.className = 'notif-popup';
  div.innerHTML = `
    <div class="notif-icon">💬</div>
    <div>
      <div class="notif-title">${nrMesaje === 1 ? 'Mesaj nou' : nrMesaje + ' mesaje noi'}</div>
      <div class="notif-sub">Apasă pentru a vedea conversațiile</div>
    </div>
    <button class="notif-close" onclick="inchideNotif('${id}')">✕</button>`;

  div.addEventListener('click', function(e) {
    if (e.target.classList.contains('notif-close')) return;
    inchideNotif(id);
    showPage('mesaje');
    loadConversatii();
  });

  container.appendChild(div);

  // Dispare automat dupa 6 secunde
  setTimeout(() => inchideNotif(id), 6000);
}

function inchideNotif(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.opacity   = '0';
  el.style.transform = 'translateX(120%)';
  setTimeout(() => el.remove(), 200);
}

async function loadConversatii() {
  const el = document.getElementById('conv-list');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Se încarcă...</p></div>';

  try {
    const conv = await (await fetch('/api/conversatii')).json();

    if (!conv.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Nicio conversație încă.<br>Conversațiile apar după ce trimiți sau primești un mesaj.</p></div>';
      return;
    }

    el.innerHTML = conv.map(c => {
      const areNecitite = c.necitite > 0;
      const data        = c.ultima_data
        ? new Date(c.ultima_data).toLocaleDateString('ro-RO', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})
        : '';
      const preview = c.ultim_mesaj
        ? (c.ultim_sender + ': ' + c.ultim_mesaj).slice(0, 60) + (c.ultim_mesaj.length > 50 ? '...' : '')
        : 'Niciun mesaj încă';

      return `<div class="conv-card ${areNecitite ? 'necitit' : ''}" onclick="deschideChatById(${c.oferta_id})">
        <div class="conv-avatar">💬</div>
        <div class="conv-body">
          <div class="conv-title">${c.lucrare_titlu}</div>
          <div style="font-size:11px;color:var(--gray);margin-bottom:4px;">
            🏢 ${c.nume_firma} · ${c.categorie} · 📍 ${c.oras}
          </div>
          <div class="conv-preview ${areNecitite ? 'necitit' : ''}">${preview}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${data}</div>
          ${areNecitite ? `<span class="conv-badge">${c.necitite}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    // Dupa ce s-au afisat conversatiile, reseteaza contorul
    ultimeleNecitite = 0;
    verificaMesaje();

  } catch(e) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Eroare la încărcarea conversațiilor.</p></div>';
  }
}

// ============================================================
//  CLIENT DASHBOARD
// ============================================================
async function loadClientDashboard() {
  const me = await (await fetch('/api/me')).json();
  if (!me.loggedIn) return;
  currentUser = me.user;
  document.getElementById('client-salut').textContent = `Salut, ${me.user.nume_complet.split(' ')[0]}!`;
  loadLucrariClient();
}

function clientTab(tab, btn) {
  document.querySelectorAll('#page-client .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('client-tab-lucrari').style.display = tab === 'lucrari' ? 'block' : 'none';
  document.getElementById('client-tab-browse').style.display  = tab === 'browse'  ? 'block' : 'none';
  if (tab === 'browse')  loadFirme();
  if (tab === 'reviews') loadReviewurileMele();
}

async function loadLucrariClient() {
  const res     = await fetch('/api/lucrari');
  const lucrari = await res.json();
  const myId    = currentUser?.id;
  const mine    = lucrari.filter(l => l.client_id === myId);
  const el      = document.getElementById('client-lucrari-list');

  if (!mine.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><p>Nu ai postat nicio lucrare încă.<br>Apasă <strong>"+ Lucrare nouă"</strong> pentru a începe.</p></div>`;
    return;
  }

  el.innerHTML = mine.map(function(l) {
    var actiuni = '';

    if (l.status === 'in_lucru') {
      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ')">Vezi oferte</button>'
        + ' <button class="btn-finalizeaza" onclick="finalizeazaLucrare(' + l.id + ')">✓ Marchează finalizată</button>';

    } else if (l.status === 'finalizata') {
      if (l.review_scris) {
        if (l.review_public) {
          actiuni = '<span class="badge badge-green">✓ Review trimis și public</span>';
        } else {
          var zile = l.zile_pana_public > 0 ? l.zile_pana_public : 0;
          actiuni = '<span class="badge-negociere">⏳ Review trimis — devine public în ' + zile + ' zile</span>';
        }
      } else {
        actiuni = '<button class="btn-review" onclick="deschideReview(' + l.id + ', \'client\')">⭐ Scrie review</button>'
          + '<div class="review-pending-box" style="margin-top:8px;">Lucrare finalizată! Scrie un review pentru a ajuta alți clienți.</div>';
      }

    } else if (l.status === 'activa') {
      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ')">Vezi oferte</button>'
        + ' <button class="btn btn-danger btn-sm" onclick="stergelucrare(' + l.id + ')">Șterge</button>';
    } else {
      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ')">Vezi oferte</button>';
    }

    return '<div class="card-sm">'
      + '<div class="lucrare-header"><div>'
      + '<div class="lucrare-title">' + l.titlu + '</div>'
      + '<div class="lucrare-meta">'
      + '<span>📍 ' + l.oras + '</span>'
      + '<span class="badge badge-blue">' + l.categorie + '</span>'
      + statusBadge(l.status)
      + (l.urgenta ? '<span class="urgenta-tag">⚡ URGENT</span>' : '')
      + '</div>'
      + (l.descriere ? '<div style="font-size:13px;color:var(--gray);margin-top:8px;">' + l.descriere + '</div>' : '')
      + '</div></div>'
      + '<div class="lucrare-actions">' + actiuni + '</div>'
      + '</div>';
  }).join('');
}

// ===== MODIFICARE: veziOferte cu 3 butoane — Accepta, Chat, Contraoferta =====
async function veziOferte(lucrareId, titlu) {
  const res  = await fetch('/api/lucrari/' + lucrareId);
  const data = await res.json();
  currentLucrareId = lucrareId;

  document.getElementById('modal-oferte-title').textContent = 'Oferte pentru: ' + titlu;
  const list = document.getElementById('modal-oferte-list');

  if (!data.oferte || !data.oferte.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><p>Nicio ofertă primită încă.</p></div>';
    openModal('modal-oferte-client');
    return;
  }

  list.innerHTML = data.oferte.map(function(o) {
    var pretAfisat;
    if (o.status === 'negociere' && o.pret_contraoferta) {
      pretAfisat = '<div>'
        + '<div class="oferta-pret" style="text-decoration:line-through;opacity:.5;font-size:14px;">' + o.pret + ' lei</div>'
        + '<div class="oferta-pret" style="color:var(--amber);">↩ ' + o.pret_contraoferta + ' lei</div>'
        + '</div>';
    } else {
      pretAfisat = '<div class="oferta-pret">' + o.pret + ' lei</div>';
    }

    var butoane = '';
    if (o.status === 'trimisa') {
      butoane = '<button class="btn btn-green btn-sm" onclick="acceptaOferta(' + o.id + ')">✓ Acceptă</button>'
        + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>'
        + ' <button class="btn btn-sm" style="background:#D97706;color:#fff;border:none;" onclick="deschideContraofertaById(' + o.id + ',' + o.pret + ')">↩ Contraofertă</button>';

    } else if (o.status === 'negociere') {
      // Verifica cine a initiat negocierea: firma_a_initiat = true inseamna firma a trimis contraoferta
      var firmaAInitiat = o.firma_a_initiat;

      if (firmaAInitiat) {
        // Firma a trimis contraoferta — clientul poate accepta, negocia sau refuza
        butoane = '<button class="btn btn-green btn-sm" onclick="acceptaOfertaFirma(' + o.id + ', ' + o.pret_contraoferta + ')">✓ Acceptă ' + o.pret_contraoferta + ' lei</button>'
          + ' <button class="btn btn-sm" style="background:#D97706;color:#fff;border:none;" onclick="deschideContraofertaById(' + o.id + ',' + o.pret_contraoferta + ')">↩ Contraofertă</button>'
          + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';
      } else {
        // Clientul a trimis contraoferta — asteapta raspunsul firmei
        butoane = '<span class="badge-negociere">⏳ Contraofertă trimisă — aștepți răspuns</span>'
          + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';
      }

    } else if (o.status === 'acceptata') {
      butoane = '<span class="badge badge-green">✓ Acceptată</span>';
    } else if (o.status === 'refuzata') {
      butoane = '<span class="badge badge-red">✗ Refuzată</span>';
    } else {
      butoane = statusBadge(o.status);
    }

    var contraofertaBox = '';
    if (o.status === 'negociere' && o.mesaj_contraoferta) {
      if (o.firma_a_initiat) {
        contraofertaBox = '<div class="contraoferta-box" style="background:#EEF3FF;border-color:#93C5FD;color:#1e40af;">'
          + '🏢 Firma propune: <strong>' + o.pret_contraoferta + ' lei</strong>'
          + ' — "' + o.mesaj_contraoferta + '"</div>';
      } else {
        contraofertaBox = '<div class="contraoferta-box">↩ Contraoferta ta: "' + o.mesaj_contraoferta + '"</div>';
      }
    }

    return '<div class="card-sm">'
      + '<div class="oferta-header"><div>'
      + '<div class="oferta-firma">🏢 ' + (o.nume_firma||'') + '</div>'
      + '<div style="font-size:12px;color:var(--gray);">📍 ' + (o.firma_oras||'') + ' · ' + (o.firma_categorie||'') + '</div>'
      + '</div>' + pretAfisat + '</div>'
      + (o.descriere_oferta ? '<div class="oferta-desc">' + o.descriere_oferta + '</div>' : '')
      + (o.disponibilitate ? '<div style="font-size:12px;color:var(--gray);margin-bottom:6px;">🕐 ' + o.disponibilitate + '</div>' : '')
      + contraofertaBox
      + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' + butoane + '</div>'
      + '</div>';
  }).join('');

  openModal('modal-oferte-client');
}

// ===== deschideChatById: obtine titlul din API fara hardcodare =====
async function deschideChatById(ofertaId) {
  // Deschide imediat — titlul se actualizeaza dupa ce API-ul raspunde
  chatOfertaId = parseInt(ofertaId);
  document.getElementById('chat-title').textContent = '💬 Chat';
  document.getElementById('chat-messages').innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gray);padding:20px;">Se incarca...</div>';
  document.getElementById('chat-input').value = '';
  openModal('modal-chat');
  clearInterval(chatInterval);

  try {
    // Obtine detaliile ofertei din server pentru titlul corect
    const res    = await fetch('/api/oferta-detalii/' + ofertaId);
    const detalii = await res.json();
    if (detalii && detalii.titlu) {
      document.getElementById('chat-title').textContent = '💬 Chat — ' + detalii.titlu;
    }
  } catch(e) { /* titlul ramane generic daca API-ul nu e disponibil */ }

  loadMesaje();
  chatInterval = setInterval(loadMesaje, 3000);
}
// ===== SFARSIT deschideChatById =====

// deschideContraofertaById: obtine numele din server
async function deschideContraofertaById(ofertaId, pretOriginal) {
  var numePartener = '';
  try {
    const res     = await fetch('/api/oferta-detalii/' + ofertaId);
    const detalii = await res.json();
    numePartener  = detalii.titlu || '';
  } catch(e) {}
  deschideContraoferta(ofertaId, pretOriginal, numePartener);
}
// ===== SFARSIT MODIFICARE =====

// ===== FUNCTII CHAT =====
let chatOfertaId = null;
let chatInterval = null;

// ===== MODIFICARE: deschideChat decodifica numele si functioneaza din orice context =====
function deschideChat(ofertaId, numeFirma) {
  chatOfertaId = ofertaId;
  // Decodifica numele daca e encodat cu encodeURIComponent
  var numeAfisat = numeFirma;
  try { numeAfisat = decodeURIComponent(numeFirma); } catch(e) {}
  if (!numeAfisat || numeAfisat === 'undefined') numeAfisat = 'Partener';

  document.getElementById('chat-title').textContent = '💬 Chat cu ' + numeAfisat;
  document.getElementById('chat-messages').innerHTML = '<div style="text-align:center;font-size:13px;color:var(--gray);padding:20px;">Se încarcă...</div>';
  document.getElementById('chat-input').value = '';
  openModal('modal-chat');
  loadMesaje();
  clearInterval(chatInterval);
  chatInterval = setInterval(loadMesaje, 3000);
}
// ===== SFARSIT MODIFICARE =====

async function loadMesaje() {
  if (!chatOfertaId) return;
  const mesaje = await (await fetch('/api/chat/' + chatOfertaId)).json();
  const container = document.getElementById('chat-messages');
  if (!Array.isArray(mesaje)) return;
  container.innerHTML = mesaje.length === 0
    ? '<div style="text-align:center;font-size:13px;color:var(--gray);padding:20px;">Niciun mesaj încă. Începe conversația!</div>'
    : mesaje.map(m => {
        const isMine = m.sender_id === currentUser?.id;
        const ora = new Date(m.creat_la).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'});
        return `<div class="chat-msg ${isMine ? 'out' : 'in'}">
          ${m.mesaj}
          <div class="chat-msg-meta">${isMine ? 'Tu' : m.sender_nume} · ${ora}</div>
        </div>`;
      }).join('');
  // Scroll la ultimul mesaj
  container.scrollTop = container.scrollHeight;
}

async function trimiteMsg() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text || !chatOfertaId) return;
  input.value = '';
  await fetch('/api/chat/' + chatOfertaId, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ mesaj: text })
  });
  loadMesaje();
}

// Opreste polling cand se inchide chat-ul
document.getElementById('modal-chat').addEventListener('click', function(e) {
  if (e.target === this) { clearInterval(chatInterval); chatOfertaId = null; }
});
document.querySelector('#modal-chat .modal-close').addEventListener('click', function() {
  clearInterval(chatInterval); chatOfertaId = null;
});
// ===== SFARSIT FUNCTII CHAT =====

// ===== FUNCTII CONTRAOFERTA =====
function deschideContraoferta(ofertaId, pretOriginal, numeFirma) {
  document.getElementById('co-oferta-id').value   = ofertaId;
  document.getElementById('co-sender-tip').value  = 'client';
  document.getElementById('co-modal-title').textContent = 'Trimite contraofertă';
  document.getElementById('co-mesaj-label').textContent = 'Mesaj pentru firmă (opțional)';
  document.getElementById('co-mesaj').placeholder       = 'Explică de ce propui acest preț...';
  document.getElementById('co-oferta-info').textContent = 'Oferta ' + numeFirma + ': ' + pretOriginal + ' lei. Propune un pret alternativ:';
  document.getElementById('co-pret').value  = '';
  document.getElementById('co-mesaj').value = '';
  showAlert('contraoferta-alert', '', '');
  closeModal('modal-oferte-client');
  openModal('modal-contraoferta');
}

// ===== BUG FIX: trimiteContraoferta foloseste ruta corecta pt client SAU firma =====
async function trimiteContraoferta() {
  const ofertaId  = document.getElementById('co-oferta-id').value;
  const pret      = document.getElementById('co-pret').value;
  const mesaj     = document.getElementById('co-mesaj').value.trim();
  const senderTip = document.getElementById('co-sender-tip').value;
  showAlert('contraoferta-alert', '', '');

  if (!pret || pret <= 0) {
    showAlert('contraoferta-alert', 'Introdu un preț valid.', 'error');
    return;
  }

  // Alege ruta corecta: client -> /contraoferta, firma -> /contraoferta-firma
  const ruta = senderTip === 'firma'
    ? '/api/oferte/' + ofertaId + '/contraoferta-firma'
    : '/api/oferte/' + ofertaId + '/contraoferta';

  const res  = await fetch(ruta, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pret_contraoferta: pret, mesaj_contraoferta: mesaj })
  });
  const data = await res.json();

  if (res.ok) {
    closeModal('modal-contraoferta');
    const toast = senderTip === 'firma'
      ? 'Contraofertă trimisă clientului! ↩'
      : 'Contraofertă trimisă! Aștepți răspunsul firmei. ↩';
    showToast(toast);
    if (senderTip === 'firma') loadOferteMele();
    else loadLucrariClient();
  } else {
    showAlert('contraoferta-alert', data.error, 'error');
  }
}
// ===== SFARSIT BUG FIX trimiteContraoferta =====
// ===== SFARSIT FUNCTII CONTRAOFERTA =====

// ===== Helper: deschideModalOferta fara escaping =====
// Stocheaza titlurile lucrarilor pentru a le accesa fara escaping
var _lucrariTitluri = {};
function deschideModalOfertaById(lucrareId) {
  var titlu = _lucrariTitluri[lucrareId] || 'Lucrare';
  deschideModalOferta(lucrareId, titlu);
}

// ===== FUNCTII ACCEPTARE / REFUZ OFERTE CLIENT =====

// Client accepta oferta originala
async function acceptaOferta(ofertaId) {
  const res  = await fetch('/api/oferte/' + ofertaId + '/accepta', { method: 'PATCH' });
  const data = await res.json();
  if (res.ok) {
    closeModal('modal-oferte-client');
    showToast('Ofertă acceptată! Lucrarea e acum în lucru. ✅');
    loadLucrariClient();
  } else { alert(data.error); }
}

// Client accepta contraoferta trimisa de firma (cu noul pret)
async function acceptaOfertaFirma(ofertaId, pretNou) {
  if (!confirm('Accepti pretul de ' + pretNou + ' lei propus de firma?')) return;
  const res  = await fetch('/api/oferte/' + ofertaId + '/accepta-contraoferta-firma', { method: 'PATCH' });
  const data = await res.json();
  if (res.ok) {
    closeModal('modal-oferte-client');
    showToast('Ofertă acceptată la ' + pretNou + ' lei! Lucrarea e în lucru. ✅');
    loadLucrariClient();
  } else { alert(data.error); }
}

// Client refuza oferta
async function refuzaOferta(ofertaId) {
  if (!confirm('Sigur vrei să refuzi această ofertă?')) return;
  const res  = await fetch('/api/oferte/' + ofertaId + '/refuza', { method: 'PATCH' });
  const data = await res.json();
  if (res.ok) {
    showToast('Ofertă refuzată.');
    var titlu = document.getElementById('modal-oferte-title').textContent.replace('Oferte pentru: ', '');
    veziOferte(currentLucrareId, titlu);
  } else { alert(data.error); }
}
// ===== SFARSIT FUNCTII ACCEPTARE =====

async function stergelucrare(id) {
  if (!confirm('Sigur vrei să ștergi această lucrare?')) return;
  const res = await fetch('/api/lucrari/' + id, { method:'DELETE' });
  if (res.ok) { showToast('Lucrare ștearsă.'); loadLucrariClient(); }
}

// ============================================================
//  SISTEM REVIEW
// ============================================================

// Marcare lucrare finalizata de catre client
async function finalizeazaLucrare(lucrareId) {
  if (!confirm('Confirmați că lucrarea a fost finalizată? Aceasta acțiune nu poate fi anulată.')) return;
  const res  = await fetch('/api/lucrari/' + lucrareId + '/finalizeaza', { method: 'PATCH' });
  const data = await res.json();
  if (res.ok) {
    showToast('Lucrare marcată ca finalizată! Poți lăsa acum un review. ✅');
    loadLucrariClient();
  } else { alert(data.error); }
}

// Helper pentru firma - evita escaping in template literals
function deschideReviewFirma(lucrareId) {
  deschideReview(lucrareId, 'firma');
}

// Deschide modal review
function deschideReview(lucrareId, tip) {
  document.getElementById('rev-lucrare-id').value = lucrareId;
  document.getElementById('rev-tip').value = tip;

  // Reset toate stelele
  resetReviewModal();

  if (tip === 'client') {
    document.getElementById('review-modal-title').textContent = '⭐ Review pentru firmă';
    fetch('/api/lucrari/' + lucrareId + '/review-status-cealalta-parte')
      .then(function(r){ return r.json(); })
      .then(function(d){
        document.getElementById('rev-context').textContent = d.a_scris
          ? 'Firma a scris deja un review! Dacă trimiți şi tu acum, ambele devin publice imediat. ✅'
          : 'Evaluă firma. Dacă şi firma scrie, ambele devin publice imediat — altfel după 10 zile.';
      }).catch(function(){ document.getElementById('rev-context').textContent = 'Evaluă firma.'; });
    document.getElementById('rev-categorii-client').style.display = 'block';
    document.getElementById('rev-categorii-firma').style.display  = 'none';
    document.getElementById('rev-comentariu-label').textContent   = 'Comentariu despre firmă (opțional)';
  } else {
    document.getElementById('review-modal-title').textContent = '⭐ Review pentru client';
    fetch('/api/lucrari/' + lucrareId + '/review-status-cealalta-parte')
      .then(function(r){ return r.json(); })
      .then(function(d){
        document.getElementById('rev-context').textContent = d.a_scris
          ? 'Clientul a scris deja un review! Dacă trimiți şi tu acum, ambele devin publice imediat. ✅'
          : 'Evaluă clientul. Dacă şi clientul scrie, ambele devin publice imediat — altfel după 10 zile.';
      }).catch(function(){ document.getElementById('rev-context').textContent = 'Evaluă clientul.'; });
    document.getElementById('rev-categorii-client').style.display = 'none';
    document.getElementById('rev-categorii-firma').style.display  = 'block';
    document.getElementById('rev-comentariu-label').textContent   = 'Comentariu despre client (opțional)';
  }
  openModal('modal-review');
}

function resetReviewModal() {
  document.getElementById('rev-rating-general').value = '0';
  document.getElementById('rev-comentariu').value = '';
  showAlert('review-alert', '', '');
  // Reset stele generale
  document.querySelectorAll('#rev-stars-general .star-btn').forEach(b => b.classList.remove('activ'));
  // Reset toate categoriile
  ['punctualitate','calitate','comunicare-firma','raport',
   'seriozitate','promptitudine','comunicare-client','corectitudine'].forEach(function(cat) {
    var el = document.getElementById('rev-' + cat);
    if (el) el.value = '0';
    var stars = document.getElementById('stars-' + cat);
    if (stars) stars.querySelectorAll('.categ-star').forEach(function(b) { b.classList.remove('activ'); });
  });
}

// Seteaza rating general cu highlight stele
function setStarGeneral(val) {
  document.getElementById('rev-rating-general').value = val;
  document.querySelectorAll('#rev-stars-general .star-btn').forEach(function(b, i) {
    b.classList.toggle('activ', i < val);
  });
}

// Seteaza rating categorie
function setCategStar(cat, val) {
  document.getElementById('rev-' + cat).value = val;
  var container = document.getElementById('stars-' + cat);
  if (container) {
    container.querySelectorAll('.categ-star').forEach(function(b, i) {
      b.classList.toggle('activ', i < val);
    });
  }
}

// Trimite review
async function trimiteReview() {
  var lucrareId   = document.getElementById('rev-lucrare-id').value;
  var tip         = document.getElementById('rev-tip').value;
  var general     = parseInt(document.getElementById('rev-rating-general').value);
  var comentariu  = document.getElementById('rev-comentariu').value.trim();
  showAlert('review-alert', '', '');

  if (!general || general < 1) {
    showAlert('review-alert', 'Te rugăm să acorzi cel puțin un rating general.', 'error');
    return;
  }

  var body = {
    tip_reviewer:        tip,
    rating_general:      general,
    comentariu:          comentariu,
    punctualitate:       parseInt(document.getElementById('rev-punctualitate')?.value)  || null,
    calitate_lucrare:    parseInt(document.getElementById('rev-calitate')?.value)        || null,
    comunicare:          parseInt(document.getElementById('rev-comunicare-firma')?.value) || null,
    raport_calitate_pret: parseInt(document.getElementById('rev-raport')?.value)         || null,
    seriozitate:         parseInt(document.getElementById('rev-seriozitate')?.value)     || null,
    promptitudine:       parseInt(document.getElementById('rev-promptitudine')?.value)   || null,
    comunicare_client:   parseInt(document.getElementById('rev-comunicare-client')?.value) || null,
    corectitudine_pret:  parseInt(document.getElementById('rev-corectitudine')?.value)   || null,
  };

  var res  = await fetch('/api/lucrari/' + lucrareId + '/review', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var data = await res.json();

  if (res.ok) {
    closeModal('modal-review');
    var toastMsg = data.ambiiiAuScris
      ? 'Review trimis! Ambele review-uri sunt acum publice. ⭐'
      : 'Review trimis! Va deveni public în 10 zile sau imediat ce şi cealaltă parte scrie. ⭐';
    showToast(toastMsg);
    if (tip === 'client') loadLucrariClient();
    else loadOferteMele();
  } else {
    showAlert('review-alert', data.error, 'error');
  }
}

// ============================================================
//  AFISARE REVIEWS PE PROFILUL FIRMEI
// ============================================================
async function incarcaReviewsFirma(firmaId, container) {
  try {
    var reviews = await (await fetch('/api/reviews/firma/' + firmaId)).json();
    if (!reviews.length) {
      container.innerHTML = '<div style="font-size:13px;color:var(--gray);text-align:center;padding:16px;">Niciun review public încă.</div>';
      return;
    }
    container.innerHTML = reviews.map(function(r) {
      var stele = '';
      for (var i = 1; i <= 5; i++) stele += i <= r.rating_general ? '★' : '☆';
      var categorii = [];
      if (r.punctualitate)        categorii.push('Punctualitate <span>' + '★'.repeat(r.punctualitate) + '</span>');
      if (r.calitate_lucrare)     categorii.push('Calitate <span>' + '★'.repeat(r.calitate_lucrare) + '</span>');
      if (r.comunicare)           categorii.push('Comunicare <span>' + '★'.repeat(r.comunicare) + '</span>');
      if (r.raport_calitate_pret) categorii.push('Preț/calitate <span>' + '★'.repeat(r.raport_calitate_pret) + '</span>');

      var data = new Date(r.creat_la).toLocaleDateString('ro-RO', {month:'long', year:'numeric'});
      return '<div class="review-card">'
        + '<div class="review-card-header">'
        + '<div><div class="review-autor">' + (r.reviewer_nume || 'Client verificat') + '</div>'
        + '<div class="review-data">' + data + '</div></div>'
        + '<div class="review-stars-display">' + stele + '</div>'
        + '</div>'
        + (r.comentariu ? '<div class="review-comentariu">"' + r.comentariu + '"</div>' : '')
        + (categorii.length ? '<div class="review-categorii">'
          + categorii.map(function(c) { return '<span class="review-categ-item">' + c + '</span>'; }).join('')
          + '</div>' : '')
        + '</div>';
    }).join('');
  } catch(e) {
    container.innerHTML = '<div style="font-size:13px;color:var(--gray);">Eroare la încărcarea review-urilor.</div>';
  }
}
// ============================================================
//  SFARSIT SISTEM REVIEW
// ============================================================


// ============================================================
//  REVIEW-URILE MELE (client - primite de la firme)
// ============================================================
async function loadReviewurileMele() {
  var el = document.getElementById('client-reviews-list');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><p>Se încarcă...</p></div>';
  try {
    var reviews = await (await fetch('/api/reviews/client-meu')).json();
    if (!reviews.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><p>Nu ai primit review-uri de la firme încă.</p></div>';
      return;
    }
    el.innerHTML = reviews.map(function(r) {
      var stele = '';
      for (var i = 1; i <= 5; i++) stele += i <= r.rating_general ? '★' : '☆';
      var cats = [];
      if (r.seriozitate)        cats.push('Seriozitate: ' + '★'.repeat(r.seriozitate));
      if (r.promptitudine)      cats.push('Promptitudine: ' + '★'.repeat(r.promptitudine));
      if (r.comunicare_client)  cats.push('Comunicare: ' + '★'.repeat(r.comunicare_client));
      if (r.corectitudine_pret) cats.push('Corectitudine preț: ' + '★'.repeat(r.corectitudine_pret));
      var data = new Date(r.creat_la).toLocaleDateString('ro-RO', {month:'long', year:'numeric'});
      return '<div class="review-card">'
        + '<div class="review-card-header">'
        + '<div><div class="review-autor">🏢 ' + (r.reviewer_nume || 'Firmă verificată') + '</div>'
        + '<div class="review-data">' + (r.lucrare_titlu||'') + ' · ' + data + '</div></div>'
        + '<div class="review-stars-display" style="color:#F59E0B;">' + stele + '</div>'
        + '</div>'
        + (r.comentariu ? '<div class="review-comentariu">"' + r.comentariu + '"</div>' : '')
        + (cats.length ? '<div class="review-categorii">' + cats.map(function(c){ return '<span class="review-categ-item">' + c + '</span>'; }).join('') + '</div>' : '')
        + '</div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Eroare la încărcarea review-urilor.</p></div>';
  }
}


// Incarca si afiseaza ratingul unui client (din reviews primite de la firme)
var _ratingClientiCache = {};
async function incarcaRatingClient(clientId) {
  if (_ratingClientiCache[clientId] !== undefined) {
    afiseazaRatingClient(clientId, _ratingClientiCache[clientId]);
    return;
  }
  try {
    var data = await (await fetch('/api/reviews/rating-client/' + clientId)).json();
    _ratingClientiCache[clientId] = data;
    afiseazaRatingClient(clientId, data);
  } catch(e) {
    var el = document.getElementById('rating-client-' + clientId);
    if (el) el.innerHTML = '<div style="font-size:11px;color:var(--gray);">Rating client</div><div style="font-size:11px;color:var(--gray);">Nou pe platformă</div>';
  }
}

function afiseazaRatingClient(clientId, data) {
  var el = document.getElementById('rating-client-' + clientId);
  if (!el) return;
  if (!data || !data.nr_reviews) {
    el.innerHTML = '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="font-size:12px;color:var(--gray);">Nou pe platformă</div>';
  } else {
    var stele = '';
    var rating = parseFloat(data.rating_mediu) || 0;
    for (var i = 1; i <= 5; i++) stele += i <= Math.round(rating) ? '★' : '☆';
    el.innerHTML = '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="color:#F59E0B;font-size:14px;">' + stele + '</div>'
      + '<div style="font-size:11px;color:var(--gray);">' + rating.toFixed(1) + ' (' + data.nr_reviews + ' lucrări)</div>';
  }
}

async function loadFirme() {
  const cat  = document.getElementById('filter-cat').value;
  const oras = document.getElementById('filter-oras').value;
  const params = new URLSearchParams();
  if (cat)  params.set('categorie', cat);
  if (oras) params.set('oras', oras);

  const firme = await (await fetch('/api/firme?' + params)).json();
  const el    = document.getElementById('firme-list');

  if (!firme.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>Nicio firmă găsită pentru filtrele selectate.</p></div>`;
    return;
  }
  el.innerHTML = firme.map(f => `
    <div class="card-sm">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="font-size:15px;font-weight:600;">${f.nume_firma}</div>
          <div style="font-size:12px;color:var(--gray);margin-top:3px;">
            📍 ${f.oras} · Acoperire: ${f.raza_km} km
          </div>
          <div style="margin-top:6px;">
            <span class="badge badge-blue">${f.categorie}</span>
            ${f.rating_mediu
              ? `<button onclick="veziReviewsFirma(${f.id}, '${f.nume_firma.replace(/'/g, '')}')"
                  style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--amber);
                  margin-left:8px;padding:2px 8px;border-radius:20px;
                  background:var(--amber-light);font-family:var(--font);font-weight:500;"
                  title="Vezi toate review-urile">
                  ★ ${f.rating_mediu} (${f.nr_recenzii} recenzii) ›
                </button>`
              : '<span style="font-size:12px;color:var(--gray);margin-left:8px;">Fără recenzii încă</span>'}
          </div>
          ${f.descriere ? `<div style="font-size:13px;color:var(--gray);margin-top:8px;">${f.descriere}</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}


// ============================================================
//  MODAL REVIEWS FIRMA (deschis din pagina clientului)
// ============================================================
async function veziReviewsFirma(firmaId, numeFirma) {
  // Seteaza titlul modalului
  var modal = document.getElementById('modal-reviews-firma');
  var titleEl = document.getElementById('reviews-firma-title');
  var listEl  = document.getElementById('reviews-firma-list');

  if (!modal || !listEl) return;

  titleEl.textContent = 'Review-uri — ' + numeFirma;
  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);">Se încarcă...</div>';
  openModal('modal-reviews-firma');

  try {
    var reviews = await (await fetch('/api/reviews/firma/' + firmaId)).json();

    if (!reviews.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><p>Niciun review public încă.</p></div>';
      return;
    }

    listEl.innerHTML = reviews.map(function(r) {
      var stele = '';
      for (var i = 1; i <= 5; i++) stele += i <= r.rating_general ? '★' : '☆';

      var cats = [];
      if (r.punctualitate)        cats.push({label:'Punctualitate',    val:r.punctualitate});
      if (r.calitate_lucrare)     cats.push({label:'Calitate lucrare', val:r.calitate_lucrare});
      if (r.comunicare)           cats.push({label:'Comunicare',       val:r.comunicare});
      if (r.raport_calitate_pret) cats.push({label:'Preț/calitate', val:r.raport_calitate_pret});

      var data = new Date(r.creat_la).toLocaleDateString('ro-RO', {day:'2-digit', month:'long', year:'numeric'});

      return '<div class="review-card">'
        + '<div class="review-card-header">'
        + '<div>'
        + '<div class="review-autor">👤 ' + (r.reviewer_nume || 'Client verificat') + '</div>'
        + '<div class="review-data">' + data + '</div>'
        + '</div>'
        + '<div style="font-size:20px;color:#F59E0B;letter-spacing:2px;">' + stele + '</div>'
        + '</div>'
        + (r.comentariu
          ? '<div class="review-comentariu" style="margin-top:10px;font-size:14px;line-height:1.7;">„' + r.comentariu + '”</div>'
          : '')
        + (cats.length
          ? '<div class="review-categorii" style="margin-top:10px;">'
            + cats.map(function(c) {
                var st = '';
                for (var i = 1; i <= 5; i++) st += i <= c.val ? '★' : '☆';
                return '<span class="review-categ-item" style="display:inline-flex;align-items:center;gap:4px;">'
                  + c.label + ' <span style="color:#F59E0B;">' + st + '</span></span>';
              }).join('')
            + '</div>'
          : '')
        + '</div>';
    }).join('');
  } catch(e) {
    listEl.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Eroare la încărcarea review-urilor.</p></div>';
  }
}

// ============================================================
//  POSTARE LUCRARE
// ============================================================
async function posteazaLucrare() {
  const titlu     = document.getElementById('l-titlu').value.trim();
  const descriere = document.getElementById('l-descriere').value.trim();
  const categorie = document.getElementById('l-categorie').value;
  const oras      = document.getElementById('l-oras').value.trim();
  const adresa    = document.getElementById('l-adresa').value.trim();
  const urgenta   = document.getElementById('l-urgenta').checked;
  showAlert('lucrare-alert', '', '');

  const res  = await fetch('/api/lucrari', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ titlu, descriere, categorie, oras, adresa, urgenta })
  });
  const data = await res.json();

  if (!res.ok) { showAlert('lucrare-alert', data.error, 'error'); return; }

  closeModal('modal-lucrare');
  showToast('Lucrare postată cu succes! 🎉');
  // Reset form
  ['l-titlu','l-descriere','l-oras','l-adresa'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('l-urgenta').checked = false;
  loadLucrariClient();
}

// ============================================================
//  FIRMA DASHBOARD
// ============================================================
async function loadFirmaDashboard() {
  const me = await (await fetch('/api/me')).json();
  if (!me.loggedIn) return;
  currentUser = me.user;

  const profil = await (await fetch('/api/profil-firma')).json();
  document.getElementById('firma-salut').textContent = profil.nume_firma || me.user.nume_complet;
  document.getElementById('firma-sub').textContent   = `${profil.categorie} · ${profil.oras} · Rază: ${profil.raza_km} km`;

  const oferte  = await (await fetch('/api/ofertele-mele')).json();
  const lucrari = await (await fetch('/api/lucrari')).json();

  document.getElementById('firma-stats').innerHTML = `
    <div class="stat-box"><div class="stat-val">${lucrari.length}</div><div class="stat-lbl">Lucrări disponibile</div></div>
    <div class="stat-box"><div class="stat-val">${oferte.length}</div><div class="stat-lbl">Ofertele mele</div></div>
    <div class="stat-box"><div class="stat-val">${profil.rating_mediu || '—'}</div><div class="stat-lbl">Rating mediu ★</div></div>
  `;
  loadLucrariPentruFirma();
}

function firmaTab(tab, btn) {
  document.querySelectorAll('#page-firma .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('firma-tab-lucrari').style.display = tab === 'lucrari' ? 'block' : 'none';
  document.getElementById('firma-tab-oferte').style.display  = tab === 'oferte'  ? 'block' : 'none';
  if (tab === 'oferte') loadOferteMele();
}

async function loadLucrariPentruFirma() {
  const cat  = document.getElementById('firma-filter-cat').value;
  const oras = document.getElementById('firma-filter-oras').value;
  const params = new URLSearchParams();
  if (cat)  params.set('categorie', cat);
  if (oras) params.set('oras', oras);

  const lucrari = await (await fetch('/api/lucrari?' + params)).json();
  const el      = document.getElementById('firma-lucrari-list');

  if (!lucrari.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><p>Nicio lucrare disponibilă momentan.</p></div>`;
    return;
  }
  // Stocheaza titlurile pentru helper
  lucrari.forEach(function(l) { _lucrariTitluri[l.id] = l.titlu; });

  el.innerHTML = lucrari.map(function(l) {
    // Data postarii
    var dataPostare = l.creat_la
      ? new Date(l.creat_la).toLocaleDateString('ro-RO', {day:'2-digit', month:'short', year:'numeric'})
      : '';

    // Badge oferte primite
    var nrOferte = l.nr_oferte || 0;
    var badgeOferte = nrOferte > 0
      ? '<span style="background:#FEF3C7;color:#92400E;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;">' + nrOferte + ' ofert' + (nrOferte === 1 ? 'ă' : 'e') + ' trimise</span>'
      : '<span style="background:#DCFCE7;color:#166534;font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;">Primul care ofertează</span>';

    // Identificator client (username din email, nu emailul complet)
    var clientId = l.client_username
      ? '<span style="font-family:monospace;background:var(--gray-light);padding:1px 6px;border-radius:4px;font-size:11px;">@' + l.client_username + '</span>'
      : l.client_nume;

    return '<div class="card-sm">'
      + '<div class="lucrare-header"><div style="flex:1;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">'
      + '<div class="lucrare-title" style="margin:0;">' + l.titlu + '</div>'
      + badgeOferte
      + '</div>'
      + '<div class="lucrare-meta">'
      + '<span>&#128205; ' + l.oras + '</span>'
      + (l.adresa ? '<span style="color:var(--gray);">· ' + l.adresa + '</span>' : '')
      + '<span class="badge badge-blue">' + l.categorie + '</span>'
      + statusBadge(l.status)
      + (l.urgenta ? '<span class="urgenta-tag">&#9889; URGENT</span>' : '')
      + '</div>'
      + (l.descriere ? '<div style="font-size:13px;color:var(--gray);margin-top:6px;">' + l.descriere + '</div>' : '')
      + '<div style="background:var(--gray-light);border-radius:8px;padding:10px 12px;margin-top:10px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      + '<div style="font-size:12px;font-weight:600;color:var(--dark);margin-bottom:4px;">&#128100; Client</div>'
      + '<div style="font-size:13px;color:var(--dark);">' + l.client_nume + '</div>'
      + '<div style="font-size:12px;color:var(--blue);margin-top:2px;">&#9993; ' + (l.client_email||'') + '</div>'
      + (dataPostare ? '<div style="font-size:11px;color:var(--gray);margin-top:2px;">&#128336; Postat: ' + dataPostare + '</div>' : '')
      + '</div>'
      + '<div id="rating-client-' + l.client_id + '" style="text-align:right;">'
      + '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="font-size:11px;color:var(--gray);">Se încarcă...</div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div></div>'
      + '<div class="lucrare-actions">'
      + '<button class="btn btn-primary btn-sm" onclick="deschideModalOfertaById(' + l.id + ')">Trimite ofert&#259;</button>'
      + '</div>'
      + '</div>';
  }).join('');

  // Incarca ratingul fiecarui client (async, dupa randare)
  lucrari.forEach(function(l) {
    incarcaRatingClient(l.client_id);
  });
}

// ===== loadOferteMele — rescris fara escaping =====
async function loadOferteMele() {
  const oferte = await (await fetch('/api/ofertele-mele')).json();
  const el = document.getElementById('firma-oferte-list');
  if (!oferte.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📤</div><p>Nu ai trimis nicio ofertă încă.</p></div>';
    return;
  }
  el.innerHTML = '';
  oferte.forEach(function(o) {
    var card = document.createElement('div');
    card.className = 'card-sm';

    // Header
    var areContraoferta = o.status === 'negociere' && o.pret_contraoferta;
    var pretHTML = areContraoferta
      ? '<div class="oferta-pret" style="text-decoration:line-through;opacity:.5;font-size:14px;">' + o.pret + ' lei</div>'
        + '<div class="oferta-pret" style="color:var(--amber);">↩ ' + o.pret_contraoferta + ' lei</div>'
      : '<div class="oferta-pret">' + o.pret + ' lei</div>';

    card.innerHTML = '<div class="oferta-header"><div>'
      + '<div class="oferta-firma">' + (o.lucrare_titlu||'') + '</div>'
      + '<div style="font-size:12px;color:var(--gray);">📍 ' + (o.lucrare_oras||'') + ' · ' + (o.lucrare_categorie||'') + '</div>'
      + '</div><div>' + pretHTML + '</div></div>'
      + (o.descriere_oferta ? '<div class="oferta-desc">' + o.descriere_oferta + '</div>' : '');

    // Sectiunea actiuni
    var actiuniDiv = document.createElement('div');
    actiuniDiv.style.marginTop = '10px';

    if (areContraoferta) {
      // Box contraoferta
      var contraBox = document.createElement('div');
      contraBox.className = 'contraoferta-box';
      contraBox.innerHTML = 'Clientul propune: <strong>' + o.pret_contraoferta + ' lei</strong>'
        + (o.mesaj_contraoferta ? ' — "' + o.mesaj_contraoferta + '"' : '');
      actiuniDiv.appendChild(contraBox);

      // Butoane principale
      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;';

      var btnAccepta = document.createElement('button');
      btnAccepta.className = 'btn btn-green btn-sm';
      btnAccepta.textContent = '✓ Acceptă ' + o.pret_contraoferta + ' lei';
      btnAccepta.onclick = (function(id){ return function(){ acceptaContraoferta(id); }; })(o.id);

      var btnNegoc = document.createElement('button');
      btnNegoc.className = 'btn btn-sm';
      btnNegoc.style.cssText = 'background:#D97706;color:#fff;border-color:#D97706;';
      btnNegoc.textContent = '↕ Negociază';
      var panelId = 'negoc-' + o.id;
      btnNegoc.onclick = (function(pid){ return function(){ toggleNegocPanel(pid); }; })(panelId);

      var btnChat = document.createElement('button');
      btnChat.className = 'btn btn-primary btn-sm';
      btnChat.textContent = '💬 Chat';
      btnChat.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);

      btnRow.appendChild(btnAccepta);
      btnRow.appendChild(btnNegoc);
      btnRow.appendChild(btnChat);
      actiuniDiv.appendChild(btnRow);

      // Mini-panel negociere
      var panel = document.createElement('div');
      panel.className = 'negoc-panel';
      panel.id = panelId;
      panel.style.display = 'none';
      panel.innerHTML = '<div class="negoc-panel-title">Ce vrei să faci?</div>';

      var opt1 = document.createElement('div');
      opt1.className = 'negoc-opt';
      opt1.innerHTML = '<div class="negoc-opt-icon">↩</div><div>'
        + '<div class="negoc-opt-label">Trimite contraofertă nouă</div>'
        + '<div class="negoc-opt-sub">Propune un preț între ' + o.pret_contraoferta + ' și ' + o.pret + ' lei</div>'
        + '</div>';
      opt1.onclick = (function(id, pc, po){ return function(){ deschideContraofertaFirma(id, pc, po); }; })(o.id, o.pret_contraoferta, o.pret);

      var opt2 = document.createElement('div');
      opt2.className = 'negoc-opt danger';
      opt2.innerHTML = '<div class="negoc-opt-icon">✕</div><div>'
        + '<div class="negoc-opt-label">Refuză contraoferta</div>'
        + '<div class="negoc-opt-sub">Menții prețul original de ' + o.pret + ' lei.</div>'
        + '</div>';
      opt2.onclick = (function(id){ return function(){ refuzaContraofertaFirma(id); }; })(o.id);

      panel.appendChild(opt1);
      panel.appendChild(opt2);
      actiuniDiv.appendChild(panel);

    } else {
      // Status normal
      var statusRow = document.createElement('div');
      statusRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;';
      statusRow.innerHTML = statusBadge(o.status);

      var btnChat2 = document.createElement('button');
      btnChat2.className = 'btn btn-primary btn-sm';
      btnChat2.textContent = '💬 Chat';
      btnChat2.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);
      statusRow.appendChild(btnChat2);

      if (o.status === 'acceptata') {
        if (o.review_scris_firma) {
          var badge = document.createElement('span');
          badge.className = 'badge-negociere';
          badge.textContent = '⭐ Review trimis';
          statusRow.appendChild(badge);
        } else {
          var btnRev = document.createElement('button');
          btnRev.className = 'btn-review';
          btnRev.textContent = '⭐ Review client';
          btnRev.onclick = (function(lid){ return function(){ deschideReviewFirma(lid); }; })(o.lucrare_id);
          statusRow.appendChild(btnRev);
        }
      }
      actiuniDiv.appendChild(statusRow);
    }

    card.appendChild(actiuniDiv);
    el.appendChild(card);
  });
}
// ===== SFARSIT MODIFICARE =====

async function acceptaContraoferta(ofertaId) {
  const res  = await fetch('/api/oferte/' + ofertaId + '/accepta-contraoferta', { method:'PATCH' });
  const data = await res.json();
  if (res.ok) {
    showToast('Contraofertă acceptată! Lucrarea e în lucru. ✅');
    loadOferteMele();
  } else { alert(data.error); }
}

// ===== FUNCTII NEGOCIERE FIRMA =====

// Toggle vizibilitate mini-panel negociere
function toggleNegocPanel(panelId) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Firma trimite contraoferta noua catre client
// ===== BUG FIX: deschideContraofertaFirma seteaza tip=firma =====
function deschideContraofertaFirma(ofertaId, pretClientului, pretOriginal) {
  var panel = document.getElementById('negoc-' + ofertaId);
  if (panel) panel.style.display = 'none';

  document.getElementById('co-oferta-id').value   = ofertaId;
  document.getElementById('co-sender-tip').value  = 'firma';
  document.getElementById('co-modal-title').textContent = 'Trimite contraofertă clientului';
  document.getElementById('co-mesaj-label').textContent = 'Mesaj pentru client (opțional)';
  document.getElementById('co-oferta-info').innerHTML   =
    'Clientul a propus <strong>' + pretClientului + ' lei</strong>. ' +
    'Propune un preț alternativ (prețul tău original: <strong>' + pretOriginal + ' lei</strong>):';
  document.getElementById('co-pret').value  = '';
  document.getElementById('co-mesaj').value = '';
  document.getElementById('co-mesaj').placeholder = 'Explică de ce nu poți executa la prețul propus...';
  showAlert('contraoferta-alert', '', '');
  openModal('modal-contraoferta');
}
// ===== SFARSIT BUG FIX =====

// Firma refuza contraoferta clientului
async function refuzaContraofertaFirma(ofertaId) {
  var panel = document.getElementById('negoc-' + ofertaId);
  if (panel) panel.style.display = 'none';

  if (!confirm('Ești sigur că vrei să refuzi contraoferta? Clientul va fi notificat că menții prețul original.')) return;

  const res  = await fetch('/api/oferte/' + ofertaId + '/refuza-contraoferta', { method: 'PATCH' });
  const data = await res.json();
  if (res.ok) {
    showToast('Contraofertă refuzată. Clientul a fost notificat. ↩');
    loadOferteMele();
  } else {
    alert(data.error);
  }
}
// ===== SFARSIT FUNCTII NEGOCIERE FIRMA =====

function deschideModalOferta(lucrareId, titlu) {
  document.getElementById('o-lucrare-id').value = lucrareId;
  document.getElementById('oferta-lucrare-info').textContent = '📋 Lucrare: ' + titlu;
  showAlert('oferta-alert', '', '');
  ['o-pret','o-descriere','o-disponibilitate'].forEach(id => document.getElementById(id).value = '');

  // ===== MODIFICARE 3: reset selector disponibilitate la deschidere modal =====
  document.getElementById('disp-trigger-text').textContent = 'Selectează zile și interval orar →';
  document.getElementById('disp-trigger-text').style.color = 'var(--gray)';
  document.getElementById('disp-trigger-btn').classList.remove('has-value');
  document.querySelectorAll('.disp-day').forEach(d => d.classList.remove('selected'));
  updateDispPreview();
  // ===== SFÂRȘIT MODIFICARE 3 reset =====

  openModal('modal-oferta');
}

async function trimiteOferta() {
  const lucrare_id      = document.getElementById('o-lucrare-id').value;
  const pret            = document.getElementById('o-pret').value;
  const descriere       = document.getElementById('o-descriere').value.trim();
  // ===== MODIFICARE 3: citim din hidden field, nu din input text =====
  const disponibilitate = document.getElementById('o-disponibilitate').value.trim();
  // ===== SFÂRȘIT MODIFICARE 3 citire =====
  showAlert('oferta-alert', '', '');

  const res  = await fetch('/api/oferte', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ lucrare_id, pret, descriere_oferta:descriere, disponibilitate })
  });
  const data = await res.json();

  if (!res.ok) { showAlert('oferta-alert', data.error, 'error'); return; }

  closeModal('modal-oferta');
  showToast('Ofertă trimisă cu succes! 📤');
  loadOferteMele();
}

// ===== MODIFICARE 3: Funcții complete pentru popup disponibilitate =====

// Generează opțiunile de ore în ambele selectoare (00:00 - 23:00)
function initDispSelectors() {
  const ore = [];
  for (let h = 0; h < 24; h++) ore.push(`${String(h).padStart(2,'0')}:00`);

  const selStart  = document.getElementById('disp-ora-start');
  const selSfarsit = document.getElementById('disp-ora-sfarsit');

  selStart.innerHTML  = ore.map(o => `<option value="${o}">${o}</option>`).join('');
  selSfarsit.innerHTML = ore.map(o => `<option value="${o}">${o}</option>`).join('');

  // Default: 08:00 → 17:00
  selStart.value   = '08:00';
  selSfarsit.value = '17:00';
}

function deschideDispPopup() {
  // Inițializează selectoarele la prima deschidere
  if (!document.getElementById('disp-ora-start').options.length) initDispSelectors();
  document.getElementById('disp-popup-overlay').classList.add('open');
  updateDispPreview();
}

function inchideDispPopup() {
  document.getElementById('disp-popup-overlay').classList.remove('open');
}

function toggleZi(el) {
  el.classList.toggle('selected');
  updateDispPreview();
}

function updateDispPreview() {
  const zileSelectate = [...document.querySelectorAll('.disp-day.selected')]
    .map(d => d.dataset.zi);

  const start   = document.getElementById('disp-ora-start')?.value  || '08:00';
  const sfarsit = document.getElementById('disp-ora-sfarsit')?.value || '17:00';
  const preview = document.getElementById('disp-preview-text');
  const confirmBtn = document.getElementById('disp-confirm-btn');

  if (!zileSelectate.length) {
    preview.textContent = 'Selectează cel puțin o zi pentru a vedea rezultatul';
    preview.className   = 'disp-preview empty';
    confirmBtn.disabled = true;
    return;
  }

  // Formatare inteligentă: Luni-Vineri în loc de Luni, Marți, Miercuri, Joi, Vineri
  const SAPTAMANA = ['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică'];
  const indecsi   = zileSelectate.map(z => SAPTAMANA.indexOf(z)).sort((a,b) => a-b);

  let textZile;
  if (indecsi.length === 7) {
    textZile = 'Luni–Duminică';
  } else if (indecsi.length === 5 && indecsi[0] === 0 && indecsi[4] === 4) {
    textZile = 'Luni–Vineri';
  } else if (indecsi.length === 2 && indecsi[0] === 5 && indecsi[1] === 6) {
    textZile = 'Sâmbătă–Duminică';
  } else {
    // Verifică dacă sunt consecutive
    const consecutive = indecsi.every((v,i) => i === 0 || v === indecsi[i-1] + 1);
    if (consecutive && indecsi.length > 2) {
      textZile = `${SAPTAMANA[indecsi[0]]}–${SAPTAMANA[indecsi[indecsi.length-1]]}`;
    } else {
      textZile = zileSelectate.join(', ');
    }
  }

  const rezultat = `${textZile}, ${start}–${sfarsit}`;
  preview.innerHTML = `🕐 <strong>${rezultat}</strong>`;
  preview.className = 'disp-preview';
  confirmBtn.disabled = false;
  confirmBtn.dataset.valoare = rezultat;
}

function confirmaDisponibilitate() {
  const valoare = document.getElementById('disp-confirm-btn').dataset.valoare;
  if (!valoare) return;

  // Salvăm în hidden field
  document.getElementById('o-disponibilitate').value = valoare;

  // Actualizăm butonul trigger din modal
  const trigger = document.getElementById('disp-trigger-btn');
  document.getElementById('disp-trigger-text').textContent = '🕐 ' + valoare;
  document.getElementById('disp-trigger-text').style.color = 'var(--blue)';
  trigger.classList.add('has-value');

  inchideDispPopup();
}

// Închide popup-ul la click pe overlay
document.getElementById('disp-popup-overlay').addEventListener('click', function(e) {
  if (e.target === this) inchideDispPopup();
});

// ===== SFÂRȘIT MODIFICARE 3 =====

// ============================================================
//  HELPERS
// ============================================================
function statusBadge(status) {
  const map = {
    activa:     ['badge-green',  'Activă'],
    in_lucru:   ['badge-amber',  'În lucru'],
    finalizata: ['badge-gray',   'Finalizată'],
    anulata:    ['badge-red',    'Anulată'],
    trimisa:    ['badge-blue',   'Trimisă'],
    acceptata:  ['badge-green',  'Acceptată'],
    refuzata:   ['badge-red',    'Refuzată'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.className = 'alert';
  if (!msg) return;
  el.classList.add('show', type === 'error' ? 'alert-error' : 'alert-success');
  el.textContent = msg;
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Închide modalul la click pe overlay
document.querySelectorAll('.modal-overlay').forEach
  (overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closeModal(this.id);
    });
  });

// ============================================================
//  INIT
// ============================================================

// ============================================================
//  ROUTING — History API complet si corect
// ============================================================

var PAGE_ROUTES = {
  'home':     '/',
  'client':   '/dashboard',
  'firma':    '/dashboard',
  'mesaje':   '/mesaje',
  'cont':     '/cont',
  'login':    '/login',
  'register': '/inregistrare',
};

// Afiseaza o pagina fara sa adauge in istoric (folosit intern)
function _afiseazaPagina(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  var el = document.getElementById('page-' + pageName);
  if (!el) el = document.getElementById('page-home');
  el.classList.add('active');
  window.scrollTo(0, 0);

  // Actiuni specifice paginii
  if (pageName === 'mesaje')  loadConversatii();
  if (pageName === 'cont')    incarcaDateCont();
  if (pageName === 'client')  loadClientDashboard();
  if (pageName === 'firma')   loadFirmaDashboard();
  if (pageName === 'login') {
    var em = localStorage.getItem('fixit_email_salvat');
    var tm = localStorage.getItem('fixit_tine_minte');
    var loginEl = document.getElementById('login-email');
    var tmEl    = document.getElementById('tine-minte');
    if (em && loginEl) loginEl.value = em;
    if (tm && tmEl)    tmEl.checked  = true;
  }
  if (pageName === 'home') {
    if (currentUser) {
      document.getElementById('home-guest').style.display  = 'none';
      document.getElementById('home-logged').style.display = 'block';
    } else {
      document.getElementById('home-guest').style.display  = 'block';
      document.getElementById('home-logged').style.display = 'none';
    }
  }
}

// Naviga la pagina — adauga in istoric si afiseaza
function navigaLa(pageName) {
  var url = PAGE_ROUTES[pageName] || '/';
  window.history.pushState({ page: pageName }, '', url);
  _afiseazaPagina(pageName);
}

// Back/Forward browser
window.addEventListener('popstate', async function(e) {
  var pageName = e.state && e.state.page ? e.state.page : _paginaDinUrl();

  // Verifica sesiunea pentru pagini protejate
  if (['client','firma','mesaje','cont'].includes(pageName) && !currentUser) {
    var r = await fetch('/api/me');
    var d = await r.json();
    if (d.loggedIn) { currentUser = d.user; updateNav(d.user); }
    else { navigaLa('login'); return; }
  }
  _afiseazaPagina(pageName);
});

// Determina pagina din URL
function _paginaDinUrl() {
  var path = window.location.pathname;
  if (path === '/dashboard')    return currentUser ? currentUser.tip_cont : 'login';
  if (path === '/mesaje')       return 'mesaje';
  if (path === '/cont')         return 'cont';
  if (path === '/login')        return 'login';
  if (path === '/inregistrare') return 'register';
  return 'home';
}

// La refresh/incarcare initiala
async function navigaDupaUrl(pushToHistory) {
  var res  = await fetch('/api/me');
  var data = await res.json();

  if (data.loggedIn) {
    currentUser = data.user;
    updateNav(data.user);
  }

  var pageName = _paginaDinUrl();

  // Daca e pagina protejata si nu e logat -> login
  if (['client','firma','mesaje','cont'].includes(pageName) && !data.loggedIn) {
    pageName = 'login';
  }
  // Daca e /dashboard, determina tipul contului
  if (window.location.pathname === '/dashboard' && data.loggedIn) {
    pageName = data.user.tip_cont;
  }

  // Seteaza starea initiala in istoric
  var url = PAGE_ROUTES[pageName] || '/';
  window.history.replaceState({ page: pageName }, '', url);

  _afiseazaPagina(pageName);
}


init();

// ============================================================
//  DROPDOWN NAVBAR
// ============================================================
function toggleDropdown() {
  var dd = document.getElementById('nav-dropdown');
  if (dd) dd.classList.toggle('open');
}
function closeDropdown() {
  var dd = document.getElementById('nav-dropdown');
  if (dd) dd.classList.remove('open');
}
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('nav-user-wrap');
  if (wrap && !wrap.contains(e.target)) closeDropdown();
});

// ============================================================
//  NAVIGARE RAPIDA DIN HOME PAGE
// ============================================================
function mergiLaDashboard() {
  if (!currentUser) return;
  var mod = currentUser.mod_activ || currentUser.tip_cont;
  if (mod === 'ambele') mod = 'client';
  navigaLa(mod);
}

function mergiLaDashboardTab(tab) {
  mergiLaDashboard();
  setTimeout(function() {
    if (currentUser && currentUser.tip_cont === 'firma') {
      var btns = document.querySelectorAll('#page-firma .tab-btn');
      if (tab === 'oferte' && btns[1]) firmaTab('oferte', btns[1]);
    }
  }, 300);
}

function deschideModalLucrare() {
  mergiLaDashboard();
  setTimeout(function() {
    var modal = document.getElementById('modal-lucrare');
    if (modal) openModal('modal-lucrare');
  }, 300);
}

// ============================================================
//  CONTUL MEU
// ============================================================
function mergiLaCont() {
  navigaLa('cont');
}

async function incarcaDateCont() {
  if (!currentUser) return;
  try {
    const res  = await fetch('/api/me');
    const data = await res.json();
    if (!data.loggedIn) return;
    const u = data.user;

    var parts = (u.nume_complet || '').split(' ');
    document.getElementById('cont-prenume').value = parts[0] || '';
    document.getElementById('cont-nume').value    = parts.slice(1).join(' ') || '';
    document.getElementById('cont-email').value   = u.email || '';

    document.getElementById('cont-nume-display').textContent  = u.nume_complet || '';
    document.getElementById('cont-email-display').textContent = u.email || '';
    document.getElementById('cont-tip-display').innerHTML = u.tip_cont === 'client'
      ? '<span class="badge badge-blue">Client</span>'
      : '<span class="badge badge-blue">Firmă</span>';

    var initial = (u.nume_complet || 'U').charAt(0).toUpperCase();
    ['cont-avatar-large','nav-avatar'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = initial;
    });

    var _tipCont = u.tip_cont;
    if (_tipCont === 'firma' || _tipCont === 'ambele') {
      document.getElementById('cont-sectiune-firma').style.display = 'block';
      var _activ = document.getElementById('cont-sectiune-activeaza-firma');
      var _form  = document.getElementById('cont-formular-activare-firma');
      if (_activ) _activ.style.display = 'none';
      if (_form)  _form.style.display  = 'none';
      incarcaDateFirmaCont();
    } else {
      document.getElementById('cont-sectiune-firma').style.display = 'none';
      var _activ2 = document.getElementById('cont-sectiune-activeaza-firma');
      if (_activ2) _activ2.style.display = 'block';
    }
  } catch(e) { console.error('Eroare incarcare cont:', e); }
}

async function incarcaDateFirmaCont() {
  try {
    const res  = await fetch('/api/profil-firma');
    const data = await res.json();
    if (!data || data.error) return;
    document.getElementById('cont-nume-firma').value  = data.nume_firma  || '';
    document.getElementById('cont-categorie').value   = data.categorie   || 'General';
    document.getElementById('cont-oras-firma').value  = data.oras        || '';
    document.getElementById('cont-raza').value        = data.raza_km     || 50;
    document.getElementById('cont-telefon').value     = data.telefon     || '';
    document.getElementById('cont-descriere').value   = data.descriere   || '';
    // Incarca zonele de activitate
    initZoneActivitate(data.zone_activitate || '');
  } catch(e) {}
}

async function salveazaProfil() {
  var prenume = document.getElementById('cont-prenume').value.trim();
  var numeF   = document.getElementById('cont-nume').value.trim();
  var email   = document.getElementById('cont-email').value.trim();
  showAlert('cont-alert-profil', '', '');

  if (!prenume || !numeF) { showAlert('cont-alert-profil', 'Prenumele şi numele sunt obligatorii.', 'error'); return; }
  if (!email)             { showAlert('cont-alert-profil', 'Emailul este obligatoriu.', 'error'); return; }

  const res  = await fetch('/api/cont/profil', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenume, nume: numeF, email })
  });
  const data = await res.json();
  if (res.ok) {
    currentUser.nume_complet = prenume + ' ' + numeF;
    var _ne = document.getElementById('nav-user-name');
    if (_ne) _ne.textContent = prenume;
    var _av = document.getElementById('nav-avatar');
    if (_av) _av.textContent = prenume.charAt(0).toUpperCase();
    var _tl = document.getElementById('home-logged-title');
    if (_tl) _tl.textContent = 'Salut, ' + prenume + '! 👋';
    document.getElementById('cont-nume-display').textContent  = prenume + ' ' + numeF;
    document.getElementById('cont-email-display').textContent = email;
    showAlert('cont-alert-profil', 'Date salvate cu succes! ✅', 'success');
  } else {
    showAlert('cont-alert-profil', data.error || 'Eroare la salvare.', 'error');
  }
}

async function schimbaParola() {
  var veche      = document.getElementById('cont-parola-veche').value;
  var noua       = document.getElementById('cont-parola-noua').value;
  var confirmare = document.getElementById('cont-parola-confirmare').value;
  showAlert('cont-alert-parola', '', '');

  if (!veche)               { showAlert('cont-alert-parola', 'Introdu parola actuală.', 'error'); return; }
  if (noua.length < 6)      { showAlert('cont-alert-parola', 'Parola nouă trebuie să aibă minim 6 caractere.', 'error'); return; }
  if (noua !== confirmare)  { showAlert('cont-alert-parola', 'Parolele nu coincid.', 'error'); return; }

  const res  = await fetch('/api/cont/parola', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parola_veche: veche, parola_noua: noua })
  });
  const data = await res.json();
  if (res.ok) {
    ['cont-parola-veche','cont-parola-noua','cont-parola-confirmare'].forEach(function(id) {
      document.getElementById(id).value = '';
    });
    showAlert('cont-alert-parola', 'Parola schimbată cu succes! ✅', 'success');
  } else {
    showAlert('cont-alert-parola', data.error || 'Eroare la schimbarea parolei.', 'error');
  }
}

async function salveazaFirma() {
  var numeFirma = document.getElementById('cont-nume-firma').value.trim();
  var categorie = document.getElementById('cont-categorie').value;
  var oras      = document.getElementById('cont-oras-firma').value.trim();
  var raza      = document.getElementById('cont-raza').value;
  var telefon   = document.getElementById('cont-telefon').value.trim();
  var descriere = document.getElementById('cont-descriere').value.trim();
  showAlert('cont-alert-firma', '', '');

  if (!numeFirma || !oras) { showAlert('cont-alert-firma', 'Numele firmei şi oraşul sunt obligatorii.', 'error'); return; }

  var zoneValue = document.getElementById('cont-zone-value');
  var zone = zoneValue ? zoneValue.value : '';
  const res = await fetch('/api/cont/firma', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nume_firma: numeFirma, categorie, oras, raza_km: raza, telefon, descriere, zone_activitate: zone })
  });
  const data = await res.json();
  if (res.ok) {
    showAlert('cont-alert-firma', 'Date firmă salvate! ✅', 'success');
  } else {
    showAlert('cont-alert-firma', data.error || 'Eroare la salvare.', 'error');
  }
}

async function stergeContul() {
  var parola = document.getElementById('stergere-parola').value;
  showAlert('stergere-alert', '', '');
  if (!parola) { showAlert('stergere-alert', 'Introdu parola pentru confirmare.', 'error'); return; }

  const res  = await fetch('/api/cont/sterge', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parola })
  });
  const data = await res.json();
  if (res.ok) {
    closeModal('modal-stergere-cont');
    showToast('Contul a fost şters. La revedere!');
    setTimeout(logout, 1500);
  } else {
    showAlert('stergere-alert', data.error || 'Parolă incorectă.', 'error');
  }
}
// ============================================================
//  ZONE DE ACTIVITATE — Autocomplete judete
// ============================================================
var JUDETE_RO = [
  'Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani',
  'Brașov','Brăila','București','Buzău','Caraș-Severin','Călărași','Cluj',
  'Constanța','Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj',
  'Harghita','Hunedoara','Ialomița','Iași','Ilfov','Maramureș','Mehedinți',
  'Mureș','Neamț','Olt','Prahova','Satu Mare','Sălaj','Sibiu','Suceava',
  'Teleorman','Timiș','Tulcea','Vaslui','Vâlcea','Vrancea'
];

var _zoneSelectate = [];

function initZoneActivitate(zoneString) {
  _zoneSelectate = zoneString ? zoneString.split(',').map(z => z.trim()).filter(Boolean) : [];
  randeazaZoneSelectate();
}

function randeazaZoneSelectate() {
  var container = document.getElementById('cont-zone-selectate');
  var hidden    = document.getElementById('cont-zone-value');
  if (!container) return;
  container.innerHTML = _zoneSelectate.map(function(j) {
    return '<span class="judet-tag">' + j
      + '<button type="button" onclick="stergeZona(\'' + j + '\')">&#10005;</button>'
      + '</span>';
  }).join('');
  if (hidden) hidden.value = _zoneSelectate.join(',');
}

function stergeZona(judet) {
  _zoneSelectate = _zoneSelectate.filter(function(j) { return j !== judet; });
  randeazaZoneSelectate();
}

function adaugaZona(judet) {
  if (!_zoneSelectate.includes(judet)) {
    _zoneSelectate.push(judet);
    randeazaZoneSelectate();
  }
  var input = document.getElementById('cont-zone-input');
  if (input) input.value = '';
  ascundeSugestii();
}

function filtreazaJudete(query) {
  var sugestii = document.getElementById('cont-zone-sugestii');
  if (!sugestii) return;
  if (!query || query.length < 1) { ascundeSugestii(); return; }

  var q = query.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
  var matches = JUDETE_RO.filter(function(j) {
    var jNorm = j.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
    return jNorm.startsWith(q) && !_zoneSelectate.includes(j);
  });

  if (!matches.length) { ascundeSugestii(); return; }

  sugestii.innerHTML = matches.map(function(j) {
    // Bold pe literele care se potrivesc
    var highlighted = '<strong>' + j.substring(0, query.length) + '</strong>' + j.substring(query.length);
    return '<div class="judet-sugestie" onmousedown="adaugaZona(\'' + j + '\')">' + highlighted + '</div>';
  }).join('');
  sugestii.style.display = 'block';
}

function arataSugestii() {
  var input = document.getElementById('cont-zone-input');
  if (input && input.value.length > 0) filtreazaJudete(input.value);
}

function ascundeSugestii() {
  var sugestii = document.getElementById('cont-zone-sugestii');
  if (sugestii) sugestii.style.display = 'none';
}


// ============================================================
//  SWITCH MOD CLIENT <-> FIRMA
// ============================================================

function actualizeazaSwitchDropdown(user) {
  var modActiv  = user.mod_activ || user.tip_cont;
  var tipCont   = user.tip_cont;
  var modEl     = document.getElementById('nav-mod-activ');
  var btnSwitch = document.getElementById('btn-switch-mod');
  var lblSwitch = document.getElementById('switch-mod-label');
  var sepSwitch = document.getElementById('sep-switch');

  if (modEl) modEl.textContent = modActiv === 'client' ? 'Mod activ: Client' : 'Mod activ: Firmă';

  if (tipCont === 'ambele') {
    if (btnSwitch) btnSwitch.style.display = 'flex';
    if (sepSwitch) sepSwitch.style.display = 'block';
    if (lblSwitch) lblSwitch.textContent = modActiv === 'client'
      ? 'Treci la contul de firmă'
      : 'Treci la contul de client';
  } else {
    if (btnSwitch) btnSwitch.style.display = 'none';
    if (sepSwitch) sepSwitch.style.display = 'none';
  }
}

async function switchMod() {
  if (!currentUser) return;
  var modNou = (currentUser.mod_activ || currentUser.tip_cont) === 'client' ? 'firma' : 'client';
  try {
    var res  = await fetch('/api/switch-mod', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mod: modNou })
    });
    var data = await res.json();
    if (!res.ok) { showToast(data.error || 'Eroare.'); return; }
    currentUser.mod_activ = modNou;
    actualizeazaSwitchDropdown(currentUser);
    showToast(modNou === 'firma' ? 'Ai trecut la contul de firmă!' : 'Ai trecut la contul de client!');
    setTimeout(function() { navigaLa(modNou); }, 600);
  } catch(e) { showToast('Eroare la schimbarea modului.'); }
}

function deschideFormularFirma() {
  var s = document.getElementById('cont-sectiune-activeaza-firma');
  var f = document.getElementById('cont-formular-activare-firma');
  if (s) s.style.display = 'none';
  if (f) f.style.display = 'block';
  initCategorieSelect('activ-categorie', false);
  initOrasSelect('activ-oras', false);
}

function ascundeFormularFirma() {
  var s = document.getElementById('cont-sectiune-activeaza-firma');
  var f = document.getElementById('cont-formular-activare-firma');
  if (s) s.style.display = 'block';
  if (f) f.style.display = 'none';
}

async function activeazaFirma() {
  var numeFirma = document.getElementById('activ-nume-firma').value.trim();
  var categorie = document.getElementById('activ-categorie').value;
  var oras      = document.getElementById('activ-oras').value;
  var raza      = document.getElementById('activ-raza').value;
  var prefix    = document.getElementById('activ-prefix')?.value || '+40';
  var telefonNr = document.getElementById('activ-telefon').value.trim();
  var descriere = document.getElementById('activ-descriere').value.trim();
  showAlert('cont-alert-activare', '', '');

  if (!numeFirma) { showAlert('cont-alert-activare', 'Numele firmei este obligatoriu.', 'error'); return; }
  if (!categorie) { showAlert('cont-alert-activare', 'Selectează o categorie.', 'error'); return; }
  if (!oras)      { showAlert('cont-alert-activare', 'Selectează județul.', 'error'); return; }

  var telValidare = validatePhone('activ-telefon', 'activ-prefix');
  if (!telValidare.valid) { showAlert('cont-alert-activare', telValidare.mesaj, 'error'); return; }

  var telefon = prefix + ' ' + telefonNr;

  var res  = await fetch('/api/activeaza-firma', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nume_firma: numeFirma, categorie, oras, raza_km: raza, telefon, descriere })
  });
  var data = await res.json();

  if (res.ok) {
    currentUser.tip_cont  = 'ambele';
    currentUser.mod_activ = 'client';
    actualizeazaSwitchDropdown(currentUser);
    var actEl = document.getElementById('cont-sectiune-activeaza-firma');
    var frmEl = document.getElementById('cont-formular-activare-firma');
    var detEl = document.getElementById('cont-sectiune-firma');
    if (actEl) actEl.style.display = 'none';
    if (frmEl) frmEl.style.display = 'none';
    if (detEl) { detEl.style.display = 'block'; incarcaDateFirmaCont(); }
    showAlert('cont-alert-profil', 'Cont de firmă activat! Foloseşte meniul pentru a comuta. ✅', 'success');
    showToast('Cont de firmă activat cu succes!');
  } else {
    showAlert('cont-alert-activare', data.error || 'Eroare la activare.', 'error');
  }
}
