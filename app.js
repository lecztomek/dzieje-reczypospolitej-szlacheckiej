// ===================== PODPIĘCIE SILNIKA (game.js) =====================
import { ConsoleGame, ProvinceID, RaidTrackID, StateID } from './game.js';

// instancja gry + ułatwienia globalne (DevTools)
export const game = new ConsoleGame();
window.game = game;
window.ProvinceID = ProvinceID;
window.RaidTrackID = RaidTrackID;
window.StateID = StateID;

const EVENT_DEFAULT_POPUP_IMG = './images/e-default.png';
const INCOME_POPUP_IMG = './images/income.png';
const DEVASTATION_POPUP_IMG = './images/devast.png';
const REINFORCEMENTS_POPUP_IMG = './images/reinf.png';
const FINAL_SUMMARY_POPUP_IMG = './images/gameover.png';
const ATTACK_POPUP_IMG = './images/attack.png';

let _actionWizard = null; 

// ==== Sejm: stan + opisy ustaw ====
let _sejmLawRound = -1;                // runda, w której wylosowaliśmy ustawę
let _sejmLaw = null;                   // { id, name }
let _sejmAuctionWinner = null;         // nazwa zwycięzcy aukcji (po rozstrzygnięciu)
let _sejmSkipPopupRound = -1;

let _finalPopupShown = false;

const LAW_POOL = [
  { id: 1, name: 'Podatek' },
  { id: 2, name: 'Podatek' },
  { id: 3, name: 'Wojsko' },       // było: Pospolite ruszenie
  { id: 4, name: 'Wojsko' },       // było: Pospolite ruszenie
  { id: 5, name: 'Gospodarka' },   // było: Fortyfikacje
  { id: 6, name: 'Pokój' },
];

const ATTACK_TARGETS = {
  prusy:        ['szwecja'],
  wielkopolska: [],
  malopolska:   ['tatarzy'],
  litwa:        ['szwecja','moskwa'],
  ukraina:      ['tatarzy','moskwa'],
};

// Opisy i przyciski dla wariantów (zgodnie z silnikiem)
const LAW_VARIANTS = {
  1: { // Podatek
    title: 'Podatek',
    buttons: [
      { label: 'Podatek — wariant A (+2 zł zwycięzca, +1 zł reszta)', choice: 'A' },
      { label: 'Cło — wariant B (+3 zł zwycięzca, +1 na losowym torze)', choice: 'B' },
    ],
    describe: [
      'A: zwycięzca aukcji +2 zł, pozostali gracze +1 zł.',
      'B: zwycięzca aukcji +3 zł oraz +1 na losowym torze (N/E/S).',
    ],
  },
  2: { // Podatek
    title: 'Podatek',
    buttons: [
      { label: 'Podatek — wariant A (+2 zł zwycięzca, +1 zł reszta)', choice: 'A' },
      { label: 'Cło — wariant B (+3 zł zwycięzca, +1 na losowym torze)', choice: 'B' },
    ],
    describe: [
      'A: zwycięzca aukcji +2 zł, pozostali gracze +1 zł.',
      'B: zwycięzca aukcji +3 zł oraz +1 na losowym torze (N/E/S).',
    ],
  },
  3: { // Wojsko
    title: 'Wojsko',
    buttons: [
      { label: 'Pospolite ruszenie — wariant A (+1 jednostka w kontrolowanej prowincji)', choice: 'A' },
      { label: 'Fort — wariant B (fort w losowej kontrolowanej prowincji zwycięzcy)', choice: 'B' },
    ],
    describe: [
      'A: każdy gracz może otrzymać +1 jednostkę w prowincji, którą jednoznacznie kontroluje (automatyczny wybór).',
      'B: wylosuj jedną z kontrolowanych przez zwycięzcę prowincji bez fortu i postaw tam fort.',
    ],
  },
  4: { // Wojsko
    title: 'Wojsko',
    buttons: [
      { label: 'Pospolite ruszenie — wariant A (+1 jednostka w kontrolowanej prowincji)', choice: 'A' },
      { label: 'Fort — wariant B (fort w losowej kontrolowanej prowincji zwycięzcy)', choice: 'B' },
    ],
    describe: [
      'A: każdy gracz może otrzymać +1 jednostkę w prowincji, którą jednoznacznie kontroluje (automatyczny wybór).',
      'B: wylosuj jedną z kontrolowanych przez zwycięzcę prowincji bez fortu i postaw tam fort.',
    ],
  },
  5: { // Gospodarka
    title: 'Gospodarka',
    buttons: [
      { label: 'Gospodarka — wariant A (Zamożność +1 w losowej prowincji zwycięzcy)', choice: 'A' },
      { label: 'Gospodarka — wariant B (Zamożność +2 w losowej prowincji na mapie)', choice: 'B' },
    ],
    describe: [
      'A: zwiększ Zamożność o +1 w losowo wybranej prowincji kontrolowanej przez zwycięzcę.',
      'B: zwiększ Zamożność o +2 w losowo wybranej prowincji na całej mapie (globalnie, nie per gracz).',
    ],
  },
  6: { // Pokój
    title: 'Pokój',
    buttons: [
      { label: 'Pokój — wariant A (wszystkie tory −1)', choice: 'A' },
      { label: 'Pokój — wariant B (wybrany tor −2)', choice: 'B', track: 'N' },
      { label: 'Pokój — wariant B (wybrany tor −2)', choice: 'B', track: 'E' },
      { label: 'Pokój — wariant B (wybrany tor −2)', choice: 'B', track: 'S' },
    ],
    describe: [
      'A: wszystkie trzy tory (N, E, S) −1.',
      'B: jeden wybrany tor (N/E/S) −2.',
    ],
  },
};


function randRolls(n){ return Array.from({length: Math.max(1, n|0)}, ()=> 1 + Math.floor(Math.random()*6)); }

function maybeAutoAdvanceAfterAttacks(){
  const s = game.getPublicState?.() || {};
  const phase = s.current_phase || game.round?.currentPhaseId?.();
  const hasActive = Number.isInteger(s.active_attacker_index);
  if (phase === 'attacks' && !hasActive){
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next z Wypraw -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function roll1d6(){ return 1 + Math.floor(Math.random()*6); }

function isGameOverState(s){ return s?.state === StateID.GAME_OVER; }

function ensureSejmLawForRound(state, { forcePopup = false } = {}){
  const s = state || game.getPublicState?.();
  if (!s) return;

  const currentRound = s.round_status?.current_round ?? roundCur;
  const curPhase = s.current_phase || game.round?.currentPhaseId?.();

  // jeśli już mamy wylosowaną na tę rundę
  if (_sejmLawRound === currentRound && _sejmLaw) {
    if (forcePopup) {
      popupFromEngine(`Sejm — wylosowano ustawę: ${_sejmLaw.name}`, [
        `Wybrano ustawę: ${_sejmLaw.name}.`,
        'Teraz licytacja marszałkowska (aukcja).'
      ], { buttonText: 'Dalej (Aukcja)' });
    }
    return;
  }

  // losowanie nowej (UI)
  const pick = LAW_POOL[Math.floor(Math.random() * LAW_POOL.length)];
  _sejmLawRound = currentRound;
  _sejmLaw = pick;
  _sejmAuctionWinner = null;

  // USTAWY w silniku NIE ustawiamy w fazie auction (brak większości!)
  if (curPhase === 'sejm') {
    const lines = game.sejm.setLaw(pick.id) || [];
    logEngine(lines);
  }

// popup informacyjny (UI) – tylko na żądanie
if (forcePopup) {
  popupFromEngine(`Sejm — wylosowano ustawę: ${pick.name}`, [
    `Wybrano ustawę: ${pick.name}.`,
    'Teraz licytacja marszałkowska (aukcja).'
  ], { buttonText: 'Dalej (Aukcja)' });
}

}

function computeNoblesPerProvince(state){
  // Zwraca: { prusy: [{color:"#hex", count: n}, ...], ... } tylko tam, gdzie count>0
  const out = {};
  for (const [pid, arr] of Object.entries(state.nobles || {})){
    const key = provKeyFromId(pid);
    if (!key) continue;
    const items = [];
    arr.forEach((cnt, pidx) => {
      if ((cnt|0) > 0){
        items.push({ color: playerColorByIndex(state, pidx), count: cnt|0 });
      }
    });
    if (items.length) out[key] = items.sort((a,b)=> b.count - a.count);
  }
  return out;
}

function renderNoblesList(state){
  if (!noblesListEl) return;                 // brak listy w DOM → nic nie robimy
  noblesListEl.innerHTML = '';

  const data = computeNoblesPerProvince(state);
  const keys = Object.keys(data);

  if (keys.length === 0){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Brak szlachciców w prowincjach.';
    noblesListEl.appendChild(empty);
    return;
  }

  keys.forEach(key => {
    const row = document.createElement('div');
    row.className = 'province-item';

    const name = document.createElement('div');
    name.className = 'province-name';
    name.textContent = PROV_DISPLAY[key] || humanize(key);

    const badges = document.createElement('div');
    badges.className = 'badges';

    data[key].forEach(({color, count}) => {
      const badge = document.createElement('span');
      badge.className = 'noble-badge';
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.setProperty('--dot', color);
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(String(count)));
      badges.appendChild(badge);
    });

    row.append(name, badges);
    noblesListEl.appendChild(row);
  });
}

function renderProvincePicker(container, onPick, title='Wybierz prowincję'){
  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';

  const h = document.createElement('div');
  h.textContent = title;
  h.style.color = '#94a3b8';
  h.style.margin = '0 0 8px';
  h.style.fontWeight = '700';
  wrap.appendChild(h);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  // auto-fit: dostosowuje liczbę kolumn do szerokości,
  // minmax 140px zapewnia czytelny przycisk
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(140px, 1fr))';
  grid.style.gap = '8px';

  ['prusy','wielkopolska','malopolska','litwa','ukraina'].forEach(k=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'phase-action';
    b.textContent = k;

    // zapewnij wygodny rozmiar i łamanie tekstu
    b.style.width = '100%';
    b.style.padding = '10px 12px';
    b.style.whiteSpace = 'normal';
    b.style.wordBreak = 'break-word';
    b.style.lineHeight = '1.2';
    b.style.minHeight = '40px';
    b.style.justifySelf = 'stretch';

    b.addEventListener('click', ()=> onPick(k));
    grid.appendChild(b);
  });

  wrap.appendChild(grid);
  container.appendChild(wrap);
}

