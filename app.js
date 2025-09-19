// ===================== Dane i narzędzia =====================
const REGIONS = {
  prusy: { key: "prusy", el: null, aliases: ["prusy"] },
  wielkopolska: { key: "wielkopolska", el: null, aliases: ["wielkopolska","wkp"] },
  malopolska: { key: "malopolska", el: null, aliases: ["małopolska","malopolska","mlp"] },
  litwa: { key: "litwa", el: null, aliases: ["litwa"] },
  ukraina: { key: "ukraina", el: null, aliases: ["ukraina"] },
};

// ======= NOWE: skala zamożności prowincji (0..3) =======
// 0 = jasnoszary (najuboższe), 3 = zielony (najbogatsze)
const REGION_WEALTH_COLORS = [
  '#d1d5db', // 0 - jasnoszary
  '#a3e635', // 1 - żółtozielony (pośredni)
  '#4ade80', // 2 - średnia zieleń (pośredni)
  '#16a34a'  // 3 - zielony (najbogatsze)
];
function wealthColor(level){
  const n = Math.max(0, Math.min(3, Number(level)));
  return REGION_WEALTH_COLORS[n];
}
function setRegionWealth(regionOrKey, level){
  const region = typeof regionOrKey === 'string'
    ? REGIONS[regionOrKey]
    : regionOrKey;
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
  const maxEl = document.getElementById('roundMax');
  if (curEl) curEl.textContent = roundCur;
  if (maxEl) maxEl.textContent = roundMax;
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
    // wyślij formularz bez klikania
    formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
  } else {
    inputEl.focus();
    // kursor na koniec
    setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
  }
}

// ===================== Utilsy =====================
const diac = { "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z" };
function norm(s){
  return (s||"")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, m => diac[m] || m);
}
function getRegionByName(name){
  const key = norm(name);
  for(const r of Object.values(REGIONS)){
    if (r.key===key || r.aliases.includes(key)) return r;
  }
  return null;
}
function bboxCenter(el){
  const b = el.getBBox();
  return { x: b.x + b.width/2, y: b.y + b.height/2 };
}
function print(msg, cls="entry"){
  const div = document.createElement('div');
  div.className = `entry ${cls}`;
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
function ok(msg){ print(msg, "entry ok"); }
function err(msg){ print(msg, "entry err"); }

function clientToSvg(clientX, clientY){
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return {x:0,y:0};
  const inv = ctm.inverse();
  const res = pt.matrixTransform(inv);
  return { x: +res.x.toFixed(1), y: +res.y.toFixed(1) };
}

// ===== Fazy gry =====
const PHASES = ['Wydarzenia','Dochód','Sejm','Akcje','Starcia','Wyprawy','Najazdy'];
let phaseCur = 1; // 1..PHASES.length
const phaseBarEl = document.getElementById('phaseBar');

const PHASE_ACTIONS = {
  1: [ // Wydarzenia
    { label: 'Losuj Wydarzenie', cmd: 'pomoc' },
  ],
  2: [ // Dochód
    { label: 'wealthall 2', cmd: 'wealthall 2' },
  ],
  3: [ // Sejm
    { label: 'fnext', cmd: 'fnext' },
  ],
  4: [ // Akcje
    { label: 'army litwa 1 #34d399 5', cmd: 'army litwa 1 #34d399 5' },
    { label: 'armreset litwa', cmd: 'armreset litwa' },
  ],
  5: [ // Starcia
    { label: 'enemy szwecja 3', cmd: 'enemy szwecja 3' },
  ],
  6: [ // Wyprawy
    { label: 'fort ukraina #f59e0b', cmd: 'fort ukraina #f59e0b' },
  ],
  7: [ // Najazdy
    { label: 'enemy tatarzy 4', cmd: 'enemy tatarzy 4' },
  ],
};

const actionsWrap = document.getElementById('phaseActions');
const pickedRegionEl = document.getElementById('pickedRegion');

function renderPhaseButtons(){
  if(!actionsWrap) return;
  actionsWrap.innerHTML = '';
  const items = PHASE_ACTIONS[phaseCur] || [];
  items.forEach(({label, cmd}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => pushToConsole(cmd, false));
    actionsWrap.appendChild(b);
  });
}

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
    if (active) { el.setAttribute('aria-current','step'); }
    else { el.removeAttribute('aria-current'); }
  });

  renderPhaseButtons(); 
}

function setPhase(n){
  const max = PHASES.length;
  const next = Math.min(Math.max(1, parseInt(n,10)), max);
  if (!Number.isFinite(next)) return false;
  phaseCur = next;
  updatePhaseUI();
  ok(`Faza ${phaseCur}/${max}: ${PHASES[phaseCur-1]}.`);
  return true;
}

function phaseNext(){
  const max = PHASES.length;
  phaseCur = phaseCur >= max ? max : phaseCur + 1;
  updatePhaseUI();
  ok(`Faza ${phaseCur}/${max}: ${PHASES[phaseCur-1]}.`);
}

function phasePrev(){
  phaseCur = phaseCur <= 1 ? 1 : phaseCur - 1;
  updatePhaseUI();
  ok(`Faza ${phaseCur}/${PHASES.length}: ${PHASES[phaseCur-1]}.`);
}


