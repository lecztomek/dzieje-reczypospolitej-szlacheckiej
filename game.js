// Console Game Skeleton (State Machine) — JavaScript module API (ESM)
// Port of the provided Python version, redesigned to be fully programmatic (no prompts).
// Usage example (Node / bundler):
//   import { ConsoleGame, StateID, ProvinceID, RaidTrackID } from "./console-game-fsm-module.js";
//   const game = new ConsoleGame();
//   game.startGame({ players: ["Ala", "Olek"], startingGold: 6, maxRounds: 3 });
//   // drive phases by calling game.events.apply(5), game.income.collect(), ... then game.round.nextPhase(), etc.

// ---------------- Enums / IDs ----------------
export const StateID = Object.freeze({ START_MENU: 1, GAMEPLAY: 2, GAME_OVER: 3 });
export const UnitKind = Object.freeze({ NONE: 0, INF: 1, CAV: 2 });

export const ProvinceID = Object.freeze({
  PRUSY: "Prusy",
  LITWA: "Litwa",
  UKRAINA: "Ukraina",
  WIELKOPOLSKA: "Wielkopolska",
  MALOPOLSKA: "Małopolska",
});

export const RaidTrackID = Object.freeze({ N: "Szwecja", S: "Tatarzy", E: "Moskwa" });

// ---------------- Utilities ----------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

function estateIncomeByWealth(wealth) {
  const w = clamp(wealth | 0, 0, 3);
  if (w <= 1) return 0;
  if (w === 2) return 1;
  return 2; // w === 3
}

// ---------------- Core Data Models ----------------
class Player {
  constructor(name, gold = 0) {
    this.name = name;
    this.score = 0;
    this.gold = gold;
    this.honor = 0;
    this.majority = false;
    this.last_bid = 0;
  }
}

class Province {
  constructor(id) {
    this.id = id;
    this.has_fort = false;
    this.estates = Array(5).fill(-1); // -1 = empty, otherwise player index
    this.wealth = 2; // 0–3
  }
}

class RaidTrack { constructor(id, value = 0) { this.id = id; this.value = value | 0; } }

class RoundStatus {
  constructor(totalRounds = 3, playersCount = 0) {
    this.current_round = 1;
    this.total_rounds = totalRounds;
    this.marshal_index = 0;
    this.last_law = null; // 1..6
    this.last_law_choice = null; // 'A' | 'B'
    this.sejm_canceled = false;
    this.admin_yield = 2;
    this.prusy_estate_income_penalty = 0;
    this.discount_litwa_wplyw_pos = 0;
    this.extra_honor_vs_tatars = false;
    this.recruit_cost_override = null;
    this.zamoznosc_cost_override = null;
    this.fairs_plus_one_income = false;
    this.artillery_defense_active = false;
    this.artillery_defense_used = Array(playersCount).fill(false);
    this.sejm_tiebreak_wlkp = false;
    this.wlkp_influence_cost_override = null;
    this.wlkp_estate_cost_override = null;
    this.viritim_influence_cost_override = null;
  }
}

class GameContext {
  constructor() {
    this.settings = { players: [], max_rounds: 3, reset_gold_each_round: false };
    this.round_status = new RoundStatus(3, 0);
    this.last_output = ""; // optional log aggregator
    this.turn = null;
    this.attackTurn = null; 
    this.battlesTurn = null; 
    this.arsonTurn = null;
    
    this.provinces = {
      [ProvinceID.PRUSY]: new Province(ProvinceID.PRUSY),
      [ProvinceID.LITWA]: new Province(ProvinceID.LITWA),
      [ProvinceID.UKRAINA]: new Province(ProvinceID.UKRAINA),
      [ProvinceID.WIELKOPOLSKA]: new Province(ProvinceID.WIELKOPOLSKA),
      [ProvinceID.MALOPOLSKA]: new Province(ProvinceID.MALOPOLSKA),
    };

    this.raid_tracks = {
      N: new RaidTrack(RaidTrackID.N, 0),
      S: new RaidTrack(RaidTrackID.S, 0),
      E: new RaidTrack(RaidTrackID.E, 0),
    };

    // boards as { provinceId: [unitsPerPlayer] }
    this.troops = { per_province: {} };
    this.nobles = { per_province: {} };
    this.troops_kind = { per_province: {} };
  }
}

// ---------------- Small mechanics helpers ----------------
function influenceWinnersInProvince(ctx, provinceId) {
  const players = ctx.settings.players;
  const pcount = players.length;
  const nobles = ctx.nobles.per_province[provinceId] || Array(pcount).fill(0);
  const troops = ctx.troops.per_province[provinceId] || Array(pcount).fill(0);

  const maxN = nobles.length ? Math.max(...nobles) : 0;
  if (maxN === 0) return [];
  const leaders = nobles.map((v, i) => [v, i]).filter(([v]) => v === maxN).map(([, i]) => i);
  if (leaders.length === 1) return leaders;
  const withTroops = leaders.filter((i) => (troops[i] || 0) > 0);
  if (withTroops.length === 1) return withTroops;
  return leaders; // unresolved tie
}

function singleControllerOf(ctx, provinceId) {
  const winners = influenceWinnersInProvince(ctx, provinceId);
  return winners.length === 1 ? winners[0] : null;
}

function setProvinceWealth(ctx, pid, value) {
  ctx.provinces[pid].wealth = clamp(Number(value) | 0, 0, 3);
  return ctx.provinces[pid].wealth;
}
function addProvinceWealth(ctx, pid, delta) {
  const p = ctx.provinces[pid];
  p.wealth = clamp(p.wealth + ((Number(delta) | 0) || 0), 0, 3);
  return p.wealth;
}
function setRaid(ctx, rid, value) {
  ctx.raid_tracks[rid === RaidTrackID.N ? 'N' : rid === RaidTrackID.S ? 'S' : 'E'].value = (Number(value) | 0);
  return ctx.raid_tracks[rid === RaidTrackID.N ? 'N' : rid === RaidTrackID.S ? 'S' : 'E'].value;
}
function addRaid(ctx, rid, delta) {
  const key = rid === RaidTrackID.N ? 'N' : rid === RaidTrackID.S ? 'S' : 'E';
  ctx.raid_tracks[key].value += (Number(delta) | 0);
  return ctx.raid_tracks[key].value;
}
function buildEstate(ctx, pid, pidx) {
  const est = ctx.provinces[pid].estates;
  for (let i = 0; i < est.length; i++) {
    if (est[i] === -1) { est[i] = pidx; return true; }
  }
  return false;
}
function removeLastEstate(ctx, pid, pidx) {
  const est = ctx.provinces[pid].estates;
  for (let i = est.length - 1; i >= 0; i--) {
    if (est[i] === pidx) { est[i] = -1; return true; }
  }
  return false;
}
function toggleFort(ctx, pid, value = undefined) {
  const prov = ctx.provinces[pid];
  prov.has_fort = value === undefined ? !prov.has_fort : !!value;
  return prov.has_fort;
}
function destroyLastEstateAny(ctx, pid) {
  const est = ctx.provinces[pid].estates;
  for (let i = est.length - 1; i >= 0; i--) {
    if (est[i] !== -1) { const owner = est[i]; est[i] = -1; return owner; }
  }
  return null;
}

function lastOccupiedEstateSlot(ctx, pid) {
  const est = ctx.provinces[pid].estates;
  for (let i = est.length - 1; i >= 0; i--) {
    const owner = est[i];
    if (owner !== -1) return { ownerIndex: owner, slotIndex: i };
  }
  return null;
}

function uniqueEstateOwner(ctx, pid) {
  const est = ctx.provinces[pid].estates;
  let owner = -1;
  let slotIndex = -1;

  for (let i = 0; i < est.length; i++) {
    const v = est[i];
    if (v === -1) continue;        // puste pole
    if (owner === -1) { owner = v; slotIndex = i; }
    else if (v !== owner) { return null; }  // różni właściciele → nie jest „ostatnia”
    else { slotIndex = i; }        // zapamiętaj najpóźniejsze wystąpienie
  }

  return (owner >= 0) ? { ownerIndex: owner, slotIndex } : null;
}

function plunderProvince(ctx, pid) {
  const prov = ctx.provinces[pid];
  const msgs = [`[Spustoszenie] ${pid}: `];
  if (prov.has_fort) { prov.has_fort = false; msgs.push("zniszczono fort; "); }
  else {
    const owner = destroyLastEstateAny(ctx, pid);
    if (owner !== null) msgs.push(`zniszczono posiadłość gracza ${ctx.settings.players[owner]?.name ?? '?' }; `);
    else msgs.push("brak fortu i posiadłości do zniszczenia; ");
  }
  const before = prov.wealth; prov.wealth = Math.max(0, prov.wealth - 1);
  msgs.push(`zamożność ${before}→${prov.wealth}.`);
  return msgs.join("");
}

function ensurePerProvinceArrays(ctx) {
  const pcount = ctx.settings.players.length;
  for (const pid of Object.values(ProvinceID)) {
    if (!ctx.troops.per_province[pid]) ctx.troops.per_province[pid] = Array(pcount).fill(0);
    if (!ctx.nobles.per_province[pid]) ctx.nobles.per_province[pid] = Array(pcount).fill(0);
    if (!ctx.troops_kind.per_province[pid]) ctx.troops_kind.per_province[pid] = Array(pcount).fill(UnitKind.NONE);
  }
}