function maybeAutoAdvanceAfterAction(){
  const s = game.getPublicState?.() || {};
  const phase = s.current_phase || game.round?.currentPhaseId?.();
  const hasActive = Number.isInteger(s.active_player_index);
  if (phase === 'actions' && !hasActive){
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next z Akcji -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function buildAutoPicksPospoliteA(state){
  // zbierz kandydatów: po 1 listę kontrolowanych prowincji (bez znaczenia, czy jest fort)
  const perPlayer = new Map(); // pidx -> [provinceId,...]
  const players = state.settings?.players || [];

  for (const [pid, prov] of Object.entries(state.provinces)){
    const ctrlIdx = controllerIndexFromState(state, pid);
    if (ctrlIdx == null) continue;
    if (!perPlayer.has(ctrlIdx)) perPlayer.set(ctrlIdx, []);
    perPlayer.get(ctrlIdx).push(prov.id);
  }

  // wylosuj po 1 prowincji na gracza
  const picks = [];
  for (const [pidx, arr] of perPlayer.entries()){
    if (!arr.length) continue;
    const k = Math.floor(Math.random() * arr.length);
    picks.push({ playerIndex: pidx, provinceId: arr[k] });
  }
  return picks;
}


function buildAutoPicksFortA(state){
  // zbuduj listę kandydatów per gracz: prowincje kontrolowane i bez fortu
  const perPlayer = new Map(); // pidx -> [provinceId,...]
  const players = state.settings?.players || [];

  for (const [pid, prov] of Object.entries(state.provinces)){
    if (prov.has_fort) continue;
    const ctrlIdx = controllerIndexFromState(state, pid);
    if (ctrlIdx == null) continue;
    if (!perPlayer.has(ctrlIdx)) perPlayer.set(ctrlIdx, []);
    perPlayer.get(ctrlIdx).push(prov.id);
  }

  // wylosuj po 1 prowincji dla każdego gracza, który ma kandydatów
  const picks = [];
  for (const [pidx, arr] of perPlayer.entries()){
    if (!arr.length) continue;
    const k = Math.floor(Math.random() * arr.length);
    picks.push({ playerIndex: pidx, provinceId: arr[k] });
  }
  return picks;
}

// === Render „opisowych” przycisków wariantów (Z NAPRAWIONYM wywołaniem silnika) ===
function renderLawChoiceUI(container, lawId, winnerName){
  const spec = LAW_VARIANTS[lawId];
  if (!spec) return;

  const info = document.createElement('div');
  info.style.color = '#94a3b8';
  info.style.margin = '6px 0 10px';
  info.textContent = `Zwycięzca aukcji: ${winnerName || '—'}. Ustawa: ${spec.title} — wybierz wariant.`;
  container.appendChild(info);

  if (Array.isArray(spec.describe) && spec.describe.length){
    const desc = document.createElement('ul');
    desc.style.margin = '0 0 8px';
    desc.style.paddingLeft = '18px';
    spec.describe.forEach(d => {
      const li = document.createElement('li');
      li.style.color = '#9ca3af';
      li.textContent = d;
      desc.appendChild(li);
    });
    container.appendChild(desc);
  }

  // mapka skrótu toru -> RaidTrackID
  const TRACK_MAP = { N: RaidTrackID.N, E: RaidTrackID.E, S: RaidTrackID.S };

  spec.buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phase-action';
    btn.textContent = b.label;

    btn.addEventListener('click', () => {
      // upewnij się, że jesteśmy w fazie sejm i że ustawa jest ustawiona w silniku
      const ph = game.round?.currentPhaseId?.();
      if (ph === 'auction') {
        game.finishPhaseAndAdvance(); // auction -> sejm
      }
      try {
        game.sejm.setLaw(lawId);
      } catch (_) {
        // ignorujemy, jeśli już ustawione
      }

      
      // przygotuj ewentualny 'extra'
      let extra = undefined;
      if (b.choice === 'B' && b.track){              // B z torem (3/4/6)
        extra = { track: TRACK_MAP[b.track] };
      } else if (b.choice === 'A'){
        const s = game.getPublicState?.() || {};
        if (lawId === 3 || lawId === 4){            // Pospolite ruszenie A
          extra = buildAutoPicksPospoliteA(s);
          if (!extra.length) ok('(UI) Nikt jednoznacznie nie kontroluje prowincji — brak przyrostów.');
        } else if (lawId === 5){                    // Fortyfikacje A
          extra = buildAutoPicksFortA(s);
          if (!extra.length) ok('(UI) Brak kontrolowanych prowincji bez fortu — nic do położenia.');
        }
        // dla 1/2 i 6 A — extra niepotrzebne
      }

      ok(`Sejm: wybór wariantu ${b.choice}${b.track ? ` (tor ${b.track})` : ''}.`);
      let lines;
      try {
        lines = game.sejm.chooseVariant(b.choice, extra);
      } catch (e) {
        err('Błąd przy wyborze wariantu: ' + e.message);
        return;
      }

      popupFromEngine('Sejm — wybrano wariant', lines, {
        buttonText: 'Dalej (Akcje)',
        onAction: () => {
          const nxt = game.finishPhaseAndAdvance();    // przejście z „sejm” -> „actions”
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
        }
      });
    });

    container.appendChild(btn);
  });
}

// ===================== Dane i narzędzia =====================
const REGIONS = {
  prusy: { key: "prusy", el: null, aliases: ["prusy"] },
  wielkopolska: { key: "wielkopolska", el: null, aliases: ["wielkopolska","wkp"] },
  malopolska: { key: "malopolska", el: null, aliases: ["małopolska","malopolska","mlp"] },
  litwa: { key: "litwa", el: null, aliases: ["litwa"] },
  ukraina: { key: "ukraina", el: null, aliases: ["ukraina"] },
};

// === [DODAJ] Odwrotna mapa z enumów do kluczy UI ===
const REV_PROV_MAP = {
  [ProvinceID.PRUSY]: 'prusy',
  [ProvinceID.LITWA]: 'litwa',
  [ProvinceID.UKRAINA]: 'ukraina',
  [ProvinceID.WIELKOPOLSKA]: 'wielkopolska',
  [ProvinceID.MALOPOLSKA]: 'malopolska',
};

// === [DODAJ] Bezpieczna normalizacja identyfikatora prowincji ===
function provKeyFromId(id){
  // jeżeli string, przyjmij np. "LITWA" / "litwa"
  if (typeof id === 'string') return norm(id);
  // jeżeli number/enum, sięgnij do odwrotnej mapy
  if (typeof id === 'number') return REV_PROV_MAP[id] || null;
  // fallback (np. obiekt z polem id)
  if (id && typeof id.id !== 'undefined') return provKeyFromId(id.id);
  return null;
}


// ======= Skala zamożności prowincji (0..3) =======
const REGION_WEALTH_COLORS = ['#d1d5db','#a3e635','#4ade80','#16a34a'];
function wealthColor(level){ const n = Math.max(0, Math.min(3, Number(level))); return REGION_WEALTH_COLORS[n]; }
function setRegionWealth(regionOrKey, level){
  const region = typeof regionOrKey === 'string' ? REGIONS[regionOrKey] : regionOrKey;
  if(!region || !region.el) return false;
  region.el.setAttribute('fill', wealthColor(level));
  return true;
}

const svg = document.getElementById('mapSvg');
const overlay = document.getElementById('overlay');
const boxLayer = document.getElementById('boxLayer');
const armiesLayer = document.getElementById('armiesLayer');
const enemiesLayer = document.getElementById('enemiesLayer');
const tooltip = document.getElementById('tooltip') || createTooltip();
const coordsBadge = document.getElementById('coords');
const logEl = document.getElementById('log');
const inputEl = document.getElementById('cmdInput');
const formEl = document.getElementById('cmdForm');
const noblesBody = document.getElementById('noblesBody');
const noblesListEl = document.getElementById('noblesList'); 
const playersListEl = document.getElementById('playersList');

const marshalBox = document.getElementById('marshalBox');
const marshalResetBtn = document.getElementById('marshalResetBtn');
const playersBody = document.getElementById('playersBody');
const turnSwatch = document.getElementById('turnSwatch');
const turnNameEl = document.getElementById('turnName');

// === Jedna aktualna faza (badge) w nagłówku ===
const roundLabelEl = document.getElementById('roundLabel');
const roundWrap = roundLabelEl?.parentElement; // to jest .round
let phaseNowEl = null;


if (marshalBox) marshalBox.style.display = 'none';
if (marshalResetBtn) marshalResetBtn.style.display = 'none';

let curPlayerIdx = -1; // -1 = brak aktywnego gracza

const history = [];
let histIdx = -1;
let idCounter = 1;

let roundCur = 1;
let roundMax = 10;

// Szansa na wystąpienie wydarzenia w danej rundzie (oprócz 1. rundy)
const SPECIAL_EVENT_CHANCE = 0.45; // dostosuj np. 0.3–0.6

// Harmonogram wydarzeń na całą grę: [0|1, 0|1, ...] długości = liczba rund
let _eventSchedule = [];

/** Wylosuj rozkład wydarzeń dla całej partii.
 *  • Nigdy brak wydarzenia w 1. rundzie (index 0 = 0)
 *  • Każda następna runda: 1 z prawdopodobieństwem SPECIAL_EVENT_CHANCE
 */
function buildEventSchedule(totalRounds){
  const N = Math.max(1, totalRounds|0);
  _eventSchedule = Array.from({length: N}, (_,i) =>
    i === 0 ? 0 : (Math.random() < SPECIAL_EVENT_CHANCE ? 1 : 0)
  );
  // Dev-log (opcjonalnie, usuń jeśli nie chcesz)
  //ok(`[Wydarzenia] Rozkład: ${_eventSchedule.join(' ')}`);
}

/** Zwraca true, jeśli w danej rundzie ma być wydarzenie. */
function hasEventThisRound(roundNo){
  const i = (roundNo|0) - 1;
  return _eventSchedule[i] === 1;
}

/** Gdyby harmonogram nie istniał / ma złą długość — odbuduj go. */
function ensureEventSchedule(roundsTotal){
  if (!Array.isArray(_eventSchedule) || _eventSchedule.length !== (roundsTotal|0)){
    buildEventSchedule(roundsTotal|0);
  }
}


function renderPlayerChip(p){
  const row = document.createElement('div');
  row.className = 'player-item';
  row.id = `pitem-${p.key}`;

  const dot = document.createElement('span');
  dot.className = 'player-dot';
  dot.style.background = p.color;
  dot.style.borderColor = p.color;

  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = p.name;

  const gold = document.createElement('span');
  gold.className = 'player-gold';
  gold.innerHTML = `<span class="coin"></span><strong class="val">0</strong>`;

  row.append(dot, name, gold);
  playersListEl.appendChild(row);
}

// ZAMIANA: rysowanie gracza jako chip (nie <tr>)
function renderPlayerRow(p){
  const chip = document.createElement('span');
  chip.id = `player-${p.key}`;
  chip.className = 'player-chip';

  const dot = document.createElement('span');
  dot.className = 'player-dot';
  dot.style.color = p.color;

  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = p.name;

  const gold = document.createElement('span');
  gold.className = 'player-gold';
  gold.innerHTML = `<span class="coin"></span><span class="val">—</span>`;
  gold.setAttribute('data-col', 'gold');

  chip.append(dot, name, gold);
  playersBody.appendChild(chip);
}

// bez zmian interfejsu:
function addPlayer(name, color){
  if (!name || !color) return false;
  if (findPlayer(name)) return 'exists';
  const p = { key: playerKey(name), name, color };
  PLAYERS.push(p);
  renderPlayerRow(p);
  return true;
}

// aktualizacja tylko złota (bo resztę usunęliśmy)
function updatePlayersUIFromState(s){
  const players = (s.settings?.players || []);
  players.forEach(sp => {
    const ui = PLAYERS.find(p => p.name === sp.name);
    if (!ui) return;
    const chip = document.getElementById(`player-${ui.key}`);
    if (!chip) return;
    const goldEl = chip.querySelector('[data-col="gold"] .val');
    if (goldEl) goldEl.textContent = String(sp.gold ?? '0');
  });
}


