-- ============================================================
--  FixIt.ro — Schema completă bază de date
--  Compatibilă cu: SQLite, SQL Server, MySQL, PostgreSQL
--  Generată automat din structura aplicației
-- ============================================================

-- ============================================================
--  TABEL: utilizatori
--  Stochează toți utilizatorii platformei (clienți + firme)
-- ============================================================
CREATE TABLE utilizatori (
    id                INTEGER       PRIMARY KEY AUTOINCREMENT,
    email             VARCHAR(255)  NOT NULL UNIQUE,
    parola_hash       VARCHAR(255)  NOT NULL,          -- bcrypt hash, nu parola în clar!
    tip_cont          VARCHAR(10)   NOT NULL            -- valori posibile: 'client' | 'firma'
                      CHECK(tip_cont IN ('client','firma')),
    nume_complet      VARCHAR(255)  NOT NULL,
    activ             TINYINT       NOT NULL DEFAULT 0, -- 0 = neactivat, 1 = activ
    token_activare    VARCHAR(64)   NULL,               -- token hex 32 bytes, NULL după activare
    token_expira      DATETIME      NULL,               -- expiră după 24h de la creare
    creat_la          DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  TABEL: firme
--  Profilul extins al conturilor de tip 'firma'
--  Relație: 1 utilizator (tip_cont='firma') → 1 firmă
-- ============================================================
CREATE TABLE firme (
    id              INTEGER       PRIMARY KEY AUTOINCREMENT,
    utilizator_id   INTEGER       NOT NULL UNIQUE      -- FK → utilizatori.id
                    REFERENCES utilizatori(id) ON DELETE CASCADE,
    nume_firma      VARCHAR(255)  NOT NULL,
    categorie       VARCHAR(100)  NOT NULL DEFAULT 'General',
                                                       -- ex: Instalator, Electrician, Zugrav
    oras            VARCHAR(100)  NOT NULL DEFAULT '',
    raza_km         INTEGER       NOT NULL DEFAULT 50,  -- raza de acoperire în km
    descriere       TEXT          DEFAULT '',
    telefon         VARCHAR(20)   DEFAULT '',
    creat_la        DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  TABEL: lucrari
--  Lucrările postate de clienți
-- ============================================================
CREATE TABLE lucrari (
    id          INTEGER       PRIMARY KEY AUTOINCREMENT,
    client_id   INTEGER       NOT NULL               -- FK → utilizatori.id (tip_cont='client')
                REFERENCES utilizatori(id) ON DELETE CASCADE,
    titlu       VARCHAR(255)  NOT NULL,
    descriere   TEXT          DEFAULT '',
    categorie   VARCHAR(100)  NOT NULL,              -- ex: Instalator, Electrician, Zugrav
    oras        VARCHAR(100)  NOT NULL,
    adresa      VARCHAR(255)  DEFAULT '',
    urgenta     TINYINT       NOT NULL DEFAULT 0,    -- 0 = normal, 1 = urgent
    status      VARCHAR(20)   NOT NULL DEFAULT 'activa'
                CHECK(status IN ('activa','in_lucru','finalizata','anulata')),
    creat_la    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  TABEL: oferte
--  Ofertele trimise de firme pentru lucrările clienților
--  Constrângere: o firmă poate trimite o singură ofertă per lucrare
-- ============================================================
CREATE TABLE oferte (
    id                INTEGER       PRIMARY KEY AUTOINCREMENT,
    lucrare_id        INTEGER       NOT NULL           -- FK → lucrari.id
                      REFERENCES lucrari(id) ON DELETE CASCADE,
    firma_id          INTEGER       NOT NULL           -- FK → firme.id
                      REFERENCES firme(id) ON DELETE CASCADE,
    pret              DECIMAL(10,2) NOT NULL,          -- în lei, fără TVA
    descriere_oferta  TEXT          DEFAULT '',
    disponibilitate   VARCHAR(255)  DEFAULT '',        -- ex: "Luni–Vineri, 08:00–17:00"
    status            VARCHAR(20)   NOT NULL DEFAULT 'trimisa'
                      CHECK(status IN ('trimisa','acceptata','refuzata')),
    creat_la          DATETIME      DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lucrare_id, firma_id)                       -- o firmă, o ofertă per lucrare
);

-- ============================================================
--  TABEL: recenzii
--  Recenziile lăsate de clienți după finalizarea lucrărilor
--  Condiție: clientul trebuie să fi acceptat o ofertă a firmei
-- ============================================================
CREATE TABLE recenzii (
    id          INTEGER       PRIMARY KEY AUTOINCREMENT,
    firma_id    INTEGER       NOT NULL               -- FK → firme.id
                REFERENCES firme(id) ON DELETE CASCADE,
    client_id   INTEGER       NOT NULL               -- FK → utilizatori.id
                REFERENCES utilizatori(id) ON DELETE CASCADE,
    lucrare_id  INTEGER       NOT NULL               -- FK → lucrari.id
                REFERENCES lucrari(id) ON DELETE CASCADE,
    rating      TINYINT       NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comentariu  TEXT          DEFAULT '',
    creat_la    DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  INDECȘI — pentru performanță la query-uri frecvente
-- ============================================================
CREATE INDEX idx_lucrari_client    ON lucrari(client_id);
CREATE INDEX idx_lucrari_categorie ON lucrari(categorie);
CREATE INDEX idx_lucrari_oras      ON lucrari(oras);
CREATE INDEX idx_lucrari_status    ON lucrari(status);
CREATE INDEX idx_oferte_lucrare    ON oferte(lucrare_id);
CREATE INDEX idx_oferte_firma      ON oferte(firma_id);
CREATE INDEX idx_oferte_status     ON oferte(status);
CREATE INDEX idx_recenzii_firma    ON recenzii(firma_id);
CREATE INDEX idx_firme_categorie   ON firme(categorie);
CREATE INDEX idx_firme_oras        ON firme(oras);

-- ============================================================
--  QUERY-URI UTILE PENTRU QA
-- ============================================================

-- Toți utilizatorii cu statusul contului
-- SELECT id, email, tip_cont, nume_complet,
--        CASE WHEN activ=1 THEN 'Activ' ELSE 'Neactivat' END AS status_cont,
--        creat_la
-- FROM utilizatori
-- ORDER BY creat_la DESC;

-- Toate lucrările cu numele clientului
-- SELECT l.id, l.titlu, l.categorie, l.oras, l.status,
--        CASE WHEN l.urgenta=1 THEN 'DA' ELSE 'NU' END AS urgent,
--        u.email AS client_email, l.creat_la
-- FROM lucrari l
-- JOIN utilizatori u ON l.client_id = u.id
-- ORDER BY l.creat_la DESC;

-- Toate ofertele cu detalii lucrare + firmă
-- SELECT o.id, o.pret, o.status, o.disponibilitate,
--        l.titlu AS lucrare, l.oras,
--        f.nume_firma, f.categorie,
--        o.creat_la
-- FROM oferte o
-- JOIN lucrari l ON o.lucrare_id = l.id
-- JOIN firme f   ON o.firma_id = f.id
-- ORDER BY o.creat_la DESC;

-- Rating mediu per firmă
-- SELECT f.nume_firma, f.categorie, f.oras,
--        ROUND(AVG(r.rating), 2) AS rating_mediu,
--        COUNT(r.id) AS nr_recenzii
-- FROM firme f
-- LEFT JOIN recenzii r ON r.firma_id = f.id
-- GROUP BY f.id
-- ORDER BY rating_mediu DESC;

-- Lucrări fără nicio ofertă (posibil bug sau lipsă firme în zonă)
-- SELECT l.id, l.titlu, l.oras, l.categorie, l.creat_la
-- FROM lucrari l
-- LEFT JOIN oferte o ON o.lucrare_id = l.id
-- WHERE o.id IS NULL
-- ORDER BY l.creat_la DESC;
