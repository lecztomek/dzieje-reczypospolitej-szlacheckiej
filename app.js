// ===================== PODPIĘCIE SILNIKA (game.js) =====================
import { ConsoleGame, ProvinceID, RaidTrackID, StateID, UnitKind  } from './game.js';

// instancja gry + ułatwienia globalne (DevTools)
export const game = new ConsoleGame();
window.game = game;
window.ProvinceID = ProvinceID;
window.RaidTrackID = RaidTrackID;
window.StateID = StateID;
window.UnitKind = UnitKind;

const EVENT_DEFAULT_POPUP_IMG = './images/e-default.png';
const INCOME_POPUP_IMG = './images/income.png';
const DEVASTATION_POPUP_IMG = './images/devast.png';
const REINFORCEMENTS_POPUP_IMG = './images/reinf.png';
const FINAL_SUMMARY_POPUP_IMG = './images/gameover.png';
const PEACE_BORDER_IMG = './images/spokoj_granica.png';
const ARSON_POPUP_IMG = './images/burn.png';

const EVENT_IMG_BASE = './images/events';

const EVENT_IMAGES_BY_ID = {
  1:  'veto',           // Liberum veto
  2:  'elekcja',        // Elekcja viritim
  3:  'skarb_pusty',    // Skarb pusty
  4:  'reformy',        // Reformy skarbowe
  5:  'sweden_war',     // Potop szwedzki
  6:  'north_war',      // Wojna północna
  7:  'cossacs_war',    // Powstanie Chmielnickiego
  8:  'kozacy',    // Kozacy na służbie (użyjemy tej samej grafiki)
  9:  'rus_war',      // Wojna z Moskwą (jeśli masz inną – podmień tu)
  10: 'wieden',         // Bitwa pod Wiedniem
  11: 'oliwa',          // Pokój w Oliwie
  12: 'zaciag',         // Zaciąg pospolity
  13: 'fortyfikacje',   // Fortyfikacja pogranicza
  14: 'artyleria',      // Artyleria koronna
  15: 'glod',           // Głód
  16: 'susza',          // Susza
  17: 'urodzaj',        // Urodzaj
  18: 'jarmarki',       // Jarmarki królewskie
  19: 'bunt_chlopski',  // Bunt chłopski
  20: 'roszady',        // Magnackie roszady
  21: 'bunt_poznan',    // Bunt w Poznaniu
  22: 'sroda',          // Sejmik w Środzie
  23: 'pozar',          // Pożar w Poznaniu
  24: 'szlak',          // Szlak Warta–Odra
  25: 'clo',            // Cła morskie
};

const LAW_IMG_BASE = './images/laws';
const LAW_IMG_BY_ID = {
  1: 'podatek',     // Podatek
  2: 'podatek',     // Podatek
  3: 'wojsko',      // Wojsko
  4: 'wojsko',      // Wojsko
  5: 'gospodarka',  // Gospodarka
  6: 'pokoj',       // Pokój
};

function lawImageFor(lawId){
  const key = LAW_IMG_BY_ID[lawId|0];
  return key ? `${LAW_IMG_BASE}/${key}.png` : '';
}

const ATTACK_IMG_LOW  = './images/attack_3.png';   // np. słaba szarża
const ATTACK_IMG_MID  = './images/attack_2.png';   // wyrównane starcie
const ATTACK_IMG_HIGH = './images/attack_1.png';  // miażdżący atak

let _lastPhaseId = null;
let _lastRoundNo = null;
let _actionWizard = null; 
let _defensePopupRound = -1; 

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

// NOWE: nazwy torów i konwersja na RaidTrackID
const TRACK_NAME = { N: 'Szwecja', E: 'Moskwa', S: 'Tatarzy' };
function toTrackEnum(k){ return k === 'N' ? RaidTrackID.N : k === 'E' ? RaidTrackID.E : RaidTrackID.S; }

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
      { label: 'Pokój — wariant A (N, E, S −1 każdy)', choice: 'A' },
      { label: 'Pokój — wariant B (−2 na torze N)', choice: 'B', track: 'N' },
      { label: 'Pokój — wariant B (−2 na torze E)', choice: 'B', track: 'E' },
      { label: 'Pokój — wariant B (−2 na torze S)', choice: 'B', track: 'S' },
    ],
    describe: [
      'A: wszystkie trzy tory (N, E, S) −1.',
      'B: jeden wybrany tor (N/E/S) −2.',
    ],
  },
};

function eventImageFor(n){
  const key = EVENT_IMAGES_BY_ID[n|0];
  return key ? `${EVENT_IMG_BASE}/${key}.png` : EVENT_DEFAULT_POPUP_IMG;
}

function randRolls(n){ return Array.from({length: Math.max(1, n|0)}, ()=> 1 + Math.floor(Math.random()*6)); }

function maybePrepareDefenseTargets(state){
  const s = state || game.getPublicState?.() || {};
  const phase = s.current_phase || game.round?.currentPhaseId?.();
  if (phase !== 'defense') return;
  if (s.defense_turn?.prepared) return;   // już zrobione

  // rzuć kością tylko dla torów z wartością ≥3
  const dice = {};
  if ((s.raid_tracks?.N|0) >= 3) dice.N = roll1d6();
  if ((s.raid_tracks?.E|0) >= 3) dice.E = roll1d6();
  if ((s.raid_tracks?.S|0) >= 3) dice.S = roll1d6();

  try {
    const lines = game.defense.chooseTargets(dice);
    logEngine(lines);
  } catch (e) {
    err('Obrona — losowanie celów nie powiodło się: ' + e.message);
  }

  // po przygotowaniu celów odśwież UI
  syncUIFromGame();
}


