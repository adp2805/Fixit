# FixIt.ro — Ghid de instalare și pornire
## (Fără cunoștințe tehnice necesare!)

---

## PASUL 1 — Instalează Node.js

1. Mergi la: https://nodejs.org
2. Apasă butonul verde mare **"LTS"** (versiunea stabilă)
3. Descarcă și rulează instalatorul `.msi`
4. Apasă **Next → Next → Install** (toate opțiunile default sunt ok)
5. Repornește calculatorul după instalare

---

## PASUL 2 — Dezarhivează proiectul

1. Dezarhivează fișierul `fixit-ro.zip` undeva pe calculator
   (ex: `C:\Users\NumeleTau\Desktop\fixit-ro\`)
2. Deschide folderul dezarhivat — ar trebui să conțină:
   - `server.js`
   - `database.js`
   - `package.json`
   - folderul `public\`

---

## PASUL 3 — Deschide terminalul în VS Code

1. Deschide VS Code
2. Din meniu: **File → Open Folder** → selectează folderul `fixit-ro`
3. Deschide terminalul: **Terminal → New Terminal** (sau `Ctrl + ~`)
4. Ar trebui să apară un terminal în josul ecranului

---

## PASUL 4 — Instalează dependențele (O SINGURĂ DATĂ)

În terminal, scrie exact:

```
npm install
```

Apasă Enter și așteaptă ~30 secunde până se instalează pachetele.
Vei vedea ceva de genul `added 120 packages`.

---

## PASUL 5 — Pornește serverul

```
node server.js
```

Ar trebui să apară:

```
  ✅ FixIt.ro rulează la: http://localhost:3000
  📦 Baza de date: fixit.db
  
  📋 Conturi de test disponibile (parola: Test1234):
     client1@test.ro  — client
     client2@test.ro  — client
     firma1@test.ro   — firmă (Instalator, Câmpina)
     firma2@test.ro   — firmă (Electrician, Ploiești)
     firma3@test.ro   — firmă (Zugrav, București)
```

---

## PASUL 6 — Deschide aplicația

Deschide browserul (Chrome, Edge, Firefox) și mergi la:

**http://localhost:3000**

---

## Conturi de test disponibile

| Email | Parola | Tip |
|-------|--------|-----|
| client1@test.ro | Test1234 | Client (Ion Popescu) |
| client2@test.ro | Test1234 | Client (Maria Ionescu) |
| firma1@test.ro  | Test1234 | Firmă - Instalator, Câmpina |
| firma2@test.ro  | Test1234 | Firmă - Electrician, Ploiești |
| firma3@test.ro  | Test1234 | Firmă - Zugrav, București |

---

## Ce poți testa

### Ca CLIENT:
- [ ] Înregistrare cont client nou
- [ ] Login / Logout
- [ ] Postare lucrare nouă (cu urgență sau fără)
- [ ] Vizualizare oferte primite
- [ ] Acceptarea unei oferte
- [ ] Ștergerea unei lucrări
- [ ] Filtrare firme după categorie și oraș

### Ca FIRMĂ:
- [ ] Înregistrare firmă nouă
- [ ] Login / Logout
- [ ] Vizualizare lucrări disponibile
- [ ] Filtrare lucrări după categorie / oraș
- [ ] Trimitere ofertă
- [ ] Vizualizare ofertele trimise

---

## Oprire server

În terminal apasă **Ctrl + C**

---

## Depanare probleme frecvente

**"node nu este recunoscut ca comandă"**
→ Node.js nu s-a instalat corect. Reinstalează și repornește calculatorul.

**"Cannot find module 'express'"**
→ Nu ai rulat `npm install`. Rulează-l din nou.

**Pagina nu se deschide în browser**
→ Verifică că serverul e pornit (terminal deschis cu `node server.js`)
→ Asigură-te că adresa e exact `http://localhost:3000`

**"Port 3000 already in use"**
→ Închide alte instanțe ale serverului (Ctrl+C) sau repornește calculatorul.

---

## Structura bazei de date

Baza de date este fișierul `fixit.db` creat automat în folderul proiectului.
Poți vizualiza conținutul cu: **DB Browser for SQLite** (https://sqlitebrowser.org) — un program gratuit cu interfață vizuală.

Tabelele create automat:
- `utilizatori` — toți userii (clienți + firme)
- `firme` — profilul extins al firmelor
- `lucrari` — lucrările postate de clienți
- `oferte` — ofertele trimise de firme
- `recenzii` — recenziile lăsate după lucrări

---

*FixIt.ro MVP — versiunea 1.0*
