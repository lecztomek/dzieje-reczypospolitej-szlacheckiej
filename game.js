// Console Game Skeleton (State Machine) — JavaScript module API (ESM)
// Port of the provided Python version, redesigned to be fully programmatic (no prompts).
// Usage example (Node / bundler):
//   import { ConsoleGame, StateID, ProvinceID, RaidTrackID } from "./console-game-fsm-module.js";
//   const game = new ConsoleGame();
//   game.startGame({ players: ["Ala", "Olek"], startingGold: 6, maxRounds: 3 });
//   // drive phases by calling game.events.apply(5), game.income.collect(), ... then game.round.nextPhase(), etc.

// ---------------- Enums / IDs ----------------
export const StateID = Object.freeze({ START_MENU: 1, GAMEPLAY: 2, GAME_OVER: 3 });

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
  }
}

class GameContext {
  constructor() {
    this.settings = { players: [], max_rounds: 3 };
    this.round_status = new RoundStatus(3, 0);
    this.last_output = ""; // optional log aggregator
    this.turn = null;
    this.attackTurn = null; 
    
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
      2: () => { log.push("[Wydarzenia] Elekcja viritim — zwycięzca sejmu w tej rundzie ciągnie 2 ustawy i wybiera 1."); },
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
      log.push("[Sejm] Podatek.");
      if (ch === 'A') { c.settings.players.forEach((p) => p.gold += 2); log.push("Każdy +2 zł."); }
      else { c.settings.players.forEach((p) => p.gold += 1); majority.gold += 3; log.push(`${majority.name} łącznie +4 zł, pozostali +1 zł.`); }
      return log;
    }

    if (law === 3 || law === 4) {
      log.push("[Sejm] Pospolite ruszenie.");
      if (ch === 'A') {
        // extra: array of { playerIndex, provinceId }
        const picks = Array.isArray(extra) ? extra : [];
        picks.forEach(({ playerIndex, provinceId }) => {
          ensurePerProvinceArrays(c);
          const arr = influenceWinnersInProvince(c, provinceId);
          if (arr.length === 1 && arr[0] === playerIndex) {
            c.troops.per_province[provinceId][playerIndex] += 1;
            log.push(`  ${c.settings.players[playerIndex].name}: +1 jednostka w ${provinceId}`);
          }
        });
        return log;
      } else {
        // ch B: need a track id in extra e.g. { track: RaidTrackID.N|E|S }
        const rid = extra?.track; if (!rid) throw new Error("Missing track for law 3/4 variant B");
        addRaid(c, rid, -2); log.push(`Tor ${rid} −2.`); return log;
      }
    }

    if (law === 5) {
      log.push("[Sejm] Fortyfikacje: połóż fort w kontrolowanej prowincji.");
      // extra: array of { playerIndex, provinceId }
      const picks = Array.isArray(extra) ? extra : [];
      picks.forEach(({ playerIndex, provinceId }) => {
        ensurePerProvinceArrays(c);
        const winners = influenceWinnersInProvince(c, provinceId);
        if (winners.length === 1 && winners[0] === playerIndex && !c.provinces[provinceId].has_fort) {
          toggleFort(c, provinceId, true);
          log.push(`  ${c.settings.players[playerIndex].name}: fort w ${provinceId}`);
        }
      });
      return log;
    }

    if (law === 6) {
      log.push("[Sejm] Pokój.");
      if (ch === 'A') { addRaid(c, RaidTrackID.N, -1); addRaid(c, RaidTrackID.E, -1); addRaid(c, RaidTrackID.S, -1); log.push("Wszystkie tory −1."); }
      else { const rid = extra?.track; if (!rid) throw new Error("Missing track for law 6B"); addRaid(c, rid, -2); log.push(`Tor ${rid} −2.`); }
      return log;
    }
    return log;
  }
}

class ActionAPI {
  static COST = { wplyw: 2, posiadlosc: 2, rekrutacja: 2, marsz: 0, zamoznosc: 2, administracja: 0 };
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