// ---------------- Phase Logic bundles (API) ----------------
class EventsAPI {
  constructor(ctx) { this.ctx = ctx; }
  // Apply event by number 1..25
  apply(n) {
    const c = this.ctx; const rs = c.round_status; const log = [];
    const ev = {
      1: () => { rs.sejm_canceled = true; log.push("[Wydarzenia] Liberum veto — Sejm zerwany. W tej rundzie pomijacie licytację i ustawę."); },
      2: () => {
        rs.viritim_influence_cost_override = 1; // ← ta runda: Wpływ kosztuje 1 zł wszędzie
        log.push("[Wydarzenia] Elekcja viritim — w tej rundzie akcja Wpływ kosztuje 1 zł.");
      },
      3: () => { rs.admin_yield = 0; log.push("[Wydarzenia] Skarb pusty — Administracja=0 zł w tej rundzie."); },
      4: () => { rs.admin_yield = 3; log.push("[Wydarzenia] Reformy skarbowe — Administracja=+3 zł w tej rundzie."); },
      5: () => { addRaid(c, RaidTrackID.N, +2); log.push("[Wydarzenia] Potop szwedzki — Szwecja +2."); },
      6: () => { addRaid(c, RaidTrackID.N, +1); rs.prusy_estate_income_penalty = 1; log.push("[Wydarzenia] Wojna północna — Szwecja +1; posiadłości w Prusach płacą o 1 mniej."); },
      7: () => { addRaid(c, RaidTrackID.E, +1); addRaid(c, RaidTrackID.S, +1); log.push("[Wydarzenia] Powstanie Chmielnickiego — Moskwa +1, Tatarzy +1."); },
      8: () => {
        ensurePerProvinceArrays(c); const pid = ProvinceID.UKRAINA; const arr = c.troops.per_province[pid];
        if (!arr) { log.push("[Wydarzenia] (Brak tablicy wojsk — nic nie zrobiono.)"); return; }
        const gains = [];
        arr.forEach((units, i) => { if (units > 0) { c.troops.per_province[pid][i] = units + 1; gains.push(c.settings.players[i].name); } });
        log.push(gains.length ? `[Wydarzenia] Kozacy na służbie — +1 jednostka na Ukrainie dla: ${gains.join(", ")}.` : "[Wydarzenia] Kozacy na służbie — brak armii na Ukrainie.");
      },
      9: () => { addRaid(c, RaidTrackID.E, +2); rs.discount_litwa_wplyw_pos = 1; log.push("[Wydarzenia] Wojna z Moskwą — Moskwa +2; Litwa: Wpływ/Posiadłość -1 zł w tej rundzie."); },
      10: () => { addRaid(c, RaidTrackID.S, -1); rs.extra_honor_vs_tatars = true; log.push("[Wydarzenia] Bitwa pod Wiedniem — Tatarzy −1; dodatkowy honor vs Tatarzy w tej rundzie."); },
      11: () => { addRaid(c, RaidTrackID.N, -1); log.push("[Wydarzenia] Pokój w Oliwie — Szwecja −1."); },
      12: () => { rs.recruit_cost_override = 1; log.push("[Wydarzenia] Zaciąg pospolity — Rekrutacja kosztuje 1 zł w tej rundzie."); },
      13: () => {
        const border = [ProvinceID.PRUSY, ProvinceID.LITWA, ProvinceID.UKRAINA, ProvinceID.MALOPOLSKA];
        const noFort = border.filter((pid) => !c.provinces[pid].has_fort);
        const pool = noFort.length ? noFort : border;
        const pid = pool[Math.floor(Math.random() * pool.length)];
        toggleFort(c, pid, true);
        log.push(`[Wydarzenia] Fortyfikacja pogranicza — fort w ${pid}.`);
      },
      14: () => { rs.artillery_defense_active = true; rs.artillery_defense_used = Array(c.settings.players.length).fill(false); log.push("[Wydarzenia] Artyleria koronna — pierwszy raz w obronie +1 kość."); },
      15: () => {
        const changed = [];
        for (const pid of Object.values(ProvinceID)) {
          const prov = c.provinces[pid]; if (prov.wealth >= 3) { prov.wealth = 2; changed.push(pid); }
        }
        log.push(changed.length ? `[Wydarzenia] Głód — 3→2 w: ${changed.join(", ")}.` : "[Wydarzenia] Głód — brak prowincji o zamożności 3.");
      },
      16: () => { rs.zamoznosc_cost_override = 3; log.push("[Wydarzenia] Susza — Zamożność kosztuje 3 zł w tej rundzie."); },
      17: () => { rs.zamoznosc_cost_override = 1; log.push("[Wydarzenia] Urodzaj — Zamożność kosztuje 1 zł w tej rundzie."); },
      18: () => { rs.fairs_plus_one_income = true; log.push("[Wydarzenia] Jarmarki królewskie — każdy +1 zł na początku Dochodu."); },
      19: () => {
        ensurePerProvinceArrays(c);
        const affected = [];
        for (const pid of Object.values(ProvinceID)) {
          if (c.provinces[pid].wealth <= 1) {
            const ctrl = singleControllerOf(c, pid);
            if (ctrl === null) continue;
            const player = c.settings.players[ctrl];
            if (player.gold >= 2) { player.gold -= 2; affected.push(`${pid}: ${player.name} zapłacił 2 zł`); }
            else {
              const arr = c.nobles.per_province[pid]; arr[ctrl] = Math.max(0, arr[ctrl] - 1);
              affected.push(`${pid}: ${player.name} nie stać — −1 wpływ`);
            }
          }
        }
        log.push(affected.length ? `[Wydarzenia] Bunt chłopski — ${affected.join("; ")}.` : "[Wydarzenia] Bunt chłopski — brak efektów.");
      },
      20: () => {
        ensurePerProvinceArrays(c);
        let majorityIdx = c.settings.players.findIndex((p) => p.majority);
        const candidates = [];
        for (const pid of Object.values(ProvinceID)) {
          const nobles = c.nobles.per_province[pid];
          const present = nobles.map((n, i) => [n, i]).filter(([n]) => n > 0).map(([, i]) => i);
          const filtered = majorityIdx >= 0 ? present.filter((i) => i !== majorityIdx) : present;
          if (filtered.length) candidates.push([pid, filtered]);
        }
        if (!candidates.length) { log.push("[Wydarzenia] Magnackie roszady — brak kandydatów."); return; }
        const [pid, present] = candidates[Math.floor(Math.random() * candidates.length)];
        const victim = present[Math.floor(Math.random() * present.length)];
        const arr = c.nobles.per_province[pid]; arr[victim] = Math.max(0, arr[victim] - 1);
        log.push(`[Wydarzenia] Magnackie roszady — w ${pid} usunięto 1 wpływ gracza ${c.settings.players[victim].name}.`);
      },
      21: () => {
        const pid = ProvinceID.WIELKOPOLSKA; const ctrl = singleControllerOf(c, pid);
        if (ctrl === null) { log.push("[Wydarzenia] Bunt w Poznaniu — brak kontrolującego."); return; }
        const pl = c.settings.players[ctrl];
        if (pl.gold >= 2) { pl.gold -= 2; log.push(`[Wydarzenia] Bunt w Poznaniu — ${pl.name} zapłacił 2 zł.`); }
        else {
          const removed = removeLastEstate(c, pid, ctrl);
          log.push(removed ? `[Wydarzenia] Bunt w Poznaniu — ${pl.name} traci 1 posiadłość.` : `[Wydarzenia] Bunt w Poznaniu — ${pl.name} nie ma posiadłości do usunięcia.`);
        }
      },
      22: () => { rs.sejm_tiebreak_wlkp = true; log.push("[Wydarzenia] Sejmik w Środzie — remisy w licytacji rozstrzyga kontrolujący Wlkp."); },
      23: () => {
        const pid = ProvinceID.WIELKOPOLSKA; addProvinceWealth(c, pid, -1);
        const ctrl = singleControllerOf(c, pid);
        if (ctrl === null) { log.push("[Wydarzenia] Pożar w Poznaniu — zamożność −1; brak kontrolującego."); return; }
        const pl = c.settings.players[ctrl];
        if (pl.gold >= 2) { pl.gold -= 2; log.push(`[Wydarzenia] Pożar w Poznaniu — zamożność −1; ${pl.name} zapłacił 2 zł.`); }
        else {
          const removed = removeLastEstate(c, pid, ctrl);
          log.push(removed ? `[Wydarzenia] Pożar w Poznaniu — zamożność −1; ${pl.name} traci 1 posiadłość.` : `[Wydarzenia] Pożar w Poznaniu — zamożność −1; ${pl.name} nie ma posiadłości.`);
        }
      },
      24: () => { rs.wlkp_influence_cost_override = 1; rs.wlkp_estate_cost_override = 3; log.push("[Wydarzenia] Szlak Warta–Odra — Wpływ(Wlkp)=1 zł, Posiadłość(Wlkp)=3 zł (w tej rundzie)."); },
      25: () => {
        const pid = ProvinceID.PRUSY; const ctrl = singleControllerOf(c, pid);
        if (ctrl !== null) { c.settings.players[ctrl].gold += 2; log.push(`[Wydarzenia] Cła morskie — ${c.settings.players[ctrl].name} +2 zł (kontroluje Prusy).`); }
        else log.push("[Wydarzenia] Cła morskie — nikt nie kontroluje Prus.");
      },
    }[n];
    if (!ev) throw new Error("Unknown event number (1..25)");
    ev();
    return log;
  }
}

