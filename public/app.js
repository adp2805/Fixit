
// ============================================================
//  INTERCEPTOR GLOBAL FETCH — redirect la login la sesiune expirata
// ============================================================
(function() {
  var _originalFetch = window.fetch;
  window.fetch = async function() {
    var res = await _originalFetch.apply(this, arguments);
    if (res.status === 401) {
      // Cloneaza raspunsul ca sa nu il consumam
      var clone = res.clone();
      try {
        var data = await clone.json();
        if (data.error && data.error.toLowerCase().includes('logat')) {
          // Sesiunea a expirat — arata mesaj si redirectioneaza
          currentUser = null;
          showSesiuneExpirata();
          return res;
        }
      } catch(e) {}
    }
    return res;
  };
})();

function showSesiuneExpirata() {
  // Inchide orice modal deschis
  document.querySelectorAll('.modal-overlay.open').forEach(function(m) {
    m.classList.remove('open');
  });
  // Arata toast si redirectioneaza la login
  showToast('Sesiunea a expirat. Te redirectionăm la login...');
  setTimeout(function() {
    currentUser = null;
    // Reset UI
    var bellWrap = document.getElementById('nav-bell-wrap');
    var userWrap = document.getElementById('nav-user-wrap');
    var loginBtn = document.getElementById('btn-login-nav');
    var regBtn   = document.getElementById('btn-register-nav');
    var badge    = document.getElementById('badge-necitite');
    if (bellWrap) bellWrap.style.display = 'none';
    if (userWrap) userWrap.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'inline-block';
    if (regBtn)   regBtn.style.display   = 'inline-block';
    if (badge)    badge.style.display    = 'none';
    if (typeof stopPollingMesaje === 'function') stopPollingMesaje();
    navigaLa('login');
  }, 1500);
}

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

  // Initializeaza toate dropdown-urile de orase
  initOrasSelect('l-judet',            false);
  initOrasSelect('filter-oras',        true);
  initOrasSelect('firma-filter-oras',  true);
  initOrasSelect('reg-oras',           false);
  initOrasSelect('activ-oras',         false);
  initOrasSelect('cont-oras-firma-select', false);

  // Initializeaza toate dropdown-urile de categorii
  initCategorieSelect('l-categorie',       false);
  initCategorieSelect('activ-categorie',   false);
  initCategorieSelect('cont-categorie',    false);
  initCategorieSelect('reg-categorie',     false);
  initCategorieSelect('filter-cat',        true);
  initCategorieSelect('firma-filter-cat',  true);

  // Initializeaza custom dropdown-uri pentru prefix telefon
  initPrefixDropdown('reg');
  initPrefixDropdown('cont');
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
  actualizezaButoaneleHero(user);
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

  // Arata clopotelul de notificari
  var _bellWrap = document.getElementById('nav-bell-wrap');
  if (_bellWrap) _bellWrap.style.display = 'block';

  // Porneste polling pentru mesaje necitite (badge pe dropdown)
  startPollingMesaje();
}

// ============================================================
//  AUTH
// ============================================================
// ===== MODIFICARE 4: functie show/hide password =====
function deschideForgotPassword() {
  document.getElementById('forgot-email').value =
    document.getElementById('login-email')?.value || '';
  showAlert('forgot-alert', '', '');
  document.getElementById('forgot-dev-link').style.display = 'none';
  openModal('modal-forgot-password');
}

