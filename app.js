// ===================== PODPIĘCIE SILNIKA (game.js) =====================
import { ConsoleGame, ProvinceID, RaidTrackID } from './game.js';

// instancja gry + ułatwienia globalne (DevTools)
export const game = new ConsoleGame();
window.game = game;
window.ProvinceID = ProvinceID;
window.RaidTrackID = RaidTrackID;


// ===================== Dane i narzędzia =====================
const REGIONS = {
  prusy: { key: "prusy", el: null, aliases: ["prusy"] },
  wielkopolska: { key: "wielkopolska", el: null, aliases: ["wielkopolska","wkp"] },
  malopolska: { key: "malopolska", el: null, aliases: ["małopolska","malopolska","mlp"] },
  litwa: { key: "litwa", el: null, aliases: ["litwa"] },
  ukraina: { key: "ukraina", el: null, aliases: ["ukraina"] },
};

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
const marshalBox = document.getElementById('marshalBox');
const marshalResetBtn = document.getElementById('marshalResetBtn');
const playersBody = document.getElementById('playersBody');
const turnSwatch = document.getElementById('turnSwatch');
const turnNameEl = document.getElementById('turnName');

let curPlayerIdx = -1; // -1 = brak aktywnego gracza

const history = [];
let histIdx = -1;
let idCounter = 1;

let roundCur = 1;
let roundMax = 10;

function updateRoundUI(){
  const curEl = document.getElementById('roundCur');
  if (curEl) curEl.textContent = String(roundCur);

  const maxEl = document.getElementById('roundMax');
  if (maxEl) maxEl.textContent = String(roundMax);
}

function updatePlayersUIFromState(s){
  const players = (s.settings?.players || []);
  players.forEach(sp => {
    const ui = PLAYERS.find(p => p.name === sp.name);
    if (!ui) return;
    const row = document.getElementById(`player-${ui.key}`);
    if (!row) return;
    const tdGold  = row.querySelector('[data-col="gold"]');
    const tdHonor = row.querySelector('[data-col="honor"]');
    const tdFinal = row.querySelector('[data-col="final"]');
    if (tdGold)  tdGold.textContent  = String(sp.gold ?? "0");
    if (tdHonor) tdHonor.textContent = String(sp.honor ?? "0");
    if (tdFinal) tdFinal.textContent = String(sp.score ?? "0");
  });
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

function pushToConsole(text, submit = true){
  inputEl.value = text;
  if(submit){
    formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  } else {
    inputEl.focus();
    setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
  }
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
  if (!out) return;
  if (Array.isArray(out)) {
    out.forEach(line => { if (line) ok(line); });
  } else if (typeof out === 'string') {
    ok(out);
  }
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
const PHASES = ['Wydarzenia','Dochód','Sejm','Akcje','Starcia','Wyprawy','Najazdy'];
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
function renderPlayerRow(p){
  const tr = document.createElement('tr'); tr.id = `player-${p.key}`;
  const tdColor = document.createElement('td'); const box = document.createElement('div');
  box.className = 'player-color'; box.style.background = p.color; box.style.borderColor = p.color; tdColor.appendChild(box);
  const tdName = document.createElement('td'); tdName.className = 'name'; tdName.textContent = p.name;
  const tdGold  = document.createElement('td'); tdGold.textContent  = '—'; tdGold.setAttribute('data-col','gold');
  const tdHonor = document.createElement('td'); tdHonor.textContent = '—'; tdHonor.setAttribute('data-col','honor');
  const tdFinal = document.createElement('td'); tdFinal.textContent = '—'; tdFinal.setAttribute('data-col','final');
  tr.append(tdColor, tdName, tdGold, tdHonor, tdFinal);
  playersBody.appendChild(tr);
}
function addPlayer(name, color){
  if (!name || !color) return false;
  if (findPlayer(name)) return 'exists';
  const p = { key: playerKey(name), name, color };
  PLAYERS.push(p); renderPlayerRow(p); return true;
}

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

// ===== PANEL: Marszałek + Szlachcice (na potrzeby sync UI) =====
const NOBLE_SLOTS = 4;
function humanize(key){ return key.charAt(0).toUpperCase() + key.slice(1); }
function buildNoblesTable(){
  const order = ['prusy','wielkopolska','malopolska','litwa','ukraina'];
  order.forEach(k => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = humanize(k); tr.appendChild(th);
    for(let i=1;i<=NOBLE_SLOTS;i++){
      const td = document.createElement('td');
      const slot = document.createElement('div');
      slot.className = 'noble-slot';
      slot.setAttribute('data-region', k);
      slot.setAttribute('data-slot', i);
      slot.setAttribute('data-empty', '1');
      slot.title = `${humanize(k)} – Szlachcic ${i}`;
      td.appendChild(slot); tr.appendChild(td);
    }
    noblesBody.appendChild(tr);
  });
}
function setMarshal(color){ marshalBox.style.background = color; marshalBox.style.borderColor = color; return true; }
function clearMarshal(){ marshalBox.style.background = 'none'; marshalBox.style.borderColor = '#475569'; }
marshalResetBtn?.addEventListener('click', () => { clearMarshal(); ok('Wyczyszczono kolor Marszałka.'); });
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
  attacks: 6,
  reinforcements: 7,
  devastation: 7, // nie mamy osobnej pozycji w UI — podpinamy pod „Najazdy”
};