class IncomeAPI {
  constructor(ctx) { this.ctx = ctx; }
  collect() {
    const c = this.ctx; const rs = c.round_status; const players = c.settings.players; const pcount = players.length;
    ensurePerProvinceArrays(c);
    const gained_control = Array(pcount).fill(0);
    const gained_estates = Array(pcount).fill(0);
    const log = [];

    if (rs.fairs_plus_one_income) { players.forEach((p) => p.gold += 1); log.push("[Dochód] Jarmarki królewskie: każdy +1 zł."); }

    for (const pid of Object.values(ProvinceID)) {
      const prov = c.provinces[pid];
      const winners = influenceWinnersInProvince(c, pid);
      const single = winners.length === 1 ? winners[0] : null;
      if (single !== null) { players[single].gold += 1; gained_control[single] += 1; }

      let perEstate = estateIncomeByWealth(prov.wealth);
      if (pid === ProvinceID.PRUSY && rs.prusy_estate_income_penalty > 0) perEstate = Math.max(0, perEstate - rs.prusy_estate_income_penalty);

      if (perEstate > 0) {
        if (pid === ProvinceID.WIELKOPOLSKA) {
          if (single !== null) {
            for (const owner of prov.estates) if (owner >= 0 && owner === single) { players[owner].gold += perEstate; gained_estates[owner] += perEstate; }
          }
        } else {
          for (const owner of prov.estates) if (owner >= 0) { players[owner].gold += perEstate; gained_estates[owner] += perEstate; }
        }
      }
    }

    players.forEach((p, i) => log.push(`[Dochód] ${p.name}: +${gained_control[i]} (kontrola) +${gained_estates[i]} (posiadłości) = +${gained_control[i] + gained_estates[i]} zł. Razem: ${p.gold}`));
    return log;
  }
}

class AuctionAPI {
  constructor(ctx) { this.ctx = ctx; }
  resetForRound() {
    this.ctx.settings.players.forEach((p) => { p.majority = false; p.last_bid = 0; });
  }
  setBid(playerIndex, amount) {
    const p = this.ctx.settings.players[playerIndex];
    if (!p) throw new Error("Invalid player index");
    const bid = Number(amount) | 0; if (bid < 0 || bid > p.gold) throw new Error(`Bid must be 0..${p.gold}`);
    p.last_bid = bid; return `[Auction] ${p.name} licytuje ${bid} zł.`;
  }
  resolve() {
    const c = this.ctx; const rs = c.round_status; const log = [];
    if (rs.sejm_canceled) { log.push("[Auction] Sejm zerwany — licytacja pominięta."); return log; }
    const bids = c.settings.players.map((p, idx) => [p.last_bid, idx]).sort((a, b) => b[0] - a[0]);
    if (!bids.length) return log;
    const [topBid, topIdx] = bids[0]; const tie = bids.length > 1 && bids[1][0] === topBid;
    if (topBid === 0) { c.settings.players.forEach((p) => p.majority = false); log.push("[Auction] Brak ofert > 0 — nikt nie ma większości."); return log; }
    if (tie) {
      if (rs.sejm_tiebreak_wlkp) {
        const ctrl = singleControllerOf(c, ProvinceID.WIELKOPOLSKA);
        if (ctrl !== null) {
          const tiedIdxs = bids.filter(([b]) => b === topBid).map(([, i]) => i);
          if (tiedIdxs.includes(ctrl)) {
            const winner = c.settings.players[ctrl]; winner.gold -= topBid; c.settings.players.forEach((p) => p.majority = (p === winner));
            log.push(`[Auction] Remis — tie-break Wlkp: większość zdobywa ${winner.name} (zapłacił ${topBid}).`);
            return log;
          }
        }
      }
      c.settings.players.forEach((p) => p.majority = false); log.push("[Auction] Remis — nikt nie ma większości."); return log;
    }
    const winner = c.settings.players[topIdx]; winner.gold -= topBid; c.settings.players.forEach((p) => p.majority = (p === winner));
    log.push(`[Auction] Większość: ${winner.name} (zapłacił ${topBid}).`);
    return log;
  }
}

class SejmAPI {
  constructor(ctx) { this.ctx = ctx; }
  setLaw(n) {
    const c = this.ctx; if (c.round_status.sejm_canceled) return ["[Sejm] Sejm zerwany — brak ustawy."];
    if (!c.settings.players.some((p) => p.majority)) return ["[Sejm] Brak większości — ustawa nie przeszła."];
    if (n < 1 || n > 6) throw new Error("Law must be 1..6");
    c.round_status.last_law = n; c.round_status.last_law_choice = null;
    return [`[Sejm] Wybrano ustawę nr ${n}.`];
  }
  chooseVariant(choice /* 'A'|'B' */, extra /* optional payload */) {
    const c = this.ctx; const rs = c.round_status; const log = [];
    if (rs.sejm_canceled) return ["[Sejm] Sejm zerwany — brak fazy."];
    const majority = c.settings.players.find((p) => p.majority);
    if (!majority) return ["[Sejm] Nikt nie ma większości — ustawa nie wchodzi w życie."];
    const law = rs.last_law; if (!law) return ["[Sejm] Nie wybrano ustawy."];
    const ch = (String(choice || "").toUpperCase() === "B") ? "B" : "A"; rs.last_law_choice = ch;
    
    if (law === 1 || law === 2) {
      // PODATEK
      log.push("[Sejm] Podatek.");
      const players = c.settings.players;
      const others = players.filter(p => p !== majority);
    
      if (ch === 'A') {
        // A: zwycięzca +2, reszta +1
        majority.gold += 2;
        others.forEach(p => p.gold += 1);
        log.push(`${majority.name} +2 zł; pozostali +1 zł.`);
      } else {
        // B: zwycięzca +3, +1 na losowym torze (N/E/S)
        majority.gold += 3;
        const ridList = [RaidTrackID.N, RaidTrackID.E, RaidTrackID.S];
        const rid = ridList[Math.floor(Math.random() * ridList.length)];
        addRaid(c, rid, +1); // +1 na torze (czyli gorzej dla graczy)
        log.push(`${majority.name} +3 zł; losowy tor (${rid}) +1.`);
      }
      return log;
    }
    
    if (law === 3 || law === 4) {
      // WOJSKO
      log.push("[Sejm] Wojsko.");
      if (ch === 'A') {
        // Pospolite ruszenie (jak poprzednio)
        const picks = Array.isArray(extra) ? extra : [];
        picks.forEach(({ playerIndex, provinceId }) => {
          ensurePerProvinceArrays(c);
          const arr = influenceWinnersInProvince(c, provinceId);
          if (arr.length === 1 && arr[0] === playerIndex) {
            c.troops.per_province[provinceId][playerIndex] += 1;
            const arr = c.troops_kind.per_province[provinceId];
            if ((arr[playerIndex] | 0) === UnitKind.NONE){
              c.troops_kind.per_province[provinceId][playerIndex] = UnitKind.INF;
            }
            
            log.push(`  ${c.settings.players[playerIndex].name}: +1 jednostka w ${provinceId}`);
          }
        });
        return log;
      } else {
        // B: Fort w losowej kontrolowanej prowincji zwycięzcy (bez fortu)
        ensurePerProvinceArrays(c);
        const candidates = [];
        for (const pid of Object.values(ProvinceID)) {
          const winners = influenceWinnersInProvince(c, pid);
          if (winners.length === 1 && winners[0] === c.settings.players.indexOf(majority) && !c.provinces[pid].has_fort) {
            candidates.push(pid);
          }
        }
        if (candidates.length === 0) { log.push("Brak kontrolowanych prowincji bez fortu — brak efektu."); return log; }
        const pid = candidates[Math.floor(Math.random() * candidates.length)];
        toggleFort(c, pid, true);
        log.push(`Fort — położono fort w ${pid} (zwycięzca: ${majority.name}).`);
        return log;
      }
    }
    
    if (law === 5) {
      // GOSPODARKA
      log.push("[Sejm] Gospodarka.");
      if (ch === 'A') {
        // Zamożność +1 w losowej prowincji zwycięzcy
        ensurePerProvinceArrays(c);
        const owned = [];
        for (const pid of Object.values(ProvinceID)) {
          const winners = influenceWinnersInProvince(c, pid);
          if (winners.length === 1 && winners[0] === c.settings.players.indexOf(majority)) {
            owned.push(pid);
          }
        }
        if (!owned.length) { log.push("Zwycięzca nie kontroluje żadnej prowincji — brak efektu."); return log; }
        const pid = owned[Math.floor(Math.random() * owned.length)];
        const before = c.provinces[pid].wealth;
        addProvinceWealth(c, pid, +1);
        log.push(`Zamożność +1 w ${pid}: ${before}→${c.provinces[pid].wealth}.`);
        return log;
      } else {
        // Zamożność +2 w losowej prowincji na mapie (globalnie)
        const all = Object.values(ProvinceID);
        const pid = all[Math.floor(Math.random() * all.length)];
        const before = c.provinces[pid].wealth;
        addProvinceWealth(c, pid, +2);
        log.push(`Zamożność +2 w losowej prowincji: ${pid} (${before}→${c.provinces[pid].wealth}).`);
        return log;
      }

      return log;
    }
    
    if (law === 6) {
      // POKÓJ — bez zmian
      log.push("[Sejm] Pokój.");
      if (ch === 'A') { addRaid(c, RaidTrackID.N, -1); addRaid(c, RaidTrackID.E, -1); addRaid(c, RaidTrackID.S, -1); log.push("Wszystkie tory −1."); }
      else { const rid = extra?.track; if (!rid) throw new Error("Missing track for law 6B"); addRaid(c, rid, -2); log.push(`Tor ${rid} −2.`); }
      return log;
    }
  }
}