function ensurePhaseNowEl(){
  if (phaseNowEl || !roundWrap) return;
  phaseNowEl = document.createElement('div');
  phaseNowEl.id = 'phaseNow';
  phaseNowEl.className = 'phase-now';

  // label „FAZA:”
  const lbl = document.createElement('span');
  lbl.className = 'phase-now-label';
  lbl.textContent = 'FAZA:';

  // miejsce na nazwę fazy
  const txt = document.createElement('span');
  txt.id = 'phaseNowText';
  txt.textContent = '—';

  phaseNowEl.append(lbl, txt);
  roundWrap.insertBefore(phaseNowEl, roundLabelEl); // przed „RUNDA …”
}

function setPhaseNow(engPhase){
  ensurePhaseNowEl();
  const label = PHASE_LABELS[engPhase] || '—';
  const txt = document.getElementById('phaseNowText');
  if (txt) txt.textContent = ' ' + label; // spacja po „FAZA:”
}

ensurePhaseNowEl();

const PHASE_LABELS = {
  events: 'Wydarzenia',
  income: 'Dochód',
  auction:'Sejm — Aukcja',
  sejm:   'Sejm',
  actions:'Akcje',
  battles:'Starcia',
  reinforcements:'Wzmacnianie',
  attacks:'Wyprawy',
  devastation:'Spustoszenia'
};

function updateRoundUI(){
  const curEl = document.getElementById('roundCur');
  if (curEl) curEl.textContent = String(roundCur);

  const maxEl = document.getElementById('roundMax');
  if (maxEl) maxEl.textContent = String(roundMax);
}

function applyCurrentTurnFromState(s){
  const phase = s.current_phase || game.round?.currentPhaseId?.();
  let idx = -1;

  if (phase === 'actions' && Number.isInteger(s.active_player_index)) {
    idx = s.active_player_index;
  } else if (phase === 'attacks' && Number.isInteger(s.active_attacker_index)) {
    idx = s.active_attacker_index;
  } else {
    idx = -1; // w innych fazach czyścimy
  }

  if (idx !== curPlayerIdx) {
    curPlayerIdx = idx;
    updateTurnUI();
  }
}

function updateTurnUI(){
  if (PLAYERS.length === 0 || curPlayerIdx < 0 || curPlayerIdx >= PLAYERS.length){
    if (turnSwatch){ turnSwatch.style.background = 'none'; turnSwatch.style.borderColor = '#475569'; }
    if (turnNameEl){ turnNameEl.textContent = '–'; }
    return;
  }
  const p = PLAYERS[curPlayerIdx];
  if (turnSwatch){ turnSwatch.style.background = p.color; turnSwatch.style.borderColor = p.color; }
  if (turnNameEl){ turnNameEl.textContent = p.name; }
}

function setTurnByIndex(idx){
  if (PLAYERS.length === 0) { curPlayerIdx = -1; updateTurnUI(); return false; }
  const n = Math.max(0, Math.min(PLAYERS.length - 1, idx));
  curPlayerIdx = n;
  updateTurnUI();
  ok(`Tura gracza: ${PLAYERS[curPlayerIdx].name}`);
  return true;
}

function setTurnByName(name){
  const p = findPlayer(name);
  if (!p) { err(`Nie ma gracza "${name}".`); return false; }
  const i = PLAYERS.findIndex(x => x.key === p.key);
  return setTurnByIndex(i);
}

// Podłącz elementy regionów
Object.keys(REGIONS).forEach(k => {
  const el = svg.querySelector(`[data-key="${k}"]`);
  REGIONS[k].el = el;
});

function createTooltip(){
  const t = document.createElement('div');
  t.className = 'tooltip';
  t.id = 'tooltip';
  t.setAttribute('role','tooltip');
  t.setAttribute('aria-hidden','true');
  document.body.appendChild(t);
  return t;
}

function runCmd(cmd){ pushToConsole(cmd, true); }

function pushToConsole(text, submit = true){
  inputEl.value = text;
  if(submit){
    formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  } else {
    inputEl.focus();
    setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
  }
}

// ===== [DODAJ] Popup (modal) API =====
const popupEl = document.getElementById('popupBackdrop');
const popupTitleEl = document.getElementById('popupTitle');
const popupTextEl = document.getElementById('popupText');
const popupImgEl = document.getElementById('popupImage');
const popupOkBtn = document.getElementById('popupOkBtn');
const popupCloseBtn = document.querySelector('.popup-close');

let _popupOnClose = null;

function openPopup({
  title = '',
  text = '',
  imageUrl = '',
  buttonText = 'Zamknij',
  onAction = null,            // ← callback wywoływany po kliknięciu przycisku
  onClose = null,
  hideImage = false
} = {}){
  popupTitleEl.textContent = title || '';

  const t = Array.isArray(text) ? text.filter(Boolean).join('\n') : (text || '');
  popupTextEl.textContent = t || '(brak danych)';

  if (imageUrl){
    popupImgEl.src = imageUrl;
    popupImgEl.hidden = false;
  } else {
    popupImgEl.removeAttribute('src');
    popupImgEl.hidden = true;
  }

  // tekst przycisku i akcja
  popupOkBtn.textContent = buttonText || 'OK';
  popupOkBtn.onclick = async () => {
    try {
      if (typeof onAction === 'function') {
        const res = await onAction();
        // Jeżeli callback zwróci dokładnie false — NIE zamykaj (np. chcesz coś jeszcze dokończyć)
        if (res === false) return;
      }
    } catch (e) {
      console.error('Popup onAction error:', e);
      // mimo błędu — zamkniemy, chyba że chcesz inaczej: wtedy w onAction zwróć false
    }
    closePopup();
  };

  _popupOnClose = typeof onClose === 'function' ? onClose : null;

  popupEl.hidden = false;
  popupOkBtn.focus();
}


function closePopup(){
  popupEl.hidden = true;
  if (_popupOnClose){ try { _popupOnClose(); } catch{} }
  _popupOnClose = null;
}
// zamykanie: przycisk, X, klik w tło, Esc
popupCloseBtn?.addEventListener('click', closePopup);
popupEl?.addEventListener('click', (e)=>{ if (e.target === popupEl) closePopup(); });
document.addEventListener('keydown', (e)=>{ if (!popupEl.hidden && e.key === 'Escape') closePopup(); });

// pomocnicze: pokaż wynik z silnika (string | string[])
function popupFromEngine(title, engineOut, opts={}){
  openPopup({ title, text: engineOut, ...opts });
}


// ===================== Utilsy =====================
const diac = { "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z" };
function norm(s){
  return (s||"").toString().trim().toLowerCase().replace(/[ąćęłńóśźż]/g, m => diac[m] || m);
}

function uiFindPlayerByName(name){
  const k = norm(name);
  return PLAYERS.find(p => norm(p.name) === k) || null;
}

function getRegionByName(name){
  const key = norm(name);
  for(const r of Object.values(REGIONS)){
    if (r.key===key || r.aliases.includes(key)) return r;
  }
  return null;
}
function logEngine(out){
  if (!out || (Array.isArray(out) && out.length === 0)) { 
    ok('(brak szczegółów z silnika)'); 
    return; 
  }
  if (Array.isArray(out)) out.forEach(line => { if (line) ok(line); });
  else if (typeof out === 'string') ok(out);
}

function bboxCenter(el){ const b = el.getBBox(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; }
function print(msg, cls="entry"){ const div = document.createElement('div'); div.className = `entry ${cls}`; div.textContent = msg; logEl.appendChild(div); logEl.scrollTop = logEl.scrollHeight; }
function ok(msg){ print(msg, "entry ok"); }
function err(msg){ print(msg, "entry err"); }
function clientToSvg(clientX, clientY){
  const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM(); if (!ctm) return {x:0,y:0};
  const inv = ctm.inverse(); const res = pt.matrixTransform(inv);
  return { x: +res.x.toFixed(1), y: +res.y.toFixed(1) };
}

// ===== Pasek faz (UI tylko do podglądu) =====
const PHASES = ['Wydarzenia','Dochód', 'Sejm','Akcje','Starcia', 'Wzmacnanie', 'Wyprawy','Spustoszenia'];
let phaseCur = 1; // 1..PHASES.length
const phaseBarEl = document.getElementById('phaseBar');

function buildPhaseBar(){
  if(!phaseBarEl) return;
  phaseBarEl.innerHTML = '';
  PHASES.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phase';
    btn.setAttribute('data-idx', String(i+1));
    btn.innerHTML = `<span class="idx">${i+1}.</span>${name}`;
    btn.addEventListener('click', () => setPhase(i+1));
    phaseBarEl.appendChild(btn);
  });
  updatePhaseUI();
}

// ===== Panel akcji fazy (przyciski, które tylko wpisują komendy) =====
const phaseActionsEl = document.getElementById('phaseActions');

// Podpinamy do cyklu UI: po zmianie fazy odśwież panel
const _origUpdatePhaseUI = updatePhaseUI;
updatePhaseUI = function(){
  _origUpdatePhaseUI.call(this);
  buildPhaseActionsSmart(game.getPublicState?.() || {}); // ← smart zamiast statycznego
};

function updatePhaseUI(){
  const items = phaseBarEl?.querySelectorAll('.phase') || [];
  items.forEach(el => {
    const idx = +el.getAttribute('data-idx');
    const active = (idx === phaseCur);
    el.setAttribute('data-active', active ? '1' : '0');
    if (active) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });
}
function setPhase(n){
  const max = PHASES.length;
  const next = Math.min(Math.max(1, parseInt(n,10)), max);
  if (!Number.isFinite(next)) return false;
  phaseCur = next;
  updatePhaseUI();
  ok(`Faza UI ${phaseCur}/${max}: ${PHASES[phaseCur-1]}.`);
  return true;
}

// ===== Gracze (UI) =====
const PLAYERS = []; // { key, name, color }

function playerKey(name){ return norm(name).replace(/\s+/g,'_'); }
function findPlayer(name){ const k = playerKey(name); return PLAYERS.find(p => p.key === k) || null; }

// ===================== Rysowanie (piny, linie, etykiety) – używane przez UI sync =====================
function makeId(prefix){ return `${prefix}-${idCounter++}`; }
function drawPinAt(x,y,label){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id', makeId('pin')); g.setAttribute('filter','url(#softGlow)');
  const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', 8);
  circle.setAttribute('fill', '#eab308'); circle.setAttribute('stroke', '#0b1221'); circle.setAttribute('stroke-width','2');
  const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 2.6); dot.setAttribute('fill', '#0b1221');
  g.appendChild(circle); g.appendChild(dot);
  if (label){
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', x + 12); text.setAttribute('y', y - 12);
    text.setAttribute('font-size','20'); text.setAttribute('font-weight','700');
    text.setAttribute('fill','#e5e7eb'); text.setAttribute('stroke','#061127'); text.setAttribute('stroke-width','0.8');
    text.textContent = label; g.appendChild(text);
  }
  overlay.appendChild(g); return g.id;
}
function drawLine(x1,y1,x2,y2,withArrow=true,label){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id', makeId('line'));
  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
  line.setAttribute('stroke','#eab308'); line.setAttribute('stroke-width','4');
  if (withArrow) line.setAttribute('marker-end','url(#arrow)'); g.appendChild(line);
  if (label){
    const midx = (x1+x2)/2, midy = (y1+y2)/2;
    const text2 = document.createElementNS('http://www.w3.org/2000/svg','text');
    text2.setAttribute('x', midx + 8); text2.setAttribute('y', midy - 8);
    text2.setAttribute('font-size','18'); text2.setAttribute('font-weight','700');
    text2.setAttribute('fill','#e5e7eb'); text2.setAttribute('stroke','#061127'); text2.setAttribute('stroke-width','0.8');
    text2.textContent = label; g.appendChild(text2);
  }
  overlay.appendChild(g); return g.id;
}
function drawLabel(x,y,textStr){
  const id = makeId('label');
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('id', id); t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('font-size','22'); t.setAttribute('font-weight','800');
  t.setAttribute('fill','#e5e7eb'); t.setAttribute('stroke','#061127'); t.setAttribute('stroke-width','1');
  t.textContent = textStr; overlay.appendChild(t); return id;
}