async function trimiteResetParola() {
  var email = document.getElementById('forgot-email').value.trim();
  showAlert('forgot-alert', '', '');
  if (!email) { showAlert('forgot-alert', 'Introdu adresa de email.', 'error'); return; }

  var btn = document.querySelector('#modal-forgot-password .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Se trimite...'; }

  try {
    var res  = await fetch('/api/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    var data = await res.json();

    if (res.ok) {
      showAlert('forgot-alert', data.mesaj || 'Link trimis! Verifică emailul.', 'success');
      // Dev mode — afiseaza link-ul direct
      if (data.devMode && data.link) {
        var devBox = document.getElementById('forgot-dev-link');
        var devUrl = document.getElementById('forgot-dev-link-url');
        devBox.style.display = 'block';
        devUrl.href = data.link;
        devUrl.textContent = data.link;
      }
    } else {
      showAlert('forgot-alert', data.error || 'Eroare la trimitere.', 'error');
    }
  } catch(e) {
    showAlert('forgot-alert', 'Eroare de conexiune.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Trimite link de resetare'; }
  }
}

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

// ── Date tari pentru prefix telefon ──────────────────────────
var TARI_PREFIX = [
  { flag:'🇷🇴', code:'RO', prefix:'+40', placeholder:'721 000 000', digits:9 },
  { flag:'🇺🇸', code:'US', prefix:'+1',  placeholder:'201 555 0123', digits:10 },
  { flag:'🇬🇧', code:'GB', prefix:'+44', placeholder:'7700 900123', digits:10 },
  { flag:'🇩🇪', code:'DE', prefix:'+49', placeholder:'1512 3456789', digits:10 },
  { flag:'🇫🇷', code:'FR', prefix:'+33', placeholder:'612 345 678', digits:9 },
  { flag:'🇮🇹', code:'IT', prefix:'+39', placeholder:'312 345 6789', digits:10 },
  { flag:'🇪🇸', code:'ES', prefix:'+34', placeholder:'612 345 678', digits:9 },
  { flag:'🇳🇱', code:'NL', prefix:'+31', placeholder:'612 345 678', digits:9 },
  { flag:'🇧🇪', code:'BE', prefix:'+32', placeholder:'470 123 456', digits:9 },
  { flag:'🇦🇹', code:'AT', prefix:'+43', placeholder:'664 123456', digits:9 },
  { flag:'🇨🇭', code:'CH', prefix:'+41', placeholder:'78 123 45 67', digits:9 },
  { flag:'🇵🇱', code:'PL', prefix:'+48', placeholder:'512 345 678', digits:9 },
  { flag:'🇨🇿', code:'CZ', prefix:'+420', placeholder:'601 123 456', digits:9 },
  { flag:'🇭🇺', code:'HU', prefix:'+36', placeholder:'20 123 4567', digits:9 },
  { flag:'🇧🇬', code:'BG', prefix:'+359', placeholder:'87 123 4567', digits:9 },
  { flag:'🇷🇸', code:'RS', prefix:'+381', placeholder:'60 123 4567', digits:9 },
  { flag:'🇺🇦', code:'UA', prefix:'+380', placeholder:'50 123 4567', digits:9 },
  { flag:'🇲🇩', code:'MD', prefix:'+373', placeholder:'79 123 456',  digits:8 },
  { flag:'🇬🇷', code:'GR', prefix:'+30',  placeholder:'691 234 5678', digits:10 },
  { flag:'🇹🇷', code:'TR', prefix:'+90',  placeholder:'532 123 4567', digits:10 },
  { flag:'🇷🇺', code:'RU', prefix:'+7',   placeholder:'912 345 6789', digits:10 },
];

function initPrefixDropdown(ns) {
  // ns = 'reg' sau 'cont'
  var dropdownEl = document.getElementById(ns + '-prefix-dropdown');
  if (!dropdownEl) return;
  dropdownEl.innerHTML = TARI_PREFIX.map(function(t) {
    return '<div class="phone-prefix-option" onclick="selectPrefix(\'' + ns + '\',\'' + t.prefix + '\')">'
      + '<span class="phone-prefix-option-flag">' + t.flag + '</span>'
      + '<span class="phone-prefix-option-label">' + t.code + '</span>'
      + '<span class="phone-prefix-option-code">' + t.prefix + '</span>'
      + '</div>';
  }).join('');
}

function togglePrefixDropdown(ns) {
  var btn  = document.getElementById(ns + '-prefix-btn');
  var drop = document.getElementById(ns + '-prefix-dropdown');
  if (!btn || !drop) return;
  var isOpen = drop.classList.contains('open');
  // Inchide toate dropdown-urile deschise
  document.querySelectorAll('.phone-prefix-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  document.querySelectorAll('.phone-prefix-btn.open').forEach(function(b) { b.classList.remove('open'); });
  if (!isOpen) {
    drop.classList.add('open');
    btn.classList.add('open');
  }
}

function selectPrefix(ns, prefix) {
  var tara = TARI_PREFIX.find(function(t) { return t.prefix === prefix; });
  if (!tara) return;
  // Actualizeaza butonul
  document.getElementById(ns + '-prefix-flag').textContent = tara.flag;
  document.getElementById(ns + '-prefix-code').textContent = tara.prefix;
  // Actualizeaza hidden input
  var hiddenId = ns === 'reg' ? 'reg-prefix' : 'cont-telefon-prefix';
  document.getElementById(hiddenId).value = tara.prefix;
  // Actualizeaza placeholder-ul campului de telefon
  var inputId = ns === 'reg' ? 'reg-telefon' : 'cont-telefon-nr';
  var inp = document.getElementById(inputId);
  if (inp) { inp.placeholder = tara.placeholder; inp.dataset.digits = tara.digits; }
  // Marcheaza optiunea selectata
  var drop = document.getElementById(ns + '-prefix-dropdown');
  drop.querySelectorAll('.phone-prefix-option').forEach(function(el) {
    el.classList.toggle('selected', el.querySelector('.phone-prefix-option-code').textContent === tara.prefix);
  });
  // Inchide dropdown-ul
  drop.classList.remove('open');
  document.getElementById(ns + '-prefix-btn').classList.remove('open');
}

// Inchide dropdown la click in afara
document.addEventListener('click', function(e) {
  if (!e.target.closest('.phone-prefix-wrap')) {
    document.querySelectorAll('.phone-prefix-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
    document.querySelectorAll('.phone-prefix-btn.open').forEach(function(b) { b.classList.remove('open'); });
  }
});

function updatePhonePlaceholder(selectId, inputId) {
  // Pastrat pentru compatibilitate, nu mai e folosit activ
}

function validatePhone(inputId, prefixId) {
  var inp    = document.getElementById(inputId);
  var hidden = document.getElementById(prefixId);
  if (!inp) return { valid: true };

  var prefix = hidden ? hidden.value : '+40';
  var tara   = (typeof TARI_PREFIX !== 'undefined')
    ? TARI_PREFIX.find(function(t) { return t.prefix === prefix; })
    : null;
  var digits = tara ? tara.digits : (parseInt(inp.dataset.digits) || 9);
  var nr     = (inp.value || '').replace(/\s/g, '');

  if (!nr) {
    return { valid: false, mesaj: 'Numărul de telefon este obligatoriu.' };
  }
  if (nr.startsWith('0')) {
    return { valid: false, mesaj: 'Nu include cifra 0 la început. Ex: ' + (tara ? tara.placeholder : '721 000 000') };
  }
  if (nr.length !== digits) {
    return { valid: false, mesaj: 'Numărul trebuie să aibă exact ' + digits + ' cifre (fără 0). Ex: ' + (tara ? tara.placeholder : '721 000 000') };
  }
  if (!/^\d+$/.test(nr)) {
    return { valid: false, mesaj: 'Numărul trebuie să conțină doar cifre.' };
  }
  return { valid: true };
}

function setPrefixValue(ns, prefix) {
  // Seteaza prefixul programatic (ex: la incarcarea datelor din cont)
  selectPrefix(ns, prefix);
}

function selectTip(tip) {
  document.getElementById('reg-tip').value = tip;
  document.getElementById('opt-client').classList.toggle('selected', tip === 'client');
  document.getElementById('opt-firma').classList.toggle('selected', tip === 'firma');
  document.getElementById('firma-extra').style.display   = tip === 'firma'  ? 'block' : 'none';
  document.getElementById('client-fields').style.display = tip === 'client' ? 'block' : 'none';
  if (tip === 'firma') {
    initCategorieSelect('reg-categorie', false);
    initOrasSelect('reg-oras', false);
    initPrefixDropdown('rf');
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

  // Dupa login, arata homepage-ul personalizat
  // Folosim replaceState ca sa inlocuim pagina de login in istoric (back nu se mai intoarce la login)
  window.history.replaceState({ page: 'home' }, '', '/');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('home-guest').style.display  = 'none';
  document.getElementById('home-logged').style.display = 'block';
  _updateBackBtn('home');
  window.scrollTo(0, 0);
}
// ===== SFARSIT MODIFICARE =====

async function doRegister() {
  const tip = document.getElementById('reg-tip').value;
  showAlert('register-alert', '', '');

  var prenume, numeSimple, email, parola;

  if (tip === 'firma') {
    prenume    = document.getElementById('rf-prenume').value.trim();
    numeSimple = document.getElementById('rf-nume').value.trim();
    email      = document.getElementById('rf-email').value.trim();
    parola     = document.getElementById('rf-parola').value;
  } else {
    prenume    = document.getElementById('reg-prenume').value.trim();
    numeSimple = document.getElementById('reg-nume').value.trim();
    email      = document.getElementById('reg-email').value.trim();
    parola     = document.getElementById('reg-parola').value;
  }

  const nume = prenume + ' ' + numeSimple;

  if (!prenume || !numeSimple) {
    showAlert('register-alert', 'Prenumele și numele sunt obligatorii.', 'error');
    return;
  }

  var body = { tip_cont:tip, nume_complet:nume, prenume, nume_familie:numeSimple, email, parola };

  if (tip === 'firma') {
    const numeFirma  = document.getElementById('reg-numefirma')?.value.trim();
    const categorie  = document.getElementById('reg-categorie')?.getAttribute('data-value');
    const oras       = document.getElementById('reg-oras')?.getAttribute('data-value');
    const raza       = document.getElementById('reg-raza')?.value;
    const prefix     = document.getElementById('rf-prefix')?.value || '+40';
    const telefonNr  = document.getElementById('rf-telefon')?.value.trim();

    if (!numeFirma) { showAlert('register-alert', 'Numele firmei este obligatoriu.', 'error'); return; }
    if (!categorie)  { showAlert('register-alert', 'Selectează o categorie.', 'error'); return; }
    if (!oras)       { showAlert('register-alert', 'Selectează județul.', 'error'); return; }

    var telValidare = validatePhone('rf-telefon', 'rf-prefix');
    if (!telValidare.valid) { showAlert('register-alert', telValidare.mesaj, 'error'); return; }

    const telefon = prefix + ' ' + telefonNr;
    body = { ...body, telefon, telefon_prefix: prefix,
      nume_firma: numeFirma, categorie, oras, raza_km: raza };
  } else {
    const prefix    = document.getElementById('reg-prefix')?.value || '+40';
    const telefonNr = document.getElementById('reg-telefon')?.value.trim();
    var telValClient = validatePhone('reg-telefon', 'reg-prefix');
    if (!telValClient.valid) { showAlert('register-alert', telValClient.mesaj, 'error'); return; }
    body.telefon        = prefix + ' ' + telefonNr;
    body.telefon_prefix = prefix;
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
let ultimeleNecitite  = -1;
let ultimeleMesaje    = -1;
let ultimeleOferte    = -1;
let ultimeleAcceptari = -1;
let ultimeleReviews   = -1;
let ultimeleConvIds  = new Set();

function startPollingMesaje() {
  clearInterval(pollingInterval);
  ultimeleNecitite  = -1;
  ultimeleMesaje    = -1;
  ultimeleOferte    = -1;
  ultimeleAcceptari = -1;
  ultimeleReviews   = -1;
  verificaMesaje();
  pollingInterval = setInterval(verificaMesaje, 5000);
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
    const total     = data.total     || 0;
    const mesaje    = data.mesaje    || 0;
    const oferte    = data.oferte    || 0;
    const acceptari = data.acceptari || 0;
    const reviews   = data.reviews   || 0;

    actualizaBadge(total);

    if (ultimeleNecitite === -1) {
      ultimeleNecitite = total;
      ultimeleMesaje   = mesaje;
      ultimeleOferte   = oferte;
      ultimeleAcceptari = acceptari;
      ultimeleReviews  = reviews;
      return;
    }

    if (oferte    > ultimeleOferte)    arataPopupOferta(oferte - ultimeleOferte);
    if (acceptari > ultimeleAcceptari) arataPopupAcceptare(acceptari - ultimeleAcceptari);
    if (mesaje    > ultimeleMesaje)    arataPopup(mesaje - ultimeleMesaje);
    if (reviews   > ultimeleReviews)   arataPopupReview(reviews - ultimeleReviews);

    ultimeleNecitite  = total;
    ultimeleMesaje    = mesaje;
    ultimeleOferte    = oferte;
    ultimeleAcceptari = acceptari;
    ultimeleReviews   = reviews;
  } catch(e) {}
}

function arataPopupOferta(nr) {
  const container = document.getElementById('notif-container');
  const id        = 'notif-' + Date.now();
  const div = document.createElement('div');
  div.id        = id;
  div.className = 'notif-popup';
  const modActiv = currentUser?.mod_activ || currentUser?.tip_cont;
  const titlu = modActiv === 'firma'
    ? (nr === 1 ? 'Contraofertă nouă' : nr + ' contraoferte noi')
    : (nr === 1 ? 'Ofertă nouă primită!' : nr + ' oferte noi primite!');
  const sub = modActiv === 'firma'
    ? 'Un client a trimis o contraofertă'
    : 'O firmă a trimis o ofertă la lucrarea ta';
  div.innerHTML = `
    <div class="notif-icon">📋</div>
    <div>
      <div class="notif-title">${titlu}</div>
      <div class="notif-sub">${sub}</div>
    </div>
    <button class="notif-close" onclick="inchideNotif('${id}')">✕</button>`;
  div.addEventListener('click', function(e) {
    if (e.target.classList.contains('notif-close')) return;
    inchideNotif(id);
    navigaLa(modActiv === 'firma' ? 'firma' : 'client');
  });
  container.appendChild(div);
  setTimeout(() => inchideNotif(id), 6000);
}

function arataPopupAcceptare(nr) {
  const container = document.getElementById('notif-container');
  const id        = 'notif-' + Date.now();
  const div = document.createElement('div');
  div.id        = id;
  div.className = 'notif-popup';
  div.innerHTML = `
    <div class="notif-icon">✅</div>
    <div>
      <div class="notif-title">${nr === 1 ? 'Ofertă acceptată!' : nr + ' oferte acceptate!'}</div>
      <div class="notif-sub">${nr === 1 ? 'Un client a acceptat oferta ta' : 'Clienții au acceptat ofertele tale'}</div>
    </div>
    <button class="notif-close" onclick="inchideNotif('${id}')">✕</button>`;
  div.addEventListener('click', function(e) {
    if (e.target.classList.contains('notif-close')) return;
    inchideNotif(id);
    navigaLa('firma');
  });
  container.appendChild(div);
  setTimeout(() => inchideNotif(id), 6000);
}

function arataPopupReview(nr) {
  const container = document.getElementById('notif-container');
  const id        = 'notif-' + Date.now();
  const div = document.createElement('div');
  div.id        = id;
  div.className = 'notif-popup';
  const modActiv = currentUser?.mod_activ || currentUser?.tip_cont;
  div.innerHTML = `
    <div class="notif-icon">⭐</div>
    <div>
      <div class="notif-title">${nr === 1 ? 'Review nou primit!' : nr + ' review-uri noi!'}</div>
      <div class="notif-sub">Cineva ți-a evaluat activitatea</div>
    </div>
    <button class="notif-close" onclick="inchideNotif('${id}')">✕</button>`;
  div.addEventListener('click', function(e) {
    if (e.target.classList.contains('notif-close')) return;
    inchideNotif(id);
    if (modActiv === 'firma') _refreshFirmaOferte();
    else _refreshClient();
  });
  container.appendChild(div);
  setTimeout(() => inchideNotif(id), 6000);
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
  setTimeout(() => inchideNotif(id), 6000);
}

function actualizaBadge(total) {
  var badge = document.getElementById('badge-necitite');
  var bell  = document.querySelector('.nav-bell-btn');
  if (total > 0) {
    if (badge) {
      badge.style.display = 'flex';
      badge.textContent   = total > 99 ? '99+' : String(total);
      badge.style.animation = 'none';
      badge.offsetHeight;
      badge.style.animation = '';
    }
    if (bell) bell.classList.add('has-notif');
  } else {
    if (badge) badge.style.display = 'none';
    if (bell)  bell.classList.remove('has-notif');
  }
}

function toggleNotifDropdown() {
  var dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  var contDd = document.getElementById('nav-dropdown');
  if (contDd) contDd.classList.remove('open');
  if (isOpen) {
    dd.classList.remove('open');
  } else {
    dd.classList.add('open');
    incarcaNotifDropdown();
  }
}

function closeNotifDropdown() {
  var dd = document.getElementById('notif-dropdown');
  if (dd) dd.classList.remove('open');
}

async function incarcaNotifDropdown() {
  var list = document.getElementById('notif-dropdown-list');
  if (!list) return;
  list.innerHTML = '<div style="padding:16px;text-align:center;font-size:13px;color:var(--gray);">Se încarcă...</div>';
  try {
    const res  = await fetch('/api/mesaje-necitite-total');
    const data = await res.json();
    const items = [];
    const modActiv = currentUser?.mod_activ || currentUser?.tip_cont;

    if (data.reviews > 0) {
      items.push({
        icon: '⭐', cls: 'amber',
        titlu: data.reviews === 1 ? 'Review nou primit!' : data.reviews + ' review-uri noi',
        sub: 'Cineva ți-a lăsat un review după finalizarea lucrării',
        actiune: function() {
          closeNotifDropdown();
          var mod = currentUser?.mod_activ || currentUser?.tip_cont;
          if (mod === 'firma') _refreshFirmaOferte();
          else _refreshClient();
        }
      });
    }

    if (data.oferte > 0) {
      if (modActiv === 'client') {
        items.push({
          icon: '📋', cls: 'blue',
          titlu: data.oferte === 1 ? 'Ofertă nouă primită' : data.oferte + ' oferte noi',
          sub: 'Firmele au trimis oferte la lucrările tale',
          actiune: function() { closeNotifDropdown(); _refreshClient(); }
        });
      } else {
        items.push({
          icon: '↩️', cls: 'amber',
          titlu: data.oferte === 1 ? 'Contraofertă nouă' : data.oferte + ' contraoferte noi',
          sub: 'Un client a trimis o contraofertă la oferta ta',
          actiune: function() { closeNotifDropdown(); _refreshFirmaOferte(); }
        });
      }
    }

    if (data.acceptari > 0) {
      items.push({
        icon: '✅', cls: 'green',
        titlu: data.acceptari === 1 ? 'Ofertă acceptată!' : data.acceptari + ' oferte acceptate!',
        sub: data.acceptari === 1 ? 'Un client a acceptat oferta ta' : 'Clienții au acceptat ofertele tale',
        actiune: function() { closeNotifDropdown(); _refreshFirmaOferte(); }
      });
    }

    if (data.mesaje > 0) {
      items.push({
        icon: '💬', cls: 'green',
        titlu: data.mesaje === 1 ? 'Mesaj nou' : data.mesaje + ' mesaje noi',
        sub: 'Ai mesaje necitite în conversații',
        actiune: function() { closeNotifDropdown(); navigaLa('mesaje'); }
      });
    }

    if (items.length === 0) {
      list.innerHTML = '<div style="padding:24px 16px;text-align:center;font-size:13px;color:var(--gray);">Nicio notificare nouă ✓</div>';
      return;
    }

    list.innerHTML = items.map(function(item, i) {
      return '<div class="notif-item" id="notif-dd-item-' + i + '">'
        + '<div class="notif-item-icon ' + item.cls + '">' + item.icon + '</div>'
        + '<div style="flex:1;">'
        + '<div class="notif-item-title">' + item.titlu + '</div>'
        + '<div class="notif-item-sub">' + item.sub + '</div>'
        + '</div>'
        + '<div class="notif-item-dot"></div>'
        + '</div>';
    }).join('');

    items.forEach(function(item, i) {
      var el = document.getElementById('notif-dd-item-' + i);
      if (el) el.addEventListener('click', item.actiune);
    });
  } catch(e) {
    list.innerHTML = '<div style="padding:16px;text-align:center;font-size:13px;color:var(--gray);">Eroare la încărcare</div>';
  }
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
  // Ascunde badge imediat, fara sa asteptam serverul
  var badge = document.getElementById('badge-necitite');
  if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  // Marcheaza ofertele ca vazute cand se deschide dashboard-ul
  fetch('/api/marcheaza-citit', { method: 'POST' })
    .then(() => { ultimeleNecitite=-1; ultimeleOferte=-1; ultimeleReviews=-1; verificaMesaje(); })
    .catch(() => {});
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
  if (!Array.isArray(lucrari)) { console.error('Eroare lucrari:', lucrari); return; }
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
      var permisFinalizare = true;
      var tooltipDisp = '';

      if (l.disp_pana_la_acceptata) {
        // Extragem ora locala curenta ca string YYYY-MM-DD HH:mm
        var acum = new Date();
        var pad = function(n){ return String(n).padStart(2,'0'); };
        var acumStr = acum.getFullYear() + '-' + pad(acum.getMonth()+1) + '-' + pad(acum.getDate())
          + ' ' + pad(acum.getHours()) + ':' + pad(acum.getMinutes());
        // Extragem limita din string SQL fara conversie timezone
        var limitaStr = String(l.disp_pana_la_acceptata).replace('T',' ').replace('Z','').substring(0,16);
        permisFinalizare = acumStr >= limitaStr;
        if (!permisFinalizare) {
          tooltipDisp = 'Lucrare programată până la: ' + fmtDatetime(l.disp_pana_la_acceptata);
        }
      }

      var btnFinalizeaza = permisFinalizare
        ? '<button class="btn-finalizeaza" onclick="finalizeazaLucrare(' + l.id + ')">✓ Marchează finalizată</button>'
        : '<button class="btn-finalizeaza" disabled title="' + tooltipDisp + '" style="opacity:.45;cursor:not-allowed;">🕐 ' + (tooltipDisp || 'Lucrare în desfășurare') + '</button>';

      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ', \'' + (l.titlu||'').replace(/'/g,"\\'") + '\')">Vezi oferte</button>'
        + ' <span class="badge badge-amber" style="font-size:11px;">✓ Ofertă acceptată</span>'
        + ' ' + btnFinalizeaza;

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
      var nrOferte = l.nr_oferte || 0;
      var badgeOferta = nrOferte > 0
        ? ' <span class="badge badge-blue" style="font-size:11px;">📋 ' + nrOferte + ' ofert' + (nrOferte === 1 ? 'ă' : 'e') + '</span>'
        : '';
      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ', \'' + (l.titlu||'').replace(/'/g,"\\'") + '\')">Vezi oferte</button>'
        + badgeOferta
        + ' <button class="btn btn-danger btn-sm" onclick="stergelucrare(' + l.id + ')">Șterge</button>';
    } else {
      actiuni = '<button class="btn btn-primary btn-sm" onclick="veziOferte(' + l.id + ', \'' + (l.titlu||'').replace(/'/g,"\\'") + '\')">Vezi oferte</button>';
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
      + (l.descriere ? '<div style="font-size:13px;color:var(--gray);margin-top:8px;word-break:break-word;overflow-wrap:break-word;">' + l.descriere + '</div>' : '')
      + '</div></div>'
      + '<div class="lucrare-actions">' + actiuni + '</div>'
      + '</div>';
  }).join('');
}

// ============================================================
//  REFRESH HELPERS — reincarca datele si activeaza tab-ul corect
// ============================================================
async function _refreshClient() {
  // Asigura-te ca suntem pe pagina client
  if (!document.getElementById('page-client').classList.contains('active')) {
    navigaLa('client');
  }
  // Activeaza tab-ul "Lucrarile mele"
  var btn = document.querySelector('#page-client .tab-btn');
  if (btn) {
    document.querySelectorAll('#page-client .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    var tabLucrari = document.getElementById('client-tab-lucrari');
    var tabBrowse  = document.getElementById('client-tab-browse');
    if (tabLucrari) tabLucrari.style.display = 'block';
    if (tabBrowse)  tabBrowse.style.display  = 'none';
  }
  // Reincarca lista direct
  await loadLucrariClient();
}

async function _refreshFirmaOferte() {
  // Asigura-te ca suntem pe pagina firma
  if (!document.getElementById('page-firma').classList.contains('active')) {
    navigaLa('firma');
  }
  // Activeaza tab-ul "Ofertele mele"
  var btn = document.querySelector('#page-firma .tab-btn[onclick*="oferte"]');
  if (btn) {
    document.querySelectorAll('#page-firma .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    var tabLucrari = document.getElementById('firma-tab-lucrari');
    var tabOferte  = document.getElementById('firma-tab-oferte');
    if (tabLucrari) tabLucrari.style.display = 'none';
    if (tabOferte)  tabOferte.style.display  = 'block';
  }
  // Reincarca lista direct
  await loadOferteMele();
}

// ===== MODIFICARE: veziOferte cu 3 butoane — Accepta, Chat, Contraoferta =====
async function veziOferte(lucrareId, titlu) {
  try {
    const res  = await fetch('/api/lucrari/' + lucrareId);
    const data = await res.json();
  currentLucrareId = lucrareId;

  document.getElementById('modal-oferte-title').textContent = 'Oferte pentru: ' + (titlu || data.titlu || 'lucrare');
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
        + ' <button class="btn btn-sm" style="background:#D97706;color:#fff;border:none;" onclick="deschideContraofertaById(' + o.id + ',' + o.pret + ')">↩ Contraofertă</button>'
        + ' <button class="btn btn-danger btn-sm" onclick="refuzaOferta(' + o.id + ')">✗ Refuză</button>'
        + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';

    } else if (o.status === 'negociere') {
      var firmaAInitiat = _bitVal(o.firma_a_initiat) === 1; // == pentru a compara si string "1"

      if (firmaAInitiat) {
        // Firma a trimis contraoferta — clientul poate accepta, negocia sau refuza
        butoane = '<button class="btn btn-green btn-sm" onclick="acceptaOfertaFirma(' + o.id + ', ' + o.pret_contraoferta + ')">✓ Acceptă ' + o.pret_contraoferta + ' lei</button>'
          + ' <button class="btn btn-sm" style="background:#D97706;color:#fff;border:none;" onclick="deschideContraofertaById(' + o.id + ',' + o.pret_contraoferta + ')">↩ Contraofertă</button>'
          + ' <button class="btn btn-danger btn-sm" onclick="refuzaOferta(' + o.id + ')">✗ Refuză</button>'
          + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';
      } else {
        // Clientul a trimis contraoferta — asteapta raspunsul firmei
        butoane = '<span class="badge-negociere">⏳ Contraofertă trimisă — aștepți răspuns</span>'
          + ' <button class="btn btn-danger btn-sm" onclick="refuzaOferta(' + o.id + ')">✗ Refuză</button>'
          + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';
      }

    } else if (o.status === 'acceptata') {
      butoane = '<span class="badge badge-green">✓ Acceptată</span>'
        + ' <button class="btn btn-primary btn-sm" onclick="deschideChatById(' + o.id + ')">💬 Chat</button>';
    } else if (o.status === 'refuzata') {
      butoane = '<span class="badge badge-red">✗ Refuzată</span>';
    } else {
      butoane = statusBadge(o.status);
    }

    var contraofertaBox = '';
    if (o.status === 'negociere' && o.pret_contraoferta) {
      if (_bitVal(o.firma_a_initiat) === 1) {
        contraofertaBox = '<div class="contraoferta-box" style="background:#EEF3FF;border-color:#93C5FD;color:#1e40af;">'
          + '🏢 Firma propune: <strong>' + o.pret_contraoferta + ' lei</strong>'
          + (o.mesaj_contraoferta ? ' — "' + o.mesaj_contraoferta + '"' : '') + '</div>';
      } else {
        contraofertaBox = '<div class="contraoferta-box" style="background:#F0FDF4;border-color:#86EFAC;color:#166534;">'
          + '👤 Tu propui: <strong>' + o.pret_contraoferta + ' lei</strong>'
          + (o.mesaj_contraoferta ? ' — "' + o.mesaj_contraoferta + '"' : '') + '</div>';
      }
    }

    return '<div class="card-sm">'
      + '<div class="oferta-header"><div>'
      + '<div class="oferta-firma">🏢 ' + (o.nume_firma||'')
      + ' <button onclick="veziReviewsFirma(' + o.firma_id + ',\'' + (o.nume_firma||'').replace(/'/g,"\\'") + '\')" '
      + 'style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--amber);padding:2px 6px;border-radius:10px;background:var(--amber-light);">⭐ Reviews</button>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--gray);">📍 ' + (o.firma_oras||'') + ' · ' + (o.firma_categorie||'') + '</div>'
      + '</div>' + pretAfisat + '</div>'
      + (o.descriere_oferta ? '<div class="oferta-desc">' + o.descriere_oferta + '</div>' : '')
      + (o.disponibilitate_de_la && o.disponibilitate_pana_la
          ? '<div style="font-size:12px;color:var(--gray);margin-bottom:6px;">🕐 ' + fmtDatetime(o.disponibilitate_de_la) + ' → ' + fmtDatetime(o.disponibilitate_pana_la) + '</div>'
          : (o.disponibilitate ? '<div style="font-size:12px;color:var(--gray);margin-bottom:6px;">🕐 ' + o.disponibilitate + '</div>' : ''))
      + contraofertaBox
      + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' + butoane + '</div>'
      + '</div>';
  }).join('');

  openModal('modal-oferte-client');
  } catch(e) {
    console.error('veziOferte error:', e);
  }
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
    if (senderTip === 'firma') _refreshFirmaOferte();
    else _refreshClient();
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
    _refreshClient();
  } else { alert(data.error); }
}

// Client accepta contraoferta trimisa de firma (cu noul pret)
async function acceptaOfertaFirma(ofertaId, pretNou) {
  confirmCustom(
    'Accepti prețul de ' + pretNou + ' lei propus de firmă?',
    'Acceptare ofertă', '✅',
    async function() {
      const res  = await fetch('/api/oferte/' + ofertaId + '/accepta-contraoferta-firma', { method: 'PATCH' });
      const data = await res.json();
      if (res.ok) {
        closeModal('modal-oferte-client');
        showToast('Ofertă acceptată la ' + pretNou + ' lei! Lucrarea e în lucru. ✅');
        _refreshClient();
      } else { alert(data.error); }
    }
  );
}

// Client refuza oferta
async function refuzaOferta(ofertaId) {
  confirmCustom(
    'Sigur vrei să refuzi această ofertă?',
    'Refuză oferta', '❌',
    async function() {
      const res  = await fetch('/api/oferte/' + ofertaId + '/refuza', { method: 'PATCH' });
      const data = await res.json();
      if (res.ok) {
        closeModal('modal-oferte-client');
        showToast('Ofertă refuzată.');
        _refreshClient();
      } else { showToast(data.error || 'Eroare la refuzare.'); }
    }
  );
}
// ===== SFARSIT FUNCTII ACCEPTARE =====

async function stergelucrare(id) {
  confirmCustom(
    'Sigur vrei să ștergi această lucrare? Acțiunea nu poate fi anulată.',
    'Șterge lucrare', '🗑️',
    async function() {
      const res = await fetch('/api/lucrari/' + id, { method:'DELETE' });
      if (res.ok) {
        showToast('Lucrare ștearsă.');
        _refreshClient();
      }
    }
  );
}

// ============================================================
//  SISTEM REVIEW
// ============================================================

// Marcare lucrare finalizata de catre client
async function finalizeazaLucrare(lucrareId) {
  confirmCustom(
    'Confirmați că lucrarea a fost finalizată? Această acțiune nu poate fi anulată.',
    'Finalizare lucrare', '✅',
    async function() {
      const res  = await fetch('/api/lucrari/' + lucrareId + '/finalizeaza', { method: 'PATCH' });
      const data = await res.json();
      if (res.ok) {
        showToast('Lucrare marcată ca finalizată! Poți lăsa acum un review. ✅');
        _refreshClient();
      } else { alert(data.error); }
    }
  );
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
    if (tip === 'client') _refreshClient();
    else _refreshFirmaOferte();
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

// ── Review-urile mele (modal din navbar) ─────────────────────
var _reviewurileMeleDate = null;

async function deschideReviewurileMele() {
  openModal('modal-reviews-mele');
  var list = document.getElementById('reviews-mele-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;font-size:13px;color:var(--gray);">Se încarcă...</div>';

  try {
    var data = await (await fetch('/api/reviews/ale-mele')).json();
    _reviewurileMeleDate = data;
    // Activeaza tab-ul "Primite" implicit
    var btnPrimite = document.getElementById('tab-reviews-primite');
    var btnTrimise = document.getElementById('tab-reviews-trimise');
    if (btnPrimite) { btnPrimite.classList.add('active'); }
    if (btnTrimise) { btnTrimise.classList.remove('active'); }
    randeazaReviewuri(data.primite, 'primite');
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:20px;font-size:13px;color:var(--gray);">Eroare la încărcare.</div>';
  }
}

function switchReviewTab(tab, btn) {
  document.querySelectorAll('#modal-reviews-mele .tab-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (!_reviewurileMeleDate) return;
  randeazaReviewuri(tab === 'primite' ? _reviewurileMeleDate.primite : _reviewurileMeleDate.trimise, tab);
}

function randeazaReviewuri(reviews, tip) {
  var list = document.getElementById('reviews-mele-list');
  if (!list) return;
  if (!reviews || !reviews.length) {
    list.innerHTML = '<div style="text-align:center;padding:24px;font-size:13px;color:var(--gray);">'
      + (tip === 'primite' ? 'Nu ai primit review-uri publice încă.' : 'Nu ai trimis review-uri încă.')
      + '</div>';
    return;
  }
  list.innerHTML = reviews.map(function(r) {
    var stele = '';
    for (var i = 1; i <= 5; i++) stele += i <= r.rating_general ? '★' : '☆';
    var data = new Date(r.creat_la).toLocaleDateString('ro-RO', {month:'long', year:'numeric'});
    var persoana = tip === 'primite'
      ? '👤 ' + (r.reviewer_nume || '—')
      : '🏢 ' + (r.reviewer_nume || '—');
    return '<div class="review-card">'
      + '<div class="review-card-header">'
      + '<div><div class="review-autor">' + persoana + '</div>'
      + '<div class="review-data">' + (r.lucrare_titlu||'') + ' · ' + data + '</div></div>'
      + '<div class="review-stars-display" style="color:#F59E0B;font-size:18px;">' + stele + ' <span style="font-size:13px;">' + r.rating_general + '/5</span></div>'
      + '</div>'
      + (r.comentariu ? '<div class="review-comentariu">"' + r.comentariu + '"</div>' : '')
      + '</div>';
  }).join('');
}


// Incarca si afiseaza ratingul unui client (din reviews primite de la firme)
var _ratingClientiCache = {};
async function incarcaRatingClient(clientId, lucrareId) {
  try {
    var data;
    if (_ratingClientiCache[clientId] !== undefined) {
      data = _ratingClientiCache[clientId];
    } else {
      data = await (await fetch('/api/reviews/rating-client/' + clientId)).json();
      _ratingClientiCache[clientId] = data;
    }
    afiseazaRatingClient(lucrareId, data);
  } catch(e) {
    var el = document.getElementById('rating-client-luc-' + lucrareId);
    if (el) el.innerHTML = '<div style="font-size:11px;color:var(--gray);">Rating client</div><div style="font-size:11px;color:var(--gray);">Nou pe platformă</div>';
  }
}

function afiseazaRatingClient(lucrareId, data) {
  var el = document.getElementById('rating-client-luc-' + lucrareId);
  if (!el) return;
  var html;
  if (!data || !data.nr_reviews) {
    html = '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="font-size:12px;color:var(--gray);">Nou pe platformă</div>';
  } else {
    var stele = '';
    var rating = parseFloat(data.rating_mediu) || 0;
    for (var i = 1; i <= 5; i++) stele += i <= Math.round(rating) ? '★' : '☆';
    html = '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="color:#F59E0B;font-size:14px;">' + stele + '</div>'
      + '<div style="font-size:11px;color:var(--gray);">' + rating.toFixed(1) + ' (' + data.nr_reviews + ' lucrări)</div>';
  }
  el.innerHTML = html;
}

async function loadFirme() {
  const cat  = document.getElementById('filter-cat').getAttribute('data-value');
  const oras = document.getElementById('filter-oras').getAttribute('data-value');
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

async function deschideDetaliiLucrare(lucrareId) {
  var titleEl   = document.getElementById('detalii-lucrare-title');
  var contentEl = document.getElementById('detalii-lucrare-content');
  if (!contentEl) return;

  titleEl.textContent = 'Detalii lucrare';
  contentEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);">Se încarcă...</div>';
  openModal('modal-detalii-lucrare');

  try {
    var res  = await fetch('/api/lucrari/' + lucrareId, { credentials: 'include' });
    var data = await res.json();
    if (!res.ok) { contentEl.innerHTML = '<div class="empty"><p>Eroare la încărcare.</p></div>'; return; }

    titleEl.textContent = data.titlu || 'Detalii lucrare';

    var dataPostare = data.creat_la
      ? new Date(data.creat_la).toLocaleDateString('ro-RO', { day:'2-digit', month:'long', year:'numeric' })
      : '';

    contentEl.innerHTML =
      // Badges status
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">'
      + '<span class="badge badge-blue">' + (data.categorie || '') + '</span>'
      + statusBadge(data.status)
      + (data.urgenta ? '<span class="urgenta-tag">⚡ URGENT</span>' : '')
      + '</div>'

      // Grid info
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">'
      + '<div style="background:var(--gray-light);border-radius:var(--r);padding:14px;">'
      + '<div style="font-size:11px;color:var(--gray);font-weight:600;text-transform:uppercase;margin-bottom:6px;">📍 Locație</div>'
      + '<div style="font-size:15px;font-weight:600;color:var(--dark);">' + (data.oras || '') + '</div>'
      + (data.adresa ? '<div style="font-size:12px;color:var(--gray);margin-top:3px;">' + data.adresa + '</div>' : '')
      + '</div>'
      + '<div style="background:var(--gray-light);border-radius:var(--r);padding:14px;">'
      + '<div style="font-size:11px;color:var(--gray);font-weight:600;text-transform:uppercase;margin-bottom:6px;">📅 Data postării</div>'
      + '<div style="font-size:15px;font-weight:600;color:var(--dark);">' + dataPostare + '</div>'
      + '</div>'
      + '</div>'

      // Descriere
      + (data.descriere
        ? '<div style="margin-bottom:20px;">'
          + '<div style="font-size:11px;color:var(--gray);font-weight:600;text-transform:uppercase;margin-bottom:8px;">📝 Descriere</div>'
          + '<div style="font-size:14px;line-height:1.7;color:var(--dark);background:var(--gray-light);padding:14px;border-radius:var(--r);word-break:break-word;overflow-wrap:break-word;">' + data.descriere + '</div>'
          + '</div>'
        : '')

      // Footer
      + '<div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">'
      + '<div style="font-size:12px;color:var(--gray);">📋 ' + (data.oferte ? data.oferte.length : 0) + ' ofert' + ((data.oferte && data.oferte.length === 1) ? 'ă' : 'e') + ' primite</div>'
      + '</div>';

  } catch(e) {
    contentEl.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><p>Eroare la încărcarea detaliilor.</p></div>';
  }
}

async function veziReviewsClient(clientId, numeClient) {
  var titleEl = document.getElementById('reviews-firma-title');
  var listEl  = document.getElementById('reviews-firma-list');
  if (!listEl) return;

  titleEl.textContent = 'Review-uri — ' + numeClient;
  listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);">Se încarcă...</div>';
  openModal('modal-reviews-firma');

  try {
    var reviews = await (await fetch('/api/reviews/client/' + clientId)).json();
    if (!reviews.length) {
      listEl.innerHTML = '<div class="empty"><div class="empty-icon">⭐</div><p>Niciun review public pentru acest client.</p></div>';
      return;
    }
    listEl.innerHTML = reviews.map(function(r) {
      var stele = '';
      for (var i = 1; i <= 5; i++) stele += i <= r.rating_general ? '★' : '☆';
      var data = new Date(r.creat_la).toLocaleDateString('ro-RO', {day:'2-digit', month:'long', year:'numeric'});
      var cats = [];
      if (r.seriozitate)        cats.push({label:'Seriozitate',      val:r.seriozitate});
      if (r.promptitudine)      cats.push({label:'Promptitudine',    val:r.promptitudine});
      if (r.comunicare_client)  cats.push({label:'Comunicare',       val:r.comunicare_client});
      if (r.corectitudine_pret) cats.push({label:'Corectitudine preț', val:r.corectitudine_pret});
      return '<div class="review-card">'
        + '<div class="review-card-header">'
        + '<div>'
        + '<div class="review-autor">🏢 ' + (r.reviewer_nume || 'Firmă verificată') + '</div>'
        + '<div class="review-data">' + data + '</div>'
        + '</div>'
        + '<div style="font-size:20px;color:#F59E0B;letter-spacing:2px;">' + stele + '</div>'
        + '</div>'
        + (r.comentariu ? '<div class="review-comentariu" style="margin-top:10px;font-size:14px;line-height:1.7;">„' + r.comentariu + '"</div>' : '')
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
  const titlu      = document.getElementById('l-titlu').value.trim();
  const descriere  = document.getElementById('l-descriere').value.trim();
  const categorie  = document.getElementById('l-categorie').getAttribute('data-value');
  const judet      = document.getElementById('l-judet').getAttribute('data-value');
  const localitate = document.getElementById('l-localitate').value.trim();
  const adresa     = document.getElementById('l-adresa').value.trim();
  const urgenta    = document.getElementById('l-urgenta').checked;
  showAlert('lucrare-alert', '', '');

  if (!titlu)      { showAlert('lucrare-alert', 'Titlul este obligatoriu.', 'error'); return; }
  if (!categorie)  { showAlert('lucrare-alert', 'Selectează o categorie.', 'error'); return; }
  if (!judet)      { showAlert('lucrare-alert', 'Selectează județul.', 'error'); return; }
  if (!localitate) { showAlert('lucrare-alert', 'Localitatea este obligatorie.', 'error'); return; }
  if (!adresa)     { showAlert('lucrare-alert', 'Strada și numărul sunt obligatorii.', 'error'); return; }

  // Compune oras ca "Județ · Localitate" pentru compatibilitate cu codul existent
  const oras = judet + ' · ' + localitate;

  const res  = await fetch('/api/lucrari', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ titlu, descriere, categorie, oras, adresa, urgenta })
  });
  const data = await res.json();

  if (!res.ok) { showAlert('lucrare-alert', data.error, 'error'); return; }

  closeModal('modal-lucrare');
  showToast('Lucrare postată cu succes! 🎉');
  ['l-titlu','l-descriere','l-localitate','l-adresa'].forEach(id => {
    var el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('l-urgenta').checked = false;
  initOrasSelect('l-judet', false);
  _refreshClient();
}

// ============================================================
//  COORDONATE JUDETE + CALCUL DISTANTA
// ============================================================
var JUDETE_COORDS = {
  'Alba':             [46.0737, 23.5803],
  'Arad':             [46.1667, 21.3167],
  'Argeș':            [44.8565, 24.8698],
  'Bacău':            [46.5670, 26.9146],
  'Bihor':            [47.0458, 21.9189],
  'Bistrița-Năsăud':  [47.1333, 24.5000],
  'Botoșani':         [47.7333, 26.6667],
  'Brașov':           [45.6427, 25.5887],
  'Brăila':           [45.2692, 27.9574],
  'București':        [44.4268, 26.1025],
  'Buzău':            [45.1500, 26.8333],
  'Caraș-Severin':    [45.2984, 21.8933],
  'Călărași':         [44.2000, 27.3333],
  'Cluj':             [46.7712, 23.6236],
  'Constanța':        [44.1598, 28.6348],
  'Covasna':          [45.8524, 26.1882],
  'Dâmbovița':        [44.9333, 25.4500],
  'Dolj':             [44.3302, 23.7949],
  'Galați':           [45.4353, 28.0080],
  'Giurgiu':          [43.9037, 25.9699],
  'Gorj':             [45.0500, 23.2833],
  'Harghita':         [46.3500, 25.8000],
  'Hunedoara':        [45.7489, 22.9022],
  'Ialomița':         [44.5667, 27.3833],
  'Iași':             [47.1585, 27.6014],
  'Ilfov':            [44.4500, 26.1167],
  'Maramureș':        [47.6597, 23.5688],
  'Mehedinți':        [44.6333, 22.6500],
  'Mureș':            [46.5439, 24.5575],
  'Neamț':            [46.9333, 26.3667],
  'Olt':              [44.4333, 24.3667],
  'Prahova':          [44.9440, 26.0127],
  'Satu Mare':        [47.7833, 22.8833],
  'Sălaj':            [47.2000, 23.0667],
  'Sibiu':            [45.7983, 24.1256],
  'Suceava':          [47.6333, 26.2500],
  'Teleorman':        [43.9833, 25.3167],
  'Timiș':            [45.7597, 21.2300],
  'Tulcea':           [45.1833, 28.8000],
  'Vâlcea':           [45.1000, 24.3667],
  'Vaslui':           [46.6333, 27.7333],
  'Vrancea':          [45.7000, 27.1833],
  'Sector 1':         [44.4668, 26.0686],
  'Sector 2':         [44.4500, 26.1300],
  'Sector 3':         [44.4200, 26.1500],
  'Sector 4':         [44.3900, 26.1200],
  'Sector 5':         [44.4000, 26.0700],
  'Sector 6':         [44.4300, 26.0300],
};

function calcDistantaKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2)
        + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180)
        * Math.sin(dLon/2) * Math.sin(dLon/2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function getJudetDinOras(orasStr) {
  // "Giurgiu · Giurgiu" sau "București · Sector 6" — extragem primul token
  if (!orasStr) return null;
  var parts = orasStr.split(/[·\-,]/);
  var judet = parts[0].trim();
  // Verificam si sectoarele Bucuresti
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p.startsWith('Sector')) return p;
    if (JUDETE_COORDS[p]) return p;
  }
  return JUDETE_COORDS[judet] ? judet : null;
}

function avertismentDistanta(lucrareOras, firmaOras, razaKm) {
  var jLucrare = getJudetDinOras(lucrareOras);
  var jFirma   = getJudetDinOras(firmaOras);
  if (!jLucrare || !jFirma) return '';
  if (jLucrare === jFirma) return ''; // acelasi judet, fara avertisment
  var cL = JUDETE_COORDS[jLucrare];
  var cF = JUDETE_COORDS[jFirma];
  if (!cL || !cF) return '';
  var dist = calcDistantaKm(cF[0], cF[1], cL[0], cL[1]);
  if (dist <= razaKm) return ''; // in raza, fara avertisment
  return '<div style="background:#FEF9C3;border:1px solid #FDE047;border-radius:8px;'
    + 'padding:8px 12px;margin-top:8px;display:flex;align-items:center;gap:8px;">'
    + '<span style="font-size:16px;">⚠️</span>'
    + '<span style="font-size:12px;color:#854D0E;">'
    + 'Lucrarea se află la aprox. <strong>' + dist + ' km</strong> față de sediul tău'
    + ' — în afara razei de acoperire de <strong>' + razaKm + ' km</strong>.'
    + '</span>'
    + '</div>';
}

// ============================================================
//  FIRMA DASHBOARD
// ============================================================
async function loadFirmaDashboard() {
  const me = await (await fetch('/api/me', { credentials: 'include', cache: 'no-store' })).json();
  if (!me.loggedIn) return;
  currentUser = me.user;

  // Marcheaza contraofertele ca vazute cand se deschide dashboard-ul firmei
  fetch('/api/marcheaza-citit', { method: 'POST' })
    .then(() => { ultimeleNecitite=-1; verificaMesaje(); })
    .catch(() => {});

  const profil = await (await fetch('/api/profil-firma', { credentials: 'include' })).json();
  window._firmaProfilCurent = profil; // stocat pentru calcul distanta
  document.getElementById('firma-salut').textContent = profil.nume_firma || me.user.nume_complet;
  document.getElementById('firma-sub').textContent   = `${profil.categorie} · ${profil.oras} · Rază: ${profil.raza_km} km`;

  const oferte  = await (await fetch('/api/ofertele-mele', { credentials: 'include', cache: 'no-store' })).json();
  const lucrari = await (await fetch('/api/lucrari', { credentials: 'include', cache: 'no-store' })).json();

  document.getElementById('firma-stats').innerHTML = `
    <div class="stat-box"><div class="stat-val">${lucrari.length}</div><div class="stat-lbl">Lucrări disponibile</div></div>
    <div class="stat-box"><div class="stat-val">${oferte.length}</div><div class="stat-lbl">Ofertele mele</div></div>
    <div class="stat-box"><div class="stat-val">${profil.rating_mediu || '—'}</div><div class="stat-lbl">Rating mediu ★</div></div>
  `;
  await loadLucrariPentruFirma();
}

function firmaTab(tab, btn) {
  document.querySelectorAll('#page-firma .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('firma-tab-lucrari').style.display = tab === 'lucrari' ? 'block' : 'none';
  document.getElementById('firma-tab-oferte').style.display  = tab === 'oferte'  ? 'block' : 'none';
  if (tab === 'oferte') loadOferteMele();
}

async function loadLucrariPentruFirma() {
  const cat  = document.getElementById('firma-filter-cat').getAttribute('data-value');
  const oras = document.getElementById('firma-filter-oras').getAttribute('data-value');
  const params = new URLSearchParams();
  if (cat)  params.set('categorie', cat);
  if (oras) params.set('oras', oras);

  const lucrari = await (await fetch('/api/lucrari?' + params, { credentials: 'include', cache: 'no-store' })).json();
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

    // Afiseaza doar prenumele inainte de acceptare, numele complet dupa
    var numeAfisat = (l.oferta_mea_status === 'acceptata' || l.status === 'in_lucru' || l.status === 'finalizata')
      ? l.client_nume
      : (l.client_nume || '').split(' ')[0] + ' ***';

    var eAcceptata = l.oferta_mea_status === 'acceptata' || l.status === 'in_lucru';
    var cardStyle = eAcceptata
      ? ' style="border:2px solid #16A34A;background:#F0FDF4;"'
      : '';

    return '<div class="card-sm"' + cardStyle + '>'
      + '<div class="lucrare-header"><div style="flex:1;">'
      + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'
      + '<div class="lucrare-title" style="margin:0;font-size:17px;font-weight:700;line-height:1.4;padding-bottom:2px;">' + l.titlu + '</div>'
      + badgeOferte
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<span style="background:#EFF6FF;color:#1D4ED8;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">&#128205; ' + (l.oras ? l.oras.split(/[··\-]/)[0].trim() : '') + '</span>'
      + '<span style="background:#F0FDF4;color:#166534;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">' + l.categorie + '</span>'
      + statusBadge(l.status)
      + (l.urgenta ? '<span class="urgenta-tag">&#9889; URGENT</span>' : '')
      + '</div>'
      + (function() {
          var p = window._firmaProfilCurent;
          return p ? avertismentDistanta(l.oras, p.oras, p.raza_km) : '';
        }())
      + '<div style="background:var(--gray-light);border-radius:8px;padding:10px 12px;margin-top:10px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      + '<div style="font-size:12px;font-weight:600;color:var(--dark);margin-bottom:4px;">&#128100; Client</div>'
      + '<div style="font-size:13px;color:var(--dark);">' + numeAfisat + '</div>'
      + (l.oferta_mea_status === 'acceptata' || l.status === 'in_lucru' || l.status === 'finalizata'
        ? '<div style="font-size:12px;color:var(--blue);margin-top:2px;">&#9993; ' + (l.client_email||'') + '</div>'
          + (l.client_telefon ? '<div style="font-size:12px;color:var(--green);margin-top:2px;">📞 ' + l.client_telefon + '</div>' : '')
        : '<div style="font-size:11px;color:var(--gray);margin-top:3px;font-style:italic;">🔒 Date vizibile după acceptarea ofertei</div>'
      )
      + (dataPostare ? '<div style="font-size:11px;color:var(--gray);margin-top:2px;">&#128336; Postat: ' + dataPostare + '</div>' : '')
      + '</div>'
      + '<div id="rating-client-luc-' + l.id + '" style="text-align:right;">'
      + '<div style="font-size:11px;color:var(--gray);">Rating client</div>'
      + '<div style="font-size:11px;color:var(--gray);">Se încarcă...</div>'
      + '</div>'
      + '<button onclick="veziReviewsClient(' + l.client_id + ',\'' + (l.client_nume||'').replace(/'/g,"\\'") + '\')" '
      + 'style="font-size:11px;color:var(--amber);background:var(--amber-light);border:none;cursor:pointer;padding:3px 8px;border-radius:10px;">⭐ Reviews</button>'
      + '<button onclick="deschideDetaliiLucrare(' + l.id + ')" '
      + 'style="font-size:11px;color:var(--blue);background:var(--blue-light);border:none;cursor:pointer;padding:3px 8px;border-radius:10px;">📋 Detalii</button>'
      + '</div>'
      + '</div>'
      + '</div></div>'
      + (eAcceptata && l.status !== 'finalizata'
        ? '<div style="background:#DCFCE7;border:1px solid #16A34A;border-radius:8px;padding:10px 14px;margin-top:10px;display:flex;align-items:center;gap:10px;">'
          + '<span style="font-size:20px;">🎉</span>'
          + '<div>'
          + '<div style="font-size:13px;font-weight:700;color:#15803D;">Oferta ta a fost acceptată!</div>'
          + '<div style="font-size:12px;color:#166534;margin-top:2px;">Lucrarea a început — contactează clientul pentru detalii.</div>'
          + '</div>'
          + '</div>'
        : '')
      + '<div class="lucrare-actions">'
      + (l.status === 'finalizata'
          ? '<span class="badge badge-green">&#10003; Lucrare finalizată</span>'
          : l.status === 'in_lucru'
            ? ''
            : (l.oferta_mea_status === 'trimisa' || l.oferta_mea_status === 'negociere')
              ? '<span class="badge badge-blue">&#10003; Ofertă trimisă</span>'
              : l.oferta_mea_status === 'refuzata'
                ? '<button class="btn btn-primary btn-sm" onclick="deschideModalOfertaById(' + l.id + ')">↩ Retrimite ofertă</button>'
                  + ' <span style="font-size:11px;color:var(--gray);">Oferta anterioară a fost refuzată</span>'
                : '<button class="btn btn-primary btn-sm" onclick="deschideModalOfertaById(' + l.id + ')">Trimite ofertă</button>'
        )
      + '</div>'
      + '</div>';
  }).join('');

  // Incarca ratingul fiecarui client (async, dupa randare)
  lucrari.forEach(function(l) {
    incarcaRatingClient(l.client_id, l.id);
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
      var firmaAInitiatOferta = _bitVal(o.firma_a_initiat) === 1;

      // Box contraoferta
      var contraBox = document.createElement('div');
      contraBox.className = 'contraoferta-box';
      if (firmaAInitiatOferta) {
        contraBox.style.cssText = 'background:#F0FDF4;border-color:#86EFAC;color:#166534;';
        contraBox.innerHTML = '🏢 Tu propui: <strong>' + o.pret_contraoferta + ' lei</strong>'
          + (o.mesaj_contraoferta ? ' — "' + o.mesaj_contraoferta + '"' : '');
      } else {
        contraBox.innerHTML = '👤 Clientul propune: <strong>' + o.pret_contraoferta + ' lei</strong>'
          + (o.mesaj_contraoferta ? ' — "' + o.mesaj_contraoferta + '"' : '');
      }
      actiuniDiv.appendChild(contraBox);

      var btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;';

      if (firmaAInitiatOferta) {
        // Firma a trimis contraoferta - asteapta raspunsul clientului
        var badgeAsteapta = document.createElement('span');
        badgeAsteapta.className = 'badge-negociere';
        badgeAsteapta.textContent = '⏳ Contraofertă trimisă — aștepți răspuns';
        btnRow.appendChild(badgeAsteapta);
        var btnChatF2 = document.createElement('button');
        btnChatF2.className = 'btn btn-primary btn-sm';
        btnChatF2.textContent = '💬 Chat';
        btnChatF2.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);
        btnRow.appendChild(btnChatF2);
      } else {
        // Clientul a trimis contraoferta - firma poate accepta, negocia sau refuza
        var btnAccepta = document.createElement('button');
        btnAccepta.className = 'btn btn-green btn-sm';
        btnAccepta.textContent = '✓ Acceptă ' + o.pret_contraoferta + ' lei';
        btnAccepta.onclick = (function(id){ return function(){ acceptaContraoferta(id); }; })(o.id);

        var btnNegoc = document.createElement('button');
        btnNegoc.className = 'btn btn-sm';
        btnNegoc.style.cssText = 'background:#D97706;color:#fff;border-color:#D97706;';
        btnNegoc.textContent = '⇕ Negociază';
        var panelId = 'negoc-' + o.id;
        btnNegoc.onclick = (function(pid){ return function(){ toggleNegocPanel(pid); }; })(panelId);

        var btnChat = document.createElement('button');
        btnChat.className = 'btn btn-primary btn-sm';
        btnChat.textContent = '💬 Chat';
        btnChat.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);

        btnRow.appendChild(btnAccepta);
        btnRow.appendChild(btnNegoc);
        btnRow.appendChild(btnChat);
      }
      actiuniDiv.appendChild(btnRow);

      // Mini-panel negociere (doar cand clientul a initiat)
      if (!firmaAInitiatOferta) {
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
      } // end if(!firmaAInitiatOferta)

    } else {
      // Status normal
      var statusRow = document.createElement('div');
      statusRow.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;';
      statusRow.innerHTML = statusBadge(o.status);

      if (o.status === 'trimisa') {
        // Firma poate retrage oferta trimisa
        var btnRetrage = document.createElement('button');
        btnRetrage.className = 'btn btn-danger btn-sm';
        btnRetrage.textContent = '✗ Retrage oferta';
        btnRetrage.onclick = (function(id){ return function(){
          confirmCustom(
            'Ești sigur că vrei să retragi această ofertă?',
            'Retrage ofertă', '⚠️',
            function() {
              fetch('/api/oferte/' + id + '/refuza', { method:'PATCH' })
                .then(function(r){ return r.json(); })
                .then(function(d){
                  if (d.success !== false) { showToast('Ofertă retrasă.'); _refreshFirmaOferte(); }
              });
            }
          );
        }; })(o.id);
        statusRow.appendChild(btnRetrage);

        var btnChat2 = document.createElement('button');
        btnChat2.className = 'btn btn-primary btn-sm';
        btnChat2.textContent = '💬 Chat';
        btnChat2.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);
        statusRow.appendChild(btnChat2);

      } else if (o.status === 'acceptata') {
        var btnChat3 = document.createElement('button');
        btnChat3.className = 'btn btn-primary btn-sm';
        btnChat3.textContent = '💬 Chat';
        btnChat3.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);
        statusRow.appendChild(btnChat3);

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
      } else {
        var btnChat4 = document.createElement('button');
        btnChat4.className = 'btn btn-primary btn-sm';
        btnChat4.textContent = '💬 Chat';
        btnChat4.onclick = (function(id){ return function(){ deschideChatById(id); }; })(o.id);
        statusRow.appendChild(btnChat4);
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
    _refreshFirmaOferte();
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

  confirmCustom(
    'Ești sigur că vrei să refuzi contraoferta? Clientul va fi notificat că menții prețul original.',
    'Refuză contraoferta', '❌',
    async function() {
      const res  = await fetch('/api/oferte/' + ofertaId + '/refuza-contraoferta', { method: 'PATCH' });
      const data = await res.json();
      if (res.ok) {
        showToast('Contraofertă refuzată. Clientul a fost notificat. ↩');
        _refreshFirmaOferte();
      } else {
        alert(data.error);
      }
    }
  );
}
// ===== SFARSIT FUNCTII NEGOCIERE FIRMA =====

function deschideModalOferta(lucrareId, titlu) {
  document.getElementById('o-lucrare-id').value = lucrareId;
  document.getElementById('oferta-lucrare-info').textContent = '📋 Lucrare: ' + titlu;
  showAlert('oferta-alert', '', '');
  ['o-pret','o-descriere'].forEach(id => { var el = document.getElementById(id); if(el) el.value = ''; });

  // Reset selector disponibilitate
  document.getElementById('disp-trigger-text').textContent = 'Selectează perioada →';
  document.getElementById('disp-trigger-text').style.color = 'var(--gray)';
  var triggerBtn = document.getElementById('disp-trigger-btn');
  triggerBtn.classList.remove('has-value');
  delete triggerBtn.dataset.dela;
  delete triggerBtn.dataset.panala;
  var dataDela   = document.getElementById('disp-data-dela');
  var dataPanala = document.getElementById('disp-data-panala');
  if (dataDela)   dataDela.value   = '';
  if (dataPanala) dataPanala.value = '';
  updateDispPreview();

  openModal('modal-oferta');
}

async function trimiteOferta() {
  const lucrare_id  = document.getElementById('o-lucrare-id').value;
  const pret        = document.getElementById('o-pret').value;
  const descriere   = document.getElementById('o-descriere').value.trim();
  const triggerBtn  = document.getElementById('disp-trigger-btn');
  const dela        = triggerBtn?.dataset.dela   || '';
  const panala      = triggerBtn?.dataset.panala || '';
  showAlert('oferta-alert', '', '');

  if (!pret || pret <= 0) {
    showAlert('oferta-alert', 'Introdu un preț valid.', 'error'); return;
  }
  if (!dela || !panala) {
    showAlert('oferta-alert', 'Disponibilitatea este obligatorie — selectează perioada.', 'error');
    if (triggerBtn) {
      triggerBtn.style.borderColor = '#DC2626';
      setTimeout(function() { triggerBtn.style.borderColor = ''; }, 3000);
    }
    return;
  }

  // Verifica ca data de inceput sa nu fie in trecut
  var acum = new Date();
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var acumStr = acum.getFullYear() + '-' + pad(acum.getMonth()+1) + '-' + pad(acum.getDate())
    + ' ' + pad(acum.getHours()) + ':' + pad(acum.getMinutes());
  var delaStr   = dela.replace('T', ' ').substring(0, 16);
  var panalaStr = panala.replace('T', ' ').substring(0, 16);

  if (delaStr < acumStr) {
    showAlert('oferta-alert', 'Data de început nu poate fi în trecut.', 'error');
    return;
  }

  if (panalaStr <= delaStr) {
    showAlert('oferta-alert', 'Data de sfârșit trebuie să fie după data de început.', 'error');
    return;
  }

  // Trimite datetime ca ora locala (fara conversie UTC)
  // Adaugam offsetul de timezone ca sa SQL Server salveze ora locala
  function localDatetimeStr(isoStr) {
    if (!isoStr) return null;
    // isoStr e 'YYYY-MM-DDTHH:mm:ss' din input date+select
    // Returnam 'YYYY-MM-DD HH:mm:00' — fara T, fara Z
    return isoStr.replace('T', ' ').substring(0, 16) + ':00';
  }

  const res  = await fetch('/api/oferte', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ lucrare_id, pret, descriere_oferta: descriere,
      disponibilitate_de_la:   localDatetimeStr(dela),
      disponibilitate_pana_la: localDatetimeStr(panala) })
  });
  const data = await res.json();

  if (!res.ok) { showAlert('oferta-alert', data.error, 'error'); return; }

  closeModal('modal-oferta');
  showToast('Ofertă trimisă cu succes! 📤');
  _refreshFirmaOferte();
}

// ===== MODIFICARE 3: Funcții complete pentru popup disponibilitate =====

// Generează opțiunile de ore în ambele selectoare (00:00 - 23:00)
function initDispSelectors() {
  // Populeaza selectoarele de ora (00:00 - 23:00)
  var ore = [];
  for (var h = 0; h < 24; h++) ore.push(String(h).padStart(2,'0') + ':00');
  var oraDela   = document.getElementById('disp-ora-dela');
  var oraPanala = document.getElementById('disp-ora-panala');
  if (oraDela && !oraDela.options.length) {
    oraDela.innerHTML   = ore.map(function(o){ return '<option value="' + o + '">' + o + '</option>'; }).join('');
    oraPanala.innerHTML = ore.map(function(o){ return '<option value="' + o + '">' + o + '</option>'; }).join('');
    oraDela.value   = '08:00';
    oraPanala.value = '17:00';
  }
  // Seteaza data minima la azi
  var azi = new Date().toISOString().split('T')[0];
  var dataDela   = document.getElementById('disp-data-dela');
  var dataPanala = document.getElementById('disp-data-panala');
  if (dataDela)   dataDela.min   = azi;
  if (dataPanala) dataPanala.min = azi;
}

function deschideDispPopup() {
  initDispSelectors();
  document.getElementById('disp-popup-overlay').classList.add('open');
  updateDispPreview();
}

function inchideDispPopup() {
  document.getElementById('disp-popup-overlay').classList.remove('open');
}

function toggleZi(el) { /* compatibilitate */ }

function updateDispPreview() {
  var dataDela   = document.getElementById('disp-data-dela')?.value;
  var oraDela    = document.getElementById('disp-ora-dela')?.value   || '08:00';
  var dataPanala = document.getElementById('disp-data-panala')?.value;
  var oraPanala  = document.getElementById('disp-ora-panala')?.value || '17:00';
  var preview    = document.getElementById('disp-preview-text');
  var confirmBtn = document.getElementById('disp-confirm-btn');

  if (!dataDela || !dataPanala) {
    preview.textContent = 'Selectează perioada pentru a vedea rezultatul';
    preview.className   = 'disp-preview empty';
    confirmBtn.disabled = true;
    return;
  }

  // Construieste datetime strings: YYYY-MM-DDTHH:00
  var delaISO   = dataDela   + 'T' + oraDela   + ':00';
  var panalaISO = dataPanala + 'T' + oraPanala + ':00';

  // Valideaza: pana la > de la
  if (panalaISO <= delaISO) {
    preview.textContent = '⚠️ Data de sfârșit trebuie să fie după data de început!';
    preview.className   = 'disp-preview empty';
    confirmBtn.disabled = true;
    return;
  }

  function fmt(data, ora) {
    var d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('ro-RO', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + ora;
  }

  var rezultat = fmt(dataDela, oraDela) + ' → ' + fmt(dataPanala, oraPanala);
  preview.innerHTML   = '🕐 <strong>' + rezultat + '</strong>';
  preview.className   = 'disp-preview';
  confirmBtn.disabled = false;
  confirmBtn.dataset.dela   = delaISO;
  confirmBtn.dataset.panala = panalaISO;
  confirmBtn.dataset.valoare = rezultat;
}

function confirmaDisponibilitate() {
  var btn     = document.getElementById('disp-confirm-btn');
  var valoare = btn.dataset.valoare;
  var dela    = btn.dataset.dela;
  var panala  = btn.dataset.panala;
  if (!valoare) return;

  document.getElementById('disp-trigger-text').textContent = '🕐 ' + valoare;
  document.getElementById('disp-trigger-text').style.color = 'var(--blue)';
  var triggerBtn = document.getElementById('disp-trigger-btn');
  triggerBtn.classList.add('has-value');
  triggerBtn.dataset.dela   = dela;
  triggerBtn.dataset.panala = panala;
  inchideDispPopup();
}

// Închide popup-ul la click pe overlay
document.getElementById('disp-popup-overlay').addEventListener('click', function(e) {
  if (e.target === this) inchideDispPopup();
});

// ============================================================
//  HELPERS
// ============================================================
function fmtDatetime(dtStr) {
  if (!dtStr) return '';
  var s = String(dtStr).replace('T', ' ').replace('Z', '').substring(0, 16);
  var parts = s.split(' ');
  var dateParts = (parts[0] || '').split('-');
  if (dateParts.length === 3) {
    var dataFmt = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];
    // Afisam ora doar daca exista si nu e 00:00
    var ora = parts[1] || '';
    if (ora && ora !== '00:00') {
      return dataFmt + ' ' + ora;
    }
    return dataFmt;
  }
  return s;
}

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

var _toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast-msg');
  if (!el) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(-50%) translateY(0)';
  _toastTimer = setTimeout(function() {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
  }, 3000);
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  el.className = 'alert';
  if (!msg) return;
  el.classList.add('show', type === 'error' ? 'alert-error' : 'alert-success');
  el.textContent = msg;
}

// Helper: SQL Server returneaza campurile BIT ca Array sau object
// Aceasta functie extrage valoarea corecta indiferent de format
function _bitVal(v) {
  if (v === null || v === undefined) return 0;
  if (Array.isArray(v)) return v[0] ? 1 : 0;
  if (typeof v === 'object' && v !== null) {
    // mssql poate returna { value: 1 } sau similar
    if ('value' in v) return v.value ? 1 : 0;
    // Incearca primul element
    var keys = Object.keys(v);
    if (keys.length > 0) return v[keys[0]] ? 1 : 0;
    return 0;
  }
  return parseInt(v) || 0;
}

// ── Confirm custom (inlocuieste native confirm() care blocheaza iOS) ──
function confirmCustom(mesaj, titlu, iconita, callback) {
  document.getElementById('confirm-msg').textContent   = mesaj;
  document.getElementById('confirm-title').textContent = titlu || 'Ești sigur?';
  document.getElementById('confirm-icon').textContent  = iconita || '⚠️';
  var btn = document.getElementById('confirm-ok-btn');
  btn.textContent = 'Confirmă';
  // Verde pentru actiuni pozitive, rosu pentru actiuni distructive
  var icoane_pozitive = ['✅', '✔️', '👍', '🎉'];
  if (icoane_pozitive.includes(iconita)) {
    btn.style.background = '#16A34A';
    btn.style.borderColor = '#16A34A';
  } else {
    btn.style.background = '';
    btn.style.borderColor = '';
  }
  btn.onclick = function() {
    closeModal('modal-confirm');
    callback();
  };
  openModal('modal-confirm');
}

function openModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.display = 'flex'; // forteaza display inainte de clasa (fix iOS)
  el.classList.add('open');
  document.body.style.overflow = 'hidden'; // previne scroll in spate pe mobile
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  el.style.display = '';
  document.body.style.overflow = '';
}

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
  if (pageName === 'mesaje')   loadConversatii();
  if (pageName === 'cont')     incarcaDateCont();
  if (pageName === 'client')   loadClientDashboard();
  if (pageName === 'firma')    loadFirmaDashboard();
  if (pageName === 'register') selectTip('client');
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
  _updateBackBtn(pageName);
}