class ActionAPI {
  static COST = {
    wplyw: 2, posiadlosc: 2,
    rekrutacja_inf: 2,     // piechota
    rekrutacja_cav: 3,     // kawaleria (droższa)
    marsz: 0, zamoznosc: 2, administracja: 0
  };
  constructor(ctx) { this.ctx = ctx; }
  #pidx(playerIndex) { if (playerIndex < 0 || playerIndex >= this.ctx.settings.players.length) throw new Error("Bad player"); return playerIndex; }
  #hasNoble(pid, pidx) { ensurePerProvinceArrays(this.ctx); return (this.ctx.nobles.per_province[pid][pidx] || 0) > 0; }

  #ensureActionsPhase() {
    const phase = this.ctx?.round_status && (this.ctx?.gamePhase ?? this.ctx?.round?.currentPhaseId?.());
    if (this.ctx?.turn?.phase !== "actions") throw new Error("Akcje niedostępne — to nie jest faza 'actions'.");
    if (this.ctx.turn.done) throw new Error("Faza 'actions' zakończona — każdy wykonał 2 akcje.");
  }
  #requireActive(playerIndex) {
    this.#ensureActionsPhase();
    const expected = this.ctx.turn.order[this.ctx.turn.idx];
    if (playerIndex !== expected) {
      const want = this.ctx.settings.players[expected]?.name ?? `#${expected}`;
      const you = this.ctx.settings.players[playerIndex]?.name ?? `#${playerIndex}`;
      throw new Error(`Teraz ruch ma ${want}. (Próba akcji przez ${you} została zablokowana.)`);
    }
  }
  #advanceAfterAction(playerIndex) {
    const t = this.ctx.turn;
    // policz akcję
    t.counts[playerIndex] = Math.min(2, (t.counts[playerIndex] | 0) + 1);

    // sprawdź, czy zamknęliśmy bieżącą kolejkę (pass=1 albo pass=2)
    const target = t.pass; // każdy ma mieć >= target
    const allReachedTarget = t.counts.every(c => c >= target);

    if (allReachedTarget) {
      if (t.pass === 1) {
        // zaczynamy drugą kolejkę
        t.pass = 2;
        t.idx = 0; // wracamy do pierwszego w order
      } else {
        // wszyscy mają 2 akcje — koniec fazy
        t.done = true;
        return;
      }
    } else {
      // przejdź do kolejnego gracza (z tych, którzy nie osiągnęli jeszcze targetu)
      for (let step = 1; step <= t.order.length; step++) {
        const nextIdx = (t.idx + step) % t.order.length;
        const pidx = t.order[nextIdx];
        if (t.counts[pidx] < target) { t.idx = nextIdx; break; }
      }
    }
  }

  administracja(playerIndex) {
    this.#requireActive(playerIndex);
    const p = this.ctx.settings.players[this.#pidx(playerIndex)];
    const gain = this.ctx.round_status.admin_yield; p.gold += gain; 
    
    this.#advanceAfterAction(playerIndex);
    return `${p.name} otrzymuje +${gain} zł (złoto=${p.gold}).`;
  }

  wplyw(playerIndex, provinceId) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); const p = c.settings.players[pidx];
    let cost = ActionAPI.COST.wplyw;
    if (c.round_status.viritim_influence_cost_override != null) cost = c.round_status.viritim_influence_cost_override;
    if (provinceId === ProvinceID.WIELKOPOLSKA && c.round_status.wlkp_influence_cost_override != null) cost = c.round_status.wlkp_influence_cost_override;
    if (provinceId === ProvinceID.LITWA && c.round_status.discount_litwa_wplyw_pos > 0) cost = Math.max(0, cost - c.round_status.discount_litwa_wplyw_pos);
    if (p.gold < cost) throw new Error(`Za mało złota. Koszt=${cost}, masz ${p.gold}.`);
    ensurePerProvinceArrays(c); c.nobles.per_province[provinceId][pidx] += 1; p.gold -= cost; 
    this.#advanceAfterAction(playerIndex);
    return `${p.name} stawia szlachcica w ${provinceId}. (koszt ${cost}, złoto=${p.gold})`;
  }

  posiadlosc(playerIndex, provinceId) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); const p = c.settings.players[pidx];
    if (!this.#hasNoble(provinceId, pidx)) throw new Error("Musisz mieć szlachcica w tej prowincji.");
    let cost = ActionAPI.COST.posiadlosc;
    if (provinceId === ProvinceID.WIELKOPOLSKA && c.round_status.wlkp_estate_cost_override != null) cost = c.round_status.wlkp_estate_cost_override;
    if (provinceId === ProvinceID.LITWA && c.round_status.discount_litwa_wplyw_pos > 0) cost = Math.max(0, cost - c.round_status.discount_litwa_wplyw_pos);
    if (p.gold < cost) throw new Error(`Za mało złota. Koszt=${cost}, masz ${p.gold}.`);
    const ok = buildEstate(c, provinceId, pidx); if (!ok) throw new Error("Brak wolnych slotów posiadłości."); p.gold -= cost; 
    this.#advanceAfterAction(playerIndex);
    return `${p.name} buduje posiadłość w ${provinceId}. (koszt ${cost}, złoto=${p.gold})`;
  }

 #rekrutuj(playerIndex, provinceId, kind) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); const p = c.settings.players[pidx];
    if (!this.#hasNoble(provinceId, pidx)) throw new Error("Musisz mieć szlachcica w tej prowincji.");

    ensurePerProvinceArrays(c);
    const arr = c.troops.per_province[provinceId];
    const kinds = c.troops_kind.per_province[provinceId];
     if ((arr[pidx] | 0) === 0) kinds[pidx] = UnitKind.NONE;
   
    const curKind = kinds[pidx] | 0;

    // Zakaz mieszania typów: jeśli coś stoi i jest innego typu — blokujemy
    if (curKind !== UnitKind.NONE && curKind !== kind) {
      throw new Error("W tej prowincji masz już inny rodzaj wojsk — nie można mieszać.");
    }

    // koszt: override 'recruit_cost_override' dotyczy obu typów
    const base = (kind === UnitKind.CAV) ? ActionAPI.COST.rekrutacja_cav : ActionAPI.COST.rekrutacja_inf;
    const actual = (c.round_status.recruit_cost_override != null) ? c.round_status.recruit_cost_override : base;

    if (p.gold < actual) throw new Error(`Za mało złota. Koszt=${actual}, masz ${p.gold}.`);

    arr[pidx] = (arr[pidx] | 0) + 1;
    kinds[pidx] = kind;
    p.gold -= actual;

    this.#advanceAfterAction(playerIndex);
    const kindName = (kind === UnitKind.CAV) ? "kawaleria" : "piechota";
    return `${p.name} rekrutuje 1 (${kindName}) w ${provinceId}. (koszt ${actual}, złoto=${p.gold})`;
  }

  rekrutacja_piechota(playerIndex, provinceId) {
    return this.#rekrutuj(playerIndex, provinceId, UnitKind.INF);
  }

  rekrutacja_kawaleria(playerIndex, provinceId) {
    return this.#rekrutuj(playerIndex, provinceId, UnitKind.CAV);
  }

  // MARSZ — bez mieszania: źródło i cel muszą być puste lub tego samego typu dla danego gracza
  marsz(playerIndex, fromPid, toPid, amount = 1) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); ensurePerProvinceArrays(c);
    if (!this.#hasNoble(fromPid, pidx) || !this.#hasNoble(toPid, pidx)) throw new Error("Marsz tylko między prowincjami, gdzie masz szlachciców na obu.");

    const fromArr = c.troops.per_province[fromPid];
    const toArr   = c.troops.per_province[toPid];
    const fromKinds = c.troops_kind.per_province[fromPid];
    const toKinds   = c.troops_kind.per_province[toPid];

    const amt = Math.max(1, Number(amount) | 0);
    if ((fromArr[pidx] | 0) < amt) throw new Error("Brak jednostek do przesunięcia.");

    const kFrom = fromKinds[pidx] | 0;
    const kTo   = toKinds[pidx]   | 0;

    if (kFrom === UnitKind.NONE) throw new Error("Brak określonego typu wojsk w polu źródłowym.");
    if (kTo !== UnitKind.NONE && kTo !== kFrom) throw new Error("Nie można mieszać typów wojsk podczas marszu.");

    fromArr[pidx] -= amt;
    toArr[pidx]   += amt;

    // jeśli cel był pusty — przejmuje typ
    if (kTo === UnitKind.NONE) toKinds[pidx] = kFrom;
    // jeśli źródło opustoszało — czyścimy typ
    if ((fromArr[pidx] | 0) === 0) fromKinds[pidx] = UnitKind.NONE;

    this.#advanceAfterAction(playerIndex);
    return `${c.settings.players[pidx].name} maszeruje ${amt} j.: ${fromPid} -> ${toPid}.`;
  }


  zamoznosc(playerIndex, provinceId) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); const p = c.settings.players[pidx];
    const before = c.provinces[provinceId].wealth; if (before >= 3) throw new Error("Zamożność już 3 (MAX).");
    const base = ActionAPI.COST.zamoznosc; const actual = c.round_status.zamoznosc_cost_override != null ? c.round_status.zamoznosc_cost_override : base;
    if (p.gold < actual) throw new Error(`Za mało złota. Koszt=${actual}, masz ${p.gold}.`);
    addProvinceWealth(c, provinceId, +1); p.gold -= actual; 
    this.#advanceAfterAction(playerIndex);
    return `${p.name} podnosi zamożność ${provinceId}: ${before}→${c.provinces[provinceId].wealth}. (koszt ${actual}, złoto=${p.gold})`;
  }
}