// === Obramowanie prowincji zależne od kontroli ===
function setProvinceControlBorder(regionKey, color){
  const el = REGIONS[regionKey]?.el; if(!el) return false;
  el.style.stroke = color;
  el.style.strokeWidth = '5';
  el.style.filter = 'url(#softGlow)'; // delikatna poświata, opcjonalnie
  el.setAttribute('data-controlled','1');
  return true;
}
function clearProvinceControlBorder(regionKey){
  const el = REGIONS[regionKey]?.el; if(!el) return false;
  el.style.stroke = 'var(--map-stroke, #475569)'; // domyślny kontur mapy
  el.style.strokeWidth = '1.5';
  el.style.filter = '';
  el.removeAttribute('data-controlled');
  return true;
}

// liczymy kontrolującego tak samo jak w silniku:
// - max szlachty > 0 → jeśli jeden lider, on wygrywa
// - przy remisie: jeśli tylko część liderów ma wojska > 0 i jest dokładnie jeden taki, on wygrywa
// - inaczej: brak jednoznacznej kontroli
function controllerIndexFromState(s, provinceIdStr){
  const nobles = (s.nobles?.[provinceIdStr]) || [];
  const troops = (s.troops?.[provinceIdStr]) || [];
  if (!Array.isArray(nobles) || nobles.length === 0) return null;

  const maxN = Math.max(...nobles);
  if (maxN <= 0) return null;

  const leaders = nobles.map((v,i)=>[v,i]).filter(([v])=>v===maxN).map(([,i])=>i);
  if (leaders.length === 1) return leaders[0];

  const withTroops = leaders.filter(i => (troops[i]||0) > 0);
  if (withTroops.length === 1) return withTroops[0];

  return null;
}

// ===== PANEL: Marszałek + Szlachcice (na potrzeby sync UI) =====
const NOBLE_SLOTS = 4;
function humanize(key){ return key.charAt(0).toUpperCase() + key.slice(1); }

const PROV_DISPLAY = {
  prusy: "Prusy",
  wielkopolska: "Wielkopolska",
  malopolska: "Małopolska",
  litwa: "Litwa",
  ukraina: "Ukraina",
};

function playerColorByIndex(state, pidx){
  const name = state?.settings?.players?.[pidx]?.name;
  const ui = name ? PLAYERS.find(p => p.name === name) : null;
  return ui?.color || '#eab308';
}

//function setMarshal(color){ marshalBox.style.background = color; marshalBox.style.borderColor = color; return true; }
//function clearMarshal(){ marshalBox.style.background = 'none'; marshalBox.style.borderColor = '#475569'; }
function setMarshal(/* color */){ return true; }
function clearMarshal(){ /* intentionally empty */ }

//marshalResetBtn?.addEventListener('click', () => { clearMarshal(); ok('Wyczyszczono kolor Marszałka.'); });
function getNobleSlot(regionKey, slot){ return document.querySelector(`.noble-slot[data-region="${regionKey}"][data-slot="${slot}"]`); }
function setNoble(regionKey, slot, color, value){
  const el = getNobleSlot(regionKey, slot); if(!el) return false;
  el.style.background = color; el.style.borderColor = color; el.textContent = String(parseInt(value,10));
  el.setAttribute('data-empty','0'); return true;
}
function clearNoble(regionKey, slot){
  const el = getNobleSlot(regionKey, slot); if(!el) return false;
  el.style.background = 'none'; el.style.borderColor = '#475569'; el.textContent = ''; el.setAttribute('data-empty','1'); return true;
}
function resetNobles(regionKey){ let okAny=false; for(let i=1;i<=NOBLE_SLOTS;i++){ okAny = clearNoble(regionKey, i) || okAny; } return okAny; }

// ===================== Boxy + Fort (na potrzeby sync UI) =====================
const BOX_COUNT = 5, BOX_SIZE  = 24, BOX_GAP = 8, BOX_ROW_OFFSET_Y = 40;
function starPoints(cx, cy, spikes = 5, outerR = 12, innerR = 5.2){
  let rot = Math.PI / 2 * 3; const step = Math.PI / spikes; const pts = [];
  for (let i = 0; i < spikes; i++){
    let x = cx + Math.cos(rot) * outerR, y = cy + Math.sin(rot) * outerR;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); rot += step;
    x = cx + Math.cos(rot) * innerR; y = cy + Math.sin(rot) * innerR;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); rot += step;
  } return pts.join(' ');
}
function createBoxes(){
  for(const r of Object.values(REGIONS)){
    if (!r.el) continue;
    const c = bboxCenter(r.el), spacing = BOX_SIZE + BOX_GAP;
    const firstCx = c.x - ((BOX_COUNT-1)/2)*spacing, rowCy = c.y + BOX_ROW_OFFSET_Y;
    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('id', `boxes-${r.key}`); group.setAttribute('data-region', r.key);
    for(let i=0;i<BOX_COUNT;i++){
      const cx = firstCx + i*spacing, x = cx - BOX_SIZE/2, y = rowCy - BOX_SIZE/2;
      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', x.toFixed(1)); rect.setAttribute('y', y.toFixed(1));
      rect.setAttribute('width', BOX_SIZE); rect.setAttribute('height', BOX_SIZE);
      rect.setAttribute('data-idx', (i+1)); rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', 'gray');
      group.appendChild(rect);
    }
    const starCx = firstCx + BOX_COUNT*spacing;
    const star = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    star.setAttribute('points', starPoints(starCx, rowCy, 5, 12, 5.2));
    star.setAttribute('data-fort', '1'); star.setAttribute('fill', 'none'); star.setAttribute('stroke', 'gray');
    group.appendChild(star); boxLayer.appendChild(group);
  }
}
function setBox(regionKey, idx, color){
  const rect = svg.querySelector(`#boxes-${regionKey} rect[data-idx="${idx}"]`);
  if (!rect) return false; rect.style.fill = color; rect.style.stroke = color; return true;
}
function resetBoxes(regionKey){ const rects = svg.querySelectorAll(`#boxes-${regionKey} rect`); rects.forEach(r => r.style.fill = 'none'); return rects.length > 0; }
function setFort(regionKey, color){
  const star = svg.querySelector(`#boxes-${regionKey} polygon[data-fort]`);
  if (!star) return false; star.style.fill = color; star.style.stroke = color; return true;
}
function clearFort(regionKey){
  const star = svg.querySelector(`#boxes-${regionKey} polygon[data-fort]`);
  if (!star) return false; star.style.fill = 'none'; star.style.stroke = 'gray'; return true;
}

// ===================== Armie (na potrzeby sync UI) =====================
const ARMY_SLOTS = 4, ARMY_R = 18, ARMY_COL_SPACING = 46, ARMY_OFFSET_Y = 30;
function createArmySlots(){
  for (const r of Object.values(REGIONS)) {
    if (!r.el) continue;
    const c = bboxCenter(r.el);
    const firstCx = c.x - ((ARMY_SLOTS - 1) / 2) * ARMY_COL_SPACING;
    const armyCy  = c.y - ARMY_OFFSET_Y;
    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('id', `armies-${r.key}`); group.setAttribute('data-region', r.key);
    for (let i = 1; i <= ARMY_SLOTS; i++) {
      const cx = firstCx + (i - 1) * ARMY_COL_SPACING;
      const slotG = document.createElementNS('http://www.w3.org/2000/svg','g');
      slotG.setAttribute('id', `army-${r.key}-${i}`); slotG.setAttribute('data-slot', i);
      slotG.style.display = 'none';
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', cx.toFixed(1)); circle.setAttribute('cy', armyCy.toFixed(1));
      circle.setAttribute('r', ARMY_R); circle.setAttribute('fill', 'none');
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x', cx.toFixed(1)); text.setAttribute('y', armyCy.toFixed(1)); text.textContent = '';
      slotG.appendChild(circle); slotG.appendChild(text); group.appendChild(slotG);
    }
    armiesLayer.appendChild(group);
  }
}
function getArmySlot(regionKey, slot){ return svg.querySelector(`#army-${regionKey}-${slot}`); }
function setArmy(regionKey, slot, color, units){
  const slotG = getArmySlot(regionKey, slot); if(!slotG) return false;
  const c = slotG.querySelector('circle'); const t = slotG.querySelector('text');
  c.style.fill = color; c.style.stroke = color; t.textContent = String(parseInt(units,10)); slotG.style.display = ''; return true;
}
function resetArmies(regionKey){
  const slots = svg.querySelectorAll(`#armies-${regionKey} g[data-slot]`); let okAny = false;
  slots.forEach(s => { const idx = +s.getAttribute('data-slot'); okAny = (()=>{
    const c = s.querySelector('circle'); const t = s.querySelector('text');
    c.style.fill = 'none'; c.style.stroke = 'gray'; t.textContent = ''; s.style.display = 'none'; return true;
  })() || okAny; });
  return okAny;
}

// ===================== *** Tory wrogów (X) – sync UI *** =====================
const ENEMY_COUNT = 6, ENEMY_SPACING = 42, ENEMY_SIZE = 16;
const ENEMY_ALERT_THRESHOLD = 3, ENEMY_ALERT_COLOR = '#ef4444';
const ENEMY_DEFAULT_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || '#eab308';