// Actualizeaza vizibilitatea butonului back pe mobil
function _updateBackBtn(pageName) {
  var btn = document.getElementById('btn-back-mobile');
  if (!btn) return;
  var paginiFaraBack = ['home', 'login', 'register'];
  if (!paginiFaraBack.includes(pageName)) {
    btn.classList.add('visible');
  } else {
    btn.classList.remove('visible');
  }
}

// Functia de back
function goBack() {
  if (window.history.length > 1) {
    window.history.back();
    // Dupa ce back-ul s-a executat, verificam ce pagina e activa si actualizam butonul
    setTimeout(function() {
      var paginaActiva = document.querySelector('.page.active');
      if (paginaActiva) {
        var pageName = paginaActiva.id.replace('page-', '');
        _updateBackBtn(pageName);
      }
    }, 100);
  } else {
    navigaLa(currentUser ? (currentUser.tip === 'firma' ? 'firma' : 'client') : 'home');
  }
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
function _closeDropdownsOutside(e) {
  var wrap = document.getElementById('nav-user-wrap');
  if (wrap && !wrap.contains(e.target)) closeDropdown();
  var bellWrap = document.getElementById('nav-bell-wrap');
  if (bellWrap && !bellWrap.contains(e.target)) closeNotifDropdown();
}
document.addEventListener('click', _closeDropdownsOutside);
document.addEventListener('touchstart', _closeDropdownsOutside, { passive: true });

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

    // Incarca telefonul
    if (u.telefon_prefix) setPrefixValue('cont', u.telefon_prefix);
    var nrEl = document.getElementById('cont-telefon-nr');
    if (nrEl && u.telefon) {
      var nr = u.telefon.replace(u.telefon_prefix || '', '').trim();
      // Elimina 0-ul de la inceput daca exista (format vechi)
      if (nr.startsWith('0')) nr = nr.substring(1);
      nrEl.value = nr;
    }

    document.getElementById('cont-nume-display').textContent  = u.nume_complet || '';
    document.getElementById('cont-email-display').textContent = u.email || '';

    var modActiv = currentUser.mod_activ || u.tip_cont;
    var badgeText = u.tip_cont === 'ambele'
      ? (modActiv === 'client' ? 'Client' : 'Firmă')
      : (u.tip_cont === 'firma' ? 'Firmă' : 'Client');
    document.getElementById('cont-tip-display').innerHTML =
      '<span class="badge badge-blue">' + badgeText + '</span>';

    var initial = (u.nume_complet || 'U').charAt(0).toUpperCase();
    ['cont-avatar-large','nav-avatar'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = initial;
    });

    // Sectiune firma in TAB-ul Detalii firma
    var _tipCont = u.tip_cont;
    if (_tipCont === 'firma' || _tipCont === 'ambele') {
      // Are firma — arata detalii + zone, ascunde butonul de activare
      var _sf = document.getElementById('cont-sectiune-firma');
      var _activ = document.getElementById('cont-sectiune-activeaza-firma');
      var _form  = document.getElementById('cont-formular-activare-firma');
      if (_sf)    _sf.style.display = 'block';
      if (_activ) _activ.style.display = 'none';
      if (_form)  _form.style.display  = 'none';
      incarcaDateFirmaCont();
      // Sidebar: arata "Detalii firma" + "Zone activitate", ascunde "Activeaza"
      var _snavActiv = document.getElementById('snav-activeaza-firma');
      var _snavFirma = document.getElementById('snav-firma');
      var _snavZone  = document.getElementById('snav-zone');
      if (_snavActiv) _snavActiv.style.display = 'none';
      if (_snavFirma) _snavFirma.style.display = 'flex';
      if (_snavZone)  _snavZone.style.display  = 'flex';
    } else {
      // Nu are firma — arata doar butonul de activare
      var _sf2   = document.getElementById('cont-sectiune-firma');
      var _activ2 = document.getElementById('cont-sectiune-activeaza-firma');
      if (_sf2)    _sf2.style.display = 'none';
      if (_activ2) _activ2.style.display = 'block';
      // Sidebar: ascunde "Detalii firma" + "Zone activitate", arata "Activeaza"
      var _snavActiv2 = document.getElementById('snav-activeaza-firma');
      var _snavFirma2 = document.getElementById('snav-firma');
      var _snavZone2  = document.getElementById('snav-zone');
      if (_snavActiv2) _snavActiv2.style.display = 'flex';
      if (_snavFirma2) _snavFirma2.style.display = 'none';
      if (_snavZone2)  _snavZone2.style.display  = 'none';
    }

    // Actualizeaza butonul de switch si tabul activ
    actualizeazaCardSwitch(currentUser);
    // Arata optiunea de stergere firma doar daca are firma
    var _cardStergeFirma = document.getElementById('stergere-doar-firma');
    if (_cardStergeFirma) {
      _cardStergeFirma.style.display = (u.tip_cont === 'firma' || u.tip_cont === 'ambele') ? 'block' : 'none';
    }
    setContTab('profil');
  } catch(e) { console.error('Eroare incarcare cont:', e); }
}