class ArsonAPI {
  constructor(ctx) { this.ctx = ctx; }

  #ensurePhase() {
    if (!this.ctx.arsonTurn) throw new Error("To nie jest faza palenia posiadłości.");
    if (this.ctx.arsonTurn.done) throw new Error("Faza palenia posiadłości już zakończona.");
  }

  #requireActive(playerIndex) {
    this.#ensurePhase();
    const t = this.ctx.arsonTurn;
    const expected = t.order[t.idx];
    if (playerIndex !== expected) {
      const want = this.ctx.settings.players[expected]?.name ?? `#${expected}`;
      throw new Error(`Teraz ruch ma ${want}.`);
    }
  }

  #eligibleTargetsFor(playerIndex) {
    ensurePerProvinceArrays(this.ctx);
    const s = this.ctx;
    const out = [];
    for (const pid of Object.values(ProvinceID)) {
      const troops = (s.troops.per_province[pid]?.[playerIndex] | 0);
      if (troops <= 0) continue;
  
      const info = lastOccupiedEstateSlot(s, pid);
      if (!info) continue;
  
      // tylko jeśli ostatnia posiadłość należy do przeciwnika
      if (info.ownerIndex === playerIndex) continue;
  
      out.push(pid);
    }
    return out;
  }

  #advanceToNext() {
    const t = this.ctx.arsonTurn;
    if (!t) return;
  
    const P = t.order.length | 0;
    if (P === 0) { t.done = true; return; }
  
    // 1) wszyscy już PASS → koniec fazy
    if (t.passed.every(Boolean)) {
      t.done = true;
      return;
    }
  
    // 2) znajdź NASTĘPNEGO gracza, który JESZCZE nie zagrał (nie sprawdzamy celów!)
    //    — dokładnie tak jak w battles: gracz bez celów ma turę i klika PASS ręcznie.
    for (let step = 1; step <= P; step++) {
      const nextIdx = (t.idx + step) % P;   // indeks w kolejności tury
      const pidx    = t.order[nextIdx];     // indeks gracza
      if (!t.passed[pidx]) {
        t.idx = nextIdx;                    // przekazujemy turę temu graczowi
        return;
      }
    }
  
    // 3) awaryjnie (gdyby pętla nic nie znalazła) – zamknij
    t.done = true;
  }

  burn({ playerIndex, provinceId }) {
    this.#requireActive(playerIndex);
    const legal = this.#eligibleTargetsFor(playerIndex);
    if (!legal.includes(provinceId)) throw new Error("Ta prowincja nie jest legalnym celem do spalenia.");
  
    const c = this.ctx; ensurePerProvinceArrays(c);
    const info = lastOccupiedEstateSlot(c, provinceId);
    if (!info) throw new Error("Brak posiadłości do spalenia.");
    if (info.ownerIndex === playerIndex) throw new Error("Nie możesz spalić własnej posiadłości.");

    c.provinces[provinceId].estates[info.slotIndex] = -1;

    const beforeWealth = c.provinces[provinceId].wealth;
    addProvinceWealth(c, provinceId, -1);
    const afterWealth = c.provinces[provinceId].wealth;
    
    const atk = c.settings.players[playerIndex].name;
    const def = c.settings.players[info.ownerIndex].name;

    this.#resetPasses();
    this.#advanceToNext();
    return `[Palenie] ${atk} spalił posiadłość gracza ${def} w ${provinceId}; `
         + `zamożność ${beforeWealth}→${afterWealth}.`;
  }

  pass(playerIndex) {
    this.#requireActive(playerIndex);
    this.ctx.arsonTurn.passed[playerIndex] = true;
    this.#advanceToNext();
    return `PASS (palenie) — ${this.ctx.settings.players[playerIndex].name}`;
  }

  // alias dla spójności z battles
  passTurn(playerIndex) { return this.pass(playerIndex); }

  #resetPasses() {
    const t = this.ctx.arsonTurn;
    if (!t) return;  
    t.passed.fill(false);
  }
}

class PlayerBattleAPI {
  constructor(ctx) { this.ctx = ctx; }
  #ensurePhase() {
    if (!this.ctx.battlesTurn) throw new Error("To nie jest faza starć.");
    if (this.ctx.battlesTurn.done) throw new Error("Faza starć już zakończona.");
  }
  #requireActive(playerIndex) {
    this.#ensurePhase();
    const t = this.ctx.battlesTurn;
    const expected = t.order[t.idx];
    if (playerIndex !== expected) {
      const want = this.ctx.settings.players[expected]?.name ?? `#${expected}`;
      const you  = this.ctx.settings.players[playerIndex]?.name ?? `#${playerIndex}`;
      throw new Error(`Teraz w starciach kolej ${want}. (Akcja ${you} zablokowana.)`);
    }
  }
  #anyEligibleBattlesLeft() {
    const { troops } = this.ctx;
    for (const pid of Object.values(ProvinceID)) {
      const arr = troops.per_province[pid] || [];
      const present = arr.map((u,i)=>(u|0)>0?i:-1).filter(i=>i>=0);
      if (new Set(present).size >= 2) return true; // są co najmniej dwie strony
    }
    return false;
  }
  
  #advance(turnWasAttack) {
    const t = this.ctx.battlesTurn;
    if (!t) return;
  
    // Po realnym ataku zaczynamy nową mini-rundę: zdejmij wszystkie PASS-y
    if (turnWasAttack) {
      t.passed = t.passed.map(() => false);
    }
  
    // Koniec fazy tylko gdy w TEJ mini-rundzie wszyscy mają PASS
    if (t.passed.every(Boolean)) {
      t.done = true;
      return;
    }
  
    // Przejdź do następnego gracza, który nie ma PASS
    const n = t.order.length;
    for (let step = 1; step <= n; step++) {
      const nextIdx = (t.idx + step) % n;
      const pidx = t.order[nextIdx];
      if (!t.passed[pidx]) {
        t.idx = nextIdx;
        break;
      }
    }
  }

  #resetPasses() {
    const t = this.ctx.attackTurn;
    if (!t) return;  
    t.passed.fill(false);
  }
  
  /**
   * Jedna akcja ataku gracz→gracz oparta o progi:
   * CAV trafia na 4–6, INF trafia na 5–6. Brak strat własnych.
   * @param {number} playerIndex - atakujący (indeks gracza)
   * @param {ProvinceID} provinceId - gdzie toczy się walka
   * @param {number} targetIndex - broniący (indeks gracza)
   * @param {number[]} [rolls] - opcjonalnie rzuty; gdy brak, losujemy
   * @param {number} [dice=1] - ile kości (domyślnie 1; max = twoje jednostki)
   */
  attack({ playerIndex, provinceId, targetIndex, rolls, dice }) {
    this.#requireActive(playerIndex);
    ensurePerProvinceArrays(this.ctx);

    const c   = this.ctx;
    const atk = playerIndex | 0;
    const def = targetIndex  | 0;
    if (atk === def) throw new Error("Nie możesz atakować samego siebie.");

    const unitsAtk = (c.troops.per_province[provinceId]?.[atk] | 0);
    const unitsDef = (c.troops.per_province[provinceId]?.[def] | 0);
    if (unitsAtk <= 0) throw new Error("Brak twoich jednostek w tej prowincji.");
    if (unitsDef <= 0) throw new Error("Brak jednostek przeciwnika w tej prowincji.");

    // próg trafienia wg typu wojsk atakującego
    const kindAtk = (c.troops_kind.per_province[provinceId]?.[atk] | 0); // UnitKind
    const thr = (kindAtk === UnitKind.CAV) ? 4 : 5;

    // ile kości faktycznie używamy (bez bonusów; to starcia gracz↔gracz)
    const requestedDice = (Number(dice) > 0 ? (Number(dice) | 0) : 1);
    const usedDice = Math.max(1, Math.min(requestedDice, unitsAtk));

    const seq = Array.isArray(rolls) && rolls.length
      ? rolls.slice(0, usedDice)
      : Array.from({length: usedDice}, () => 1 + Math.floor(Math.random() * 6));

    const out = [];
    for (const r0 of seq) {
      if ((c.troops.per_province[provinceId][atk] | 0) <= 0) break;
      if ((c.troops.per_province[provinceId][def] | 0) <= 0) break;

      const r = r0 | 0;
      if (!(r >= 1 && r <= 6)) throw new Error("Rzut musi być 1..6.");

      if (r >= thr) {
        // trafienie: tylko obrońca traci 1
        c.troops.per_province[provinceId][def] =
          Math.max(0, c.troops.per_province[provinceId][def] - 1);

        out.push(
          (kindAtk === UnitKind.CAV)
            ? "CAV 4–6 → trafienie: obrońca −1, twoje jednostki bez strat."
            : "INF 5–6 → trafienie: obrońca −1, twoje jednostki bez strat."
        );
      } else {
        // pudło: nic się nie dzieje
        out.push(
          (kindAtk === UnitKind.CAV)
            ? "CAV 1–3 → pudło: bez efektu."
            : "INF 1–4 → pudło: bez efektu."
        );
      }
    }

    const a = c.settings.players[atk].name;
    const d = c.settings.players[def].name;
    out.push(
      `Po starciu: ${a}=${c.troops.per_province[provinceId][atk]}, `
      + `${d}=${c.troops.per_province[provinceId][def]} w ${provinceId}.`
    );

    this.#resetPasses();
    this.#advance(true); // utrzymujemy rotację tury w fazie "battles"
    return out;
  }
  
  passTurn(playerIndex) {
    this.#requireActive(playerIndex);
    const t = this.ctx.battlesTurn;
    t.passed[playerIndex] = true;
    this.#advance(false);
    return `PASS (starcia) — ${this.ctx.settings.players[playerIndex].name}`;
  }

}

