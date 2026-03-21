-- ============================================================
--  FixIt.ro — Schema completa pentru SQL Server
--  Compatibila cu: SQL Server Express / Standard / Developer
--  
--  INSTRUCTIUNI DE IMPORT IN SSMS:
--  1. Deschide SSMS si conecteaza-te la .\SQLEXPRESS
--  2. File -> Open -> File -> selecteaza acest fisier
--  3. Din bara de sus, asigura-te ca e selectat "fixit_db"
--  4. Apasa Execute (F5)
--  5. Mesaj asteptat: "Commands completed successfully"
-- ============================================================

USE fixit_db;
GO

-- ============================================================
--  TABEL: utilizatori
--  Stocheaza toti utilizatorii platformei (clienti + firme)
-- ============================================================
CREATE TABLE utilizatori (
    id                INT              NOT NULL IDENTITY(1,1),
    email             NVARCHAR(255)    NOT NULL,
    parola_hash       NVARCHAR(255)    NOT NULL,
    tip_cont          NVARCHAR(10)     NOT NULL,
    nume_complet      NVARCHAR(255)    NOT NULL,
    activ             BIT              NOT NULL DEFAULT 0,
    token_activare    NVARCHAR(64)     NULL,
    token_expira      DATETIME         NULL,
    creat_la          DATETIME         NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_utilizatori         PRIMARY KEY (id),
    CONSTRAINT UQ_utilizatori_email   UNIQUE (email),
    CONSTRAINT CK_utilizatori_tip     CHECK (tip_cont IN ('client', 'firma'))
);
GO

-- ============================================================
--  TABEL: firme
--  Profilul extins al conturilor de tip firma
--  Relatie: 1 utilizator (tip_cont='firma') -> 1 firma
-- ============================================================
CREATE TABLE firme (
    id              INT              NOT NULL IDENTITY(1,1),
    utilizator_id   INT              NOT NULL,
    nume_firma      NVARCHAR(255)    NOT NULL,
    categorie       NVARCHAR(100)    NOT NULL DEFAULT 'General',
    oras            NVARCHAR(100)    NOT NULL DEFAULT '',
    raza_km         INT              NOT NULL DEFAULT 50,
    descriere       NVARCHAR(MAX)    NULL DEFAULT '',
    telefon         NVARCHAR(20)     NULL DEFAULT '',
    creat_la        DATETIME         NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_firme               PRIMARY KEY (id),
    CONSTRAINT UQ_firme_utilizator    UNIQUE (utilizator_id),
    CONSTRAINT FK_firme_utilizatori   FOREIGN KEY (utilizator_id)
        REFERENCES utilizatori(id) ON DELETE CASCADE
);
GO

-- ============================================================
--  TABEL: lucrari
--  Lucrarile postate de clienti
-- ============================================================
CREATE TABLE lucrari (
    id          INT              NOT NULL IDENTITY(1,1),
    client_id   INT              NOT NULL,
    titlu       NVARCHAR(255)    NOT NULL,
    descriere   NVARCHAR(MAX)    NULL DEFAULT '',
    categorie   NVARCHAR(100)    NOT NULL,
    oras        NVARCHAR(100)    NOT NULL,
    adresa      NVARCHAR(255)    NULL DEFAULT '',
    urgenta     BIT              NOT NULL DEFAULT 0,
    status      NVARCHAR(20)     NOT NULL DEFAULT 'activa',
    creat_la    DATETIME         NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_lucrari           PRIMARY KEY (id),
    CONSTRAINT FK_lucrari_client    FOREIGN KEY (client_id)
        REFERENCES utilizatori(id) ON DELETE CASCADE,
    CONSTRAINT CK_lucrari_status    CHECK (status IN (
        'activa', 'in_lucru', 'finalizata', 'anulata'
    ))
);
GO

-- ============================================================
--  TABEL: oferte
--  Ofertele trimise de firme pentru lucrarile clientilor
--  Constrangere: o firma poate trimite o singura oferta per lucrare
-- ============================================================
CREATE TABLE oferte (
    id                INT              NOT NULL IDENTITY(1,1),
    lucrare_id        INT              NOT NULL,
    firma_id          INT              NOT NULL,
    pret              DECIMAL(10,2)    NOT NULL,
    descriere_oferta  NVARCHAR(MAX)    NULL DEFAULT '',
    disponibilitate   NVARCHAR(255)    NULL DEFAULT '',
    status            NVARCHAR(20)     NOT NULL DEFAULT 'trimisa',
    creat_la          DATETIME         NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_oferte                    PRIMARY KEY (id),
    CONSTRAINT UQ_oferte_lucrare_firma      UNIQUE (lucrare_id, firma_id),
    CONSTRAINT FK_oferte_lucrare            FOREIGN KEY (lucrare_id)
        REFERENCES lucrari(id) ON DELETE CASCADE,
    CONSTRAINT FK_oferte_firma              FOREIGN KEY (firma_id)
        REFERENCES firme(id),
    CONSTRAINT CK_oferte_status             CHECK (status IN (
        'trimisa', 'acceptata', 'refuzata'
    ))
);
GO