function applyPhaseFromEngineState(s){
  const id = s.current_phase || game.round?.currentPhaseId?.();
  const idx = ENGINE_TO_UI_PHASE[id];
  if (Number.isInteger(idx) && idx !== phaseCur){
    phaseCur = idx;
    updatePhaseUI();
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

// ===================== SYNC UI ⇄ SILNIK =====================
function syncUIFromGame(){
  const s = game.getPublicState?.(); if (!s) return;

  // RUNDY
  roundCur = s.round_status.current_round; roundMax = s.round_status.total_rounds; 
  updateRoundUI();
  updatePlayersUIFromState(s);
  applyCurrentTurnFromState(s);
  applyPhaseFromEngineState(s);

  const midx = s.round_status?.marshal_index ?? -1;
  if (midx >= 0 && s.settings?.players?.[midx]) {
    const mname = s.settings.players[midx].name;
    const ui = uiFindPlayerByName(mname);
    if (ui) setMarshal(ui.color);
    else clearMarshal(); // nie znaleziono odpowiednika w UI
  } else {
    clearMarshal();
  }

  // PROWINCJE: zamożność + fort + posiadłości
  for (const [_, prov] of Object.entries(s.provinces)){
    const key = norm(prov.id.toLowerCase());
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
  }

  // ARMIE (top4)
  for (const [pid, arr] of Object.entries(s.troops.per_province || {})){
    const key = norm(pid.toLowerCase()); resetArmies(key);
    const tuples = arr.map((units, idx) => ({ units, idx }))
                      .filter(t => t.units > 0)
                      .sort((a,b) => b.units - a.units)
                      .slice(0,4);
    tuples.forEach((t, slot) => {
      const p = s.settings.players[t.idx]; const uiPlayer = PLAYERS.find(x => x.name === p.name);
      const color = uiPlayer?.color || '#60a5fa'; setArmy(key, slot+1, color, t.units);
    });
  }

  // SZLACHCICE (top4)
  for (const [pid, arr] of Object.entries(s.nobles.per_province || {})){
    const key = norm(pid.toLowerCase()); resetNobles(key);
    const tuples = arr.map((cnt, idx) => ({ cnt, idx }))
                      .filter(t => t.cnt > 0)
                      .sort((a,b) => b.cnt - a.cnt)
                      .slice(0,4);
    tuples.forEach((t, slot) => {
      const p = s.settings.players[t.idx]; const uiPlayer = PLAYERS.find(x => x.name === p.name);
      const color = uiPlayer?.color || '#f59e0b'; setNoble(key, slot+1, color, t.cnt);
    });
  }

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
  print('• gdevast <N S E> — rzuty spustoszeń (1–6)');
  print('• gstate — wypisz stan silnika do konsoli');
  print('• clear — wyczyść rysunki • reset — pełny reset UI');
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
    document.querySelectorAll('.region').forEach(n => n.classList.remove('selected'));
    path.classList.add('selected'); inputEl.value = key + ' '; inputEl.focus();
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
buildNoblesTable();
buildPhaseBar();
updateTurnUI();
ok('Witaj! Dodaj graczy komendą „gracz <imię> <kolor>”, potem „gstart”. „pomoc” pokaże listę komend.');