class EnemyReinforcementAPI {
  constructor(ctx) { this.ctx = ctx; }
  // rolls: { N:1..6, S:1..6, E:1..6 }
  reinforce(rolls) {
    const c = this.ctx; const log = [];
    const toDelta = (r) => (r <= 2 ? 0 : r <= 4 ? 1 : 2);
    const order = ["N", "S", "E"];
    for (const k of order) {
      const rid = k === "N" ? RaidTrackID.N : k === "S" ? RaidTrackID.S : RaidTrackID.E;
      const r = Number(rolls?.[k]); if (!(r >= 1 && r <= 6)) throw new Error(`Missing/invalid roll for ${k}`);
      const d = toDelta(r);
      if (d) { const v = addRaid(c, rid, d); log.push(`${c.raid_tracks[k].id}: +${d} → ${v}`); }
      else log.push(`${c.raid_tracks[k].id}: +0 (bez zmian)`);
    }
    return log;
  }
}

class AttackInvadersAPI {
  constructor(ctx) { this.ctx = ctx; }
  // Perform one attack action with an array of rolls (processed sequentially, stops early if track hits 0).
  // { playerIndex, enemy: RaidTrackID, from: ProvinceID, rolls: number[] }

  #ensurePhase() {
    if (!this.ctx.attackTurn) throw new Error("To nie jest faza ataków.");
    if (this.ctx.attackTurn.done) throw new Error("Faza ataków już zakończona.");
  }

  #requireActive(playerIndex) {
    this.#ensurePhase();
    const t = this.ctx.attackTurn;
    const expected = t.order[t.idx];
    if (playerIndex !== expected) {
      const want = this.ctx.settings.players[expected]?.name ?? `#${expected}`;
      const you  = this.ctx.settings.players[playerIndex]?.name ?? `#${playerIndex}`;
      throw new Error(`Teraz atakuje ${want}. (Akcja ${you} zablokowana.)`);
    }
  }

  #anyEligibleAttacksLeft() {
    const { raid_tracks, troops } = this.ctx;
    // ktoś ma wojsko w zasięgu i istnieje cel (tor > 0)
    const hasTarget = raid_tracks.N.value > 0 || raid_tracks.S.value > 0 || raid_tracks.E.value > 0;
    if (!hasTarget) return false;

    const pcount = this.ctx.settings.players.length;
    const sources = {
      N: [ProvinceID.PRUSY, ProvinceID.LITWA],
      E: [ProvinceID.LITWA, ProvinceID.UKRAINA],
      S: [ProvinceID.MALOPOLSKA, ProvinceID.UKRAINA],
    };
    for (let pidx = 0; pidx < pcount; pidx++) {
      if (raid_tracks.N.value > 0 && sources.N.some(pid => (troops.per_province[pid]?.[pidx] | 0) > 0)) return true;
      if (raid_tracks.E.value > 0 && sources.E.some(pid => (troops.per_province[pid]?.[pidx] | 0) > 0)) return true;
      if (raid_tracks.S.value > 0 && sources.S.some(pid => (troops.per_province[pid]?.[pidx] | 0) > 0)) return true;
    }
    return false;
  }
  
  #advance(turnWasAttack) {
    const t = this.ctx.attackTurn;
    if (!t) return;
  
    // Po realnym ataku zaczynamy nową mini-rundę: zdejmij wszystkie PASS-y
    if (turnWasAttack) {
      t.passed = t.passed.map(() => false);
    }
  
    // Koniec fazy tylko gdy w TEJ mini-rundzie wszyscy mają PASS
    const allPassed = t.passed.every(Boolean);
    if (allPassed || !this.#anyEligibleAttacksLeft()) {
      t.done = true;
      return;
    }
  
    // Przejdź do następnego gracza bez PASS
    const n = t.order.length;
    for (let step = 1; step <= n; step++) {
      const nextIdx = (t.idx + step) % n;
      const pidx = t.order[nextIdx];
      if (!t.passed[pidx]) {
        t.idx = nextIdx;
        break;
      }
    }
  }

  #resetPasses() {
    const t = this.ctx.attackTurn;
    if (!t) return;  
    t.passed.fill(false);
  }

  attack({ playerIndex, enemy, from, rolls, dice /* optional: ile kości chcesz rzucić */ }) {
    this.#requireActive(playerIndex);
    const c = this.ctx; ensurePerProvinceArrays(c);
    const pidx = Number(playerIndex) | 0; const pl = c.settings.players[pidx];

    const allowed = {
      [RaidTrackID.N]: new Set([ProvinceID.PRUSY, ProvinceID.LITWA]),
      [RaidTrackID.E]: new Set([ProvinceID.LITWA, ProvinceID.UKRAINA]),
      [RaidTrackID.S]: new Set([ProvinceID.MALOPOLSKA, ProvinceID.UKRAINA]),
    };
    const srcOk = allowed[enemy]?.has(from);
    if (!srcOk) throw new Error("Z tej prowincji nie można atakować wybranego najeźdźcy.");
    if ((c.troops.per_province[from][pidx] | 0) <= 0) throw new Error("Brak jednostek na prowincji źródłowej.");

    const key = enemy === RaidTrackID.N ? "N" : enemy === RaidTrackID.S ? "S" : "E";
    const track = c.raid_tracks[key];
    if (track.value <= 0) throw new Error("Tor już = 0 — brak celu.");

    // jednostki na polu + potencjalna kość z artylerii (zużyjemy tylko gdy faktycznie jej użyjesz)
    const units = c.troops.per_province[from][pidx] | 0;
    const hasArtilleryBonus = c.round_status.artillery_defense_active && !c.round_status.artillery_defense_used[pidx];
    const maxAvailableDice = units + (hasArtilleryBonus ? 1 : 0);

    // ile kości faktycznie używamy w tej akcji
    const requestedDice = Number(dice) > 0 ? Number(dice) | 0
                         : (Array.isArray(rolls) ? rolls.length : maxAvailableDice);
   const usedDice = Math.max(1, Math.min(requestedDice + (hasArtilleryBonus && requestedDice <= units ? 1 : 0), maxAvailableDice));

    // jeśli podano rzuty, upewnij się że mamy ich tyle, ile chcemy użyć
    if (Array.isArray(rolls) && rolls.length < usedDice) {
      throw new Error(`Za mało rzutów: podano ${rolls.length}, wymagane ${usedDice}.`);
    }

    // oznacz zużycie artylerii TYLKO jeśli naprawdę używamy dodatkowej kości ponad liczbę jednostek
    if (hasArtilleryBonus && usedDice > units) {
      c.round_status.artillery_defense_used[pidx] = true;
    }

    const seq = Array.isArray(rolls) ? rolls.slice(0, usedDice) : [];
    const out = [];
    const kinds = c.troops_kind.per_province[from];
    const myKind = kinds[pidx] | 0; // UnitKind
    
    for (let i = 0; i < seq.length; i++) {
      if (track.value <= 0) { out.push("Tor już 0 — koniec akcji."); break; }
      const r = seq[i] | 0; if (!(r >= 1 && r <= 6)) throw new Error("Rzuty muszą być 1..6");
    
      if (myKind === UnitKind.CAV) {
        // Kawaleria: 1 (porażka -1), 2–4 (sukces, tor-1 i tracisz 1), 5–6 (sukces, tor-1 i NIE tracisz)
        if (r === 1) {
          c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1);
          if ((c.troops.per_province[from][pidx] | 0) === 0) kinds[pidx] = UnitKind.NONE; 
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("1 → porażka kawalerii, tracisz 1 jednostkę.");
        } else if (r <= 4) {
          addRaid(c, enemy, -1);
          c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1);
          if ((c.troops.per_province[from][pidx] | 0) === 0) kinds[pidx] = UnitKind.NONE; 
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("2–4 → sukces kawalerii: tor -1 i tracisz 1 jednostkę.");
        } else {
          addRaid(c, enemy, -1);
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("5–6 → sukces kawalerii: tor -1 i jednostka pozostaje.");
        }
      } else {
        // Piechota (stare zasady): 1 (porażka -1), 2–5 (sukces, tor-1 i tracisz 1), 6 (sukces bez straty)
        if (r === 1) {
          c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1);
          if ((c.troops.per_province[from][pidx] | 0) === 0) kinds[pidx] = UnitKind.NONE; 
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("1 → porażka, tracisz 1 jednostkę.");
        } else if (r <= 5) {
          addRaid(c, enemy, -1);
          c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1);
          if ((c.troops.per_province[from][pidx] | 0) === 0) kinds[pidx] = UnitKind.NONE; 
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("2–5 → sukces: tor -1 i tracisz 1 jednostkę.");
        } else {
          addRaid(c, enemy, -1);
          pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1;
          out.push("6 → sukces: tor -1 i jednostka pozostaje.");
        }
      }
    }

    out.push(`Użyte kości: ${usedDice}/${maxAvailableDice} (jednostki=${units}${hasArtilleryBonus ? ", +1 artyleria możliwa" : ""})`);
    out.push(`Po ataku: ${track.id}=${track.value}, ${from}: jednostek=${c.troops.per_province[from][pidx]}`);

    this.#resetPasses();
    this.#advance(true);
    return out;
  }

  passTurn(playerIndex) {
    this.#requireActive(playerIndex);
    const t = this.ctx.attackTurn;
    t.passed[playerIndex] = true;
    this.#advance(false);
    return `PASS (${this.ctx.settings.players[playerIndex].name})`;
  }
}