async function incarcaDateFirmaCont() {
  try {
    const res  = await fetch('/api/profil-firma');
    const data = await res.json();
    if (!data || data.error) return;
    document.getElementById('cont-nume-firma').value  = data.nume_firma  || '';
    initCategorieSelect('cont-categorie', false, data.categorie || 'General');
    // Reinitializeaza select-ul cu orasul pre-selectat
    initOrasSelect('cont-oras-firma-select', false, data.oras || '');
    document.getElementById('cont-raza').value        = data.raza_km     || 50;
    document.getElementById('cont-telefon').value     = data.telefon     || '';
    document.getElementById('cont-descriere').value   = data.descriere   || '';
    initZoneActivitate(data.zone_activitate || '');
  } catch(e) {}
}

async function salveazaProfil() {
  var prenume  = document.getElementById('cont-prenume').value.trim();
  var numeF    = document.getElementById('cont-nume').value.trim();
  var email    = document.getElementById('cont-email').value.trim();
  var prefix   = document.getElementById('cont-telefon-prefix')?.value || '+40';
  var telefonNr = document.getElementById('cont-telefon-nr')?.value.trim();
  showAlert('cont-alert-profil', '', '');

  if (!prenume || !numeF) { showAlert('cont-alert-profil', 'Prenumele şi numele sunt obligatorii.', 'error'); return; }
  if (!email)             { showAlert('cont-alert-profil', 'Emailul este obligatoriu.', 'error'); return; }
  var telValidare2 = validatePhone('cont-telefon-nr', 'cont-telefon-prefix');
  if (!telValidare2.valid) {
    showAlert('cont-alert-profil', telValidare2.mesaj, 'error');
    return;
  }

  var telefon = prefix + ' ' + telefonNr;

  const res  = await fetch('/api/cont/profil', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prenume, nume: numeF, email, telefon, telefon_prefix: prefix })
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
  var categorie = document.getElementById('cont-categorie').getAttribute('data-value');
  var oras      = document.getElementById('cont-oras-firma-select').getAttribute('data-value');
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