// ===== Gracze =====
const PLAYERS = []; // { key, name, color, gold:0, honor:0, final:0 }

function playerKey(name){
  return norm(name).replace(/\s+/g,'_');
}
function findPlayer(name){
  const k = playerKey(name);
  return PLAYERS.find(p => p.key === k) || null;
}
function renderPlayerRow(p){
  const tr = document.createElement('tr');
  tr.id = `player-${p.key}`;

  const tdColor = document.createElement('td');
  const box = document.createElement('div');
  box.className = 'player-color';
  box.style.background = p.color;
  box.style.borderColor = p.color;
  tdColor.appendChild(box);

  const tdName = document.createElement('td');
  tdName.className = 'name';
  tdName.textContent = p.name;

  const tdGold  = document.createElement('td');  tdGold.textContent  = p.gold;  tdGold.setAttribute('data-col','gold');
  const tdHonor = document.createElement('td');  tdHonor.textContent = p.honor; tdHonor.setAttribute('data-col','honor');
  const tdFinal = document.createElement('td');  tdFinal.textContent = p.final; tdFinal.setAttribute('data-col','final');

  tr.append(tdColor, tdName, tdGold, tdHonor, tdFinal);
  playersBody.appendChild(tr);
}
function addPlayer(name, color){
  if (!name || !color) return false;
  if (findPlayer(name)) return 'exists';
  const p = { key: playerKey(name), name: name, color: color, gold:0, honor:0, final:0 };
  PLAYERS.push(p);
  renderPlayerRow(p);
  return true;
}
function setPlayerStats(name, gold, honor, finalPts){
  const p = findPlayer(name);
  if (!p) return false;
  p.gold  = Number.isFinite(+gold)  ? parseInt(gold,10)  : p.gold;
  p.honor = Number.isFinite(+honor) ? parseInt(honor,10) : p.honor;
  p.final = Number.isFinite(+finalPts)?parseInt(finalPts,10): p.final;

  const row = document.getElementById(`player-${p.key}`);
  if (row){
    row.querySelector('td[data-col="gold"]').textContent  = p.gold;
    row.querySelector('td[data-col="honor"]').textContent = p.honor;
    row.querySelector('td[data-col="final"]').textContent = p.final;
  }
  return true;
}

// ===================== Interakcje mapy =====================
function showTooltip(e, text){
  tooltip.textContent = text;
  tooltip.style.left = e.clientX + 'px';
  tooltip.style.top = e.clientY + 'px';
  tooltip.classList.add('shown');
  tooltip.setAttribute('aria-hidden','false');
}
function hideTooltip(){
  tooltip.classList.remove('shown');
  tooltip.setAttribute('aria-hidden','true');
}

document.querySelectorAll('.region').forEach(path => {
  const key = path.getAttribute('data-key');
  const name = key[0].toUpperCase() + key.slice(1);

  path.addEventListener('click', () => {
    document.querySelectorAll('.region').forEach(n => n.classList.remove('selected'));
    path.classList.add('selected');

    inputEl.value = key + ' ';
    inputEl.focus();
    setTimeout(()=>inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
    // pokazuj też w prawym panelu
    if (pickedRegionEl) pickedRegionEl.textContent = key;
  });
  path.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); path.click(); }
  });
  path.addEventListener('pointerenter', (e) => showTooltip(e, name));
  path.addEventListener('pointermove', (e) => showTooltip(e, name));
  path.addEventListener('pointerleave', hideTooltip);
  path.addEventListener('blur', hideTooltip);
});

document.querySelectorAll('.legend button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.getAttribute('data-jump');
    const target = document.querySelector(`[data-key="${key}"]`);
    if (target){ target.focus({preventScroll:false}); target.click(); }
  });
});

function clearOverlay(){
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
  ok("Usunięto wszystkie rysunki.");
}

svg.addEventListener('pointermove', (e) => {
  const {x,y} = clientToSvg(e.clientX, e.clientY);
  coordsBadge.textContent = `x: ${x}, y: ${y}`;
});

