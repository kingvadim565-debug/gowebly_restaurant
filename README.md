# Miasto 88 — strona z panelem administracyjnym

Aplikacja webowa dla restauracji: strona publiczna + panel do zarządzania treścią
i rezerwacjami. Napisana w Node.js **bez żadnych bibliotek zewnętrznych** —
nie ma `npm install`, nie ma czego zepsuć przy aktualizacjach.

---

## Uruchomienie

Potrzebny jest **Node.js** (wersja LTS) z [nodejs.org](https://nodejs.org) — instalacja jednorazowa.
Projekt **nie ma żadnych zależności**, więc `npm install` nie jest potrzebne.

```bash
npm run dev
```

Alternatywnie: dwuklik na **`start.bat`** — robi to samo i sam otwiera przeglądarkę.

| Adres | Co to jest |
|---|---|
| `http://localhost:3000/` | strona dla gości |
| `http://localhost:3000/admin` | panel administracyjny |

**Pierwsze logowanie:** login `admin`, hasło `miasto88`.
Zmień je od razu w panelu → zakładka **Konto**. Do czasu zmiany panel wyświetla ostrzeżenie.

Zatrzymanie serwera: `Ctrl + C` w oknie terminala.

### Dostępne komendy

| Komenda | Do czego |
|---|---|
| `npm run dev` | tryb pracy — serwer restartuje się sam po zmianie `server.js` |
| `npm start` | tryb produkcyjny — bez auto-restartu |
| `npm run reset-haslo -- NoweHaslo123` | awaryjna zmiana hasła administratora (min. 8 znaków) |

Auto-restart w `npm run dev` reaguje tylko na zmiany w kodzie serwera. Zapis rezerwacji
do bazy **nie** restartuje serwera, więc nikt nie zostaje wylogowany w trakcie pracy.
Zmiany w `public/` (HTML, CSS, JS strony) działają od razu po odświeżeniu przeglądarki.

Gdyby port 3000 był zajęty:

```bash
set PORT=3001 && npm run dev
```

---

## Co potrafi panel

**Rezerwacje** — wszystkie zgłoszenia ze strony trafiają tutaj. Filtrowanie po statusie,
wyszukiwarka po nazwisku/telefonie, zmiana statusu (nowa → potwierdzona → zrealizowana /
odwołana), edycja szczegółów, ręczne dodawanie rezerwacji telefonicznych, usuwanie.
Lista odświeża się sama co minutę.

**Menu** — pełna edycja karty: kategorie i dania, ceny, opisy, etykiety („nowość", „hit", „wege"),
kolejność, chwilowe ukrywanie dania bez usuwania. Zmiany widać na stronie po odświeżeniu.

Kategoria może mieć **kilka kolumn cenowych** — tak działa pizza (30 / 40 / 50 cm).
W edycji kategorii wpisujesz je po przecinku w polu „Kolumny cenowe", a przy każdym daniu
pojawią się osobne pola cen dla każdego rozmiaru. Puste pole = danie niedostępne w tym
rozmiarze (na stronie pokaże się „—", jak przy pizzy Stella i Calzone).
Zostaw pole kolumn puste, jeśli dania mają jedną cenę.

**Galeria** — przeciągnij zdjęcia na pole uploadu. Każdemu zdjęciu przypisujesz **miejsce
na stronie**: zdjęcie główne (hero), dwa zdjęcia w sekcji „O nas", zdjęcie dania
sztandarowego, albo galeria. Dopóki nie wgrasz zdjęć, strona pokazuje ciepłe gradienty
zamiast pustych ramek.

**Godziny otwarcia** — osobno na każdy dzień, z możliwością zaznaczenia dnia zamkniętego.
Te godziny sterują jednocześnie trzema rzeczami: tabelą na stronie, plakietką
„Otwarte / Zamknięte" na górnym pasku i tym, jakie terminy da się zarezerwować.

**Ustawienia** — dane kontaktowe, wszystkie teksty na stronie (nagłówki, opisy),
liczby (ocena, opinie, obserwujący) oraz parametry systemu rezerwacji.

**Konto** — zmiana hasła, pobranie treści strony w formacie JSON.

---

## Jak działa system rezerwacji

Gość wybiera datę i liczbę osób, a strona pyta serwer o wolne godziny. Serwer:

1. bierze godziny otwarcia na ten dzień i generuje terminy co 30 minut,
2. dla każdego terminu liczy, ilu gości ma już rezerwacje w nakładającym się oknie czasowym,
3. odejmuje to od liczby miejsc na sali i zwraca liczbę wolnych miejsc.

Godziny bez miejsc są wyszarzone i nieklikalne. Po wysłaniu formularza serwer **jeszcze raz**
sprawdza dostępność — dzięki temu dwie osoby rezerwujące w tej samej sekundzie nie przepełnią sali.

Parametry do ustawienia w panelu (zakładka Ustawienia → System rezerwacji):

| Ustawienie | Znaczenie | Domyślnie |
|---|---|---|
| Liczba miejsc na sali | ile osób może być naraz | 40 |
| Czas jednej wizyty | na ile blokowany jest stolik | 90 min |
| Maks. osób na rezerwację | powyżej — prośba o telefon | 12 |
| Min. wyprzedzenie | najbliższy możliwy termin | 60 min |
| Maks. dni naprzód | jak daleko w przyszłość | 90 |

---

## Struktura plików

```
restauracja/
├─ package.json           komendy npm (dev / start / reset-haslo)
├─ server.js              serwer + API + baza (jeden plik, bez zależności)
├─ start.bat              uruchomienie jednym kliknięciem
├─ data/                  tworzy się samo przy pierwszym starcie
│   ├─ db.json            ← CAŁA TREŚĆ I REZERWACJE. To kopiuj na backup.
│   └─ uploads/           wgrane zdjęcia
└─ public/
    ├─ index.html         strona publiczna
    ├─ css/style.css
    ├─ img/               zdjęcia startowe (do podmiany na własne)
    ├─ js/app.js          treść z API, menu, galeria, rezerwacje
    ├─ js/motion.js       silnik animacji
    └─ admin/             panel administracyjny
```

**Kopia zapasowa = skopiowanie folderu `data/`.** Nic więcej nie trzeba archiwizować.

---

## Logo

Znak to sylwetka miasteczka z wieżą pośrodku — „Miasto" w nazwie. Wcześniej w tym miejscu
była po prostu liczba 88, która i tak powtarzała się w napisie obok.

| Plik | Do czego |
|---|---|
| `public/img/logo.svg` | sam znak w czerwonym kwadracie — favicon, ikona aplikacji, awatar na Facebooku |
| `public/img/logo-lockup.svg` | znak + nazwa + „RESTAURACJA · MOGILNO" — wizytówki, ulotki, stopki maili |

Znak jest jednokolorowy, więc przyjmuje kolor tła: na stronie jest kremowy na czerwonym,
w stopce czerwony na kremowym, w panelu złoty na ciemnym. Sprawdzony pod kątem czytelności
od 16 px (favicon) w górę — dlatego nie ma w nim drobnych detali typu okna, które przy
tym rozmiarze zamieniają się w plamę.

Pliki SVG otworzysz i wyeksportujesz do PNG w darmowej Inkscape albo na stronie
[svgtopng.com](https://svgtopng.com) — przyda się, bo Facebook i Google wymagają PNG/JPG.

---

## Zdjęcia — WAŻNE

Strona ma **zdjęcia startowe** z serwisu Unsplash (licencja darmowa, także do celów
komercyjnych, bez obowiązku podawania autora). Leżą w `public/img/` i są przypisane
do miejsc na stronie w panelu → Galeria.

**To są zdjęcia zastępcze — nie Wasze dania.** Trzeba je podmienić na własne:

1. Panel → **Galeria** → przeciągnij swoje zdjęcia na pole uploadu.
2. Przy każdym nowym zdjęciu wybierz **miejsce na stronie**
   (zdjęcie główne / O nas — duże / O nas — małe / danie sztandarowe / galeria).
3. Usuń stare zdjęcia zastępcze przyciskiem „Usuń zdjęcie".

Dopóki tego nie zrobisz, goście zobaczą ogólne zdjęcia jedzenia. Google potrafi
rozpoznać stockowe fotografie, a lokalni goście i tak zauważą, że to nie Wasza sala —
własne zdjęcia zawsze sprzedają lepiej.

---

## Animacje i wygląd

Kierunek: **ciepłe bistro** — kremowe tło (#FDF8F2), pomidorowa czerwień jako akcent,
zdjęcia jedzenia na pierwszym planie, miękkie zaokrąglenia i delikatne cienie.
Kroje pisma: **Fraunces** (nagłówki, ciepły szeryf) + **DM Sans** (tekst).

- ekran powitalny z paskiem ładowania,
- nagłówki wjeżdżające słowo po słowie,
- paralaksa na zdjęciach,
- przyciski przyciągające kursor (tylko na komputerach z myszką),
- animowane liczniki (ocena, liczba opinii, obserwujący),
- przewijany pasek z hasłami kuchni,
- przełączanie kategorii menu z animowaną pigułką,
- galeria z lightboxem (strzałki, Escape, podpisy),
- rysowany znaczek potwierdzenia po rezerwacji.

Wszystko wyłącza się automatycznie, gdy w systemie włączona jest opcja
**„ogranicz ruch"** (dostępność) — wtedy zostaje sama, statyczna treść.

---

## Publikacja w internecie

Na razie strona działa tylko na tym komputerze (`localhost`). Żeby wystawić ją publicznie
pod adresem typu `miasto88.pl`, potrzebny jest hosting obsługujący **Node.js** —
np. [Railway](https://railway.app), [Render](https://render.com) albo VPS (mikr.us, OVH).
Wgrywasz cały folder, ustawiasz komendę startową **`npm start`** i podpinasz domenę.
Hosting sam poda numer portu przez zmienną `PORT` — serwer to obsługuje.

Zwykły hosting „na FTP" (home.pl, cyber_Folks w podstawowym pakiecie) **nie wystarczy** —
tam działają tylko pliki statyczne, bez panelu i rezerwacji.

Przed publikacją koniecznie:
1. zmień hasło administratora,
2. ustaw hosting na HTTPS (ciasteczko sesji jest wtedy bezpieczne),
3. skonfiguruj automatyczny backup pliku `data/db.json`.

---

## Do uzupełnienia własnymi danymi

Karta menu jest **prawdziwa** — 102 pozycje w 14 kategoriach, przepisane z Waszych
zdjęć menu (pizza w trzech rozmiarach, burgery, rollo, dania główne, sałatki, napoje).
Warto ją przejrzeć w panelu i sprawdzić, czy nic się nie przekręciło przy przepisywaniu.

Do uzupełnienia zostaje:

- **zdjęcia** — obecne są stockowe, patrz sekcja „Zdjęcia" wyżej,
- **danie sztandarowe** na stronie głównej ustawiłem na „Placek po zbójnicku"
  (golonka z Facebooka nie występuje w karcie) — zmień w Ustawieniach, jeśli wolisz inne,
- **godziny otwarcia** — wpisane 11:00–00:00 dla każdego dnia (znana była tylko godzina
  zamknięcia); popraw w zakładce Godziny otwarcia,
- **link do Facebooka** — na razie prowadzi do wyszukiwarki FB; wklej właściwy adres
  w Ustawieniach.