async function stergeDoarFirma() {
  var parola = document.getElementById('stergere-firma-parola').value;
  showAlert('stergere-firma-alert', '', '');
  if (!parola) { showAlert('stergere-firma-alert', 'Introdu parola pentru confirmare.', 'error'); return; }

  const res  = await fetch('/api/cont/sterge-firma', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parola })
  });
  const data = await res.json();
  if (res.ok) {
    closeModal('modal-stergere-firma');
    currentUser.tip_cont  = 'client';
    currentUser.mod_activ = 'client';
    showToast('Contul de firmă a fost șters. Contul de client rămâne activ.');
    actualizeazaSwitchDropdown(currentUser);
    actualizezaButoaneleHero(currentUser);
    await incarcaDateCont();
    setContTab('profil');
  } else {
    showAlert('stergere-firma-alert', data.error || 'Parolă incorectă.', 'error');
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

// ── Zone activitate pentru FORMULARUL DE ACTIVARE FIRMA ──────
var _zoneActivSelectate = [];

function randeazaZoneActivSelectate() {
  var container = document.getElementById('activ-zone-selectate');
  var hidden    = document.getElementById('activ-zone-value');
  if (!container) return;
  container.innerHTML = _zoneActivSelectate.map(function(j) {
    return '<span class="judet-tag">' + j
      + '<button type="button" onclick="stergeZonaActiv(\'' + j + '\')">&#10005;</button>'
      + '</span>';
  }).join('');
  if (hidden) hidden.value = _zoneActivSelectate.join(',');
}

function stergeZonaActiv(judet) {
  _zoneActivSelectate = _zoneActivSelectate.filter(function(j) { return j !== judet; });
  randeazaZoneActivSelectate();
}

function adaugaZonaActiv(judet) {
  if (!_zoneActivSelectate.includes(judet)) {
    _zoneActivSelectate.push(judet);
    randeazaZoneActivSelectate();
  }
  var input = document.getElementById('activ-zone-input');
  if (input) input.value = '';
  ascundeSugestiiActiv();
}

function filtreazaJudeteActiv(query) {
  var sugestii = document.getElementById('activ-zone-sugestii');
  if (!sugestii) return;
  if (!query || query.length < 1) { ascundeSugestiiActiv(); return; }
  var q = query.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
  var matches = JUDETE_RO.filter(function(j) {
    var jNorm = j.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
    return jNorm.startsWith(q) && !_zoneActivSelectate.includes(j);
  });
  if (!matches.length) { ascundeSugestiiActiv(); return; }
  sugestii.innerHTML = matches.map(function(j) {
    var highlighted = '<strong>' + j.substring(0, query.length) + '</strong>' + j.substring(query.length);
    return '<div class="judet-sugestie" onmousedown="adaugaZonaActiv(\'' + j + '\')">' + highlighted + '</div>';
  }).join('');
  sugestii.style.display = 'block';
}

function arataSugestiiActiv() {
  var input = document.getElementById('activ-zone-input');
  if (input && input.value.length > 0) filtreazaJudeteActiv(input.value);
}

function ascundeSugestiiActiv() {
  var sugestii = document.getElementById('activ-zone-sugestii');
  if (sugestii) sugestii.style.display = 'none';
}

// ============================================================
//  ORAȘE ROMÂNIA — dropdown standardizat
// ============================================================
var CATEGORII_RO = [
  'Construcții și renovări',
  'Instalații',
  'Electricitate și automatizări',
  'Tâmplărie și geamuri',
  'Curățenie',
  'Climatizare și ventilație',
  'Grădinărit și amenajări exterioare',
  'Mutări și transport',
  'Deratizare și dezinfecție',
  'Lăcătușerie',
  'Mobilă la comandă',
  'General'
].sort(function(a,b){ return a.localeCompare(b,'ro'); });

function initCategorieSelect(id, withAll, selected) {
  var trigger = document.getElementById(id);
  var dd = document.getElementById(id + '-dd');
  if (!trigger || !dd) return;

  var opts = '';
  if (withAll) {
    opts += '<div class="custom-select-option placeholder-opt" data-value="" onclick="selectCustomOption(\'' + id + '\', \'\', \'Toate categoriile\')">Toate categoriile</div>';
  } else {
    opts += '<div class="custom-select-option placeholder-opt" data-value="" onclick="selectCustomOption(\'' + id + '\', \'\', \'Selectează categoria...\')">Selectează categoria...</div>';
  }
  CATEGORII_RO.forEach(function(cat) {
    var isSel = selected && selected.trim().toLowerCase() === cat.toLowerCase();
    opts += '<div class="custom-select-option' + (isSel ? ' selected' : '') + '" data-value="' + cat + '" onclick="selectCustomOption(\'' + id + '\', \'' + cat.replace(/'/g, "\\'") + '\', \'' + cat.replace(/'/g, "\\'") + '\')">' + cat + '</div>';
  });
  dd.innerHTML = opts;

  // Seteaza valoarea initiala
  if (selected) {
    trigger.textContent = selected;
    trigger.setAttribute('data-value', selected);
    trigger.classList.remove('placeholder');
  } else {
    var placeholderText = withAll ? 'Toate categoriile' : 'Selectează categoria...';
    trigger.textContent = placeholderText;
    trigger.setAttribute('data-value', withAll ? '' : '');
    trigger.classList.add('placeholder');
  }
}

function toggleCustomSelect(id) {
  var trigger = document.getElementById(id);
  var dd = document.getElementById(id + '-dd');
  if (!trigger || !dd) return;

  var isOpen = dd.classList.contains('open');

  // Inchide toate celelalte dropdown-uri deschise
  document.querySelectorAll('.custom-select-dropdown.open').forEach(function(el) {
    el.classList.remove('open');
    var t = document.getElementById(el.id.replace('-dd', ''));
    if (t) t.classList.remove('open');
  });

  if (!isOpen) {
    dd.classList.add('open');
    trigger.classList.add('open');
  }
}

function selectCustomOption(id, value, label) {
  var trigger = document.getElementById(id);
  var dd = document.getElementById(id + '-dd');
  if (!trigger || !dd) return;

  trigger.textContent = label;
  trigger.setAttribute('data-value', value);

  if (!value) {
    trigger.classList.add('placeholder');
  } else {
    trigger.classList.remove('placeholder');
  }

  // Marcheaza optiunea selectata
  dd.querySelectorAll('.custom-select-option').forEach(function(opt) {
    opt.classList.toggle('selected', opt.getAttribute('data-value') === value);
  });

  // Inchide dropdown-ul
  dd.classList.remove('open');
  trigger.classList.remove('open');

  // Declanseaza onchange pentru filtre
  if (id === 'filter-cat') loadFirme();
  if (id === 'firma-filter-cat') loadLucrariPentruFirma();
  if (id === 'filter-oras') loadFirme();
  if (id === 'firma-filter-oras') loadLucrariPentruFirma();
}

// Inchide dropdown-urile la click in afara
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-select-wrap')) {
    document.querySelectorAll('.custom-select-dropdown.open').forEach(function(el) {
      el.classList.remove('open');
      var t = document.getElementById(el.id.replace('-dd', ''));
      if (t) t.classList.remove('open');
    });
  }
});