// ===================== Rysowanie (piny, linie, etykiety) =====================
function makeId(prefix){ return `${prefix}-${idCounter++}`; }
function drawPinAt(x,y,label){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id', makeId('pin'));
  g.setAttribute('filter','url(#softGlow)');

  const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx', x); circle.setAttribute('cy', y);
  circle.setAttribute('r', 8); circle.setAttribute('fill', '#eab308');
  circle.setAttribute('stroke', '#0b1221'); circle.setAttribute('stroke-width','2');

  const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  dot.setAttribute('r', 2.6); dot.setAttribute('fill', '#0b1221');

  g.appendChild(circle); g.appendChild(dot);

  if (label){
    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x', x + 12); text.setAttribute('y', y - 12);
    text.setAttribute('font-size','20'); text.setAttribute('font-weight','700');
    text.setAttribute('fill','#e5e7eb'); text.setAttribute('stroke','#061127'); text.setAttribute('stroke-width','0.8');
    text.textContent = label;
    g.appendChild(text);
  }
  overlay.appendChild(g);
  return g.id;
}
function drawLine(x1,y1,x2,y2,withArrow=true,label){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id', makeId('line'));
  const line = document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
  line.setAttribute('stroke','#eab308'); line.setAttribute('stroke-width','4');
  if (withArrow) line.setAttribute('marker-end','url(#arrow)');
  g.appendChild(line);

  if (label){
    const midx = (x1+x2)/2, midy = (y1+y2)/2;
    const text = document.createElementNS('http://www.w3.org/200/svg','text'); // typo fixed? keep original
    // Keep original attributes for consistency:
    const text2 = document.createElementNS('http://www.w3.org/2000/svg','text');
    text2.setAttribute('x', midx + 8); text2.setAttribute('y', midy - 8);
    text2.setAttribute('font-size','18'); text2.setAttribute('font-weight','700');
    text2.setAttribute('fill','#e5e7eb'); text2.setAttribute('stroke','#061127'); text2.setAttribute('stroke-width','0.8');
    text2.textContent = label;
    g.appendChild(text2);
  }
  overlay.appendChild(g);
  return g.id;
}
function drawLabel(x,y,textStr){
  const id = makeId('label');
  const t = document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('id', id);
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('font-size','22'); t.setAttribute('font-weight','800');
  t.setAttribute('fill','#e5e7eb'); t.setAttribute('stroke','#061127'); t.setAttribute('stroke-width','1');
  t.textContent = textStr;
  overlay.appendChild(t);
  return id;
}
function colorRegion(region, color){
  region.el.setAttribute('fill', color);
}
function selectRegion(region){
  document.querySelectorAll('.region').forEach(n => n.classList.remove('selected'));
  region.el.classList.add('selected');
}

// ===== PANEL: Marszałek + Szlachcice =====
const NOBLE_SLOTS = 4;
function humanize(key){ return key.charAt(0).toUpperCase() + key.slice(1); }

// zbuduj tabelę (wiersze = prowincje, kolumny 1..4)
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

// Marszałek
function setMarshal(color){ marshalBox.style.background = color; marshalBox.style.borderColor = color; return true; }
function clearMarshal(){ marshalBox.style.background = 'none'; marshalBox.style.borderColor = '#475569'; }
marshalResetBtn?.addEventListener('click', () => { clearMarshal(); ok('Wyczyszczono kolor Marszałka.'); });

// Szlachcice
function getNobleSlot(regionKey, slot){ return document.querySelector(`.noble-slot[data-region="${regionKey}"][data-slot="${slot}"]`); }
function setNoble(regionKey, slot, color, value){
  const el = getNobleSlot(regionKey, slot); if(!el) return false;
  el.style.background = color; el.style.borderColor = color; el.textContent = String(parseInt(value,10));
  el.setAttribute('data-empty','0'); return true;
}
function setNobleCount(regionKey, slot, value){
  const el = getNobleSlot(regionKey, slot); if(!el || el.getAttribute('data-empty')==='1') return false;
  el.textContent = String(parseInt(value,10)); return true;
}
function clearNoble(regionKey, slot){
  const el = getNobleSlot(regionKey, slot); if(!el) return false;
  el.style.background = 'none'; el.style.borderColor = '#475569'; el.textContent = ''; el.setAttribute('data-empty','1'); return true;
}
function resetNobles(regionKey){ let okAny=false; for(let i=1;i<=NOBLE_SLOTS;i++){ okAny = clearNoble(regionKey, i) || okAny; } return okAny; }


// ===================== Boxy + Fort =====================
const BOX_COUNT = 5;
const BOX_SIZE  = 24;
const BOX_GAP   = 8;
const BOX_ROW_OFFSET_Y = 40;

// generuje punkty gwiazdy 5-ramiennej (polygon)
function starPoints(cx, cy, spikes = 5, outerR = 12, innerR = 5.2){
  let rot = Math.PI / 2 * 3;
  const step = Math.PI / spikes;
  const pts = [];
  for (let i = 0; i < spikes; i++){
    let x = cx + Math.cos(rot) * outerR;
    let y = cy + Math.sin(rot) * outerR;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    rot += step;
    x = cx + Math.cos(rot) * innerR;
    y = cy + Math.sin(rot) * innerR;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    rot += step;
  }
  return pts.join(' ');
}

function createBoxes(){
  for(const r of Object.values(REGIONS)){
    if (!r.el) continue;

    const c = bboxCenter(r.el);
    const spacing = BOX_SIZE + BOX_GAP;
    const firstCx = c.x - ((BOX_COUNT-1)/2)*spacing;
    const rowCy   = c.y + BOX_ROW_OFFSET_Y;

    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('id', `boxes-${r.key}`);
    group.setAttribute('data-region', r.key);

    // 5 kwadratów
    for(let i=0;i<BOX_COUNT;i++){
      const cx = firstCx + i*spacing;
      const x = cx - BOX_SIZE/2;
      const y = rowCy - BOX_SIZE/2;

      const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', x.toFixed(1));
      rect.setAttribute('y', y.toFixed(1));
      rect.setAttribute('width', BOX_SIZE);
      rect.setAttribute('height', BOX_SIZE);
      rect.setAttribute('data-idx', (i+1)); // 1..5
      rect.setAttribute('fill', 'none');    // startowo puste
      rect.setAttribute('stroke', 'gray');
      group.appendChild(rect);
    }

    // Fort (gwiazdka) po 5. kwadracie – „szóste miejsce” w rzędzie
    const starCx = firstCx + BOX_COUNT*spacing;
    const star = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    star.setAttribute('points', starPoints(starCx, rowCy, 5, 12, 5.2));
    star.setAttribute('data-fort', '1');
    star.setAttribute('fill', 'none'); // startowo puste
    star.setAttribute('stroke', 'gray');
    group.appendChild(star);

    boxLayer.appendChild(group);
  }
}