-- ============================================================
--  TABEL: recenzii
--  Recenziile lasate de clienti dupa finalizarea lucrarilor
-- ============================================================
CREATE TABLE recenzii (
    id          INT              NOT NULL IDENTITY(1,1),
    firma_id    INT              NOT NULL,
    client_id   INT              NOT NULL,
    lucrare_id  INT              NOT NULL,
    rating      TINYINT          NOT NULL,
    comentariu  NVARCHAR(MAX)    NULL DEFAULT '',
    creat_la    DATETIME         NOT NULL DEFAULT GETDATE(),

    CONSTRAINT PK_recenzii          PRIMARY KEY (id),
    CONSTRAINT FK_recenzii_firma    FOREIGN KEY (firma_id)
        REFERENCES firme(id),
    CONSTRAINT FK_recenzii_client   FOREIGN KEY (client_id)
        REFERENCES utilizatori(id),
    CONSTRAINT FK_recenzii_lucrare  FOREIGN KEY (lucrare_id)
        REFERENCES lucrari(id),
    CONSTRAINT CK_recenzii_rating   CHECK (rating BETWEEN 1 AND 5)
);
GO

-- ============================================================
--  INDECSI — pentru performanta la query-uri frecvente
-- ============================================================
CREATE INDEX IX_lucrari_client    ON lucrari(client_id);
CREATE INDEX IX_lucrari_categorie ON lucrari(categorie);
CREATE INDEX IX_lucrari_oras      ON lucrari(oras);
CREATE INDEX IX_lucrari_status    ON lucrari(status);
CREATE INDEX IX_oferte_lucrare    ON oferte(lucrare_id);
CREATE INDEX IX_oferte_firma      ON oferte(firma_id);
CREATE INDEX IX_oferte_status     ON oferte(status);
CREATE INDEX IX_recenzii_firma    ON recenzii(firma_id);
CREATE INDEX IX_firme_categorie   ON firme(categorie);
CREATE INDEX IX_firme_oras        ON firme(oras);
GO

-- ============================================================
--  DATE DE TEST — conturi predefinite pentru QA
--  Parola pentru toate conturile: Test1234
--  Hash bcrypt generat extern si inserat direct
-- ============================================================

-- Clienti de test
INSERT INTO utilizatori (email, parola_hash, tip_cont, nume_complet, activ)
VALUES ('client1@test.ro', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'client', 'Ion Popescu', 1);

INSERT INTO utilizatori (email, parola_hash, tip_cont, nume_complet, activ)
VALUES ('client2@test.ro', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'client', 'Maria Ionescu', 1);

-- Firme de test
INSERT INTO utilizatori (email, parola_hash, tip_cont, nume_complet, activ)
VALUES ('firma1@test.ro', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'firma', 'Termo Install SRL', 1);

INSERT INTO utilizatori (email, parola_hash, tip_cont, nume_complet, activ)
VALUES ('firma2@test.ro', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'firma', 'Electro Pro SRL', 1);

INSERT INTO utilizatori (email, parola_hash, tip_cont, nume_complet, activ)
VALUES ('firma3@test.ro', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'firma', 'Zugrav Expert SRL', 1);
GO

-- Profile firme
INSERT INTO firme (utilizator_id, nume_firma, categorie, oras, raza_km, descriere)
VALUES (3, 'Termo Install Campina', 'Instalator', 'Campina', 40, 'Instalatii termice si sanitare, urgente 24h');

INSERT INTO firme (utilizator_id, nume_firma, categorie, oras, raza_km, descriere)
VALUES (4, 'Electro Pro Ploiesti', 'Electrician', 'Ploiesti', 60, 'Instalatii electrice, tablouri, prize');

INSERT INTO firme (utilizator_id, nume_firma, categorie, oras, raza_km, descriere)
VALUES (5, 'Zugrav Expert Bucuresti', 'Zugrav', 'Bucuresti', 30, 'Zugraveli interioare si exterioare');
GO