  rekrutacja(playerIndex, provinceId) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); const p = c.settings.players[pidx];
    if (!this.#hasNoble(provinceId, pidx)) throw new Error("Musisz mieć szlachcica w tej prowincji.");
    const base = ActionAPI.COST.rekrutacja;
    const actual = c.round_status.recruit_cost_override != null ? c.round_status.recruit_cost_override : base;
    if (p.gold < actual) throw new Error(`Za mało złota. Koszt=${actual}, masz ${p.gold}.`);
    ensurePerProvinceArrays(c); c.troops.per_province[provinceId][pidx] += 1; p.gold -= actual; 
    
    this.#advanceAfterAction(playerIndex);
    return `${p.name} rekrutuje 1 jednostkę w ${provinceId}. (koszt ${actual}, złoto=${p.gold})`;
  }

  marsz(playerIndex, fromPid, toPid, amount = 1) {
    this.#requireActive(playerIndex);
    const c = this.ctx; const pidx = this.#pidx(playerIndex); ensurePerProvinceArrays(c);
    if (!this.#hasNoble(fromPid, pidx) || !this.#hasNoble(toPid, pidx)) throw new Error("Marsz tylko między prowincjami, gdzie masz szlachciców na obu.");
    const fromArr = c.troops.per_province[fromPid]; const toArr = c.troops.per_province[toPid];
    const amt = Math.max(1, Number(amount) | 0);
    if ((fromArr[pidx] | 0) < amt) throw new Error("Brak jednostek do przesunięcia.");
    fromArr[pidx] -= amt; toArr[pidx] += amt; 
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

class PlayerBattleAPI {
  constructor(ctx) { this.ctx = ctx; }
  // Resolve a single duel on province `pid` between players i and j given explicit dice arrays.
  resolveDuel(pid, i, j, rollsI, rollsJ) {
    ensurePerProvinceArrays(this.ctx);
    const troops = this.ctx.troops.per_province[pid];
    const pi = this.ctx.settings.players[i]; const pj = this.ctx.settings.players[j];
    const unitsI = troops[i] | 0; const unitsJ = troops[j] | 0;
    if (unitsI <= 0 || unitsJ <= 0) return "(Potyczka pominięta — brak jednostek)";
    if (!Array.isArray(rollsI) || rollsI.length !== unitsI) throw new Error(`rollsI must have length ${unitsI}`);
    if (!Array.isArray(rollsJ) || rollsJ.length !== unitsJ) throw new Error(`rollsJ must have length ${unitsJ}`);
    const kills = (arr) => arr.reduce((s, r) => s + (r >= 5 ? 1 : 0), 0);
    const killsI = kills(rollsI); const killsJ = kills(rollsJ);
    const lossI = Math.min(killsJ, unitsI); const lossJ = Math.min(killsI, unitsJ);
    troops[i] = Math.max(0, troops[i] - lossI); troops[j] = Math.max(0, troops[j] - lossJ);
    return `${pi.name} zadał ${lossJ} strat; ${pj.name} zadał ${lossI}. Stan: ${pi.name}=${troops[i]}, ${pj.name}=${troops[j]}.`;
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
  // NEW:
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
  // NEW:
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
  // NEW:
  #advance(turnWasAttack) {
    const t = this.ctx.attackTurn;
    // po udanym "attack" nie oznaczamy passa — tylko zmieniamy indeks
    // po "pass" oznaczamy passed[current]=true
    const n = t.order.length;

    // koniec, jeśli wszyscy passed ALBO nie ma już sensownych ataków
    const allPassed = t.passed.every(Boolean);
    if (allPassed || !this.#anyEligibleAttacksLeft()) {
      t.done = true; return;
    }

    // znajdź następnego, który nie spassował
    for (let step = 1; step <= n; step++) {
      const nextIdx = (t.idx + step) % n;
      const pidx = t.order[nextIdx];
      if (!t.passed[pidx]) { t.idx = nextIdx; break; }
    }
  }

  attack({ playerIndex, enemy, from, rolls }) {
    this.#requireActive(playerIndex);
    const c = this.ctx; ensurePerProvinceArrays(c);
    const pidx = Number(playerIndex) | 0; const pl = c.settings.players[pidx];
    const allowed = { [RaidTrackID.N]: new Set([ProvinceID.PRUSY, ProvinceID.LITWA]), [RaidTrackID.E]: new Set([ProvinceID.LITWA, ProvinceID.UKRAINA]), [RaidTrackID.S]: new Set([ProvinceID.MALOPOLSKA, ProvinceID.UKRAINA]) };
    const srcOk = allowed[enemy]?.has(from); if (!srcOk) throw new Error("Z tej prowincji nie można atakować wybranego najeźdźcy.");
    if ((c.troops.per_province[from][pidx] | 0) <= 0) throw new Error("Brak jednostek na prowincji źródłowej.");
    if ( (enemy === RaidTrackID.N ? c.raid_tracks.N.value : enemy === RaidTrackID.S ? c.raid_tracks.S.value : c.raid_tracks.E.value) <= 0 ) throw new Error("Tor już = 0 — brak celu.");

    let rollsCount = c.troops.per_province[from][pidx];
    if (c.round_status.artillery_defense_active && !c.round_status.artillery_defense_used[pidx]) { rollsCount += 1; c.round_status.artillery_defense_used[pidx] = true; }

    const seq = Array.isArray(rolls) ? rolls.slice(0, rollsCount) : [];
    const key = enemy === RaidTrackID.N ? 'N' : enemy === RaidTrackID.S ? 'S' : 'E';
    const track = c.raid_tracks[key];
    const out = [];
    for (let i = 0; i < seq.length; i++) {
      if (track.value <= 0) { out.push("Tor już 0 — koniec akcji."); break; }
      const r = seq[i] | 0; if (!(r >= 1 && r <= 6)) throw new Error("Rzuty muszą być 1..6");
      if (r === 1) { c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1); pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1; out.push("1 → porażka, tracisz 1 jednostkę."); }
      else if (r <= 5) { addRaid(c, enemy, -1); c.troops.per_province[from][pidx] = Math.max(0, c.troops.per_province[from][pidx] - 1); pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1; out.push("2–5 → sukces: tor -1 i tracisz 1 jednostkę."); }
      else { addRaid(c, enemy, -1); pl.honor += 1; if (enemy === RaidTrackID.S && c.round_status.extra_honor_vs_tatars) pl.honor += 1; out.push("6 → sukces: tor -1 i jednostka pozostaje."); }
    }
    out.push(`Po ataku: ${track.id}=${track.value}, ${from}: jednostek=${c.troops.per_province[from][pidx]}`);

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

// ---------------- Scoring ----------------
function computeFinalScores(ctx) {
  const players = ctx.settings.players; const pcount = players.length;
  players.forEach((p) => p.score = 0);
  // (1) most estates
  const estatesTotal = Array(pcount).fill(0);
  for (const prov of Object.values(ctx.provinces)) for (const owner of prov.estates) if (owner >= 0 && owner < pcount) estatesTotal[owner] += 1;
  const maxEst = estatesTotal.length ? Math.max(...estatesTotal) : 0;
  const estateWinners = estatesTotal.map((v, i) => [v, i]).filter(([v]) => v === maxEst && maxEst > 0).map(([, i]) => i);
  estateWinners.forEach((i) => players[i].score += 1);

  // (2) province influence points (only if single winner)
  const influenceLines = [];
  for (const pid of Object.values(ProvinceID)) {
    const winners = influenceWinnersInProvince(ctx, pid);
    if (!winners.length) { influenceLines.push(`${pid}: brak wpływu`); continue; }
    if (winners.length === 1) { const w = winners[0]; players[w].score += 1; influenceLines.push(`${pid}: ${players[w].name}`); }
    else influenceLines.push(`${pid}: remis – nikt`);
  }

  // (3) honor
  players.forEach((p) => p.score += p.honor);
  // (4) gold → points per 3
  players.forEach((p) => p.score += Math.floor(p.gold / 3));

  const lines = [];
  lines.push("[Punktacja końcowa]");
  lines.push("Posiadłości (łącznie): " + players.map((p, i) => `${p.name}=${estatesTotal[i]}`).join(", "));
  lines.push(estateWinners.length ? ("Najwięcej posiadłości: " + estateWinners.map((i) => players[i].name).join(", ") + " (+1)") : "Najwięcej posiadłości: nikt (brak posiadłości)");
  lines.push("Wpływy z prowincji:"); influenceLines.forEach((s) => lines.push("  • " + s));
  lines.push("Honor: " + players.map((p) => `${p.name}=+${p.honor}`).join(", "));
  lines.push("Złoto→pkt: " + players.map((p) => `${p.name}=+${Math.floor(p.gold/3)} (z ${p.gold} zł)`).join(", "));
  return lines.join("\n");
}

// ---------------- Round + Game orchestration (programmatic) ----------------
class RoundEngine {
  constructor(ctx) { this.ctx = ctx; this.phaseIndex = 0; this.phases = [
    "events", "income", "auction", "sejm", "actions", "battles", "reinforcements", "attacks", "devastation"
  ]; }
  currentPhaseId() { return this.phases[this.phaseIndex] ?? null; }
  nextPhase() { this.phaseIndex = Math.min(this.phaseIndex + 1, this.phases.length); return this.currentPhaseId(); }
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

    this.round = null; // RoundEngine
  }

  // ------------ Lifecycle ------------
  startGame({ players = [], startingGold = 6, maxRounds = 3 } = {}) {
    if (!players.length) players = ["Player1"]; // default
    this.ctx.settings.players = players.map((name) => new Player(String(name), startingGold | 0));
    this.ctx.settings.max_rounds = Math.max(1, maxRounds | 0 || 1);
    this.ctx.round_status = new RoundStatus(this.ctx.settings.max_rounds, this.ctx.settings.players.length);

    // init boards
    ensurePerProvinceArrays(this.ctx);

    this.state = StateID.GAMEPLAY;
    this._startRound();
    return this.getPublicState();
  }

  _startRound() {
    const rs = this.ctx.round_status;
    // reset per-round modifiers
    rs.sejm_canceled = false; rs.admin_yield = 2; rs.prusy_estate_income_penalty = 0; rs.discount_litwa_wplyw_pos = 0;
    rs.extra_honor_vs_tatars = false; rs.recruit_cost_override = null; rs.zamoznosc_cost_override = null; rs.fairs_plus_one_income = false;
    rs.artillery_defense_active = false; rs.artillery_defense_used = Array(this.ctx.settings.players.length).fill(false);
    rs.sejm_tiebreak_wlkp = false; rs.wlkp_influence_cost_override = null; rs.wlkp_estate_cost_override = null; rs.last_law = null; rs.last_law_choice = null;
    this.ctx.turn = null;
    this.auction.resetForRound();
    this.round = new RoundEngine(this.ctx);
  }

  finishPhaseAndAdvance() {
    // zapamiętaj poprzednią fazę
    const prev = this.round.currentPhaseId();
    // przejdź do kolejnej
    const next = this.round.nextPhase();

    // NEW: gdy wchodzimy w "actions" – zainicjalizuj kolejkę 2× po 1 akcji
    if (next === "actions") this._initActionsTurn();

    // NEW: gdy wychodzimy z "actions" – wyczyść wskaźniki tury
    if (prev === "actions" && next !== "actions") this.ctx.turn = null;

    if (next === "attacks") this._initAttacksTurn();
    // NEW: porządki po fazie ataków
    if (prev === "attacks" && next !== "attacks") this.ctx.attackTurn = null;

    return this.currentPhaseId?.() ?? next;
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

  // NEW: inicjalizacja tury akcji – kolejność od marszałka, każdy ma wykonać 2 akcje
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

    return deepClone({
      state: this.state,
      settings: {
        players: this.ctx.settings.players.map((p) => ({
          name: p.name, score: p.score, gold: p.gold, honor: p.honor, majority: p.majority, last_bid: p.last_bid
        })),
      max_rounds: this.ctx.settings.max_rounds,
      },
      round_status: deepClone(this.ctx.round_status),
      provinces: deepClone(this.ctx.provinces),
      raid_tracks: { N: this.ctx.raid_tracks.N.value, S: this.ctx.raid_tracks.S.value, E: this.ctx.raid_tracks.E.value },
      troops: deepClone(this.ctx.troops.per_province),
      nobles: deepClone(this.ctx.nobles.per_province),
      current_phase: this.round?.currentPhaseId() ?? null,
      marshal: this.ctx.settings.players[this.ctx.round_status.marshal_index]?.name ?? null,

      // NEW:
      active_player_index: activeIdx,
      active_player: activeIdx != null ? this.ctx.settings.players[activeIdx].name : null,
      actions_turn: this.ctx.turn ? deepClone(this.ctx.turn) : null,

      active_attacker_index: activeAttackIdx,
      active_attacker: activeAttackIdx != null ? this.ctx.settings.players[activeAttackIdx].name : null,
      attacks_turn: this.ctx.attackTurn ? deepClone(this.ctx.attackTurn) : null,
      });
  }
}

export default ConsoleGame;