// ===================== *** NOWE: Tory wrogów (X) *** =====================
const ENEMY_COUNT = 6; // zawsze 6 X
const ENEMY_SPACING = 42; // odległość między X
const ENEMY_SIZE = 16; // długość ramienia X
const ENEMY_ALERT_THRESHOLD = 3;
const ENEMY_ALERT_COLOR = '#ef4444'; // czerwony przy >= 3
const ENEMY_DEFAULT_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || '#eab308';

const ENEMIES = {
  szwecja: { key:'szwecja', items:[], label:null },
  moskwa:  { key:'moskwa',  items:[], label:null },
  tatarzy: { key:'tatarzy', items:[], label:null },
};

function makeCross(x, y, size=ENEMY_SIZE, color='gray'){
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.classList.add('cross');
  const l1 = document.createElementNS('http://www.w3.org/2000/svg','line');
  const l2 = document.createElementNS('http://www.w3.org/2000/svg','line');
  l1.setAttribute('x1', (x-size).toFixed(1)); l1.setAttribute('y1', (y-size).toFixed(1));
  l1.setAttribute('x2', (x+size).toFixed(1)); l1.setAttribute('y2', (y+size).toFixed(1));
  l2.setAttribute('x1', (x-size).toFixed(1)); l2.setAttribute('y1', (y+size).toFixed(1));
  l2.setAttribute('x2', (x+size).toFixed(1)); l2.setAttribute('y2', (y-size).toFixed(1));
  l1.setAttribute('stroke', color); l2.setAttribute('stroke', color);
  g.appendChild(l1); g.appendChild(l2);
  return g;
}

function createEnemyTracks(){
  const width = 1633, height = 1137;
  const centerX = width/2;
  // Szwecja – nad mapą, poziomo
  { const y = 60; const startX = centerX - ((ENEMY_COUNT-1)/2)*ENEMY_SPACING; const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent = 'Szwecja'; label.setAttribute('x', centerX); label.setAttribute('y', y - 28); enemiesLayer.appendChild(label); ENEMIES.szwecja.label = label; const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const x = startX + i*ENEMY_SPACING; const cross = makeCross(x, y, ENEMY_SIZE, 'gray'); enemiesLayer.appendChild(cross); arr.push(cross); } ENEMIES.szwecja.items = arr; }
  // Moskwa – po prawej, pionowo
  { const x = width - 60; const startY = 340; const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent = 'Moskwa'; label.setAttribute('x', x); label.setAttribute('y', startY - 40); enemiesLayer.appendChild(label); ENEMIES.moskwa.label = label; const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const y = startY + i*ENEMY_SPACING; const cross = makeCross(x, y, ENEMY_SIZE, 'gray'); enemiesLayer.appendChild(cross); arr.push(cross); } ENEMIES.moskwa.items = arr; }
  // Tatarzy – na dole, poziomo
  { const y = height - 50; const startX = centerX - ((ENEMY_COUNT-1)/2)*ENEMY_SPACING; const label = document.createElementNS('http://www.w3.org/2000/svg','text'); label.classList.add('label'); label.textContent = 'Tatarzy'; label.setAttribute('x', centerX); label.setAttribute('y', y + 42); enemiesLayer.appendChild(label); ENEMIES.tatarzy.label = label; const arr=[]; for(let i=0;i<ENEMY_COUNT;i++){ const x = startX + i*ENEMY_SPACING; const cross = makeCross(x, y, ENEMY_SIZE, 'gray'); enemiesLayer.appendChild(cross); arr.push(cross); } ENEMIES.tatarzy.items = arr; }
}

function colorCross(g, color){ g.querySelectorAll('line').forEach(l=>{ l.style.stroke = color; }); }

// Ustaw liczbę pokolorowanych X (0..6). Liczymy od lewej/góry.
function setEnemyCount(which, n, color = ENEMY_DEFAULT_COLOR){
  const key = norm(which);
  const enemy = ENEMIES[key];
  if(!enemy) return false;

  const count = Math.max(0, Math.min(ENEMY_COUNT, parseInt(n,10)));
  const activeColor = count >= ENEMY_ALERT_THRESHOLD ? ENEMY_ALERT_COLOR : color;

  enemy.items.forEach((g, idx) => {
    colorCross(g, idx < count ? activeColor : 'gray');
  });
  return true;
}
function clearEnemy(which){ return setEnemyCount(which, 0, 'gray'); }