var JUDETE_RO = [
  'Alba','Arad','Argeș','Bacău','Bihor','Bistrița-Năsăud','Botoșani',
  'Brașov','Brăila','București','Buzău','Călărași','Cluj','Constanța',
  'Covasna','Dâmbovița','Dolj','Galați','Giurgiu','Gorj','Harghita',
  'Hunedoara','Ialomița','Iași','Ilfov','Maramureș','Mehedinți','Mureș',
  'Neamț','Olt','Prahova','Sălaj','Satu Mare','Sibiu','Suceava',
  'Teleorman','Timiș','Tulcea','Vâlcea','Vaslui','Vrancea'
].sort(function(a,b){ return a.localeCompare(b,'ro'); });

// Pastram si ORASE_RO pentru compatibilitate cu profilul firmei
var ORASE_RO = JUDETE_RO;

function initOrasSelect(id, withAll, selected) {
  var trigger = document.getElementById(id);
  var dd = document.getElementById(id + '-dd');
  if (!trigger || !dd) return;

  var opts = '';
  if (withAll) {
    opts += '<div class="custom-select-option placeholder-opt" data-value="" onclick="selectCustomOption(\'' + id + '\', \'\', \'Toate județele\')">Toate județele</div>';
  } else {
    opts += '<div class="custom-select-option placeholder-opt" data-value="" onclick="selectCustomOption(\'' + id + '\', \'\', \'Selectează județul...\')">Selectează județul...</div>';
  }
  JUDETE_RO.forEach(function(jud) {
    var isSel = selected && selected.trim().toLowerCase() === jud.toLowerCase();
    opts += '<div class="custom-select-option' + (isSel ? ' selected' : '') + '" data-value="' + jud + '" onclick="selectCustomOption(\'' + id + '\', \'' + jud.replace(/'/g, "\\'") + '\', \'' + jud.replace(/'/g, "\\'") + '\')">' + jud + '</div>';
  });
  dd.innerHTML = opts;

  if (selected) {
    trigger.textContent = selected;
    trigger.setAttribute('data-value', selected);
    trigger.classList.remove('placeholder');
  } else {
    trigger.textContent = withAll ? 'Toate județele' : 'Selectează județul...';
    trigger.setAttribute('data-value', '');
    trigger.classList.add('placeholder');
  }
}

function initJudetSelect(id, withAll, selected) {
  initOrasSelect(id, withAll, selected);
}


// ============================================================
//  SWITCH MOD CLIENT <-> FIRMA
// ============================================================

// ============================================================
//  BUTOANE HERO (home page)
// ============================================================
function actualizezaButoaneleHero(user) {
  var modActiv = user.mod_activ || user.tip_cont;
  var _btnP = document.getElementById('btn-go-dashboard');
  var _btnS = document.getElementById('btn-go-secondary');
  if (modActiv === 'client') {
    if (_btnP) { _btnP.textContent = '+ Postează o lucrare'; _btnP.onclick = deschideModalLucrare; }
    if (_btnS) { _btnS.textContent = 'Lucrările mele →'; _btnS.onclick = mergiLaDashboard; _btnS.style.display = 'inline-block'; }
  } else {
    if (_btnP) { _btnP.textContent = 'Lucrări disponibile →'; _btnP.onclick = mergiLaDashboard; }
    if (_btnS) { _btnS.textContent = 'Ofertele mele →'; _btnS.onclick = function(){ mergiLaDashboardTab('oferte'); }; _btnS.style.display = 'inline-block'; }
  }
}

// ============================================================
//  SETTINGS TABS — Contul meu
// ============================================================
function setContTab(tab) {
  var tabs = ['profil','securitate','notificari','firma','zone','stergere'];
  tabs.forEach(function(t) {
    var el = document.getElementById('cont-tab-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    var btn = document.getElementById('snav-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
}

// ============================================================
//  SWITCH MOD CLIENT <-> FIRMA
// ============================================================

function actualizeazaCardSwitch(user) {
  var modActiv = user.mod_activ || user.tip_cont;
  var tipCont  = user.tip_cont;
  var card     = document.getElementById('cont-sectiune-switch-mod');
  if (!card) return;

  if (tipCont === 'ambele') {
    card.style.display = 'block';
    var label = document.getElementById('cont-switch-label');
    var icon  = document.getElementById('cont-switch-icon');
    if (modActiv === 'client') {
      if (label) label.textContent = 'Treci la cont Firmă';
      if (icon)  icon.textContent  = '🏢';
    } else {
      if (label) label.textContent = 'Treci la cont Client';
      if (icon)  icon.textContent  = '👤';
    }
  } else {
    card.style.display = 'none';
  }
}

async function switchModDinCont() {
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
    actualizezaButoaneleHero(currentUser);
    actualizeazaCardSwitch(currentUser);
    showToast(modNou === 'firma' ? 'Ai trecut la contul de firmă!' : 'Ai trecut la contul de client!');
    setTimeout(function() { navigaLa(modNou); }, 600);
  } catch(e) { showToast('Eroare la schimbarea modului.'); }
}

// Pastreaza pentru compatibilitate
async function switchMod() { switchModDinCont(); }

function actualizeazaSwitchDropdown(user) {
  var modActiv = user.mod_activ || user.tip_cont;
  var modEl    = document.getElementById('nav-mod-activ');
  if (modEl) modEl.textContent = modActiv === 'client' ? 'Mod activ: Client' : 'Mod activ: Firmă';
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
  // Reset toate campurile
  var campuri = ['activ-nume-firma','activ-oras','activ-raza','activ-telefon','activ-descriere'];
  campuri.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = id === 'activ-raza' ? '50' : '';
  });
  initCategorieSelect('activ-categorie', false);
  initOrasSelect('activ-oras', false);
  showAlert('cont-alert-activare', '', '');
  // Reset zone
  _zoneActivSelectate = [];
  randeazaZoneActivSelectate();
  var zi = document.getElementById('activ-zone-input');
  if (zi) zi.value = '';
}

function ascundeFormularFirma() {
  var s = document.getElementById('cont-sectiune-activeaza-firma');
  var f = document.getElementById('cont-formular-activare-firma');
  if (s) s.style.display = 'block';
  if (f) f.style.display = 'none';
  // Reset zone la anulare
  _zoneActivSelectate = [];
  randeazaZoneActivSelectate();
}

async function activeazaFirma() {
  var numeFirma = document.getElementById('activ-nume-firma').value.trim();
  var categorie = document.getElementById('activ-categorie').getAttribute('data-value');
  var oras      = document.getElementById('activ-oras').getAttribute('data-value');
  var raza      = document.getElementById('activ-raza').value;
  var telefon   = document.getElementById('activ-telefon').value.trim();
  var descriere = document.getElementById('activ-descriere').value.trim();
  showAlert('cont-alert-activare', '', '');

  if (!numeFirma) { showAlert('cont-alert-activare', 'Numele firmei este obligatoriu.', 'error'); return; }

  var res  = await fetch('/api/activeaza-firma', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nume_firma: numeFirma, categorie, oras, raza_km: raza, telefon, descriere,
      zone_activitate: document.getElementById('activ-zone-value')?.value || '' })
  });
  var data = await res.json();

  if (res.ok) {
    currentUser.tip_cont  = 'ambele';
    currentUser.mod_activ = 'client';
    showToast('Cont de firmă activat cu succes! 🎉');
    // Reincarca sesiunea de pe server, apoi pagina contului
    const meRes  = await fetch('/api/me');
    const meData = await meRes.json();
    if (meData.loggedIn) currentUser = meData.user;
    await incarcaDateCont();
    setContTab('firma');
  } else {
    showAlert('cont-alert-activare', data.error || 'Eroare la activare.', 'error');
  }
}