class DevastationAPI {
  constructor(ctx) { this.ctx = ctx; }
  // Provide dice to choose the target province when a track >=3 triggers devastation.
  // dice: { N?:1..6, S?:1..6, E?:1..6 }
  resolve(dice = {}) {
    const c = this.ctx; const log = [];
    const pairs = { [RaidTrackID.N]: [ProvinceID.PRUSY, ProvinceID.LITWA], [RaidTrackID.E]: [ProvinceID.LITWA, ProvinceID.UKRAINA], [RaidTrackID.S]: [ProvinceID.UKRAINA, ProvinceID.MALOPOLSKA] };
    const order = [RaidTrackID.N, RaidTrackID.S, RaidTrackID.E];
    for (const rid of order) {
      const key = rid === RaidTrackID.N ? 'N' : rid === RaidTrackID.S ? 'S' : 'E'; const track = c.raid_tracks[key];
      if (track.value >= 3) {
        const [first, second] = pairs[rid];
        const r = Number(dice?.[key]); if (!(r >= 1 && r <= 6)) throw new Error(`Missing/invalid die for ${key}`);
        const target = (r <= 3) ? first : second;
        const msg = plunderProvince(c, target); track.value = 1; log.push(`${msg} Tor ${track.id} ustawiony na 1.`);
      }
    }
    if (!log.length) log.push("[Spustoszenia] Brak torów ≥ 3 — nic się nie dzieje.");
    return log;
  }
}

// === NEW: surowa punktacja dla UI i raportu ===
function computeScoresRaw(ctx){
  const players = ctx.settings.players;
  const pcount = players.length;

  // (0) wyzeruj tymczasowo
  const tmpScore = Array(pcount).fill(0);

  // (1) Posiadłości → 1 pkt każda
  const estatesTotal = Array(pcount).fill(0);
  for (const prov of Object.values(ctx.provinces)) {
    for (const owner of prov.estates) if (owner >= 0 && owner < pcount) estatesTotal[owner] += 1;
  }
  estatesTotal.forEach((v,i)=> tmpScore[i]+=v);

  // (2) Wpływy (jednoznaczna kontrola) → 1 pkt
  const provinceWinners = {};
  for (const pid of Object.values(ProvinceID)) {
    const winners = influenceWinnersInProvince(ctx, pid);
    if (winners.length === 1) { tmpScore[winners[0]] += 1; provinceWinners[pid] = winners[0]; }
    else { provinceWinners[pid] = null; }
  }

  // (3) Honor → 1:1
  players.forEach((p,i)=> tmpScore[i] += p.honor|0);

  // (4) Złoto → 1 pkt za każde pełne 5 zł (jak w Twoim computeFinalScores)
  const goldPts = players.map(p => Math.floor((p.gold|0)/5));
  goldPts.forEach((v,i)=> tmpScore[i]+=v);

  // Zbuduj tablicę
  const rows = players.map((p,i)=>({
    index: i,
    name: p.name,
    score: tmpScore[i],
    breakdown: {
      estates: estatesTotal[i],
      control: Object.values(provinceWinners).filter(w=>w===i).length,
      honor: p.honor|0,
      goldPts: goldPts[i],
      gold: p.gold|0
    }
  }));

  // Miejsca z remisami
  const sorted = [...rows].sort((a,b)=> b.score - a.score);
  const placeByIndex = Array(pcount).fill(0);
  let curPlace = 1;
  for (let k=0; k<sorted.length; k++){
    if (k>0 && sorted[k].score < sorted[k-1].score) curPlace = k+1;
    placeByIndex[sorted[k].index] = curPlace;
  }

  return {
    players: rows,                // w kolejności oryginalnej
    standings: sorted,            // posortowane malejąco
    places: placeByIndex          // indeks gracza → miejsce (1..n)
  };
}


function computeFinalScores(ctx) {
  const players = ctx.settings.players;
  // policz surowo
  const raw = computeScoresRaw(ctx);

  // zapisz score do obiektów graczy (jak wcześniej)
  raw.players.forEach(r => { players[r.index].score = r.score; });

  // zbuduj linie raportu (to co już miałeś)
  const estatesLine = "Posiadłości→pkt: " + raw.players.map(r => `${players[r.index].name}=+${r.breakdown.estates}`).join(", ");
  const honorLine   = "Honor: " + raw.players.map(r => `${players[r.index].name}=+${r.breakdown.honor}`).join(", ");
  const goldLine    = "Złoto→pkt: " + raw.players.map(r => `${players[r.index].name}=+${r.breakdown.goldPts} (z ${r.breakdown.gold} zł)`).join(", ");

  // wpływy z prowincji (rekonstrukcja jak wcześniej)
  const influenceLines = [];
  for (const pid of Object.values(ProvinceID)) {
    const winners = influenceWinnersInProvince(ctx, pid);
    if (!winners.length) influenceLines.push(`  • ${pid}: brak wpływu`);
    else if (winners.length === 1) influenceLines.push(`  • ${pid}: ${players[winners[0]].name}`);
    else influenceLines.push(`  • ${pid}: remis – nikt`);
  }

  const lines = [];
  lines.push("[Punktacja końcowa]");
  lines.push(estatesLine);
  lines.push("Wpływy z prowincji:");
  influenceLines.forEach(s => lines.push(s));
  lines.push(honorLine);
  lines.push(goldLine);
  lines.push("Tabela wyników:");
  raw.standings.forEach((s, idx) => lines.push(`  ${idx + 1}. ${s.name} — ${s.score} pkt`));

  const top = raw.standings[0]?.score ?? 0;
  const winners = raw.standings.filter(s=>s.score===top).map(s=>s.name);
  lines.push(winners.length === 1
    ? `Zwycięzca: ${winners[0]} (${top} pkt)`
    : `Zwycięzcy: ${winners.join(", ")} (${top} pkt)`);

  return lines;
}

// ---------------- Round + Game orchestration (programmatic) ----------------
class RoundEngine {
  constructor(ctx) { this.ctx = ctx; this.phaseIndex = 0; this.phases = [
    "events", "income", "auction", "sejm", "actions", "battles", "arson", "reinforcements", "attacks", "devastation"
  ]; }
  currentPhaseId() { return this.phases[this.phaseIndex] ?? null; }
  nextPhase() {
    this.phaseIndex += 1;              // po ostatniej fazie currentPhaseId() zwróci null
    return this.currentPhaseId();
  }
  isFinished() { return this.phaseIndex >= this.phases.length; }
}