// ========== API kolorowania boxów ==========
function setBox(regionKey, idx, color){
  const rect = svg.querySelector(`#boxes-${regionKey} rect[data-idx="${idx}"]`);
  if (!rect) return false;
  rect.style.fill = color;
  rect.style.stroke = color;
  return true;
}
function clearBox(regionKey, idx){
  const rect = svg.querySelector(`#boxes-${regionKey} rect[data-idx="${idx}"]`);
  if (!rect) return false;
  rect.style.fill = 'none';
  return true;
}
function resetBoxes(regionKey){
  const rects = svg.querySelectorAll(`#boxes-${regionKey} rect`);
  rects.forEach(r => r.style.fill = 'none');
  return rects.length > 0;
}
function setAllBoxes(regionKey, color){
  const rects = svg.querySelectorAll(`#boxes-${regionKey} rect`);
  rects.forEach(r => r.style.fill = color);
  return rects.length > 0;
}

// ========== API kolorowania fortu (gwiazdki) ==========
function setFort(regionKey, color){
  const star = svg.querySelector(`#boxes-${regionKey} polygon[data-fort]`);
  if (!star) return false;
  star.style.fill = color;
  star.style.stroke = color;
  return true;
}
function clearFort(regionKey){
  const star = svg.querySelector(`#boxes-${regionKey} polygon[data-fort]`);
  if (!star) return false;
  star.style.fill = 'none';
  star.style.stroke = 'gray';
  return true;
}

// ===================== Armie (4 sloty na prowincję) =====================
const ARMY_SLOTS = 4;          // bez zmian
const ARMY_R = 18;             // większe znaczniki
const ARMY_COL_SPACING = 46;   // odstęp poziomy między znacznikami
const ARMY_OFFSET_Y = 30;      // ile pikseli POWYŻEJ środka regionu

function createArmySlots(){
  for (const r of Object.values(REGIONS)) {
    if (!r.el) continue;

    const c = bboxCenter(r.el);                           // środek regionu
    const firstCx = c.x - ((ARMY_SLOTS - 1) / 2) * ARMY_COL_SPACING;
    const armyCy  = c.y - ARMY_OFFSET_Y;                  // rząd armii nad środkiem

    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    group.setAttribute('id', `armies-${r.key}`);
    group.setAttribute('data-region', r.key);

    for (let i = 1; i <= ARMY_SLOTS; i++) {
      const cx = firstCx + (i - 1) * ARMY_COL_SPACING;

      const slotG = document.createElementNS('http://www.w3.org/2000/svg','g');
      slotG.setAttribute('id', `army-${r.key}-${i}`);
      slotG.setAttribute('data-slot', i);
      slotG.style.display = 'none';

      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx', cx.toFixed(1));
      circle.setAttribute('cy', armyCy.toFixed(1));
      circle.setAttribute('r', ARMY_R);
      circle.setAttribute('fill', 'none');

      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x', cx.toFixed(1));
      text.setAttribute('y', armyCy.toFixed(1));
      text.textContent = '';

      slotG.appendChild(circle);
      slotG.appendChild(text);
      group.appendChild(slotG);
    }
    armiesLayer.appendChild(group);
  }
}

function getArmySlot(regionKey, slot){
  return svg.querySelector(`#army-${regionKey}-${slot}`);
}
function setArmy(regionKey, slot, color, units){
  const slotG = getArmySlot(regionKey, slot);
  if(!slotG) return false;
  const c = slotG.querySelector('circle');
  const t = slotG.querySelector('text');
  c.style.fill = color;
  c.style.stroke = color;
  t.textContent = String(parseInt(units,10));
  slotG.style.display = '';
  return true;
}
function setArmyCount(regionKey, slot, units){
  const slotG = getArmySlot(regionKey, slot);
  if(!slotG || slotG.style.display === 'none') return false; // brak znacznika
  const t = slotG.querySelector('text');
  t.textContent = String(parseInt(units,10));
  return true;
}
function clearArmy(regionKey, slot){
  const slotG = getArmySlot(regionKey, slot);
  if(!slotG) return false;
  const c = slotG.querySelector('circle');
  const t = slotG.querySelector('text');
  c.style.fill = 'none';
  c.style.stroke = 'gray';
  t.textContent = '';
  slotG.style.display = 'none';
  return true;
}
function resetArmies(regionKey){
  const slots = svg.querySelectorAll(`#armies-${regionKey} g[data-slot]`);
  let okAny = false;
  slots.forEach(s => {
    const idx = +s.getAttribute('data-slot');
    okAny = clearArmy(regionKey, idx) || okAny;
  });
  return okAny;
}

// ===================== Parser poleceń =====================
// box <region> <1-5> <kolor>
// boxclr <region> <1-5>
// boxreset <region>
// boxall <region> <kolor>
// fort <region> <kolor>
// fortclr <region>
// armia <region> <1-4> <kolor> <liczba>
// armset <region> <1-4> <liczba>
// armclr <region> <1-4>
// armreset <region>
// wealth|bogactwo|zamoznosc <region> <0-3>
// wealthall <0-3>
function tokenize(input){
  const m = input.match(/"[^"]*"|\S+/g) || [];
  return m.map(t => t.startsWith('"') && t.endsWith('"') ? t.slice(1,-1) : t);
}