function maybeAutoAdvanceAfterArson(){
  const s = game.getPublicState?.() || {};
  if ((s.current_phase || game.round?.currentPhaseId?.()) !== 'arson') return;
  if (s.arson_turn?.done) {
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next z Palenia -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function maybeAutoAdvanceAfterDefense(){
  const s = game.getPublicState?.() || {};
  if ((s.current_phase || game.round?.currentPhaseId?.()) !== 'defense') return;
  if (s.defense_turn?.done) {
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next z Obrony -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function maybeAutoAdvanceAfterBattles(){
  const s = game.getPublicState?.() || {};
  if ((s.current_phase || game.round?.currentPhaseId?.()) !== 'battles') return;

  // Jeżeli silnik mówi, że tura starć jest DONE → przejdź dalej.
  if (s.battles_turn?.done) {
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next ze Starć -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function maybeAutoAdvanceAfterAttacks(){
  const s = game.getPublicState?.() || {};
  if ((s.current_phase || game.round?.currentPhaseId?.()) !== 'attacks') return;

  // Jeśli silnik zakończył fazę wypraw (turn.done) → przejdź dalej.
  if (s.attacks_turn?.done) {
    const nxt = game.finishPhaseAndAdvance();
    ok(`Auto-next z Wypraw -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
    syncUIFromGame();
  }
}

function uiRightmostForeignEstate(state, pid, pidx){
  const prov = state.provinces?.[pid];
  if (!prov) return null;

  const est = Array.isArray(prov.estates) ? prov.estates : [];
  for (let i = est.length - 1; i >= 0; i--) {
    const owner = est[i] | 0;             // -1 = puste, 0.. = indeks gracza
    if (owner >= 0) {
      if (owner !== pidx) {
        return { ownerIndex: owner, slotIndex: i }; // ostatnia zajęta jest cudza → można palić
      }
      return null; // ostatnia zajęta jest nasza → nie wolno palić
    }
  }
  return null; // brak jakichkolwiek posiadłości
}

function uiArsonEligibleTargets(state, pidx){
  const out = [];
  for (const pid of Object.keys(state.provinces || {})) {
    const key = provKeyFromId(pid); if (!key) continue;

    // możesz palić tylko tam, gdzie masz wojsko
    const myTroops = (state.troops?.[pid]?.[pidx] | 0) > 0;
    if (!myTroops) continue;

    // nowa reguła: tylko skrajna prawa posiadłość i tylko jeśli jest cudza
    const info = uiRightmostForeignEstate(state, pid, pidx);
    if (!info) continue;

    out.push({ pid, key, ownerIndex: info.ownerIndex, slotIndex: info.slotIndex });
  }
  return out;
}

function attackImageForRoll(roll){
  const r = roll|0;
  if (r <= 1) return ATTACK_IMG_LOW;   // 1
  if (r <= 5) return ATTACK_IMG_MID;   // 2–5
  return ATTACK_IMG_HIGH;              // 6
}

function roll1d6(){ return 1 + Math.floor(Math.random()*6); }

function isGameOverState(s){ return s?.state === StateID.GAME_OVER; }

function ensureSejmLawForRound(state, { forcePopup = false } = {}){
  const s = state || game.getPublicState?.();
  if (!s) return;

  if (isFirstRound(s)) return;

  const currentRound = s.round_status?.current_round ?? roundCur;
  const curPhase = s.current_phase || game.round?.currentPhaseId?.();

  if (_sejmLawRound === currentRound && _sejmLaw) {
    if (forcePopup) {
      const spec = LAW_VARIANTS[_sejmLaw.id];
      const lines = [
        `Wybrano ustawę: ${_sejmLaw.name}.`,
        '',
        'Warianty do wyboru (po aukcji):',
        ...(spec?.describe || ['(brak opisu wariantów)']),
        '',
        'Za chwilę licytacja marszałkowska (aukcja).'
      ];
      popupFromEngine(`Sejm — wylosowano ustawę: ${_sejmLaw.name}`, lines, {
        imageUrl: lawImageFor(_sejmLaw.id),
        buttonText: 'Dalej (Aukcja)'
      });
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

  if (forcePopup) {
    const spec = LAW_VARIANTS[pick.id];
    const lines = [
      `Wybrano ustawę: ${pick.name}.`,
      '',
      'Warianty do wyboru (po aukcji):',
      ...(spec?.describe || ['(brak opisu wariantów)']),
      '',
      'Teraz licytacja marszałkowska (aukcja).'
    ];
    popupFromEngine(`Sejm — wylosowano ustawę: ${pick.name}`, lines, {
      imageUrl: lawImageFor(pick.id),
      buttonText: 'Dalej (Aukcja)'
    });
  }
}

function isFirstRound(state){
  const s = state || game.getPublicState?.();
  const r = s?.round_status?.current_round ?? roundCur;
  return (r|0) === 1;
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

function getUnderAttackSet(state){
  const s = state || game.getPublicState?.() || {};
  const out = new Set();

  // 1) klasyczne kształty z UI
  const arr1 = s.defense_turn?.targets;
  if (Array.isArray(arr1)) arr1.forEach(pid => { const k = provKeyFromId(pid); if (k) out.add(k); });

  const obj1 = s.defense_turn?.under_attack || s.under_attack || s.attacked_provinces;
  if (obj1 && typeof obj1 === 'object') {
    for (const [pid, val] of Object.entries(obj1)) {
      if (!val) continue;
      const k = provKeyFromId(pid); if (k) out.add(k);
    }
  }

  const arr2 = s.defense_turn?.attacks || s.defense_turn?.events || s.attacks_on_provinces;
  if (Array.isArray(arr2)) {
    arr2.forEach(x => {
      const pid = x?.provinceId ?? x?.province_id ?? x?.province ?? x?.id;
      const k = provKeyFromId(pid); if (k) out.add(k);
    });
  }

  const d = s.defense_state || s.defense || {};
  if (d.enemyByProvince && typeof d.enemyByProvince === 'object') {
    for (const [pid, enemy] of Object.entries(d.enemyByProvince)) {
      // obsłuż stary (number) i nowy (object) format
      const threatened = (typeof enemy === 'number')
        ? ((enemy|0) > 0)
        : (enemy && Object.values(enemy).some(v => (v|0) > 0));
      if (threatened) {
        const k = provKeyFromId(pid); if (k) out.add(k);
      }
    }
  }
  if (d.targetsByTrack && typeof d.targetsByTrack === 'object') {
    for (const pid of Object.values(d.targetsByTrack)) {
      const k = provKeyFromId(pid); if (k) out.add(k);
    }
  }
  if (d.prepReport && Array.isArray(d.prepReport.events)) {
    d.prepReport.events.forEach(ev => {
      const k = provKeyFromId(ev?.target); if (k) out.add(k);
    });
  }

  return out;
}

function collectDefenseThreats(state){
  const s = state || game.getPublicState?.() || {};
  const d = s.defense_state || s.defense || {};

  // key(UI prowincji) -> tablica { trackKey:'N'|'E'|'S', enemy:'Szwecja'|..., strength:int|null }
  const perProv = new Map();

  // 1) preferuj raport z chooseTargets (ma target + siłę + tor)
  if (d.prepReport && Array.isArray(d.prepReport.events) && d.prepReport.events.length){
    d.prepReport.events.forEach(ev => {
      const key = provKeyFromId(ev?.target); if (!key) return;
      const k = typeof ev?.trackKey === 'string' ? ev.trackKey
              : (ev?.trackId === RaidTrackID?.N ? 'N' : ev?.trackId === RaidTrackID?.E ? 'E' : ev?.trackId === RaidTrackID?.S ? 'S' : null);
      if (!k) return;
      const arr = perProv.get(key) || [];
      arr.push({ trackKey: k, enemy: TRACK_NAME[k] || 'wróg', strength: (ev?.strength|0) || null });
      perProv.set(key, arr);
    });
  }

  // 2) targetsByTrack + bieżące wartości torów (gdy brak prepReport)
  if (d.targetsByTrack && typeof d.targetsByTrack === 'object'){
    for (const [k, pid] of Object.entries(d.targetsByTrack)){
      if (!pid) continue;
      const key = provKeyFromId(pid); if (!key) continue;
      const strength = (s.raid_tracks && typeof s.raid_tracks[k] !== 'undefined') ? (s.raid_tracks[k]|0) : null;
      const arr = perProv.get(key) || [];
      // uniknij duplikatów tego samego toru
      if (!arr.some(x => x.trackKey === k)) arr.push({ trackKey: k, enemy: TRACK_NAME[k] || 'wróg', strength });
      perProv.set(key, arr);
    }
  }

  // 3) fallback: enemyByProvince (nowy format per-tor)
  if (d.enemyByProvince && typeof d.enemyByProvince === 'object'){
    for (const [pid, val] of Object.entries(d.enemyByProvince)){
      const key = provKeyFromId(pid); if (!key) continue;
      if (typeof val === 'number') {
        if ((val|0) > 0 && !perProv.has(key)) perProv.set(key, [{ trackKey: null, enemy:'wróg', strength: val|0 }]);
      } else if (val && typeof val === 'object') {
        for (const [k, v] of Object.entries(val)){
          if ((v|0) <= 0) continue;
          const arr = perProv.get(key) || [];
          if (!arr.some(x => x.trackKey === k)) arr.push({ trackKey: k, enemy: TRACK_NAME[k] || 'wróg', strength: v|0 });
          perProv.set(key, arr);
        }
      }
    }
  }

  // wynik
  const out = [];
  for (const [key, threats] of perProv.entries()){
    out.push({
      key,
      label: PROV_DISPLAY[key] || key,
      threats: threats   // tablica {trackKey, enemy, strength}
    });
  }
  return out;
}


function ensureDefensePopup(state){
  const s0 = state || game.getPublicState?.(); if (!s0) return;
  const phase = s0.current_phase || game.round?.currentPhaseId?.();
  if (phase !== 'defense') return;

  const r = s0.round_status?.current_round | 0;
  if (r === _defensePopupRound) return; // tylko raz na rundę

  // upewnij się, że cele są przygotowane (żeby mieć co pokazać)
  if (!s0.defense_turn?.prepared) {
    try {
      const dice = {};
      if ((s0.raid_tracks?.N|0) >= 3) dice.N = roll1d6();
      if ((s0.raid_tracks?.E|0) >= 3) dice.E = roll1d6();
      if ((s0.raid_tracks?.S|0) >= 3) dice.S = roll1d6();
      const out = game.defense.chooseTargets(dice);
      logEngine(out);
    } catch(_) { /* brak torów ≥3 → OK, nic do obrony */ }
  }

  // świeży stan po ewentualnym chooseTargets
  const s = game.getPublicState?.() || {};

  // lista zagrożeń do pokazania (etykiety, siła, kto)
  const threats = collectDefenseThreats(s); // [{key,label,enemy,strength},...]

  // kto jest aktywnym obrońcą (jak w Wyprawach: preferuj indeks z silnika)
  const pidx = Number.isInteger(s.active_defender_index)
    ? s.active_defender_index
    : (curPlayerIdx >= 0 ? curPlayerIdx : 0);

  // zestaw prowincji faktycznie pod atakiem (klucze UI: 'prusy','litwa',...)
  const underAttack = getUnderAttackSet(s);

  // Czy AKTYWNY gracz ma jednostki w którejś z prowincji będących pod atakiem?
  let youCanDefend = false;
  for (const [pid, arr] of Object.entries(s.troops || {})) {
    const key = provKeyFromId(pid); // ← jak w najazdach/wyprawach: z ID silnika -> klucz UI
    if (!key) continue;
    if (!underAttack.has(key)) continue;     // musi być atakowana
    const units = (arr?.[pidx] || 0) | 0;    // jednostki aktywnego obrońcy
    if (units > 0) { youCanDefend = true; break; }
  }

  const hasAttacks = threats.length > 0;

  const listLines = hasAttacks
    ? threats.flatMap(t => {
        if (!Array.isArray(t.threats) || t.threats.length === 0) return [`• ${t.label} — atak (szczegóły niedostępne)`];
        return t.threats.map(th => {
          const pwr = (th.strength != null) ? ` (siła: ${th.strength})` : '';
          const who = th.enemy || (th.trackKey ? TRACK_NAME[th.trackKey] : 'wróg');
          return `• ${t.label} — atakuje ${who}${pwr}`;
        });
      })
    : [];


  const lines = hasAttacks
    ? [
        'Te prowincje są napadane w tej fazie:',
        '',
        ...listLines,
        '',
        youCanDefend
          ? 'Możesz bronić tylko tam, gdzie masz własne jednostki.'
          : 'Nie masz jednostek w napadanych prowincjach — nie możesz się bronić.'
      ]
    : [
        'W tej rundzie brak najazdów (żaden tor nie osiągnął wartości 3).'
      ];

  const buttonText = youCanDefend ? 'Do obrony' : 'Dalej (Spustoszenia)';

  popupFromEngine('Najazdy — cele obrony', lines, {
    imageUrl: ATTACK_IMG_MID,
    buttonText,
    onAction: () => {
      if (!youCanDefend) {
        const nxt = game.finishPhaseAndAdvance();
        ok(`Auto-next z Obrony -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
        syncUIFromGame();
      }
    }
  });

  _defensePopupRound = r;
}


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

function renderPlayerRow(p){
  const chip = document.createElement('span');
  chip.id = `player-${p.key}`;
  chip.className = 'player-chip';

  // PASEK RANKINGU (kolor gracza)
  const rank = document.createElement('span');
  rank.className = 'rankbar';
  rank.style.color = p.color;     // kolor paska = kolor gracza
  rank.style.width = '18px';      // startowa szerokość (zostanie nadpisana)

  // IMIĘ
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = p.name;

  // ZŁOTO
  const gold = document.createElement('span');
  gold.className = 'player-gold';
  gold.innerHTML = `<span class="coin"></span><span class="val">—</span>`;
  gold.setAttribute('data-col', 'gold');

  // KOLEJNOŚĆ: pasek → imię → złoto
  chip.append(rank, name, gold);
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
  defense:'Obrona',                
  arson:  'Palenie posiadłości',
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

// [DROBNA AKTUALIZACJA — applyCurrentTurnFromState: dodaj obronę]
function applyCurrentTurnFromState(s){
  const phase = s.current_phase || game.round?.currentPhaseId?.();
  let idx = -1;

  if (phase === 'actions' && Number.isInteger(s.active_player_index)) {
    idx = s.active_player_index;
  } else if (phase === 'attacks' && Number.isInteger(s.active_attacker_index)) {
    idx = s.active_attacker_index;          
  } else if (phase === 'battles' && Number.isInteger(s.active_battler_index)) {
    idx = s.active_battler_index;          
  } else if (phase === 'defense' && Number.isInteger(s.active_defender_index)) { // [DODAJ]
    idx = s.active_defender_index;
  } else if (phase === 'arson' && Number.isInteger(s.active_arson_index)) {
    idx = s.active_arson_index;
  } else {
    idx = -1;
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

// --- [MAPA] ID silnika -> ID ścieżki w SVG:
const PID_TO_ELEMID = {
  'Prusy':        'r-prusy',
  'Litwa':        'r-litwa',
  'Ukraina':      'r-ukraina',
  'Wielkopolska': 'r-wielkopolska',
  'Małopolska':   'r-malopolska',
};

// pobierz środek elementu SVG (bbox w przestrzeni viewBox)
function svgCenterOf(el){
  const b = el.getBBox();
  return { x: b.x + b.width/2, y: b.y + b.height/2 };
}

function getAutoTrackCenter(trackKey){
  const svg = document.getElementById('mapSvg');
  if (!svg) return null;
  // priorytet: elementy w enemiesLayer oznaczone data-track
  const el = svg.querySelector(`#enemiesLayer [data-track="${trackKey}"]`)
         || svg.querySelector(`#enemiesLayer .label`); // bardzo awaryjny fallback
  return el ? bboxCenter(el) : null;
}

function getFallbackTrackAnchor(trackKey){
  const svg = document.getElementById('mapSvg');
  const circ = svg?.querySelector(`#trackAnchors [data-track="${trackKey}"]`);
  return circ ? { x:+circ.getAttribute('cx'), y:+circ.getAttribute('cy') } : null;
}

function getTrackAnchor(trackKey){
  const svg = document.getElementById('mapSvg');
  if (!svg) return null;

  // Rozmiar SVG (preferuj viewBox, fallback na wymiary klienta i sensowne domyślne)
  const vb = svg.viewBox?.baseVal || null;
  const width  = vb?.width  || svg.clientWidth  || 1633; // te same liczby, co w createEnemyTracks
  const height = vb?.height || svg.clientHeight || 1137;

  // Ustal dokładnie te same „kotwice”, co przy rysowaniu torów:
  // N: środek u góry, y = 60
  // E: prawa krawędź − 60, y = 340
  // S: środek u dołu, y = height − 50
  if (trackKey === 'N') return { x: width / 2,     y: 60 };
  if (trackKey === 'E') return { x: width - 60,    y: 340 };
  if (trackKey === 'S') return { x: width / 2,     y: height - 50 };
  return null;
}

function getProvinceCenter(pid){
  const svg = document.getElementById('mapSvg');
  const elId = PID_TO_ELEMID[pid];
  const el = elId ? svg?.getElementById(elId) : null;
  return el ? bboxCenter(el) : null;
}

function drawArrow(svg, from, to, labelText, offsetIdx=0){
  // rozchylenie równoległe do normalnej, by kilka strzałek nie leżało na sobie
  const dx = to.x - from.x, dy = to.y - from.y, L = Math.hypot(dx,dy) || 1;
  const nx = -dy/L, ny =  dx/L;
  const spread = 18; // px w przestrzeni viewBox
  const ox = nx * spread * offsetIdx, oy = ny * spread * offsetIdx;

  const x1 = from.x + ox, y1 = from.y + oy;
  const x2 = to.x   + ox, y2 = to.y   + oy;

  // linia
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('class', 'arrow');
  line.setAttribute('marker-end', 'url(#arrowB)');
  svg.appendChild(line);

  // Etykieta na środku linii (50%), z minimalnym odsunięciem od linii
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const midOffset = 10; // odsunięcie etykiety prostopadle od linii (px)
  const tx = mx + nx * midOffset, ty = my + ny * midOffset;

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', tx); text.setAttribute('y', ty);
  text.setAttribute('class', 'arrow-label');
  text.textContent = String(labelText);
  svg.appendChild(text);
}

export function updateDefenseArrowsLayer(state){
  const s = state || (window.game?.getPublicState?.() || {});
  const svg = document.getElementById('mapSvg');
  const layer = svg?.getElementById?.('defenseArrows') || document.getElementById('defenseArrows');
  if (!svg || !layer) return;

  // czyścimy
  while (layer.firstChild) layer.removeChild(layer.firstChild);

  // rysujemy tylko w fazie obrony
  const phase = s.current_phase || window.game?.round?.currentPhaseId?.();
  if (phase !== 'defense') return;

  const def = s.defense_state || s.defense || {};
  const perProv = def.enemyByProvince || {};

  for (const [pid, tracks] of Object.entries(perProv)){
    if (!tracks || typeof tracks !== 'object') continue;
    const to = getProvinceCenter(pid); if (!to) continue;

    // aktywne tory z siłą > 0
    const entries = Object.entries(tracks).filter(([,v]) => (v|0) > 0);
    entries.forEach(([k, v], idx) => {
      const from = getTrackAnchor(k); if (!from) return;
      drawArrow(layer, from, to, v|0, idx);
    });
  }
}

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
const PHASES = [
  'Wydarzenia','Dochód','Sejm','Akcje','Starcia',
  'Palenie','Wzmacnianie',
  'Wyprawy',   // ← najpierw Wyprawy
  'Obrona',    // ← tuż przed Spustoszeniami
  'Spustoszenia'
];

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

function applyRankingBarsFromEngine(publicState){
  let raw;
  try { raw = game.getScoresRaw?.(); } catch { raw = null; }
  if (!raw || !raw.players) return;

  // 2) gracze z PUBLICZNEGO stanu (ten sam porządek indeksów!)
  const players = publicState?.settings?.players || [];
  if (!players.length) return;

  // 3) mapping: miejsce → szerokość (remis = ta sama długość)
  const step = [0, 64, 46, 36, 28, 24, 20]; // 1..N; możesz podstroić
  const places = raw.places || [];

  players.forEach((sp, idx) => {
    const chip = document.getElementById(`player-${playerKey(sp.name)}`);
    if (!chip) return;
    const bar  = chip.querySelector('.rankbar');
    if (!bar) return;

    // kolor: spróbuj z datasetu chipa, potem z PLAYERS, na końcu akcent
    const ui = (typeof PLAYERS !== 'undefined') ? PLAYERS.find(p => p.name === sp.name) : null;
    const color = chip.dataset.color || ui?.color || '#eab308';

    const place = places[idx] || 7;
    const width = step[place] || 18;

    bar.style.color = color;
    bar.style.width = `${width}px`;
    bar.title = `Miejsce: ${place} — ${raw.players[idx].score} pkt`;
  });
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
    group.setAttribute('id', `armies-${r.key}`);
    group.setAttribute('data-region', r.key);

    for (let i = 1; i <= ARMY_SLOTS; i++) {
      const cx = firstCx + (i - 1) * ARMY_COL_SPACING;

      const slotG = document.createElementNS('http://www.w3.org/2000/svg','g');
      slotG.setAttribute('id', `army-${r.key}-${i}`);
      slotG.setAttribute('data-slot', i);
      slotG.setAttribute('data-cx', cx.toFixed(1));
      slotG.setAttribute('data-cy', armyCy.toFixed(1));
      slotG.style.display = 'none';

      // (opcjonalnie: zostaw puste, bez circle/text – i tak rysujesz dynamicznie)
      group.appendChild(slotG);
    }
    armiesLayer.appendChild(group);
  }
}

function isCavalryKind(k){
  // jeśli enum liczbowy
  if (typeof UnitKind?.CAV === 'number') return Number(k) === UnitKind.CAV;

  // jeśli enum stringowy
  if (typeof UnitKind?.CAV === 'string') {
    const ks = String(k).toUpperCase();
    return ks === UnitKind.CAV.toUpperCase() || ks === '1'; // gdy silnik daje 1
  }

  // fallback: akceptuj 1 jako kawalerię
  return Number(k) === 1 || String(k).toUpperCase() === 'CAV';
}

function getArmySlot(regionKey, slot){ return svg.querySelector(`#army-${regionKey}-${slot}`); }
function setArmy(regionKey, slot, color, units, kind /* UnitKind */){
  console.log('setArmy kind=', kind, 'isCav=', isCavalryKind(kind));

  const slotG = getArmySlot(regionKey, slot);
  if (!slotG) return false;

  const cx = parseFloat(slotG.getAttribute('data-cx')) || 0;
  const cy = parseFloat(slotG.getAttribute('data-cy')) || 0;

  // wyczyść zawartość po odczycie pozycji
  slotG.innerHTML = '';

  // narysuj kształt
  let shape;
  const isCav = isCavalryKind(kind);

  if (isCav) {
    const size = 22;
    const pts = [
      [cx, cy - size],
      [cx + size, cy],
      [cx, cy + size],
      [cx - size, cy]
    ].map(([x,y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    shape = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    shape.setAttribute('points', pts);
  } else {
    shape = document.createElementNS('http://www.w3.org/2000/svg','circle');
    shape.setAttribute('cx', cx.toFixed(1));
    shape.setAttribute('cy', cy.toFixed(1));
    shape.setAttribute('r', 18);
  }
  shape.setAttribute('fill', color);
  shape.setAttribute('stroke', color);

  const text = document.createElementNS('http://www.w3.org/2000/svg','text');
  text.setAttribute('x', cx.toFixed(1));
  text.setAttribute('y', cy.toFixed(1));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.textContent = String(parseInt(units,10));

  slotG.appendChild(shape);
  slotG.appendChild(text);
  slotG.style.display = '';
  return true;
}


function resetArmies(regionKey){
  const slots = svg.querySelectorAll(`#armies-${regionKey} g[data-slot]`);
  let okAny = false;
  slots.forEach(s => {
    s.innerHTML = '';
    s.style.display = 'none';
    okAny = true;
  });
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
  arson: 6,
  reinforcements: 7,
  attacks: 8,     
  defense: 9,    
  devastation: 10
};

function applyPhaseFromEngineState(s){
  const id = s.current_phase || game.round?.currentPhaseId?.();
  const idx = ENGINE_TO_UI_PHASE[id];
  if (Number.isInteger(idx) && idx !== phaseCur){
    phaseCur = idx;
  }
  setPhaseNow(id);     

  if (id === 'defense') {
    maybePrepareDefenseTargets(s);
    ensureDefensePopup(s);
  }
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
      chip('Start 15 rund', ()=>run('gstart 15 6')),
      chip('Start 20 rund', ()=>run('gstart 20 6')),
      el('div', {style:{height:'8px'}}),
      chip('Start 5 rund — reset złota',  ()=>run('gstart 5 6 reset')),
      chip('Start 10 rund — reset złota', ()=>run('gstart 10 6 reset')),
      chip('Start 15 rund — reset złota', ()=>run('gstart 15 6 reset')),
      chip('Start 20 rund — reset złota', ()=>run('gstart 20 6 reset')),
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
        imageUrl: eventImageFor(n),  
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
          // Zakończ fazę 'income'
          const nxt = game.finishPhaseAndAdvance(); // zwykle -> 'auction'
          ok(`Silnik: next -> ${nxt || game.round.currentPhaseId() || 'koniec gry'}`);
        
          const s2 = game.getPublicState?.();
          const veto = !!s2.round_status?.sejm_canceled;

          if (isFirstRound(s2) || veto) {
            // 1. runda => pomijamy 'auction' i 'sejm'
            const a = game.finishPhaseAndAdvance(); // auction -> sejm
            ok(`Silnik: next -> ${a || game.round.currentPhaseId() || 'koniec gry'}`);
            const b = game.finishPhaseAndAdvance(); // sejm -> actions
            ok(`Silnik: next -> ${b || game.round.currentPhaseId() || 'koniec gry'}`);
          }
        
          syncUIFromGame();
        },
        onClose: () => {
          const st = game.getPublicState?.();
          if (!isFirstRound(st)) {
            // tylko od 2. rundy wzwyż
            ensureSejmLawForRound(st, { forcePopup: true });
          }
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

      chip('Rekrutacja piechota', ()=>{ _actionWizard = { kind:'rekrutacja_piechota' }; buildPhaseActionsSmart(game.getPublicState()); }, 'gact rekrutacja_piechota <prowincja>'),
      chip('Rekrutacja kawaleria', ()=>{ _actionWizard = { kind:'rekrutacja_kawaleria' }; buildPhaseActionsSmart(game.getPublicState()); }, 'gact rekrutacja_kawaleria <prowincja>'),
      
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
      const singleProvKinds = new Set(['wplyw','posiadlosc','zamoznosc','rekrutacja_piechota','rekrutacja_kawaleria']);
      if (singleProvKinds.has(_actionWizard.kind)) {
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
    const box = section('Starcia', 'Wybierz prowincję z przeciwnikiem i zaatakuj (1k6). PASS, jeśli nie atakujesz.');
  
    const pidx = Number.isInteger(s.active_battler_index) ? s.active_battler_index : curPlayerIdx;
    const activePlayerName = s.settings?.players?.[pidx]?.name || '—';
    box.append(el('div', { style:{ color:'#94a3b8', margin:'0 0 8px' } }, `Aktywny gracz: ${activePlayerName}`));
  
    const rows = [];
    for (const [pid, arr] of Object.entries(s.troops || {})){
      const key = provKeyFromId(pid); if (!key) continue;
      const my = (arr?.[pidx] || 0)|0; if (my<=0) continue;
      const foes = (arr||[]).map((u,i)=>({u:u|0,i})).filter(t=>t.i!==pidx && t.u>0);
      if (!foes.length) continue;
      rows.push({ pid, key, foes });
    }
  
    if (rows.length === 0){
      box.append(el('div', { style:{ color:'#f59e0b', margin:'6px 0 8px' } }, 'Brak przeciwników przy twoich oddziałach — możesz PASS.'));
    } else {
      rows.forEach(({pid,key,foes})=>{
        const row = el('div', { style:{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', margin:'6px 0' } });
        row.append(el('span', { style:{ minWidth:'180px', fontWeight:'800' } }, `${key}`));
        foes.forEach(({i:uIdx,u})=>{
          const foeName = s.settings?.players?.[uIdx]?.name || `#${uIdx}`;
          row.append(chip(`atak ${key} → ${foeName}`, ()=>{
            try{
              const roll = roll1d6();
              ok(`(UI) Starcie ${key}: ${activePlayerName} vs ${foeName}, rzut: ${roll}`);
              const lines = game.battles.attack({
                playerIndex: pidx,
                provinceId: toProvEnum(key),
                targetIndex: uIdx,
                rolls: [roll],
                dice: 1
              });
              logEngine(lines);
              syncUIFromGame();
              maybeAutoAdvanceAfterBattles();
              
              popupFromEngine(`Starcie — ${key}`, [
                `Rzut: ${roll}.`,
                ...(Array.isArray(lines)?lines:[lines]),
              ], {
                imageUrl: attackImageForRoll(roll),
                buttonText: 'OK',
                onClose: () => {
                  maybeAutoAdvanceAfterBattles();
                  buildPhaseActionsSmart(game.getPublicState());
                }
              });
            } catch(e){ err('Błąd starcia: ' + e.message); }
          }, `gduelauto ${key} ${activePlayerName} ${foeName}`));
        });
        box.append(row);
      });
    }
  
    box.append(el('div', { style:{ height:'6px' } }));
    box.append(chip('PASS (starcia)', ()=>{
      try{
        const st = game.getPublicState?.() || {};
        if ((st.current_phase || game.round?.currentPhaseId?.()) !== 'battles') {
          ok('Faza Starć już zakończona — odświeżam UI.');
          syncUIFromGame();
          buildPhaseActionsSmart(game.getPublicState());
          return;
        }
    
        const freshPidx = Number.isInteger(st.active_battler_index)
          ? st.active_battler_index
          : curPlayerIdx;
    
        const msg = game.battles.passTurn(freshPidx);
        ok(String(msg || 'PASS (starcia).'));
    
        syncUIFromGame();
        maybeAutoAdvanceAfterBattles();
        buildPhaseActionsSmart(game.getPublicState());
    
      }catch(ex){
        if (String(ex?.message || '').includes('Faza starć już zakończona')) {
          ok('Silnik zamknął fazę Starć — odświeżam UI.');
          syncUIFromGame();
          buildPhaseActionsSmart(game.getPublicState());
          return;
        }
        err('PASS (starcia) nieudany: ' + ex.message);
      }
    }, '—'));


  
    phaseActionsEl.appendChild(box);
    tintByActive(); return;
  }

  // ====== PALENIE POSIADŁOŚCI ======
  if (phase === 'arson'){
    const box = section('Palenie posiadłości', 'Możesz spalić jedyną posiadłość w prowincji, w której masz wojsko. Albo PASS.');
  
    // aktywny gracz (jak w battles)
    const pidx = Number.isInteger(s.active_arson_index) ? s.active_arson_index : curPlayerIdx;
    const activePlayerName = s.settings?.players?.[pidx]?.name || '—';
    box.append(el('div', { style:{ color:'#94a3b8', margin:'0 0 8px' } }, `Aktywny gracz: ${activePlayerName}`));
  
    // kandydaci (jak w battles liczy przeciwników)
    const targets = uiArsonEligibleTargets(s, pidx);
  
    if (targets.length === 0){
      box.append(el('div', { style:{ color:'#f59e0b', margin:'6px 0 8px' } }, 'Brak legalnych celów — możesz PASS.'));
    } else {
      targets.forEach(({ pid, key, ownerIndex }) => {
        const victim = s.settings?.players?.[ownerIndex]?.name || `#${ownerIndex}`;
        const row = el('div', { style:{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', margin:'6px 0' } });
  
        row.append(el('span', { style:{ minWidth:'220px', fontWeight:'800' } }, `${key} — ofiara: ${victim}`));
  
        // przycisk akcji (jak „atak” w battles)
        row.append(chip(`spal ${key}`, ()=>{
          try{
            // świeże indeksy (jak w battles)
            const stNow = game.getPublicState?.() || {};
            const pidxNow = Number.isInteger(stNow.active_arson_index) ? stNow.active_arson_index : curPlayerIdx;
  
            const lines = game.arson.burn({ playerIndex: pidxNow, provinceId: toProvEnum(key) });
            logEngine(lines);
            syncUIFromGame();
  
            // popup (jak w battles: obrazek, OK) i dopiero w onClose -> maybeAuto…
            popupFromEngine(`Palenie — ${key}`, Array.isArray(lines)?lines:[String(lines)], {
              imageUrl: ARSON_POPUP_IMG,
              buttonText: 'OK',
              onClose: () => {
                maybeAutoAdvanceAfterArson();
                buildPhaseActionsSmart(game.getPublicState());
              }
            });
          } catch(e){ err('Błąd palenia: ' + e.message); }
        }, `garson burn ${key}`));
  
        box.append(row);
      });
    }
  
    box.append(el('div', { style:{ height:'6px' } }));
  
    // PASS (jak w battles)
    box.append(chip('PASS (palenie)', ()=>{
      try{
        const st = game.getPublicState?.() || {};
        if ((st.current_phase || game.round?.currentPhaseId?.()) !== 'arson') {
          ok('Faza Palenia już zakończona — odświeżam UI.');
          syncUIFromGame();
          buildPhaseActionsSmart(game.getPublicState());
          return;
        }
        const fresh = Number.isInteger(st.active_arson_index) ? st.active_arson_index : curPlayerIdx;
  
        const msg = game.arson.passTurn(fresh);
        ok(String(msg || 'PASS (palenie).'));
  
        syncUIFromGame();
        // identycznie jak w battles: sprawdź czy faza jest DONE i wtedy auto-next
        maybeAutoAdvanceAfterArson();
        buildPhaseActionsSmart(game.getPublicState());
      } catch(ex){
        if (String(ex?.message || '').includes('Faza palenia już zakończona')) {
          ok('Silnik zamknął fazę Palenia — odświeżam UI.');
          syncUIFromGame();
          buildPhaseActionsSmart(game.getPublicState());
          return;
        }
        err('PASS (palenie) nieudany: ' + ex.message);
      }
    }, 'garson pass'));
  
    phaseActionsEl.appendChild(box);
    tintByActive();
    return;
  }


  // ====== WZMACNIANIE ======
  if (phase === 'reinforcements'){
    const box = section('Wzmacnianie', 'Wylosuj N, S, E (1–6) i zastosuj wzmocnienia na torach wrogów.');
    const btn = chip('Wzmocnienie wrogów', ()=>{
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
                maybeAutoAdvanceAfterAttacks(); 
    
                popupFromEngine(`Wyprawa — ${key} → ${enemyKey}`, [
                  `Rzut: ${roll}.`,
                  ...(Array.isArray(lines) ? lines : [lines]),
                ], {
                  imageUrl: attackImageForRoll(roll),
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
    
      box.append(el('div', { style:{ height:'6px' } }));
      box.append(chip('PASS (wyprawy)', ()=> {
        try{
          const st = game.getPublicState?.() || {};
          if ((st.current_phase || game.round?.currentPhaseId?.()) !== 'attacks') {
            ok('Faza Wypraw już zakończona — odświeżam UI.');
            syncUIFromGame();
            return;
          }
          const pidx = Number.isInteger(st.active_attacker_index) ? st.active_attacker_index : curPlayerIdx;
          const msg = game.attacks.passTurn(pidx);
          ok(String(msg || 'PASS (wyprawy).'));
          syncUIFromGame();
          maybeAutoAdvanceAfterAttacks();
          buildPhaseActionsSmart(game.getPublicState());
        } catch(ex){
          err('PASS (wyprawy) nieudany: ' + ex.message);
        }
      }));

      phaseActionsEl.appendChild(box);
      tintByActive();
      return;
    }

    if (phase === 'defense'){
      const box = section('Obrona', 'Wybierz prowincję będącą pod najazdem, w której masz swoje wojsko — albo PASS.');
    
      const pidx = Number.isInteger(s.active_defender_index) ? s.active_defender_index : curPlayerIdx;
      const activePlayerName = s.settings?.players?.[pidx]?.name || '—';
      box.append(el('div', { style:{ color:'#94a3b8', margin:'0 0 8px' } }, `Aktywny gracz: ${activePlayerName}`));
    
      const underAttack = getUnderAttackSet(s);
      const enemyMap = (s.defense_state?.enemyByProvince) || {};
    
      const playerProvinces = [];
      for (const [pid, arr] of Object.entries(s.troops || {})) {
        const key = provKeyFromId(pid); if (!key) continue;
        if (!underAttack.has(key)) continue;
        const units = (arr?.[pidx] || 0) | 0;
        if (units > 0) playerProvinces.push({ key, pid, units });
      }
    
      if (playerProvinces.length === 0){
        const why = (underAttack.size === 0)
          ? 'Silnik nie zgłosił żadnych atakowanych prowincji.'
          : 'Nie masz jednostek w atakowanych prowincjach.';
        box.append(el('div', { style:{ color:'#f59e0b', margin:'6px 0 8px' } }, `Brak możliwych obron — ${why}`));
      } else {
        playerProvinces.forEach(({ key, pid, units }) => {
          const row = el('div', { style:{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap', margin:'6px 0' } });
          row.append(el('span', { style:{ minWidth:'220px', fontWeight:'800' } }, `${key} (jednostek: ${units})`));
    
          // NOWE: odczytaj aktywne tory dla tej prowincji
          const perTrack = enemyMap[pid] || {}; // np. { N:3, E:2 }
          const trackKeys = Object.entries(perTrack).filter(([,v]) => (v|0) > 0).map(([k]) => k);
    
          // Fallback (gdyby z jakiegoś powodu brakło perTrack): spróbuj z targetsByTrack
          if (trackKeys.length === 0 && s.defense_state?.targetsByTrack) {
            for (const [k, targetPid] of Object.entries(s.defense_state.targetsByTrack)) {
              if (targetPid === pid) trackKeys.push(k);
            }
          }
    
          // Renderuj po jednym przycisku na KAŻDY tor atakujący tę prowincję
          if (trackKeys.length === 0) {
            row.append(el('span', { style:{ color:'#94a3b8' } }, '— brak aktywnych torów przeciw tej prowincji —'));
          } else {
            trackKeys.forEach(k => {
              const label = `bronię ${key} ⇄ ${TRACK_NAME[k] || k}`;
              row.append(chip(label, () => {
                try {
                  const roll = roll1d6();
                  ok(`(UI) Obrona ${key} ⇄ ${TRACK_NAME[k] || k}, rzut: ${roll}`);
                  const lines = game.defense.defend({
                    playerIndex: pidx,
                    provinceId: toProvEnum(key),  // ← ID z silnika
                    track: toTrackEnum(k),        // ← NOWE: wymagane przez API
                    rolls: [roll]
                  });
                  logEngine(lines);
                  syncUIFromGame();
                  maybeAutoAdvanceAfterDefense();
                  popupFromEngine(`Obrona — ${key} ⇄ ${TRACK_NAME[k] || k}`, [
                    `Rzut: ${roll}.`,
                    ...(Array.isArray(lines) ? lines : [lines]),
                  ], {
                    imageUrl: attackImageForRoll(roll),
                    buttonText: 'OK',
                    onClose: () => {
                      maybeAutoAdvanceAfterDefense();
                      buildPhaseActionsSmart(game.getPublicState());
                    }
                  });
                } catch (e) { err('Błąd obrony: ' + e.message); }
              }, `gdefend ${k} ${key} <auto 1k6>`));
            });
          }
    
          box.append(row);
        });
      }
    
      box.append(el('div', { style:{ height:'6px' } }));
      box.append(chip('PASS (obrona)', ()=> {
        try{
          const st = game.getPublicState?.() || {};
          if ((st.current_phase || game.round?.currentPhaseId?.()) !== 'defense') {
            ok('Faza Obrony już zakończona — odświeżam UI.');
            syncUIFromGame();
            return;
          }
          const p = Number.isInteger(st.active_defender_index) ? st.active_defender_index : curPlayerIdx;
          const msg = game.defense.passTurn(p);
          ok(String(msg || 'PASS (obrona).'));
          syncUIFromGame();
          maybeAutoAdvanceAfterDefense();
          buildPhaseActionsSmart(game.getPublicState());
        } catch(ex){ err('PASS (obrona) nieudany: ' + ex.message); }
      }));
    
      phaseActionsEl.appendChild(box);
      tintByActive();
      return;
    }



  // ====== SPUSTOSZENIA ======
  if (phase === 'devastation'){
    const box = section('Spustoszenia', 'Zastosuj spustoszenia, potem przejdź do następnej rundy.');
    const btnDev = chip('Sprawdz spustoszenia', ()=>{
      const r = ()=> 1 + Math.floor(Math.random()*6);
      const N=r(), S=r(), E=r();

      const before = game.getPublicState?.() || {};
      const bn = (before.raid_tracks?.N | 0);
      const bs = (before.raid_tracks?.S | 0);
      const be = (before.raid_tracks?.E | 0);
      const noDevastation = bn < 3 && bs < 3 && be < 3;

      const lines = game.devastation.resolve({ N, S, E });
      
      ok(`(UI) spustoszenia: N=${N}, S=${S}, E=${E}`);
      logEngine(lines);
      syncUIFromGame();
    
      popupFromEngine('Najazdy — spustoszenia', [
        `Rzuty: N=${N}, S=${S}, E=${E}.`,
        ...(Array.isArray(lines) ? lines : [lines]),
      ], {
        imageUrl: noDevastation ? PEACE_BORDER_IMG : DEVASTATION_POPUP_IMG,
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

  const phaseId = s.current_phase || game.round?.currentPhaseId?.();
  const roundNo = s.round_status?.current_round;
  if (phaseId !== _lastPhaseId || roundNo !== _lastRoundNo){
    _lastPhaseId = phaseId;
    _lastRoundNo = roundNo;
  }
  
  // RUNDY
  roundCur = s.round_status.current_round; roundMax = s.round_status.total_rounds; 
  updateRoundUI();
  updatePlayersUIFromState(s);
  applyRankingBarsFromEngine(s);
  applyCurrentTurnFromState(s);
  applyPhaseFromEngineState(s);
  updateDefenseArrowsLayer(game.getPublicState());
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
  
    const tuples = arr
      .map((units, idx) => ({ units, idx }))
      .filter(t => t.units > 0)
      .sort((a,b) => b.units - a.units)
      .slice(0,4);
    
    // spróbuj kolejno: nowy kształt, stary kształt, ich wersje ze String()
    const kindsRow =
       s.troops_kind?.[pid] ??
       s.troops_kind?.per_province?.[pid] ??
       [];
  
    tuples.forEach((t, slot) => {
      const p = s.settings.players[t.idx];
      const uiPlayer = PLAYERS.find(x => x.name === p.name);
      const color = uiPlayer?.color || '#60a5fa';
  
      // wybierz rodzaj dla danego gracza
      const kind = Array.isArray(kindsRow) ? (kindsRow[t.idx] ?? UnitKind.INF) : UnitKind.INF;
  
      setArmy(key, slot + 1, color, t.units, kind);
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
  
    const flag = (tokens[3] || '').toLowerCase();
    const resetGoldEachRound = ['reset', 'zr', '--reset', 'goldreset', 'resetgold', 'zero'].includes(flag);
    
    const names = PLAYERS.map(p => p.name);
    game.startGame({ players: names, startingGold, maxRounds, resetGoldEachRound });
    
    buildEventSchedule(maxRounds);
    const mode = resetGoldEachRound ? ' (tryb: reset złota co rundę)' : '';
    ok(`Start gry: gracze=${names.join(', ')}, rund=${maxRounds}, złoto start=${startingGold}${mode}.`);
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
  
    if (['wplyw','wpływ','posiadlosc','posiadłość','rekrutacja','rekrutacja_piechota','rekrutacja_kawaleria','zamoznosc','zamożność'].includes(sub)){
      const prov = toProvEnum(tokens[2]); if (!prov) return err('Podaj prowincję.');
      if (sub.startsWith('wpl')){
        const m = game.actions.wplyw(pidx, prov); logEngine(m);
      } else if (sub.startsWith('pos')){
        const m = game.actions.posiadlosc(pidx, prov); logEngine(m);
      } else if (sub === 'rekrutacja_piechota'){
        const m = game.actions.rekrutacja_piechota(pidx, prov); logEngine(m);
      } else if (sub === 'rekrutacja_kawaleria'){
        const m = game.actions.rekrutacja_kawaleria(pidx, prov); logEngine(m);
      } else if (sub === 'rekrutacja'){ // (opcjonalny alias do piechoty)
        const m = game.actions.rekrutacja_piechota(pidx, prov); logEngine(m);
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

  if (cmd === 'gbpass'){ // battles pass
    if (curPlayerIdx < 0) return err('Brak aktywnego gracza.');
    try{
      const msg = game.battles.passTurn(curPlayerIdx);
      ok(String(msg || 'PASS (starcia).'));
      syncUIFromGame();
    }catch(ex){ err('PASS (starcia) nieudany: ' + ex.message); }
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

  if (cmd === 'garson'){
    const sub = norm(tokens[1]||'');
    if (sub === 'burn'){
      if (curPlayerIdx < 0) return err('Ustaw aktywnego gracza: turn <...>.');
      const prov = toProvEnum(tokens[2]);
      if (!prov) return err('Użycie: garson burn <prowincja>.');
      try{
        const lines = game.arson.burn({ playerIndex: curPlayerIdx, provinceId: prov });
        ok('Spalono posiadłość.');
        logEngine(lines);
        syncUIFromGame();
      } catch(ex){ err('Błąd: ' + ex.message); }
      return;
    }
    if (sub === 'pass'){
      if (curPlayerIdx < 0) return err('Brak aktywnego gracza.');
      try{
        const msg = game.arson.passTurn(curPlayerIdx);
        ok(String(msg || 'PASS (palenie).'));
        syncUIFromGame();
      } catch(ex){ err('PASS (palenie) nieudany: ' + ex.message); }
      return;
    }
    return err('Użycie: garson burn <prowincja> | garson pass');
  }

  if (cmd === 'gdefend'){
    if (curPlayerIdx < 0) return err('Ustaw aktywnego gracza: turn <...>.');
    const enemy = toEnemyEnum(tokens[1]); const src = toProvEnum(tokens[2]);
    const rolls = tokens.slice(3).map(x => parseInt(x,10)).filter(Number.isFinite);
    if (!enemy || !src || rolls.length === 0) return err('Użycie: gdefend <szwecja|moskwa|tatarzy> <prowincja> <r1> [r2]…');
    const lines = game.defense.defend({ playerIndex: curPlayerIdx, enemy, from: src, rolls });
    ok('Obrona rozpatrzona.');
    logEngine(lines);
    syncUIFromGame();
    return;
  }
  
  if (cmd === 'gdpass'){
    if (curPlayerIdx < 0) return err('Brak aktywnego gracza.');
    try {
      const msg = game.defense.passTurn(curPlayerIdx);
      ok(String(msg || 'PASS (obrona).'));
      syncUIFromGame();
    } catch (ex) {
      err('PASS (obrona) nieudany: ' + ex.message);
    }
    return;
  }

  if (cmd === 'gburn'){
    if (curPlayerIdx < 0) return err('Ustaw aktywnego gracza: turn <...>.');
    const prov = toProvEnum(tokens[1]);
    if (!prov) return err('Użycie: gburn <prowincja>.');
    try{
      const lines = game.arson.burn({ playerIndex: curPlayerIdx, provinceId: prov });
      ok('Spalono posiadłość.');
      logEngine(lines);
      syncUIFromGame();
    } catch(ex){ err('Błąd: ' + ex.message); }
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
  print('• garson burn <prow> — spal jedyną posiadłość w prowincji (jeśli legalne) • garson pass — PASS w fazie palenia');
  print('• gburn <prow> — skrót do garson burn');
  print('• gdefend <wróg> <z_prowincji> <r1> [r2]… — obrona (jak atak w najazdach)');
  print('• gdpass — PASS w fazie obrony');
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
    const singleProvKinds = new Set(['wplyw','posiadlosc','zamoznosc','rekrutacja_piechota','rekrutacja_kawaleria']);
    if (singleProvKinds.has(_actionWizard.kind)) {
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
