# Dzieje Rzeczypospolitej szlacheckiej — gra konsolowo‑mapowa (prototype)

Lekka, przeglądarkowa gra turowa osadzona w realiach XVII‑wiecznej Rzeczypospolitej.  
Sterowanie odbywa się przez prosty UI (mapa SVG, popupy) oraz **konsolę poleceń** wbudowaną w stronę.  
Silnik gry znajduje się w `game.js`, a warstwa UI w skryptach frontendu (np. w pliku z logiką mapy i popupów).

---

## Spis treści
- [Zrzuty](#zrzuty)
- [Wymagania](#wymagania)
- [Szybki start](#szybki-start)
- [Struktura projektu](#struktura-projektu)
- [Pętla rozgrywki](#pętla-rozgrywki)
- [Sterowanie i UI](#sterowanie-i-ui)
- [Konsola poleceń](#konsola-poleceń)
- [Wydarzenia specjalne](#wydarzenia-specjalne)
- [Sejm — warianty przed aukcją](#sejm--warianty-przed-aukcją)
- [Licencja](#licencja)

---

## Link

https://lecztomek.github.io/dzieje-reczypospolitej-szlacheckiej/

---

## Wymagania

- Współczesna przeglądarka (Chrome / Edge / Firefox / Safari).
- Do serwowania plików użyj jednego z rozwiązań:
  - **Node (http-server)**: `npx http-server -p 5173`
  - **VS Code – Live Server**: uruchom projekt i otwórz `index.html`

> Nie ma żadnych zależności backendowych — to statyczny frontend.

---

## Szybki start

1. Sklonuj repo:
   ```bash
   git clone <URL_Twojego_repo>
   cd <nazwa_repo>
   ```
2. Odpal serwer statyczny (wybierz jedno):
   ```bash
   npx http-server -p 5173
   # lub Live Server w VS Code
   ```
3. Otwórz: [http://localhost:5173](http://localhost:5173)
4. W UI:
   - Dodaj graczy (przykład):  
     `gracz Potoccy red`  
     `gracz Sapiehowie yellow`
   - Start gry:  
     `gstart 10 6`  (10 rund, 6 zł na start)
   - Dalej korzystaj z przycisków faz i/lub konsoli.

---

## Struktura projektu

```
.
├─ index.html            # punkt wejścia aplikacji
├─ styles.css            # style (jeśli wydzielone)
├─ game.js               # silnik gry (ConsoleGame, enums, logika faz)
├─ app.js             # warstwa UI (mapa SVG, popupy, panel akcji, konsola)
├─ images/
│  ├─ e-default.png      # grafiki popupów (wydarzenia)
│  ├─ income.png
│  ├─ devast.png
│  ├─ reinf.png
│  ├─ gameover.png
│  └─ attack.png
└─ README.md
```

---

## Pętla rozgrywki

Każda runda składa się z faz:

1. **Wydarzenia** — może (ale nie musi) wystąpić wydarzenie specjalne.
2. **Dochód**
3. **Sejm — Aukcja**
4. **Sejm — Wybór wariantu ustawy**
5. **Akcje** (administracja / wpływ / posiadłość / rekrutacja / marsz / zamożność)
6. **Starcia** (między graczami)
7. **Wzmacnianie** (N / S / E)
8. **Wyprawy** (ataki na tory wrogów)
9. **Spustoszenia** (N / S / E)

Po ostatniej rundzie wyświetla się **podsumowanie** (popup).

---

## Sterowanie i UI

- **Pasek faz** — podgląd oraz szybkie przejścia (pomocne w testach).
- **Panel akcji** — kontekstowe przyciski zależnie od fazy.
- **Mapa SVG** — klikalne regiony: _Prusy, Wielkopolska, Małopolska, Litwa, Ukraina_.
- **Popupy** — wydarzenia, dochód, sejm (aukcja/wybór), wzmacnianie, wyprawy, spustoszenia, koniec gry.
- **Konsola poleceń** — wpisujesz komendy, log jest wyświetlany pod spodem.

---

## Konsola poleceń

### Gracze / tury
- `gracz <imię> <kolor>` — dodaj gracza, np. `gracz Potoccy red`
- `turn <imię|indeks>` — ustaw aktywnego gracza, np. `turn 1` albo `turn Potoccy`
- `turnclear` — wyczyść aktywnego gracza

### Start i fazy
- `gstart [rundy] [złoto]` — rozpocznij grę, np. `gstart 10 6`
- `gphase` — pokaż bieżącą fazę silnika
- `gnext` — przejdź do kolejnej fazy

### Wydarzenia / Dochód
- `gevent <1-25>` — ręcznie zastosuj wydarzenie (do testów)
- `gincome` — pobierz dochód

### Sejm
- `gbid <kto> <kwota>` — oferta w aukcji (np. `gbid Potoccy 2`)
- `gauction` — rozstrzygnij aukcję
- `glaw <1-6>` — ustaw ustawę (po uzyskaniu większości)
- `gchoice <A|B>` — wybór wariantu

### Akcje
- `gact administracja`
- `gact wplyw <prowincja>`
- `gact posiadlosc <prowincja>`
- `gact rekrutacja <prowincja>`
- `gact zamoznosc <prowincja>`
- `gact marsz <z> <do>`

### Wrogowie / walki
- `greinf <N S E>` — rzuty wzmocnień (1–6)
- `gattack <wróg> <z_prowincji> <r1> [r2]…` — wyprawy na tory wrogów
- `gpass` — PASS w fazie wypraw
- `gduel <prow> <A> <B> <rzutyA...> | <rzutyB...>` — potyczka między graczami
- `gduelauto <prow> <A> <B>` — potyczka z automatycznymi rzutami (tyle kości, ile jednostek)

### Spustoszenia / debug
- `gdevast <N S E>` — rzuty spustoszeń (1–6)
- `gstate` — wypisz stan gry do konsoli
- `clear` — wyczyść rysunki • `reset` — pełny reset UI
- `pomoc` — lista komend

> **Prowincje:** `prusy`, `wielkopolska`, `malopolska`, `litwa`, `ukraina`  
> **Wrogowie (tory):** `szwecja` (N), `moskwa` (E), `tatarzy` (S)

---

## Wydarzenia specjalne

- Przy **starcie gry** (komenda `gstart`) powstaje **harmonogram** (tablica 0/1) o długości liczby rund.
- **1. runda nigdy nie ma wydarzenia** (flaga = 0).
- Każda kolejna runda ma **szansę** na wydarzenie (np. 45%).  
- W fazie **Wydarzenia**:
  - jeżeli flaga = 0 → popup *„Brak wydarzenia”*, **bez** wywołania `game.events.apply`,
  - jeżeli flaga = 1 → los 1–25 i `game.events.apply(n)`; wynik w popupie.

---

## Sejm — warianty przed aukcją

Po wylosowaniu ustawy, **zanim** zacznie się aukcja, popup Sejmu wyświetla krótkie **opisy wariantów A/B** (z `LAW_VARIANTS`).  
Dzięki temu gracze wiedzą, o co licytują. Wybór wariantu następuje **po** aukcji (gdy jest większość).

---

## Licencja

Wstaw tu wybraną licencję (np. MIT) lub informację „All rights reserved”.