function execCommand(raw){
  const line = raw.trim();
  if (!line){ return; }
  history.push(line); histIdx = history.length;
  const tokens = tokenize(line);
  const cmd = norm(tokens[0] || "");

  if (["pomoc","help","?"].includes(cmd)) return showHelp();
  if (["wyczysc","wyczyść","clear","cls"].includes(cmd)){ clearOverlay(); return; }
  if (cmd === "reset"){ document.getElementById('resetBtn')?.click(); clearOverlay(); return; }

  // BOXY
  if (cmd === "box"){
    const r = getRegionByName(tokens[1]);
    const idx = parseInt(tokens[2], 10);
    const color = tokens[3];
    if (!r || !(idx>=1 && idx<=5) || !color) return err('Użycie: box <region> <1-5> <kolor>');
    setBox(r.key, idx, color) ? ok(`Box ${idx} w ${r.key} = ${color}`) : err('Nie udało się ustawić koloru.');
    return;
  }
  if (cmd === "boxclr" || cmd === "boxclear"){
    const r = getRegionByName(tokens[1]);
    const idx = parseInt(tokens[2], 10);
    if (!r || !(idx>=1 && idx<=5)) return err('Użycie: boxclr <region> <1-5>');
    clearBox(r.key, idx) ? ok(`Box ${idx} w ${r.key} wyczyszczony.`) : err('Nie udało się wyczyścić.');
    return;
  }
  if (cmd === "boxreset"){
    const r = getRegionByName(tokens[1]);
    if (!r) return err('Użycie: boxreset <region>');
    resetBoxes(r.key) ? ok(`Wyczyszczono 5 boxów w ${r.key}.`) : err('Brak boxów dla regionu.');
    return;
  }
  if (cmd === "boxall"){
    const r = getRegionByName(tokens[1]);
    const color = tokens[2];
    if (!r || !color) return err('Użycie: boxall <region> <kolor>');
    setAllBoxes(r.key, color) ? ok(`Pokolorowano wszystkie boxy w ${r.key} na ${color}.`) : err('Brak boxów dla regionu.');
    return;
  }

  // FORT (gwiazdka)
  if (cmd === "fort"){
    const r = getRegionByName(tokens[1]);
    const color = tokens[2];
    if (!r || !color) return err('Użycie: fort <region> <kolor>');
    setFort(r.key, color) ? ok(`Fort w ${r.key} = ${color}`) : err('Nie udało się ustawić koloru fortu.');
    return;
  }
  if (cmd === "fortclr" || cmd === "fortclear"){
    const r = getRegionByName(tokens[1]);
    if (!r) return err('Użycie: fortclr <region>');
    clearFort(r.key) ? ok(`Fort w ${r.key} wyczyszczony.`) : err('Nie udało się wyczyścić fortu.');
    return;
  }

  // ARMIE
  if (cmd === "army"){
    const r = getRegionByName(tokens[1]);
    const idx = parseInt(tokens[2],10);
    const color = tokens[3];
    const units = parseInt(tokens[4],10);
    if(!r || !(idx>=1 && idx<=4) || !color || Number.isNaN(units))
      return err('Użycie: army <region> <1-4> <kolor> <liczba>');
    setArmy(r.key, idx, color, units) ? ok(`Armia: ${r.key} slot ${idx} = ${color}, ${units} jednostek.`)
                                      : err('Nie udało się ustawić armii.');
    return;
  }
  if (cmd === "armset"){
    const r = getRegionByName(tokens[1]);
    const idx = parseInt(tokens[2],10);
    const units = parseInt(tokens[3],10);
    if(!r || !(idx>=1 && idx<=4) || Number.isNaN(units))
      return err('Użycie: armset <region> <1-4> <liczba>');
    setArmyCount(r.key, idx, units) ? ok(`Zmieniono liczebność: ${r.key} slot ${idx} = ${units}.`)
                                    : err('Najpierw ustaw znacznik: armia <...>');
    return;
  }
  if (cmd === "armclr" || cmd === "armclear"){
    const r = getRegionByName(tokens[1]);
    const idx = parseInt(tokens[2],10);
    if(!r || !(idx>=1 && idx<=4)) return err('Użycie: armclr <region> <1-4>');
    clearArmy(r.key, idx) ? ok(`Usunięto armię: ${r.key} slot ${idx}.`)
                          : err('Nie udało się usunąć.');
    return;
  }
  if (cmd === "armreset"){
    const r = getRegionByName(tokens[1]);
    if(!r) return err('Użycie: armreset <region>');
    resetArmies(r.key) ? ok(`Wyczyszczono wszystkie armie w ${r.key}.`)
                       : err('Brak znaczników do wyczyszczenia.');
    return;
  }

  // ======= NOWE KOMENDY: zamożność (0..3) =======
  // wealth|bogactwo|zamoznosc <region> <0-3>
  if (["wealth","bogactwo","zamoznosc","zamożność"].includes(cmd)){
    const r = getRegionByName(tokens[1]);
    const level = parseInt(tokens[2], 10);
    if(!r || Number.isNaN(level) || level < 0 || level > 3){
      return err('Użycie: wealth <region> <0-3>');
    }
    setRegionWealth(r, level)
      ? ok(`Ustawiono zamożność ${r.key} = ${level} (${wealthColor(level)})`)
      : err('Nie udało się ustawić zamożności.');
    return;
  }
  // wealthall <0-3>
  if (cmd === "wealthall"){
    const level = parseInt(tokens[1], 10);
    if(Number.isNaN(level) || level < 0 || level > 3){
      return err('Użycie: wealthall <0-3>');
    }
    let count = 0;
    for(const r of Object.values(REGIONS)){
      if (setRegionWealth(r, level)) count++;
    }
    ok(`Ustawiono zamożność = ${level} dla ${count} prowincji.`);
    return;
  }

  // ======= *** NOWE KOMENDY: tory wrogów (X) *** =======
  if (cmd === 'enemy' || cmd === 'wróg' || cmd === 'wrog'){
    const who = tokens[1]; const n = parseInt(tokens[2],10); const color = tokens[3] || ENEMY_DEFAULT_COLOR; if(!who || Number.isNaN(n) || n < 0 || n > ENEMY_COUNT) return err('Użycie: enemy <szwecja|moskwa|tatarzy> <0-6> [kolor]'); setEnemyCount(who, n, color) ? ok(`Ustawiono tor: ${who} = ${n} (kolor ${color}).`) : err('Nieznany wróg. Dostępni: szwecja, moskwa, tatarzy.'); return; }
  if (cmd === 'enemyclr' || cmd === 'enemyclear' || cmd === 'enemyrst'){
    const who = tokens[1]; if(!who) return err('Użycie: enemyclr <szwecja|moskwa|tatarzy>'); clearEnemy(who) ? ok(`Wyczyszczono tor: ${who}.`) : err('Nieznany wróg.'); return; }

  // Marszałek
  if (cmd === 'marszalek' || cmd === 'marszałek'){
    const color = tokens[1]; if(!color) return err('Użycie: marszalek <kolor>');
    setMarshal(color); ok(`Marszałek = ${color}`); return;
  }

  // Szlachcice
  if (cmd === 'noble' || cmd === 'szlachcic'){
    const r = getRegionByName(tokens[1]); const idx = parseInt(tokens[2],10);
    const color = tokens[3]; const val = parseInt(tokens[4],10);
    if(!r || !(idx>=1 && idx<=4) || !color || Number.isNaN(val))
      return err('Użycie: noble <region> <1-4> <kolor> <liczba>');
    setNoble(r.key, idx, color, val) ? ok(`Szlachcic: ${r.key} slot ${idx} = ${color}, ${val}.`) : err('Nie udało się ustawić.');
    return;
  }
  if (cmd === 'nobleset'){
    const r = getRegionByName(tokens[1]); const idx = parseInt(tokens[2],10); const val = parseInt(tokens[3],10);
    if(!r || !(idx>=1 && idx<=4) || Number.isNaN(val)) return err('Użycie: nobleset <region> <1-4> <liczba>');
    setNobleCount(r.key, idx, val) ? ok(`Zmieniono liczbę (Szlachcic): ${r.key} slot ${idx} = ${val}.`) : err('Najpierw ustaw slot: noble <...>');
    return;
  }
  if (cmd === 'nobleclr' || cmd === 'nobleclear'){
    const r = getRegionByName(tokens[1]); const idx = parseInt(tokens[2],10);
    if(!r || !(idx>=1 && idx<=4)) return err('Użycie: nobleclr <region> <1-4>');
    clearNoble(r.key, idx) ? ok(`Usunięto Szlachcica: ${r.key} slot ${idx}.`) : err('Nie udało się usunąć.');
    return;
  }
  if (cmd === 'noblereset'){
    const r = getRegionByName(tokens[1]); if(!r) return err('Użycie: noblereset <region>');
    resetNobles(r.key) ? ok(`Wyczyszczono Szlachciców w ${r.key}.`) : err('Brak znaczników do wyczyszczenia.');
    return;
  }

  if (cmd === 'runda'){
    const cur = parseInt(tokens[1], 10);
    const max = tokens[2] ? parseInt(tokens[2], 10) : roundMax;
    if (Number.isNaN(cur) || (tokens[2] && Number.isNaN(max)))
      return err('Użycie: runda <obecna> [maks]');
    roundMax = Math.max(1, max);
    roundCur = Math.min(Math.max(1, cur), roundMax);
    updateRoundUI();
    ok(`Ustawiono rundę ${roundCur}/${roundMax}.`);
    return;
  }

  // RUNDA: ustaw tylko maksymalną
  if (cmd === 'rmax'){
    const max = parseInt(tokens[1], 10);
    if (Number.isNaN(max) || max < 1) return err('Użycie: rmax <maks>');
    roundMax = max;
    roundCur = Math.min(roundCur, roundMax);
    updateRoundUI();
    ok(`Ustawiono maksymalną liczbę rund = ${roundMax}.`);
    return;
  }

  if (cmd === 'gracz' || cmd === 'player'){
    const name = tokens[1];
    const color = tokens[2];
    if (!name || !color) return err('Użycie: gracz <imię> <kolor>');
    const res = addPlayer(name, color);
    if (res === true) return ok(`Dodano gracza "${name}" z kolorem ${color}.`);
    if (res === 'exists') return err(`Gracz "${name}" już istnieje (nie można zmienić imienia/koloru).`);
    return err('Nie udało się dodać gracza.');
  }

  // gset <imię> <zloto> <honor> <koncowe>
  if (cmd === 'gset'){
    const name = tokens[1];
    const gold = parseInt(tokens[2],10);
    const honor = parseInt(tokens[3],10);
    const finalPts = parseInt(tokens[4],10);
    if (!name || Number.isNaN(gold) || Number.isNaN(honor) || Number.isNaN(finalPts)){
      return err('Użycie: gset <imię> <zloto> <honor> <koncowe>');
    }
    return setPlayerStats(name, gold, honor, finalPts)
      ? ok(`Ustawiono "${name}": złoto=${gold}, honor=${honor}, punkty=${finalPts}.`)
      : err(`Nie znaleziono gracza "${name}". Najpierw dodaj go: gracz <imię> <kolor>.`);
  }

  // ===== FAZY GRY =====
  // faza <nr>  — ustawia konkretną fazę (1..7)
  // fnext      — następna faza
  // fprev      — poprzednia faza
  if (cmd === 'faza' || cmd === 'phase'){
    const n = parseInt(tokens[1],10);
    if (Number.isNaN(n) || n < 1 || n > PHASES.length)
      return err(`Użycie: faza <1-${PHASES.length}>`);
    setPhase(n);
    return;
  }
  if (cmd === 'fnext' || cmd === 'f+'){
    phaseNext(); return;
  }
  if (cmd === 'fprev' || cmd === 'f-'){
    phasePrev(); return;
  }

    if (cmd === 'turn' || cmd === 'tura'){
      const who = tokens[1];
      if (!who) return err('Użycie: turn <imię|indeks>');
      const asNum = parseInt(who, 10);
      if (!Number.isNaN(asNum)) return setTurnByIndex(asNum - 1);
      return setTurnByName(who);
    }

    // turnclear — wyczyść aktywnego gracza (np. między akcjami)
    if (cmd === 'turnclear' || cmd === 'tclear'){
      curPlayerIdx = -1;
      updateTurnUI();
      return ok('Brak aktywnego gracza.');
    }

  err('Nieznane polecenie. Wpisz "pomoc".');
}