export class ConsoleGame {
  constructor() {
    this.ctx = new GameContext();
    this.state = StateID.START_MENU;

    // APIs
    this.events = new EventsAPI(this.ctx);
    this.income = new IncomeAPI(this.ctx);
    this.auction = new AuctionAPI(this.ctx);
    this.sejm = new SejmAPI(this.ctx);
    this.actions = new ActionAPI(this.ctx);
    this.battles = new PlayerBattleAPI(this.ctx);
    this.reinforce = new EnemyReinforcementAPI(this.ctx);
    this.attacks = new AttackInvadersAPI(this.ctx);
    this.devastation = new DevastationAPI(this.ctx);
    this.arson = new ArsonAPI(this.ctx); 

    this.round = null; // RoundEngine
  }

  // ------------ Lifecycle ------------
startGame({ players = [], startingGold = 6, maxRounds = 3, resetGoldEachRound = false } = {}) {
    if (!players.length) players = ["Player1"]; // default
    this.ctx.settings.players = players.map((name) => new Player(String(name), startingGold | 0));
    this.ctx.settings.max_rounds = Math.max(1, maxRounds | 0 || 1);
    this.ctx.round_status = new RoundStatus(this.ctx.settings.max_rounds, this.ctx.settings.players.length);
    this.ctx.settings.reset_gold_each_round = !!resetGoldEachRound;

    // init boards
    ensurePerProvinceArrays(this.ctx);

    this.state = StateID.GAMEPLAY;
    this._startRound();
    return this.getPublicState();
  }

  _startRound() {
    if (this.ctx.settings.reset_gold_each_round && this.ctx.round_status.current_round > 1) {
      this.ctx.settings.players.forEach(p => { p.gold = 0; });
    }
    
    const rs = this.ctx.round_status;
    // reset per-round modifiers
    rs.sejm_canceled = false; rs.admin_yield = 2; rs.prusy_estate_income_penalty = 0; rs.discount_litwa_wplyw_pos = 0;
    rs.extra_honor_vs_tatars = false; rs.recruit_cost_override = null; rs.zamoznosc_cost_override = null; rs.fairs_plus_one_income = false;
    rs.artillery_defense_active = false; rs.artillery_defense_used = Array(this.ctx.settings.players.length).fill(false);
    rs.sejm_tiebreak_wlkp = false; rs.wlkp_influence_cost_override = null; rs.wlkp_estate_cost_override = null; rs.last_law = null; rs.last_law_choice = null;
    rs.viritim_influence_cost_override = null;
    this.ctx.turn = null;
    this.auction.resetForRound();
    this.round = new RoundEngine(this.ctx);
  }

  finishPhaseAndAdvance() {
    // zapamiętaj poprzednią fazę
    const prev = this.round.currentPhaseId();
    // przejdź do kolejnej
    let next = this.round.nextPhase();   // może zwrócić null po ostatniej fazie

    // jeśli skończyliśmy listę faz → kończymy rundę i startujemy nową
    if (next == null) {
      const wasLastRound = (this.ctx.round_status.current_round >= this.ctx.round_status.total_rounds);
      const endRes = this.endRoundOrGame();   // _startRound() wywoła się, jeśli to nie był koniec gry
      
      if (wasLastRound) {
        // koniec gry — nie ma już faz
        this.ctx.turn = null;
        this.ctx.attackTurn = null;
        return "GAME_OVER";
      }
      // świeża runda wystartowała; wracamy do pierwszej fazy nowej rundy
      next = this.round.currentPhaseId();  // powinno być "events"
    }

    // wejście/wyjście w tryby faz specjalnych dla nowej/aktualnej fazy
    if (next === "actions") this._initActionsTurn();
    if (prev === "actions" && next !== "actions") this.ctx.turn = null;

    if (next === "battles") this._initBattlesTurn();
    if (prev === "battles" && next !== "battles") this.ctx.battlesTurn = null;
    
    if (next === "attacks") this._initAttacksTurn();
    if (prev === "attacks" && next !== "attacks") this.ctx.attackTurn = null;

    if (next === "arson") this._initArsonTurn();                 
    if (prev === "arson" && next !== "arson") this.ctx.arsonTurn = null;

    return this.round.currentPhaseId();
  }

  getScoresRaw(){
    return computeScoresRaw(this.ctx);
  }

  _initAttacksTurn() {
    const pcount = this.ctx.settings.players.length;
    const start = this.ctx.round_status.marshal_index;
    const order = Array.from({ length: pcount }, (_, k) => (start + k) % pcount);
    this.ctx.attackTurn = {
      order,
      idx: 0,
      passed: Array(pcount).fill(false),
      done: false,
    };
  }

  _initBattlesTurn() {
    const pcount = this.ctx.settings.players.length;
    const start = this.ctx.round_status.marshal_index;
    const order = Array.from({ length: pcount }, (_, k) => (start + k) % pcount);
    this.ctx.battlesTurn = {
      order,
      idx: 0,
      passed: Array(pcount).fill(false),
      done: false,
    };
  }

  _initArsonTurn(){
    const P = this.ctx.settings.players.length;
    const start = this.ctx.round_status.marshal_index;
    const order = Array.from({length:P}, (_,k)=> (start + k) % P);
    this.ctx.arsonTurn = {
      order,
      idx: 0,
      passed: Array(P).fill(false),   
      done: false
    };
  }

  _initActionsTurn() {
    const pcount = this.ctx.settings.players.length;
    const start = this.ctx.round_status.marshal_index;

    const order = Array.from({ length: pcount }, (_, k) => (start + k) % pcount);
    this.ctx.turn = {
      phase: "actions",
      order,
      idx: 0,            // wskaźnik w 'order'
      pass: 1,           // aktualna kolejka (1 albo 2)
      counts: Array(pcount).fill(0), // wykonane akcje per gracz
      done: false,
    };
  }


  // Mark round finished and move to the next one or to GAME_OVER.
  endRoundOrGame() {
    const rs = this.ctx.round_status;
    if (rs.current_round < rs.total_rounds) {
      rs.current_round += 1;
      rs.marshal_index = (rs.marshal_index + 1) % this.ctx.settings.players.length;
      this._startRound();
      return { state: this.state, round: rs.current_round };
    } else {
      this.state = StateID.GAME_OVER;
      return { state: this.state };
    }
  }

  // Compute scoring and return a report (also keeps scores on players).
  computeScores() { return computeFinalScores(this.ctx); }

  // ------------ Introspection helpers ------------
  getPublicState() { 
    const phase = this.round?.currentPhaseId() ?? null;
    const activeActionIdx =
      (phase === "actions" && this.ctx.turn && !this.ctx.turn.done)
        ? this.ctx.turn.order[this.ctx.turn.idx]
        : null;
  
    const activeAttackIdx =
      (phase === "attacks" && this.ctx.attackTurn && !this.ctx.attackTurn.done)
        ? this.ctx.attackTurn.order[this.ctx.attackTurn.idx]
        : null;

    const activeBattleIdx =
      (phase === "battles" && this.ctx.battlesTurn && !this.ctx.battlesTurn.done)
        ? this.ctx.battlesTurn.order[this.ctx.battlesTurn.idx]
        : null;

    const activeArsonIdx =
      (phase === "arson" && this.ctx.arsonTurn && !this.ctx.arsonTurn.done)
        ? this.ctx.arsonTurn.order[this.ctx.arsonTurn.idx]
        : null;
    
    return deepClone({
      state: this.state,
      settings: {
        players: this.ctx.settings.players.map((p) => ({
          name: p.name, score: p.score, gold: p.gold, honor: p.honor, majority: p.majority, last_bid: p.last_bid
        })),
        max_rounds: this.ctx.settings.max_rounds,
        reset_gold_each_round: this.ctx.settings.reset_gold_each_round, 
      },
      round_status: deepClone(this.ctx.round_status),
      provinces: deepClone(this.ctx.provinces),
      raid_tracks: { N: this.ctx.raid_tracks.N.value, S: this.ctx.raid_tracks.S.value, E: this.ctx.raid_tracks.E.value },
      troops: deepClone(this.ctx.troops.per_province),
      troops_kind: deepClone(this.ctx.troops_kind.per_province),
      nobles: deepClone(this.ctx.nobles.per_province),
      current_phase: this.round?.currentPhaseId() ?? null,
      marshal: this.ctx.settings.players[this.ctx.round_status.marshal_index]?.name ?? null,
      
      active_player_index: activeActionIdx,
      active_player: activeActionIdx != null ? this.ctx.settings.players[activeActionIdx].name : null,
      actions_turn: this.ctx.turn ? deepClone(this.ctx.turn) : null,

      active_attacker_index: activeAttackIdx,
      active_attacker: activeAttackIdx != null ? this.ctx.settings.players[activeAttackIdx].name : null,
      attacks_turn: this.ctx.attackTurn ? deepClone(this.ctx.attackTurn) : null,

      active_battler_index: activeBattleIdx,
      active_battler: activeBattleIdx != null ? this.ctx.settings.players[activeBattleIdx].name : null,
      battles_turn: this.ctx.battlesTurn ? deepClone(this.ctx.battlesTurn) : null,

      active_arson_index: activeArsonIdx,
      active_arson: activeArsonIdx != null ? this.ctx.settings.players[activeArsonIdx].name : null,
      arson_turn: this.ctx.arsonTurn ? deepClone(this.ctx.arsonTurn) : null,

      });
  }
}

export default ConsoleGame;