-- Lucrari de test
INSERT INTO lucrari (client_id, titlu, descriere, categorie, oras, adresa, urgenta)
VALUES (1, 'Instalare centrala termica', 'Montaj centrala noua Bosch 24kW', 'Instalator', 'Campina', 'Str. Republicii 10', 0);

INSERT INTO lucrari (client_id, titlu, descriere, categorie, oras, adresa, urgenta)
VALUES (2, 'Tablou electric stricat', 'Sigurantele sar des, nevoie de verificare urgenta', 'Electrician', 'Ploiesti', 'Bld. Bucuresti 5', 1);
GO

-- Oferte de test
INSERT INTO oferte (lucrare_id, firma_id, pret, descriere_oferta, disponibilitate)
VALUES (1, 1, 1200.00, 'Manopera + materiale incluse, garantie 2 ani', 'Luni-Vineri 9-17');

INSERT INTO oferte (lucrare_id, firma_id, pret, descriere_oferta, disponibilitate)
VALUES (1, 2, 980.00, 'Fara materiale, disponibil oricand', 'Oricand');

INSERT INTO oferte (lucrare_id, firma_id, pret, descriere_oferta, disponibilitate)
VALUES (2, 2, 350.00, 'Verificare completa + inlocuire sigurante', 'Urgent, vin azi');
GO

-- ============================================================
--  VERIFICARE FINALA — ruleaza dupa import ca sa confirmi
-- ============================================================
SELECT 'utilizatori' AS tabel, COUNT(*) AS nr_randuri FROM utilizatori
UNION ALL
SELECT 'firme',   COUNT(*) FROM firme
UNION ALL
SELECT 'lucrari', COUNT(*) FROM lucrari
UNION ALL
SELECT 'oferte',  COUNT(*) FROM oferte
UNION ALL
SELECT 'recenzii',COUNT(*) FROM recenzii;
GO

-- ============================================================
--  QUERY-URI UTILE PENTRU QA
-- ============================================================

-- 1. Toti utilizatorii cu status cont
-- SELECT id, email, tip_cont, nume_complet,
--        CASE WHEN activ=1 THEN 'Activ' ELSE 'Neactivat' END AS status_cont,
--        FORMAT(creat_la, 'dd/MM/yyyy HH:mm') AS creat_la
-- FROM utilizatori
-- ORDER BY creat_la DESC;

-- 2. Toate lucrarile cu numele clientului
-- SELECT l.id, l.titlu, l.categorie, l.oras,
--        CASE WHEN l.urgenta=1 THEN 'DA' ELSE 'NU' END AS urgent,
--        l.status, u.email AS client_email,
--        FORMAT(l.creat_la, 'dd/MM/yyyy HH:mm') AS creat_la
-- FROM lucrari l
-- JOIN utilizatori u ON l.client_id = u.id
-- ORDER BY l.creat_la DESC;

-- 3. Toate ofertele cu detalii lucrare + firma
-- SELECT o.id, o.pret, o.status, o.disponibilitate,
--        l.titlu AS lucrare, l.oras,
--        f.nume_firma, f.categorie,
--        FORMAT(o.creat_la, 'dd/MM/yyyy HH:mm') AS creat_la
-- FROM oferte o
-- JOIN lucrari l ON o.lucrare_id = l.id
-- JOIN firme f   ON o.firma_id   = f.id
-- ORDER BY o.creat_la DESC;

-- 4. Rating mediu per firma
-- SELECT f.nume_firma, f.categorie, f.oras,
--        ROUND(AVG(CAST(r.rating AS FLOAT)), 2) AS rating_mediu,
--        COUNT(r.id) AS nr_recenzii
-- FROM firme f
-- LEFT JOIN recenzii r ON r.firma_id = f.id
-- GROUP BY f.id, f.nume_firma, f.categorie, f.oras
-- ORDER BY rating_mediu DESC;

-- 5. Lucrari fara nicio oferta
-- SELECT l.id, l.titlu, l.oras, l.categorie,
--        FORMAT(l.creat_la, 'dd/MM/yyyy HH:mm') AS creat_la
-- FROM lucrari l
-- LEFT JOIN oferte o ON o.lucrare_id = l.id
-- WHERE o.id IS NULL
-- ORDER BY l.creat_la DESC;

-- 6. Conturi neactivate
-- SELECT id, email, tip_cont, nome_complet,
--        FORMAT(token_expira, 'dd/MM/yyyy HH:mm') AS expira_la
-- FROM utilizatori
-- WHERE activ = 0
-- ORDER BY creat_la DESC;