function showHelp(){
  ok('Dostępne polecenia:');
  print('• pomoc — lista komend');
  print('• box <region> <1-5> <kolor> — pokoloruj wskazany kwadrat');
  print('• boxclr <region> <1-5> — wyczyść wskazany kwadrat');
  print('• boxreset <region> — wyczyść wszystkie 5 w regionie');
  print('• boxall <region> <kolor> — pokoloruj wszystkie 5 w regionie');
  print('• fort <region> <kolor> — ustaw kolor gwiazdki (Fort)');
  print('• fortclr <region> — wyczyść gwiazdkę (Fort)');
  print('• army <region> <1-4> <kolor> <liczba> — postaw/ustaw znacznik armii');
  print('• armset <region> <1-4> <liczba> — zmień liczbę jednostek');
  print('• armclr <region> <1-4> — usuń znacznik z danego slotu');
  print('• armreset <region> — usuń wszystkie 4 znaczniki w prowincji');
  print('• wealth|bogactwo <region> <0-3> — pokoloruj prowincję wg skali (0=jasnoszary, 3=zielony)');
  print('• wealthall <0-3> — ustaw jeden poziom dla wszystkich prowincji');
  print('• enemy <szwecja|moskwa|tatarzy> <0-6> [kolor] — pokoloruj X (0..6)');
  print('• enemyclr <szwecja|moskwa|tatarzy> — wyczyść tor wroga');
  print('• marszalek <kolor> — ustaw kolor pola Marszałka (alias: marszałek)');
  print('• noble <region> <1-4> <kolor> <liczba> — ustaw Szlachcica (kolor + liczba)');
  print('• nobleset <region> <1-4> <liczba> — zmień samą liczbę w istniejącym slocie Szlachcica');
  print('• nobleclr <region> <1-4> — usuń Szlachcica ze slotu');
  print('• noblereset <region> — usuń wszystkich 4 Szlachciców w prowincji');
  print('• runda <obecna> [maks] — ustaw numer i (opcjonalnie) maksymalną liczbę rund');
  print('• rmax <maks> — ustaw maksymalną liczbę rund');
  print('• gracz <imię> <kolor> — dodaj gracza (kolor i imię niezmienne)');
  print('• gset <imię> <zloto> <honor> <koncowe> — ustaw statystyki gracza');
  print(`• faza <1-${PHASES.length}> — ustaw aktualną fazę gry`);
  print('• fnext — przejdź do następnej fazy');
  print('• fprev — wróć do poprzedniej fazy');
  print('• turn <imię|indeks> — ustaw aktywnego gracza (indeks od 1)');
  print('• turnclear — wyczyść aktywnego gracza');
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

// Start: utwórz boxy + fort, sloty armii i powitanie
createBoxes();
updateRoundUI();
createArmySlots();
createEnemyTracks();
buildNoblesTable();
buildPhaseBar();
renderPhaseButtons();
updateTurnUI();
ok('Witaj! Wpisz "pomoc", aby zobaczyć komendy.');