const ENEMIES = { szwecja:{key:'szwecja',items:[],label:null}, moskwa:{key:'moskwa',items:[],label:null}, tatarzy:{key:'tatarzy',items:[],label:null} };
function makeCross(x, y, size=ENEMY_SIZE, color='gray'){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g'); g.classList.add('cross');
  const l1 = document.createElementNS('http://www.w3.org/2000/svg','line'); const l2 = document.createElementNS('http://www.w3.org/2000/svg','line');
  l1.setAttribute('x1',(x-size).toFixed(1)); l1.setAttribute('y1',(y-size).toFixed(1));
  l1.setAttribute('x2',(x+size).toFixed(1)); l1.setAttribute('y2',(y+size).toFixed(1));
  l2.setAttribute('x1',(x-size).toFixed(1)); l2.setAttribute('y1',(y+size).toFixed(1));
  l2.setAttribute('x2',(x+size).toFixed(1)); l2.setAttribute('y2',(y-size).toFixed(1));
  l1.setAttribute('stroke', color); l2.setAttribute('stroke', color); g.appendChild(l1); g.appendChild(l2); return g;
}
function createEnemyTracks(){
  const width = 1633, height = 1137, centerX = width/2;
  { const y = 60; const startX = centerX - ((ENEMY_COUNT-1)/2)*ENEMY_SPACING;
    const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent = 'Szwecja';
    label.setAttribute('x', centerX); label.setAttribute('y', y - 28); enemiesLayer.appendChild(label); ENEMIES.szwecja.label = label;
    const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const x=startX+i*ENEMY_SPACING; const cross=makeCross(x,y,ENEMY_SIZE,'gray'); enemiesLayer.appendChild(cross); arr.push(cross);} ENEMIES.szwecja.items=arr; }
  { const x = width - 60; const startY = 340;
    const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent='Moskwa';
    label.setAttribute('x', x); label.setAttribute('y', startY - 40); enemiesLayer.appendChild(label); ENEMIES.moskwa.label = label;
    const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const y=startY+i*ENEMY_SPACING; const cross=makeCross(x,y,ENEMY_SIZE,'gray'); enemiesLayer.appendChild(cross); arr.push(cross);} ENEMIES.moskwa.items=arr; }
  { const y = height - 50; const startX = centerX - ((ENEMY_COUNT-1)/2)*ENEMY_SPACING;
    const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent='Tatarzy';
    label.setAttribute('x', centerX); label.setAttribute('y', y + 42); enemiesLayer.appendChild(label); ENEMIES.tatarzy.label = label;
    const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const x=startX+i*ENEMY_SPACING; const cross=makeCross(x,y,ENEMY_SIZE,'gray'); enemiesLayer.appendChild(cross); arr.push(cross);} ENEMIES.tatarzy.items=arr; }
}
function colorCross(g, color){ g.querySelectorAll('line').forEach(l=>{ l.style.stroke = color; }); }
function setEnemyCount(which, n, color = ENEMY_DEFAULT_COLOR){
  const key = norm(which); const enemy = ENEMIES[key]; if(!enemy) return false;
  const EN = Math.max(0, Math.min(ENEMY_COUNT, parseInt(n,10)));
  const activeColor = EN >= ENEMY_ALERT_THRESHOLD ? ENEMY_ALERT_COLOR : color;
  enemy.items.forEach((g, idx) => { colorCross(g, idx < EN ? activeColor : 'gray'); });
  return true;
}

const ENGINE_TO_UI_PHASE = {
  events: 1,
  income: 2,
  auction: 3,
  sejm: 3,
  actions: 4,
  battles: 5,
  attacks: 7,
  reinforcements: 6,
  devastation: 8, // nie mamy osobnej pozycji w UI — podpinamy pod „Najazdy”
};

function applyPhaseFromEngineState(s){
  const id = s.current_phase || game.round?.currentPhaseId?.();
  const idx = ENGINE_TO_UI_PHASE[id];
  if (Number.isInteger(idx) && idx !== phaseCur){
    phaseCur = idx;
  }
  setPhaseNow(id);       // <<< USTAW TEKST BADGE
}


// ===================== MAPOWANIE enumów silnika =====================
const PROV_MAP = {
  prusy: ProvinceID.PRUSY,
  litwa: ProvinceID.LITWA,
  ukraina: ProvinceID.UKRAINA,
  wielkopolska: ProvinceID.WIELKOPOLSKA,
  malopolska: ProvinceID.MALOPOLSKA,
};
const ENEMY_MAP = { szwecja: RaidTrackID.N, moskwa: RaidTrackID.E, tatarzy: RaidTrackID.S };
function toProvEnum(anyName){ const r = getRegionByName(anyName); if (!r) return null; return PROV_MAP[r.key] || null; }
function toEnemyEnum(name){ const k = norm(name); return ENEMY_MAP[k] || null; }

