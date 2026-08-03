# Miasto 88 — strona restauracji z panelem i rezerwacjami

Aplikacja webowa: strona publiczna + panel administracyjny + rezerwacje online.
Dane trzymane w **MongoDB Atlas**, więc projekt działa zarówno lokalnie, jak i na
**Vercelu** jako funkcja serverless — pod adresem `restaurant.gowebly.pl`.

---

## Szybki start (lokalnie)

1. Zainstaluj **Node.js** LTS z [nodejs.org](https://nodejs.org).
2. Skopiuj `.env.example` do `.env` i uzupełnij dwie wartości:

```bash
cp .env.example .env
```

| Zmienna | Skąd wziąć |
|---|---|
| `MONGO_URL` | MongoDB Atlas → Database → **Connect** → Drivers → Node.js |
| `MONGO_DB` | zostaw `miasto88` — osobna baza, nie miesza się z danymi GoWebly |
| `SESSION_SECRET` | wygeneruj: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

3. Uruchom:

```bash
npm install
npm run dev
```

| Adres | Co to |
|---|---|
| `http://localhost:3000/` | strona dla gości |
| `http://localhost:3000/admin` | panel administracyjny |

**Pierwsze logowanie:** `admin` / `miasto88` — zmień w panelu, zakładka **Konto**.
Przy pustej bazie aplikacja sama wgrywa menu (102 pozycje), zdjęcia i konto administratora.

Alternatywnie: dwuklik na `start.bat` — sprawdzi Node, zależności i odpali serwer.

### Komendy

| Komenda | Do czego |
|---|---|
| `npm run dev` | tryb pracy — restart po zmianie kodu serwera |
| `npm start` | tryb produkcyjny |
| `npm run reset-haslo -- NoweHaslo123` | awaryjna zmiana hasła administratora |
| `npm run migruj` | przeniesienie danych ze starej wersji (`data/db.json`) do Atlasa |

---

## Wdrożenie na Vercel (restaurant.gowebly.pl)

Projekt jest już przygotowany — `vercel.json` i katalog `api/` są w repozytorium.

1. **Vercel → Add New Project** → zaimportuj repozytorium `gowebly_restaurant`.
2. Framework Preset: **Other**. Build Command i Output Directory zostaw puste —
   `public/` serwowane jest statycznie, a `api/index.js` działa jako funkcja.
3. **Settings → Environment Variables** — dodaj trzy pozycje dla środowiska *Production*:

   | Nazwa | Wartość |
   |---|---|
   | `MONGO_URL` | ten sam adres Atlasa co w GoWebly |
   | `MONGO_DB` | `miasto88` |
   | `SESSION_SECRET` | losowy ciąg, min. 32 znaki (inny niż lokalny) |

4. **Settings → Domains** → dodaj `restaurant.gowebly.pl`.
   Subdomena już wskazuje na Vercela, więc wystarczy przepiąć ją do tego projektu.
5. Deploy.

> **Atlas — Network Access:** dodaj `0.0.0.0/0` na liście dozwolonych adresów IP.
> Funkcje Vercela nie mają stałego IP i bez tego połączenie się nie nawiąże.

Po wdrożeniu sprawdź `https://restaurant.gowebly.pl/api/content` — powinno zwrócić JSON z menu.

---

## Dlaczego akurat tak

Pierwsza wersja trzymała dane w pliku `data/db.json` i zapisywała zdjęcia na dysk.
Na Vercelu to nie zadziała: system plików jest tylko do odczytu i znika po każdym
wywołaniu funkcji. Trzy rzeczy musiały się zmienić:

| Było | Jest | Dlaczego |
|---|---|---|
| plik `data/db.json` | kolekcje w MongoDB Atlas | funkcja serverless nie ma trwałego dysku |
| sesje w pamięci procesu | ciasteczko podpisane HMAC-SHA256 | każde żądanie może trafić do innej instancji |
| zdjęcia w `data/uploads/` | binarnie w kolekcji `images`, serwowane przez `/uploads/…` | jw. — brak dysku do zapisu |
| limit prób logowania w pamięci | kolekcja `login_attempts` z TTL | licznik musi być wspólny dla wszystkich instancji |

Kod jest wspólny dla obu środowisk: `lib/api.js` zawiera wszystkie trasy, a wywołują go
dwa cienkie wejścia — `server.js` (lokalnie, dokłada serwowanie plików z `public/`)
i `api/index.js` (Vercel).

### Struktura

```
├─ server.js              wejście lokalne: pliki statyczne + API
├─ api/index.js           wejście Vercela (serverless)
├─ vercel.json            przekierowania /api i /uploads do funkcji
├─ migrate-to-mongo.js    przeniesienie danych ze starej wersji
├─ lib/
│   ├─ api.js             wszystkie trasy API
│   ├─ store.js           dostęp do MongoDB (połączenie cache'owane)
│   ├─ booking.js         godziny otwarcia i dostępność stolików
│   ├─ auth.js            sesje na podpisanym ciasteczku
│   ├─ seed.js            dane startowe: menu, zdjęcia, konto admin
│   ├─ util.js            hasła, czas, walidacja pól
│   └─ env.js             wczytanie .env bez bibliotek
└─ public/                strona, panel, zdjęcia startowe
```

Jedyna zależność zewnętrzna to oficjalny sterownik `mongodb`.

---

## Co potrafi panel

**Rezerwacje** — wszystkie zgłoszenia ze strony. Filtry, wyszukiwarka, zmiana statusu
(nowa → potwierdzona → zrealizowana / odwołana), edycja, ręczne dodawanie telefonicznych.

**Menu** — kategorie i dania, ceny, opisy, etykiety, kolejność, ukrywanie bez usuwania.
Kategoria może mieć **kilka kolumn cenowych** — tak działa pizza (30 / 40 / 50 cm).
W edycji kategorii wpisujesz je po przecinku w polu „Kolumny cenowe"; przy każdym daniu
pojawiają się wtedy osobne pola cen. Puste pole = danie niedostępne w tym rozmiarze
(na stronie „—", jak przy pizzy Stella i Calzone).

**Galeria** — przeciągnij zdjęcia na pole uploadu, przypisz **miejsce na stronie**
(zdjęcie główne, dwa w „O nas", danie sztandarowe, galeria). Pliki lądują w bazie.

**Godziny otwarcia** — sterują tabelą na stronie, plakietką „Otwarte / Zamknięte"
i tym, jakie terminy da się zarezerwować.

**Ustawienia** — dane kontaktowe, teksty, liczby, parametry systemu rezerwacji.

---

## Jak działa system rezerwacji

Gość wybiera datę i liczbę osób, a serwer:

1. z godzin otwarcia generuje terminy co 30 minut,
2. dla każdego liczy, ilu gości ma rezerwacje w nakładającym się oknie czasowym,
3. odejmuje to od liczby miejsc i zwraca liczbę wolnych.

Godziny bez miejsc są wyszarzone. Po wysłaniu formularza serwer sprawdza dostępność
**drugi raz** — dwie osoby rezerwujące w tej samej sekundzie nie przepełnią sali.

| Ustawienie | Znaczenie | Domyślnie |
|---|---|---|
| Liczba miejsc na sali | ile osób naraz | 40 |
| Czas jednej wizyty | na ile blokowany jest stolik | 90 min |
| Maks. osób na rezerwację | powyżej — prośba o telefon | 12 |
| Min. wyprzedzenie | najbliższy możliwy termin | 60 min |
| Maks. dni naprzód | jak daleko w przyszłość | 90 |

---

## Kopia zapasowa

Wszystko leży w bazie `miasto88` w Atlasie. Kopię zrobisz przez
**Atlas → Database → ⋯ → Export Collection**, albo lokalnie:

```bash
mongodump --uri="TWOJ_MONGO_URL" --db=miasto88 --out=./backup
```

Atlas w darmowym planie robi też własne migawki — sprawdź w zakładce **Backup**.

---

## Zdjęcia — do podmiany

Strona ma **zdjęcia startowe** z Unsplash (licencja darmowa, także komercyjnie).
Leżą w `public/img/`. To nie są Wasze dania ani Wasza sala — podmień je:
panel → **Galeria** → przeciągnij własne, wybierz miejsce na stronie, usuń stare.

## Logo

| Plik | Do czego |
|---|---|
| `public/img/logo.svg` | znak — favicon, ikona, awatar na Facebooku |
| `public/img/logo-lockup.svg` | znak + nazwa — wizytówki, ulotki, stopka maila |

Sylwetka miasteczka z wieżą, czytelna od 16 px. Jednokolorowa, więc przyjmuje kolor tła.

---

## Do sprawdzenia przed publikacją

- **Karta menu** — 102 pozycje przepisane z Waszych zdjęć menu; przejrzyj ceny w panelu.
- **Godziny otwarcia** — wpisane 11:00–00:00 dla każdego dnia (z materiałów znana była
  tylko godzina zamknięcia).
- **Link do Facebooka** — prowadzi do wyszukiwarki FB; wklej właściwy adres w Ustawieniach.
- **Danie sztandarowe** — ustawione na „Placek po zbójnicku" (golonka z Facebooka nie
  występuje w karcie); zmień w Ustawieniach, jeśli wolisz inne.
- **Hasło administratora** — zmień domyślne `miasto88`.