// ===================== Inteligentny panel akcji (UI) =====================
function buildPhaseActionsSmart(s){  
  if (!phaseActionsEl) return;
  const phase = s?.current_phase || game.round?.currentPhaseId?.() || null;

  if (phase !== 'actions') _actionWizard = null;
  
  // helpers
  const run = (cmd) => pushToConsole(cmd, true);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)){
      if (k === 'class') n.className = v;
      else if (k === 'style' && v && typeof v === 'object') Object.assign(n.style, v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(c => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };
  const chip = (label, onClick, title='') => {
    const b = el('button', { type:'button', class:'phase-action', title: title || label }, label);
    b.addEventListener('click', onClick);
    return b;
  };
  const section = (title, desc) => {
    const box = el('div', { class:'section' });
    if (title) box.appendChild(el('div', { class:'section-title', style:{fontWeight:'800',color:'#cbd5e1',margin:'0 0 6px'} }, title));
    if (desc)  box.appendChild(el('div', { class:'section-desc',  style:{color:'#94a3b8',margin:'0 0 10px'} }, desc));
    return box;
  };
  const activeColor = () => (curPlayerIdx >= 0 && PLAYERS[curPlayerIdx]?.color) ? PLAYERS[curPlayerIdx].color : '#eab308';
  const provKeys = ['prusy','wielkopolska','malopolska','litwa','ukraina'];
  const provSelect = (id, ph='— prowincja —') => {
    const sel = el('select', { id, class:'phase-action', style:{padding:'8px 10px'} },
      el('option', { value:'' }, ph),
      ...provKeys.map(k => el('option', { value:k }, k))
    );
    return sel;
  };

  // reset
  phaseActionsEl.innerHTML = '';

  // ====== SETUP (gdy brak rundy / graczy) ======
  const noGameYet = !s?.current_phase && (s?.settings?.players?.length ?? 0) === 0;
  if (noGameYet){
    const box = section('Start', 'Dodaj graczy i uruchom partię z wybraną liczbą rund.');
    box.append(
      chip('gracz Potoccy (czerwony)', ()=>run('gracz Potoccy red')),
      chip('gracz Sapiehowie (żółty)',   ()=>run('gracz Sapiehowie yellow')),
      chip('gracz Radziwiłłowie (niebieski)', ()=>run('gracz Radziwiłłowie blue')),
      chip('gracz Leszczyńscy (fioletowy)', ()=>run('gracz Leszczyńscy purple')),
      el('div', {style:{height:'8px'}}),
      chip('Start 5 rund',  ()=>run('gstart 5 6')),
      chip('Start 10 rund', ()=>run('gstart 10 6')),
    );
    phaseActionsEl.appendChild(box);
    tintByActive();
    return;
  }
  
  if (phase === 'events'){
    const box = section('Wydarzenia', 'W tej fazie może (ale nie musi) wystąpić wydarzenie specjalne.');
  
    const rollBtn = chip('Losuj wydarzenie', () => {
      const s = game.getPublicState?.() || {};
      const roundNo  = s.round_status?.current_round ?? roundCur;
      const roundsTotal = s.round_status?.total_rounds ?? roundMax;
  
      // Upewnij się, że harmonogram istnieje i ma dobrą długość
      ensureEventSchedule(roundsTotal);
  
      // 1. runda — nigdy brak wydarzenia specjalnego (czyli flaga=0) – już gwarantowane w buildEventSchedule
      if (!hasEventThisRound(roundNo)){
        ok(`(UI) Runda ${roundNo}: brak wydarzenia specjalnego.`);
        popupFromEngine('Brak wydarzenia', [
          `W tej rundzie (${roundNo}) nie występuje wydarzenie specjalne.`
        ], {
          imageUrl: EVENT_DEFAULT_POPUP_IMG,
          buttonText: 'Dalej',
          onAction: () => {
            const nxt = game.finishPhaseAndAdvance();
            ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
            syncUIFromGame();
          }
        });
        return; // NIC nie losujemy, NIC nie wywołujemy w silniku
      }
  
      // W tej rundzie wydarzenie JEST — działamy jak dotychczas (los 1–25)
      const n = 1 + Math.floor(Math.random() * 25);
      ok(`(UI) Runda ${roundNo}: wylosowano wydarzenie #${n}`);
  
      const lines = game.events.apply(n);
      logEngine(lines);
      syncUIFromGame();
  
      popupFromEngine(`Wydarzenie #${n}`, lines, {
        imageUrl: EVENT_DEFAULT_POPUP_IMG,
        buttonText: 'Dalej',
        onAction: () => {
          const nxt = game.finishPhaseAndAdvance();
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
        }
      });
    });
  
    box.append(rollBtn);
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

  if (phase === 'income'){
    const box = section('Dochód', 'Zbierz dochód wszystkich graczy. Podsumowanie pojawi się w popupie.');
  
    const btnIncome = chip('Pobierz dochód', () => {
      const lines = game.income.collect();
      ok('Zebrano dochód.');
      logEngine(lines);
      syncUIFromGame();
    
      popupFromEngine('Dochód – podsumowanie', lines, {
        imageUrl: INCOME_POPUP_IMG,
        buttonText: 'Dalej (Sejm)',
        onAction: () => {
          const nxt = game.finishPhaseAndAdvance(); // -> auction
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
          // UWAGA: nic tu nie otwieramy – tylko przejście fazy + sync
        },
        onClose: () => {
          // Teraz, gdy poprzedni popup już się zamknął,
          // bezpiecznie otwieramy popup z ustawą
          ensureSejmLawForRound(game.getPublicState(), { forcePopup: true });
          buildPhaseActionsSmart(game.getPublicState());
        }
      });
    });
  
    box.append(btnIncome);
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

// ====== SEJM (losowanie ustawy -> aukcja -> wybór wariantu) ======
if (phase === 'auction' || phase === 'sejm'){
  const canceled = !!s.round_status?.sejm_canceled;

  if (canceled){
    const info = section('Sejm zerwany', 'Liberum veto — w tej rundzie pomijacie licytację i ustawę.');
    phaseActionsEl.appendChild(info);
  
    // pokaż popup tylko raz na rundę
    const curRound = (s.round_status?.current_round ?? roundCur) | 0;
    if (_sejmSkipPopupRound !== curRound) {
      _sejmSkipPopupRound = curRound;
      popupFromEngine('Sejm zerwany', [
        'Liberum veto — przechodzimy od razu do fazy Akcji.'
      ], {
        buttonText: 'Dalej (Akcje)',
        onAction: () => {
          const a = game.finishPhaseAndAdvance(); ok(`Silnik: next -> ${a || game.round.currentPhaseId() || 'koniec gry'}`);
          const b = game.finishPhaseAndAdvance(); ok(`Silnik: next -> ${b || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
        }
      });
    }
  
    tintByActive(); return;
  }


  // Upewnij się, że ustawa na tę rundę jest ustawiona (i jeśli trzeba — pokaż popup)
  ensureSejmLawForRound(s);

  // Czy ktoś ma majority (po rozstrzygnięciu aukcji)?
  const someMajority = (s.settings?.players || []).some(p => p.majority);

  // AUKCJA — dopóki nie ma majority
  if (!someMajority){
    const boxA = section('Sejm — Aukcja', `Licytacja marszałkowska dla ustawy: ${_sejmLaw?.name || '—'}.`);
    const quicks = [0,1,2,3];
    (s.settings?.players || []).forEach(p => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '6px';
      row.style.alignItems = 'center';
      row.style.flexWrap = 'wrap';
      row.style.margin = '6px 0';

      const tag = document.createElement('span');
      tag.style.minWidth = '84px';
      tag.style.fontWeight = '800';
      tag.textContent = p.name;
      row.appendChild(tag);

      quicks.forEach(q => {
        row.appendChild(chip(String(q), () => run(`gbid ${p.name} ${q}`), `gbid ${p.name} ${q}`));
      });
      boxA.append(row);
    });

    boxA.append(chip('Rozstrzygnij aukcję', () => {
      const lines = game.auction.resolve();
      logEngine(lines);
      syncUIFromGame();
    
      const after = game.getPublicState?.();
      const players = after?.settings?.players || [];
      const winnerObj = players.find(p => p.majority);
      const hasMajority = !!winnerObj;
    
      if (!hasMajority){
        // brak większości → popup i od razu do Akcji
        popupFromEngine('Sejm — brak większości', [
          ...(Array.isArray(lines) ? lines : [lines]),
          'Ustawa nie przeszła. Przechodzimy do fazy Akcji.'
        ], {
          buttonText: 'Dalej (Akcje)',
          onAction: () => {
            const a = game.finishPhaseAndAdvance(); ok(`Silnik: next -> ${a || game.round.currentPhaseId() || 'koniec gry'}`);
            const b = game.finishPhaseAndAdvance(); ok(`Silnik: next -> ${b || game.round.currentPhaseId() || 'koniec gry'}`);
            syncUIFromGame();
          }
        });
        return;
      }
    
      // jest większość → zapamiętaj i pokaż wynik, potem wybór wariantu
      const winner = winnerObj.name;
      _sejmAuctionWinner = winner;
    
      popupFromEngine('Sejm — wynik aukcji', [
        `Zwycięzca aukcji: ${winner}.`,
        ...(Array.isArray(lines) ? lines : [lines])
      ], {
        buttonText: 'Dalej (Wybór wariantu)',
        onAction: () => {
          // przejście: auction -> sejm
          const nxt = game.finishPhaseAndAdvance();
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
        
          // w tej fazie ustaw ustawę i odśwież panel
          ensureSejmLawForRound(game.getPublicState());
          buildPhaseActionsSmart(game.getPublicState());
        }
      });
    }));

    phaseActionsEl.appendChild(boxA);
    tintByActive(); return;
  }

  // WYBÓR WARIANTU — opisowe przyciski dla wylosowanej ustawy
  {
    const winner = _sejmAuctionWinner
      || (s.settings?.players?.find(p => p.majority)?.name || '—');

    const boxB = section('Sejm — Wybór wariantu', `Ustawa: ${_sejmLaw?.name || '—'}`);
    renderLawChoiceUI(boxB, _sejmLaw?.id, winner);
    phaseActionsEl.appendChild(boxB);
  }

  tintByActive(); return;
}

  // ====== AKCJE ======
  if (phase === 'actions'){
    const box = section('Akcje', 'Wybierz rodzaj akcji, następnie prowincję (dla marszu: skąd → dokąd).');
  
    // obszar dynamiczny kreatora
    const uiArea = el('div', { id:'actionWizardArea' });
  
    // 4 przyciski główne
    box.append(
      chip('Administracja', ()=>{ 
        if (curPlayerIdx < 0) return err('Ustaw aktywnego gracza: turn <imię|indeks>.');
      
        // wywołaj silnik bezpośrednio (szybciej niż przez konsolę)
        const msg = game.actions.administracja(curPlayerIdx);
        logEngine(msg);
        syncUIFromGame();
      
        // jeżeli to już była ostatnia akcja ostatniego gracza – przejdź automatycznie dalej
        setTimeout(maybeAutoAdvanceAfterAction, 0);
      }, 'gact administracja'),
  
      chip('Wpływ', ()=>{ 
        _actionWizard = { kind:'wplyw' };
        buildPhaseActionsSmart(game.getPublicState());
      }, 'gact wplyw <prowincja>'),

      chip('Rekrutacja', ()=>{ 
        _actionWizard = { kind:'rekrutacja' };
        buildPhaseActionsSmart(game.getPublicState());
      }, 'gact rekrutacja <prowincja>'),
      
      chip('Posiadłość', ()=>{ 
        _actionWizard = { kind:'posiadlosc' };
        buildPhaseActionsSmart(game.getPublicState());
      }, 'gact posiadlosc <prowincja>'),

      chip('Zamożność', ()=>{ 
        _actionWizard = { kind:'zamoznosc' };
        buildPhaseActionsSmart(game.getPublicState());
      }, 'gact zamoznosc <prowincja>'),
      
      chip('Marsz', ()=>{ 
        _actionWizard = { kind:'marsz', step:'from' };
        buildPhaseActionsSmart(game.getPublicState());
      }, 'gact marsz <z> <do>')
    );
  
    // Rysuj kreator wg stanu
    if (_actionWizard){
      if (_actionWizard.kind === 'wplyw' || _actionWizard.kind === 'posiadlosc' || _actionWizard.kind === 'rekrutacja' || _actionWizard.kind === 'zamoznosc'){
        renderProvincePicker(uiArea, (prov)=>{
          run(`gact ${_actionWizard.kind} ${prov}`);
          _actionWizard = null;
          buildPhaseActionsSmart(game.getPublicState());
          setTimeout(maybeAutoAdvanceAfterAction, 0);
        }, 'Wybierz prowincję');
      } else if (_actionWizard.kind === 'marsz'){
        if (_actionWizard.step === 'from'){
          renderProvincePicker(uiArea, (prov)=>{
            _actionWizard = { kind:'marsz', step:'to', from: prov };
            buildPhaseActionsSmart(game.getPublicState());
            setTimeout(maybeAutoAdvanceAfterAction, 0);
          }, 'Marsz — skąd?');
        } else if (_actionWizard.step === 'to'){
          const from = _actionWizard.from;
          renderProvincePicker(uiArea, (prov)=>{
            run(`gact marsz ${from} ${prov}`);
            _actionWizard = null;
            buildPhaseActionsSmart(game.getPublicState());
            setTimeout(maybeAutoAdvanceAfterAction, 0);
          }, 'Marsz — dokąd?');
        }
      }
    }
  
    box.append(uiArea);
    phaseActionsEl.appendChild(box);
    tintByActive(); 
    return;
  }

  // ====== STARCIA ======
  if (phase === 'battles'){
    const box = section('Starcia', 'Rozstrzygaj potyczki między graczami (komendy w konsoli). Kiedy gotowe — zakończ fazę.');
    box.append(chip('Zakończ Starcia (gnext)', ()=>run('gnext')));
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

  // ====== WZMACNIANIE ======
  if (phase === 'reinforcements'){
    const box = section('Wzmacnianie', 'Wylosuj N, S, E (1–6) i zastosuj wzmocnienia na torach wrogów.');
    const btn = chip('Wylosuj i zastosuj (greinf N S E)', ()=>{
      const r = ()=> 1 + Math.floor(Math.random()*6);
      const N=r(), S=r(), E=r();
    
      const lines = game.reinforce.reinforce({ N, S, E });
      ok(`(UI) wzmocnienia: N=${N}, S=${S}, E=${E}`);
      logEngine(lines);
      syncUIFromGame();
    
      popupFromEngine('Wzmacnianie — wyniki', [
        `Rzuty: N=${N}, S=${S}, E=${E}.`,
        ...(Array.isArray(lines) ? lines : [lines]),
      ], {
        imageUrl: REINFORCEMENTS_POPUP_IMG,
        buttonText: 'Dalej (Wyprawy)',
        onAction: () => {
          const nxt = game.finishPhaseAndAdvance();
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
        }
      });
    });
    box.append(btn);
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

    // ====== WYPRAWY (phase: attacks) ======
    if (phase === 'attacks'){
      const box = section('Wyprawy', 'Wybierz skąd atakujesz (tylko prowincje, gdzie masz jednostki) albo PASS.');
    
      // aktywny gracz w tej fazie
      const pidx = Number.isInteger(s.active_attacker_index) ? s.active_attacker_index : curPlayerIdx;
      const activePlayerName = s.settings?.players?.[pidx]?.name || '—';
      box.append(el('div', { style:{ color:'#94a3b8', margin:'0 0 8px' } },
        `Aktywny gracz: ${activePlayerName}`
      ));
    
      // prowincje z jednostkami aktywnego gracza
      const playerProvinces = [];
      for (const [pid, arr] of Object.entries(s.troops || {})) {
        const key = provKeyFromId(pid);
        if (!key) continue;
        const units = (arr?.[pidx] || 0) | 0;
        if (units > 0) playerProvinces.push({ key, units });
      }
    
      if (playerProvinces.length === 0){
        box.append(el('div', { style:{ color:'#f59e0b', margin:'6px 0 8px' } },
          'Brak jednostek — możesz tylko PASS.'
        ));
      } else {
        playerProvinces.forEach(({ key, units }) => {
          const row = el('div', { style:{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', margin:'6px 0' } });
          row.append(el('span', { style:{ minWidth:'150px', fontWeight:'800' } }, `${key} (jednostek: ${units})`));
    
          const targets = ATTACK_TARGETS[key] || [];
          targets.forEach(enemyKey => {
            row.append(chip(`atak ${key} → ${enemyKey}`, () => {
              try {
                // zawsze 1 kość
                const roll = roll1d6();
                const rolls = [roll];
    
                ok(`(UI) Wyprawa ${key} → ${enemyKey}, rzut: ${roll}`);
    
                const lines = game.attacks.attack({
                  playerIndex: pidx,
                  enemy: toEnemyEnum(enemyKey),
                  from:  toProvEnum(key),
                  rolls,      // pojedynczy rzut
                  dice: 1     // jawnie wymuszamy 1 kość
                });
    
                logEngine(lines);
                syncUIFromGame();
    
                popupFromEngine(`Wyprawa — ${key} → ${enemyKey}`, [
                  `Rzut: ${roll}.`,
                  ...(Array.isArray(lines) ? lines : [lines]),
                ], {
                  imageUrl: ATTACK_POPUP_IMG,
                  buttonText: 'OK',
                  onClose: () => {
                    maybeAutoAdvanceAfterAttacks();
                    buildPhaseActionsSmart(game.getPublicState());
                  }
                });
              } catch (e) {
                err('Błąd ataku: ' + e.message);
              }
            }, `gattack ${enemyKey} ${key} <auto 1k6>`));
          });
    
          // ← UWAGA: to musi być PO .forEach(targets)
          box.append(row);
        });
      }
    
      // PASS
      box.append(el('div', { style:{ height:'6px' } }));
      box.append(chip('PASS', () => {
        try {
          const msg = game.attacks.passTurn(pidx);
          ok(String(msg || 'PASS.'));
          syncUIFromGame();
          maybeAutoAdvanceAfterAttacks();
          buildPhaseActionsSmart(game.getPublicState());
        } catch (ex) {
          err('PASS nieudany: ' + ex.message);
        }
      }, 'gpass'));
    
      phaseActionsEl.appendChild(box);
      tintByActive();
      return;
    }


  // ====== SPUSTOSZENIA ======
  if (phase === 'devastation'){
    const box = section('Spustoszenia', 'Wylosuj N, S, E (1–6) i zastosuj spustoszenia, potem przejdź do następnej rundy.');
    const btnDev = chip('Wylosuj i zastosuj (gdevast N S E)', ()=>{
      const r = ()=> 1 + Math.floor(Math.random()*6);
      const N=r(), S=r(), E=r();
    
      const lines = game.devastation.resolve({ N, S, E });
      ok(`(UI) spustoszenia: N=${N}, S=${S}, E=${E}`);
      logEngine(lines);
      syncUIFromGame();
    
      popupFromEngine('Najazdy — spustoszenia', [
        `Rzuty: N=${N}, S=${S}, E=${E}.`,
        ...(Array.isArray(lines) ? lines : [lines]),
      ], {
        imageUrl: DEVASTATION_POPUP_IMG,
        buttonText: 'Dalej',
        onAction: () => {
          const nxt = game.finishPhaseAndAdvance();
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
          syncUIFromGame();
        },
        onClose: () => {
          // UWAGA: to wykona się dopiero PO zamknięciu poprzedniego popupu,
          // więc nowy popup nie zostanie "zgaszony".
          const s = game.getPublicState?.();
          if (!_finalPopupShown && isGameOverState(s)) {
            _finalPopupShown = true;
            const report = game.computeScores();
            popupFromEngine('Koniec gry — podsumowanie', report, {
              imageUrl: FINAL_SUMMARY_POPUP_IMG,
              buttonText: 'Zamknij'
            });
          }
        }
      });
    }); 
    box.append(btnDev);
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

  // fallback
  const fb = section('Faza', `Bieżąca faza: ${String(phase || '—')}`);
  phaseActionsEl.appendChild(fb);

  // === podświetlenie przycisków kolorem aktywnego gracza
  function tintByActive(){
    const col = activeColor();
    phaseActionsEl.querySelectorAll('button.phase-action').forEach(b=>{
      b.style.borderColor = col;
      b.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.15)';
    });
  }
}


// ===================== SYNC UI ⇄ SILNIK =====================
function syncUIFromGame(){
  const s = game.getPublicState?.(); if (!s) return;

  // RUNDY
  roundCur = s.round_status.current_round; roundMax = s.round_status.total_rounds; 
  updateRoundUI();
  updatePlayersUIFromState(s);
  applyCurrentTurnFromState(s);
  applyPhaseFromEngineState(s);
  buildPhaseActionsSmart(game.getPublicState());

  const midx = s.round_status?.marshal_index ?? -1;
  if (midx >= 0 && s.settings?.players?.[midx]) {
    const mname = s.settings.players[midx].name;
    const ui = uiFindPlayerByName(mname);
    if (ui) setMarshal(ui.color);
    else clearMarshal(); // nie znaleziono odpowiednika w UI
  } else {
    clearMarshal();
  }

  // PROWINCJE: zamożność + fort + posiadłości + OBRAMOWANIE KONTROLI
  for (const [pid, prov] of Object.entries(s.provinces)){
    const key = provKeyFromId(prov.id); // np. "prusy"
    if (!key) continue;

    // istniejący kod:
    setRegionWealth(key, prov.wealth);
    if (prov.has_fort) setFort(key, '#eab308'); else clearFort(key);
    resetBoxes(key);
    (prov.estates || []).forEach((ownerIdx, i) => {
      if (ownerIdx === -1) return;
      const owner = s.settings.players[ownerIdx];
      const uiPlayer = PLAYERS.find(p => p.name === owner.name);
      const color = uiPlayer?.color || '#eab308';
      setBox(key, i+1, color);
    });

    // NOWE: obramowanie kontroli
    const ctrlIdx = controllerIndexFromState(s, pid); // UWAGA: tu używamy klucza "pid" = ID z silnika ("Prusy", "Litwa", ...)
    if (ctrlIdx != null) {
      const ctrlName = s.settings.players[ctrlIdx]?.name;
      const ui = PLAYERS.find(p => p.name === ctrlName);
      const color = ui?.color || '#f59e0b';
      setProvinceControlBorder(key, color);
    } else {
      clearProvinceControlBorder(key);
    }
  }

  // ARMIE (top4)
  for (const [pid, arr] of Object.entries(s.troops || {})) {
    const key = provKeyFromId(pid);
    if (!key) continue;
    resetArmies(key);
    const tuples = arr.map((units, idx) => ({ units, idx }))
                      .filter(t => t.units > 0)
                      .sort((a,b) => b.units - a.units)
                      .slice(0,4);
    tuples.forEach((t, slot) => {
      const p = s.settings.players[t.idx];
      const uiPlayer = PLAYERS.find(x => x.name === p.name);
      const color = uiPlayer?.color || '#60a5fa';
      setArmy(key, slot+1, color, t.units);
    });
  }

  // SZLACHCICE 
  renderNoblesList(s);

  // WROGOWIE
  setEnemyCount('szwecja', Math.max(0, Math.min(6, s.raid_tracks.N)));
  setEnemyCount('moskwa',  Math.max(0, Math.min(6, s.raid_tracks.E)));
  setEnemyCount('tatarzy', Math.max(0, Math.min(6, s.raid_tracks.S)));
}

// ===================== Parser poleceń =====================
function tokenize(input){
  const m = input.match(/"[^"]*"|\S+/g) || [];
  return m.map(t => t.startsWith('"') && t.endsWith('"') ? t.slice(1,-1) : t);
}

function execCommand(raw){
  const line = raw.trim(); if (!line){ return; }
  history.push(line); histIdx = history.length;
  const tokens = tokenize(line);
  const cmd = norm(tokens[0] || "");

  // Podstawowe
  if (["pomoc","help","?"].includes(cmd)) return showHelp();
  if (["wyczysc","wyczyść","clear","cls"].includes(cmd)){ overlay.innerHTML=''; ok('Wyczyszczono rysunki.'); return; }
  if (cmd === "reset"){ document.getElementById('resetBtn')?.click(); overlay.innerHTML=''; return; }

  // --- Organizacja graczy / tury (potrzebne do gry) ---
  if (cmd === 'gracz' || cmd === 'player'){
    const name = tokens[1], color = tokens[2];
    if (!name || !color) return err('Użycie: gracz <imię> <kolor>');
    const res = addPlayer(name, color);
    if (res === true) return ok(`Dodano gracza "${name}" z kolorem ${color}.`);
    if (res === 'exists') return err(`Gracz "${name}" już istnieje.`);
    return err('Nie udało się dodać gracza.');
  }
  if (cmd === 'turn' || cmd === 'tura'){
    const who = tokens[1]; if (!who) return err('Użycie: turn <imię|indeks>');
    const asNum = parseInt(who, 10);
    if (!Number.isNaN(asNum)) return setTurnByIndex(asNum - 1);
    return setTurnByName(who);
  }
  if (cmd === 'turnclear' || cmd === 'tclear'){
    curPlayerIdx = -1; updateTurnUI(); return ok('Brak aktywnego gracza.');
  }

  // --- *** KOMENDY SILNIKA (game.js) *** ---

  // gstart [maxRounds] [startingGold]
  if (cmd === 'gstart'){
    const maxRounds = tokens[1] ? parseInt(tokens[1],10) : 3;
    const startingGold = tokens[2] ? parseInt(tokens[2],10) : 6;
    if (PLAYERS.length === 0) return err('Najpierw dodaj graczy: gracz <imię> <kolor>.');
    const names = PLAYERS.map(p => p.name);
    game.startGame({ players: names, startingGold, maxRounds });
    
    buildEventSchedule(maxRounds);
    ok(`Start gry: gracze=${names.join(', ')}, rund=${maxRounds}, złoto start=${startingGold}.`);
    syncUIFromGame(); return;
  }

  // gphase (podgląd)
  if (cmd === 'gphase'){ const cur = game.round.currentPhaseId(); ok(`Faza silnika: ${cur}`); return; }

  // gnext — przejście do kolejnej fazy
  if (cmd === 'gnext'){
    const nxt = game.finishPhaseAndAdvance();
    ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
    return;
  }

  if (cmd === 'gevent'){
    const ev = parseInt(tokens[1],10);
    if (!Number.isFinite(ev) || ev < 1 || ev > 25) return err('Użycie: gevent <1-25>.');
    const lines = game.events.apply(ev);
    ok(`Wydarzenie #${ev} zastosowane.`);
    logEngine(lines);
    syncUIFromGame();
    return;
  }

  // gincome
  if (cmd === 'gincome'){
    const lines = game.income.collect();
    ok('Zebrano dochód.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }

  // gbid <imię|indeks> <kwota>
  if (cmd === 'gbid'){
    const who = tokens[1]; const bid = parseInt(tokens[2],10);
    if (!who || !Number.isFinite(bid) || bid < 0) return err('Użycie: gbid <imię|indeks> <kwota>.');
    const asNum = parseInt(who,10); let pidx;
    if (!Number.isNaN(asNum)) pidx = asNum-1;
    else { const i = PLAYERS.findIndex(p => p.name === who); if (i < 0) return err(`Nie ma gracza "${who}".`); pidx = i; }
    const msg = game.auction.setBid(pidx, bid);
    logEngine(msg || `Licytacja: ${who} -> ${bid}.`);
    return;
  }

  // gauction
  if (cmd === 'gauction'){
    const lines = game.auction.resolve();
    ok('Rozstrzygnięto licytację.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }


  // glaw <1-6>
  if (cmd === 'glaw'){
    const n = parseInt(tokens[1],10);
    if (!Number.isFinite(n) || n < 1 || n > 6) return err('Użycie: glaw <1-6>.');
    const lines = game.sejm.setLaw(n);
    logEngine(lines);
    return;
  }

  // gchoice <A|B>
  if (cmd === 'gchoice'){
    const v = (tokens[1]||'').toUpperCase();
    if (!['A','B'].includes(v)) return err('Użycie: gchoice <A|B>.');
    const lines = game.sejm.chooseVariant(v);
    ok(`Sejm: wariant ${v}.`);
    logEngine(lines);
    syncUIFromGame();
    return;
  }

  // gact …
  if (cmd === 'gact'){
    if (curPlayerIdx < 0) return err('Najpierw ustaw aktywnego gracza: turn <imię|indeks>.');
    const sub = norm(tokens[1]||''); const pidx = curPlayerIdx;
  
    if (sub === 'administracja'){
      const msg = game.actions.administracja(pidx);
      logEngine(msg);
      syncUIFromGame();
      return;
    }
  
    if (['wplyw','wpływ','posiadlosc','posiadłość','rekrutacja','zamoznosc','zamożność'].includes(sub)){
      const prov = toProvEnum(tokens[2]); if (!prov) return err('Podaj prowincję.');
      if (sub.startsWith('wpl')){
        const m = game.actions.wplyw(pidx, prov); logEngine(m);
      } else if (sub.startsWith('pos')){
        const m = game.actions.posiadlosc(pidx, prov); logEngine(m);
      } else if (sub.startsWith('rek')){
        const m = game.actions.rekrutacja(pidx, prov); logEngine(m);
      } else {
        const m = game.actions.zamoznosc(pidx, prov); logEngine(m);
      }
      syncUIFromGame();
      return;
    }
  
    if (sub === 'marsz'){
      const provA = toProvEnum(tokens[2]); const provB = toProvEnum(tokens[3]);
      if (!provA || !provB) return err('Użycie: gact marsz <z> <do>.');
      const msg = game.actions.marsz(pidx, provA, provB);
      logEngine(msg);
      syncUIFromGame();
      return;
    }
  
    return err('Użycie: gact <administracja|wplyw <prow>|posiadlosc <prow>|rekrutacja <prow>|marsz <z> <do>|zamoznosc <prow>>');
  }


  // greinf <N> <S> <E>
  if (cmd === 'greinf'){
    const N = parseInt(tokens[1],10), S = parseInt(tokens[2],10), E = parseInt(tokens[3],10);
    if (![N,S,E].every(x => Number.isFinite(x) && x>=1 && x<=6)) return err('Użycie: greinf <N 1-6> <S 1-6> <E 1-6>.');
    const lines = game.reinforce.reinforce({ N, S, E });
    ok('Wzmocnienia wrogów rozpatrzone.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }


  // gattack <wróg> <z_prowincji> <rzuty...>
  if (cmd === 'gattack'){
    if (curPlayerIdx < 0) return err('Ustaw aktywnego gracza: turn <...>.');
    const enemy = toEnemyEnum(tokens[1]); const src = toProvEnum(tokens[2]);
    const rolls = tokens.slice(3).map(x => parseInt(x,10)).filter(Number.isFinite);
    if (!enemy || !src || rolls.length === 0) return err('Użycie: gattack <szwecja|moskwa|tatarzy> <prowincja> <r1> [r2] ...');
    const lines = game.attacks.attack({ playerIndex: curPlayerIdx, enemy, from: src, rolls });
    ok('Atak rozpatrzony.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }

  if (cmd === 'gpass'){
    if (curPlayerIdx < 0) return err('Brak aktywnego gracza.');
    try {
      const msg = game.attacks.passTurn(curPlayerIdx);
      ok(String(msg || 'PASS.'));
      syncUIFromGame();
    } catch (ex) {
      err('PASS nieudany: ' + ex.message);
    }
    return;
  }

  // gduel <prowincja> <graczA> <graczB> <rzutyA...> | <rzutyB...>
  // gduelauto <prowincja> <graczA> <graczB>
  if (cmd === 'gduel' || cmd === 'gbattle' || cmd === 'gduelauto') {
    const auto = (cmd === 'gduelauto');
    const pid = toProvEnum(tokens[1]);
    const nameA = tokens[2];
    const nameB = tokens[3];

    if (!pid || !nameA || !nameB) {
      return err('Użycie: gduel <prowincja> <graczA> <graczB> <rzutyA...> | <rzutyB...>  lub  gduelauto <prowincja> <graczA> <graczB>');
    }

    const s = game.getPublicState?.();
    if (!s) return err('Brak stanu gry.');

    // indeksy graczy wg nazw w silniku
    const iA = s.settings.players.findIndex(p => p.name === nameA);
    const iB = s.settings.players.findIndex(p => p.name === nameB);
    if (iA < 0) return err(`Nie znaleziono gracza "${nameA}" w silniku.`);
    if (iB < 0) return err(`Nie znaleziono gracza "${nameB}" w silniku.`);
    if (iA === iB) return err('Podaj dwóch różnych graczy.');

    const unitsA = (s.troops?.[pid]?.[iA] ?? 0) | 0;
    const unitsB = (s.troops?.[pid]?.[iB] ?? 0) | 0;
    if (unitsA <= 0 || unitsB <= 0) {
      return err(`W ${pid} brak jednostek do walki: ${nameA}=${unitsA}, ${nameB}=${unitsB}.`);
    }

    function randRolls(n){ return Array.from({length:n}, () => 1 + Math.floor(Math.random()*6)); }
    function parseRolls(arr){ 
      const nums = arr.map(x => parseInt(x,10)).filter(Number.isFinite);
      if (!nums.every(r => r>=1 && r<=6)) return null;
      return nums;
    }

    let rollsA, rollsB;

    if (auto) {
      rollsA = randRolls(unitsA);
      rollsB = randRolls(unitsB);
    } else {
      // oczekujemy separatora '|'
      const sep = tokens.indexOf('|');
      if (sep < 0) return err('Brakuje separatora "|". Użycie: gduel <prowincja> <graczA> <graczB> <rzutyA...> | <rzutyB...>');
      rollsA = parseRolls(tokens.slice(4, sep));
      rollsB = parseRolls(tokens.slice(sep+1));
      if (!rollsA || !rollsB) return err('Rzuty muszą być liczbami 1–6.');
      if (rollsA.length !== unitsA || rollsB.length !== unitsB) {
        return err(`Liczba rzutów musi odpowiadać jednostkom: ${nameA}=${unitsA}, ${nameB}=${unitsB}.`);
      }
    }

    try {
      const line = game.battles.resolveDuel(pid, iA, iB, rollsA, rollsB);
      ok('Walka rozpatrzona.');
      ok(`Rzuty ${nameA}: [${rollsA.join(', ')}]`);
      ok(`Rzuty ${nameB}: [${rollsB.join(', ')}]`);
      logEngine(line);
      syncUIFromGame();
    } catch(ex) {
      err('Błąd walki: ' + ex.message);
    }
    return;
  }

  // gdevast <N> <S> <E>
  if (cmd === 'gdevast'){
    const N = parseInt(tokens[1],10), S = parseInt(tokens[2],10), E = parseInt(tokens[3],10);
    if (![N,S,E].every(x => Number.isFinite(x) && x>=1 && x<=6)) return err('Użycie: gdevast <N 1-6> <S 1-6> <E 1-6>.');
    const lines = game.devastation.resolve({ N, S, E });
    ok('Spustoszenia rozpatrzone.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }

  // gstate — log do konsoli
  if (cmd === 'gstate'){ console.log(game.getPublicState()); ok('Stan gry wypisany w konsoli (console.log).'); return; }

  // nic nie pasuje
  err('Nieznane polecenie. Wpisz "pomoc".');
}

function showHelp(){
  ok('Dostępne komendy (tylko do grania):');
  print('• gracz <imię> <kolor> — dodaj gracza (zanim odpalisz gstart)');
  print('• turn <imię|indeks> — ustaw aktywnego gracza • turnclear — wyczyść');
  print('• gstart [rundy] [złoto] — rozpocznij grę w silniku dla dodanych graczy');
  print('• gphase — pokaż bieżącą fazę silnika');
  print('• gnext — przejdź do kolejnej fazy silnika');
  print('• gevent <1-25> — zastosuj wydarzenie');
  print('• gincome — pobierz dochód');
  print('• gbid <kto> <kwota> — oferta w licytacji (Sejm)');
  print('• gauction — rozstrzygnij licytację (Sejm)');
  print('• glaw <1-6> — wybierz ustawę (Sejm, wymaga większości)');
  print('• gchoice <A|B> — wybierz wariant ustawy');
  print('• gact administracja | wplyw <prow> | posiadlosc <prow> | rekrutacja <prow> | marsz <z> <do> | zamoznosc <prow>');
  print('• greinf <N S E> — rzuty wzmocnień wrogów (1–6)');
  print('• gattack <wróg> <z_prowincji> <r1> [r2]… — atak na tor wroga');
  print('• gpass — w fazie najazdów oddaj turę (PASS)');
  print('• gdevast <N S E> — rzuty spustoszeń (1–6)');
  print('• gstate — wypisz stan silnika do konsoli');
  print('• clear — wyczyść rysunki • reset — pełny reset UI');
  print('• gduel <prow> <A> <B> <rzutyA...> | <rzutyB...> — potyczka między graczami w prowincji (rzuty 1–6, liczba = ich jednostkom)');
  print('• gduelauto <prow> <A> <B> — szybka potyczka (losowe rzuty w liczbie = jednostkom)');

}

// ===================== Obsługa konsoli =====================
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = inputEl.value;
  print('> ' + val);
  try { execCommand(val); }
  catch(ex){ console.error(ex); err('Błąd wykonania: ' + ex.message); }
  inputEl.value = '';
  histIdx = history.length;
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp'){
    if (histIdx > 0){ histIdx--; inputEl.value = history[histIdx] || ''; setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0); e.preventDefault(); }
  } else if (e.key === 'ArrowDown'){
    if (histIdx < history.length){ histIdx++; inputEl.value = history[histIdx] || ''; setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0); e.preventDefault(); }
  }
});
document.getElementById('btnHelp').addEventListener('click', showHelp);
document.getElementById('btnClearLog').addEventListener('click', () => { logEl.innerHTML=''; ok('Wyczyszczono log.'); });

// ===================== Start: budowa UI i powitanie =====================
document.querySelectorAll('.region').forEach(path => {
  const key = path.getAttribute('data-key'); const name = key[0].toUpperCase() + key.slice(1);
path.addEventListener('click', () => {
  // jeśli kreator akcji jest aktywny — traktuj klik jako wybór prowincji
  if (_actionWizard) {
    if (_actionWizard.kind === 'wplyw' || _actionWizard.kind === 'posiadlosc' || _actionWizard.kind === 'rekrutacja' || _actionWizard.kind === 'zamoznosc'){
      runCmd(`gact ${_actionWizard.kind} ${key}`);
      _actionWizard = null;
      buildPhaseActionsSmart(game.getPublicState());
      setTimeout(maybeAutoAdvanceAfterAction, 0);
      return;
    }
    if (_actionWizard.kind === 'marsz') {
      if (_actionWizard.step === 'from') {
        _actionWizard = { kind:'marsz', step:'to', from: key };
        buildPhaseActionsSmart(game.getPublicState());
        setTimeout(maybeAutoAdvanceAfterAction, 0);
        return;
      }
      if (_actionWizard.step === 'to') {
        runCmd(`gact marsz ${_actionWizard.from} ${key}`);
        _actionWizard = null;
        buildPhaseActionsSmart(game.getPublicState());
        setTimeout(maybeAutoAdvanceAfterAction, 0);
        return;
      }
    }
  }

  // standardowe zachowanie gdy kreator nie działa
  document.querySelectorAll('.region').forEach(n => n.classList.remove('selected'));
  path.classList.add('selected');
  inputEl.value = inputEl.value + key + ' ';
  inputEl.focus();
  setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
  const pickedRegionEl = document.getElementById('pickedRegion'); if (pickedRegionEl) pickedRegionEl.textContent = key;
});

  path.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); path.click(); } });
  path.addEventListener('pointerenter', (e) => { tooltip.textContent = name; tooltip.style.left = e.clientX + 'px'; tooltip.style.top = e.clientY + 'px'; tooltip.classList.add('shown'); tooltip.setAttribute('aria-hidden','false'); });
  path.addEventListener('pointermove', (e) => { tooltip.style.left = e.clientX + 'px'; tooltip.style.top = e.clientY + 'px'; });
  path.addEventListener('pointerleave', () => { tooltip.classList.remove('shown'); tooltip.setAttribute('aria-hidden','true'); });
  path.addEventListener('blur', () => { tooltip.classList.remove('shown'); tooltip.setAttribute('aria-hidden','true'); });
});
document.querySelectorAll('.legend button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-jump');
    const target = document.querySelector(`[data-key="${key}"]`);
    if (target){ target.focus({preventScroll:false}); target.click(); }
  });
});
function clearOverlay(){ while (overlay.firstChild) overlay.removeChild(overlay.firstChild); ok("Usunięto wszystkie rysunki."); }
svg.addEventListener('pointermove', (e) => {
  const {x,y} = clientToSvg(e.clientX, e.clientY);
  coordsBadge.textContent = `x: ${x}, y: ${y}`;
});

createBoxes();
updateRoundUI();
createArmySlots();
createEnemyTracks();
buildPhaseBar();
buildPhaseActionsSmart(game.getPublicState?.() || {}); // ← smart start
setPhaseNow(game.getPublicState?.()?.current_phase || game.round?.currentPhaseId?.());
updateTurnUI();
ok('Witaj! Dodaj graczy komendą „gracz <imię> <kolor>”, potem „gstart”. „pomoc” pokaże listę komend.');
