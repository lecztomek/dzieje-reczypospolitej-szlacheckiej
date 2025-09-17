"""
Console Game Skeleton (State Machine)
-------------------------------------

This is a minimal yet extensible skeleton for a console (terminal) game in Python
built around a finite state machine (FSM). The structure supports:
  • Start menu with settings
  • Multiple players with stats (gold, honor)
  • Rotating Marshal (Marszałek) each round
  • Auction & Sejm phases
  • Multiple rounds
  • Each round consists of multiple phases
  • Each phase accepts input, mutates game state, and emits output

How to run:
  $ python console_game_state_machine.py

"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import List, Optional, Dict, Any
import random
import sys

# --------------- Core Data Models --------------- #

class StateID(Enum):
    START_MENU = auto()
    GAMEPLAY = auto()
    GAME_OVER = auto()

class ProvinceID(Enum):
    PRUSY = "Prusy"
    LITWA = "Litwa"
    UKRAINA = "Ukraina"
    WIELKOPOLSKA = "Wielkopolska"
    MALOPOLSKA = "Małopolska"

class RaidTrackID(Enum):
    N = "Szwecja"
    S = "Tatarzy"
    E = "Moskwa"

@dataclass
class RaidTrack:
    id: RaidTrackID
    value: int = 0  # licznik najazdu (startowo 0)

@dataclass
class Player:
    name: str
    score: int = 0
    gold: int = 0
    honor: int = 0
    majority: bool = False  # większość w sejmie w tej rundzie
    last_bid: int = 0       # ostatnia oferta z licytacji


@dataclass
class Settings:
    players: List[Player] = field(default_factory=list)
    max_rounds: int = 3


@dataclass
class RoundStatus:
    current_round: int = 1
    total_rounds: int = 3
    marshal_index: int = 0  # kto jest marszałkiem
    last_law: Optional[int] = None  # numer ustawy wybranej w sejmie (1..10)

@dataclass
class Province:
    id: ProvinceID
    has_fort: bool = False
    # 5 slotów posiadłości; -1 oznacza brak, a liczba to indeks gracza (0..N-1)
    estates: List[int] = field(default_factory=lambda: [-1] * 5)
    wealth: int = 2  # zamożność prowincji (0–3)


@dataclass
class TroopBoard:
    # Dla każdej prowincji trzymamy listę [units_gracza0, units_gracza1, ...]
    per_province: Dict[ProvinceID, List[int]] = field(default_factory=dict)

@dataclass
class NoblesBoard:
    # Dla każdej prowincji trzymamy listę [nobles_gracza0, nobles_gracza1, ...]
    per_province: Dict[ProvinceID, List[int]] = field(default_factory=dict)

@dataclass
class GameContext:
    settings: Settings = field(default_factory=Settings)
    round_status: RoundStatus = field(default_factory=RoundStatus)
    rng: random.Random = field(default_factory=random.Random)
    last_output: str = ""
    provinces: Dict[ProvinceID, Province] = field(default_factory=lambda: {
        ProvinceID.PRUSY: Province(ProvinceID.PRUSY),
        ProvinceID.LITWA: Province(ProvinceID.LITWA),
        ProvinceID.UKRAINA: Province(ProvinceID.UKRAINA),
        ProvinceID.WIELKOPOLSKA: Province(ProvinceID.WIELKOPOLSKA),
        ProvinceID.MALOPOLSKA: Province(ProvinceID.MALOPOLSKA),
    })
    raid_tracks: Dict[RaidTrackID, RaidTrack] = field(default_factory=lambda: {
        RaidTrackID.N: RaidTrack(RaidTrackID.N, 0),
        RaidTrackID.S: RaidTrack(RaidTrackID.S, 0),
        RaidTrackID.E: RaidTrack(RaidTrackID.E, 0),
    })
    troops: TroopBoard = field(default_factory=TroopBoard)
    nobles: NoblesBoard = field(default_factory=NoblesBoard)

# --------------- Helpers --------------- #

def prompt(text: str) -> str:
    try:
        return input(text)
    except EOFError:
        return ""


def println(*args: Any) -> None:
    print(*args)

def show_player_stats(ctx: GameContext):
    println("--- Player Stats ---")
    for p in ctx.settings.players:
        tag = " (MAJORITY)" if p.majority else ""
        println(f"{p.name}: Score={p.score}, Gold={p.gold}, Honor={p.honor}{tag}")
    println(f"Marshal: {ctx.settings.players[ctx.round_status.marshal_index].name}")
    if ctx.round_status.last_law is not None:
        println(f"Last law: {ctx.round_status.last_law}")
    
    println("\nProvinces:")
    idx2name = {i: pl.name for i, pl in enumerate(ctx.settings.players)}
    for pid, prov in ctx.provinces.items():
        println(f"  {pid.value}:")
        something_printed = False

        # Fort (tylko jeśli istnieje)
        if prov.has_fort:
            println("    Fort: TAK")
            something_printed = True

        # Wojsko (tylko jeśli ktokolwiek ma >0)
        troops_arr = ctx.troops.per_province.get(pid, [])
        if troops_arr and sum(troops_arr) > 0:
            println("    Wojsko:")
            for i, player in enumerate(ctx.settings.players):
                units = troops_arr[i] if i < len(troops_arr) else 0
                if units > 0:
                    println(f"      - {player.name}: {units}")
            something_printed = True

        # Posiadłości (tylko jeśli jakakolwiek zajęta)
        if any(v != -1 for v in prov.estates):
            estates_str = "[" + ",".join((idx2name[v] if v != -1 else "-") for v in prov.estates) + "]"
            println(f"    Posiadłości: {estates_str}")
            something_printed = True

        # Zamożność (tylko jeśli > 0)
        if prov.wealth > 0:
            println(f"    Zamożność: {prov.wealth}")
            something_printed = True

        # Szlachcice (tylko jeśli ktokolwiek ma >0)
        nobles_arr = ctx.nobles.per_province.get(pid, [])
        if nobles_arr and sum(nobles_arr) > 0:
            println("    Szlachcice:")
            for i, player in enumerate(ctx.settings.players):
                nobles = nobles_arr[i] if i < len(nobles_arr) else 0
                if nobles > 0:
                    println(f"      - {player.name}: {nobles}")
            something_printed = True

        if not something_printed:
            println("    (brak)")

    # Tory najazdów
    println("Raid Tracks:")
    for rid, track in ctx.raid_tracks.items():
        println(f"  {rid.value}: {track.value}")   

    println("--------------------")

def set_province_wealth(ctx: GameContext, province_id: ProvinceID, value: int) -> int:
    """Ustawia zamożność prowincji (0–3)."""
    prov = ctx.provinces[province_id]
    prov.wealth = max(0, min(3, int(value)))
    return prov.wealth

def add_province_wealth(ctx: GameContext, province_id: ProvinceID, delta: int) -> int:
    """Dodaje (lub odejmuje) zamożność w zakresie 0–3."""
    prov = ctx.provinces[province_id]
    prov.wealth = max(0, min(3, prov.wealth + int(delta)))
    return prov.wealth

def set_raid(ctx: GameContext, track_id: RaidTrackID, value: int) -> int:
    """Ustawia konkretną wartość toru najazdu. Zwraca nową wartość."""
    ctx.raid_tracks[track_id].value = int(value)
    return ctx.raid_tracks[track_id].value

def add_raid(ctx: GameContext, track_id: RaidTrackID, delta: int) -> int:
    """Dodaje (może być ujemne) do licznika toru. Zwraca nową wartość."""
    t = ctx.raid_tracks[track_id]
    t.value += int(delta)
    return t.value

def build_estate(ctx: GameContext, province_id: ProvinceID, player_index: int) -> bool:
    """
    Zajmuje pierwsze wolne (=-1) miejsce w liście posiadłości danej prowincji.
    Zwraca True, jeśli się udało; False, gdy brak wolnych slotów.
    """
    prov = ctx.provinces[province_id]
    for i, v in enumerate(prov.estates):
        if v == -1:
            prov.estates[i] = player_index
            return True
    return False

def remove_last_estate(ctx: GameContext, province_id: ProvinceID, player_index: int) -> bool:
    """
    Usuwa najpóźniej postawioną posiadłość danego gracza (czyli od końca listy).
    Zwraca True, jeśli coś usunięto.
    """
    prov = ctx.provinces[province_id]
    for i in range(len(prov.estates)-1, -1, -1):
        if prov.estates[i] == player_index:
            prov.estates[i] = -1
            return True
    return False

def toggle_fort(ctx: GameContext, province_id: ProvinceID, value: Optional[bool] = None) -> bool:
    """
    Ustawia/flipuje fort w prowincji. Jeśli value jest None, to flip (NOT).
    Zwraca bieżący stan fortu po operacji.
    """
    prov = ctx.provinces[province_id]
    prov.has_fort = (not prov.has_fort) if value is None else bool(value)
    return prov.has_fort

def destroy_last_estate_any(ctx: GameContext, province_id: ProvinceID) -> Optional[int]:
    """
    Usuwa 'ostatnio zbudowaną' posiadłość w prowincji, niezależnie od właściciela.
    Interpretujemy to jako ostatni zajęty slot od końca listy.
    Zwraca indeks gracza, któremu zniszczono posiadłość, albo None gdy brak.
    """
    prov = ctx.provinces[province_id]
    for i in range(len(prov.estates) - 1, -1, -1):
        if prov.estates[i] != -1:
            owner = prov.estates[i]
            prov.estates[i] = -1
            return owner
    return None


def plunder_province(ctx: GameContext, province_id: ProvinceID) -> str:
    """
    Spustoszenie prowincji:
      - Jeśli jest fort: niszczymy fort.
      - W przeciwnym razie niszczymy ostatnio zbudowaną posiadłość (jeśli jest).
      - Zamożność zawsze spada o 1 (do min 0).
    Zwraca opis tekstowy tego, co się stało.
    """
    prov = ctx.provinces[province_id]
    msgs = [f"[Spustoszenie] {province_id.value}: "]

    if prov.has_fort:
        prov.has_fort = False
        msgs.append("zniszczono fort; ")
    else:
        owner = destroy_last_estate_any(ctx, province_id)
        if owner is not None:
            owner_name = ctx.settings.players[owner].name if 0 <= owner < len(ctx.settings.players) else "?"
            msgs.append(f"zniszczono posiadłość gracza {owner_name}; ")
        else:
            msgs.append("brak fortu i posiadłości do zniszczenia; ")

    before = prov.wealth
    prov.wealth = max(0, prov.wealth - 1)
    msgs.append(f"zamożność {before}→{prov.wealth}.")
    return "".join(msgs)

def set_units(ctx: GameContext, province_id: ProvinceID, player_index: int, value: int) -> int:
    """Ustaw dokładną liczbę jednostek gracza na prowincji (nieujemną). Zwraca nową wartość."""
    arr = ctx.troops.per_province[province_id]
    arr[player_index] = max(0, int(value))
    return arr[player_index]

def add_units(ctx: GameContext, province_id: ProvinceID, player_index: int, delta: int) -> int:
    """Dodaj/odejmij jednostki (może być ujemne). Zwraca nową wartość (nie spadnie poniżej 0)."""
    arr = ctx.troops.per_province[province_id]
    arr[player_index] = max(0, arr[player_index] + int(delta))
    return arr[player_index]

def move_units(ctx: GameContext, from_pid: ProvinceID, to_pid: ProvinceID, player_index: int, amount: int) -> bool:
    """Przenieś amount jednostek między prowincjami dla danego gracza. Zwraca True, jeśli się udało."""
    amount = int(amount)
    if amount <= 0:
        return False
    from_arr = ctx.troops.per_province[from_pid]
    to_arr = ctx.troops.per_province[to_pid]
    if from_arr[player_index] < amount:
        return False
    from_arr[player_index] -= amount
    to_arr[player_index] += amount
    return True

def total_units_on(ctx: GameContext, province_id: ProvinceID) -> int:
    """Suma wszystkich jednostek (wszyscy gracze) na danej prowincji."""
    return sum(ctx.troops.per_province[province_id])

def set_nobles(ctx: GameContext, province_id: ProvinceID, player_index: int, value: int) -> int:
    """Ustaw dokładną liczbę szlachciców gracza na prowincji (nieujemną). Zwraca nową wartość."""
    arr = ctx.nobles.per_province[province_id]
    arr[player_index] = max(0, int(value))
    return arr[player_index]

def add_nobles(ctx: GameContext, province_id: ProvinceID, player_index: int, delta: int) -> int:
    """Dodaj/odejmij szlachciców (może być ujemne). Zwraca nową wartość (nie spadnie poniżej 0)."""
    arr = ctx.nobles.per_province[province_id]
    arr[player_index] = max(0, arr[player_index] + int(delta))
    return arr[player_index]

def move_nobles(ctx: GameContext, from_pid: ProvinceID, to_pid: ProvinceID, player_index: int, amount: int) -> bool:
    """Przenieś amount szlachciców między prowincjami dla danego gracza. Zwraca True, jeśli się udało."""
    amount = int(amount)
    if amount <= 0:
        return False
    from_arr = ctx.nobles.per_province[from_pid]
    to_arr = ctx.nobles.per_province[to_pid]
    if from_arr[player_index] < amount:
        return False
    from_arr[player_index] -= amount
    to_arr[player_index] += amount
    return True

def total_nobles_on(ctx: GameContext, province_id: ProvinceID) -> int:
    """Suma wszystkich szlachciców (wszyscy gracze) na danej prowincji."""
    return sum(ctx.nobles.per_province[province_id])

def count_estates_for_player_in_province(ctx: GameContext, province_id: ProvinceID, pidx: int) -> int:
    """Ile slotów posiadłości w danej prowincji należy do gracza pidx."""
    prov = ctx.provinces[province_id]
    return sum(1 for v in prov.estates if v == pidx)

from typing import Tuple

def influence_winners_in_province(ctx: GameContext, province_id: ProvinceID) -> List[int]:
    """
    Zwraca listę indeksów graczy mających kontrolę (wpływ) w danej prowincji.
    Zasada:
      - najwięcej szlachciców wygrywa,
      - remis: jeśli dokładnie jeden z remisujących ma >0 wojsk w tej prowincji, wygrywa on,
      - w przeciwnym razie kontrolę mają wszyscy remisujący.
    """
    players = ctx.settings.players
    pcount = len(players)
    nobles = ctx.nobles.per_province.get(province_id, [0]*pcount)
    troops = ctx.troops.per_province.get(province_id, [0]*pcount)

    max_n = max(nobles) if nobles else 0
    if max_n == 0:
        return []  # nikt nie ma wpływu

    leaders = [i for i, v in enumerate(nobles) if v == max_n]
    if len(leaders) == 1:
        return leaders

    with_troops = [i for i in leaders if troops[i] > 0]
    if len(with_troops) == 1:
        return with_troops

    return leaders  # remis utrzymany — wielu zwycięzców


def estate_income_by_wealth(wealth: int) -> int:
    """
    Dochód z jednej posiadłości w zależności od zamożności prowincji:
      0–1 -> 0; 2 -> 1; 3 -> 2
    """
    w = max(0, min(3, int(wealth)))
    if w <= 1:
        return 0
    if w == 2:
        return 1
    return 2  # w == 3


def compute_final_scores(ctx: GameContext) -> str:
    """
    Zasady:
      1) +1 pkt dla gracza(ów) z największą liczbą posiadłości (suma po całej mapie).
      2) Wpływy z prowincji: +1 pkt TYLKO jeśli jest dokładnie jeden zwycięzca.
         Zwycięża najwięcej szlachciców; remis -> jeśli dokładnie jeden z remisujących ma wojsko w tej prowincji,
         to on wygrywa; w przeciwnym razie (brak rozstrzygnięcia) NIKT nie dostaje punktu.
      3) +punkty honoru (dodajemy p.honor do wyniku).
      4) Za każde 3 złota +1 pkt (floor(gold/3)).
    Zwraca tekstowy raport.
    """
    players = ctx.settings.players
    pcount = len(players)
    # wyzeruj wynik, liczymy od zera
    for p in players:
        p.score = 0

    # (1) NAJWIĘCEJ POSIADŁOŚCI – globalnie
    estates_total = [0] * pcount
    for prov in ctx.provinces.values():
        for owner in prov.estates:
            if 0 <= owner < pcount:
                estates_total[owner] += 1
    max_est = max(estates_total) if estates_total else 0
    estate_winners = [i for i, v in enumerate(estates_total) if v == max_est and max_est > 0]
    for i in estate_winners:
        players[i].score += 1

    # (2) WPŁYWY Z PROWINCJI – punkt tylko przy JEDNYM zwycięzcy
    influence_lines = []
    for pid in ProvinceID:
        winners = influence_winners_in_province(ctx, pid)  # już uwzględnia tie-break wojskiem
        if not winners:
            influence_lines.append(f"{pid.value}: brak wpływu")
            continue
        if len(winners) == 1:
            w = winners[0]
            players[w].score += 1
            influence_lines.append(f"{pid.value}: {players[w].name}")
        else:
            # remis nierozstrzygnięty -> nikt nie dostaje punktu
            influence_lines.append(f"{pid.value}: remis – nikt")

    # (3) HONOR
    for p in players:
        p.score += p.honor

    # (4) ZŁOTO → PUNKTY (co 3 złota)
    gold_pts = [p.gold // 3 for p in players]
    for i, gp in enumerate(gold_pts):
        players[i].score += gp

    # raport
    lines = []
    lines.append("[Punktacja końcowa]")
    lines.append("Posiadłości (łącznie): " + ", ".join(f"{players[i].name}={estates_total[i]}" for i in range(pcount)))
    if estate_winners:
        lines.append("Najwięcej posiadłości: " + ", ".join(players[i].name for i in estate_winners) + " (+1)")
    else:
        lines.append("Najwięcej posiadłości: nikt (brak posiadłości)")

    lines.append("Wpływy z prowincji:")
    for s in influence_lines:
        lines.append("  • " + s)

    lines.append("Honor: " + ", ".join(f"{p.name}=+{p.honor}" for p in players))
    lines.append("Złoto→pkt: " + ", ".join(f"{players[i].name}=+{gold_pts[i]} (z {players[i].gold} zł)" for i in range(pcount)))

    return "\n".join(lines)



# --------------- Phase System --------------- #

class PhaseResult:
    def __init__(self, message: str = "", done: bool = False):
        self.message = message
        self.done = done


class BasePhase:
    name: str = "BasePhase"

    def enter(self, ctx: GameContext) -> None:
        pass

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        # Po każdej fazie pokaż zaktualizowane staty (zostawiamy jak było)
        show_player_stats(ctx)


# --- Phases: #
class IncomePhase(BasePhase):
    name = "IncomePhase"

    def __init__(self) -> None:
        self._ran = False

    def enter(self, ctx: GameContext) -> None:
        println("[Dochód] Pobieranie dochodów: +1 zł za kontrolę prowincji; posiadłości wg zamożności (0–1:0, 2:1, 3:2).")
        println("Uwaga: Wielkopolska daje dochód tylko graczom mającym w niej kontrolę (zarówno +1, jak i z posiadłości).")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""  # sterowanie centralne

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if self._ran:
            return PhaseResult(done=True)
        self._ran = True

        players = ctx.settings.players
        pcount = len(players)
        gained_control = [0]*pcount
        gained_estates = [0]*pcount

        for pid, prov in ctx.provinces.items():
            controllers = influence_winners_in_province(ctx, pid)
            single_controller = controllers[0] if len(controllers) == 1 else None

            # (A) +1 za kontrolę — TYLKO jeśli kontrola jest jednoznaczna (brak remisu)
            if single_controller is not None:
                players[single_controller].gold += 1
                gained_control[single_controller] += 1

            # (B) dochód z posiadłości
            per_estate = estate_income_by_wealth(prov.wealth)
            if per_estate > 0:
                if pid == ProvinceID.WIELKOPOLSKA:
                    # Wielkopolska płaci tylko, gdy jest JEDEN kontrolujący.
                    if single_controller is not None:
                        # tylko posiadłości należące do kontrolującego przynoszą dochód
                        for owner in prov.estates:
                            if owner == single_controller:
                                players[owner].gold += per_estate
                                gained_estates[owner] += per_estate
                    # przy remisie: nic (również z posiadłości)
                else:
                    # inne prowincje płacą posiadłościom niezależnie od wyniku kontroli/remisu
                    for owner in prov.estates:
                        if 0 <= owner < pcount:
                            players[owner].gold += per_estate
                            gained_estates[owner] += per_estate

        # Podsumowanie logu
        for i, p in enumerate(players):
            println(f"[Dochód] {p.name}: +{gained_control[i]} (kontrola) +{gained_estates[i]} (posiadłości) = +{gained_control[i]+gained_estates[i]} zł. (razem złoto: {p.gold})")

        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        super().exit(ctx)  # pokaże aktualne statystyki


class AuctionPhase(BasePhase):
    name = "AuctionPhase"

    def enter(self, ctx: GameContext) -> None:
        # reset większości i ostatnich ofert na początku rundy
        for p in ctx.settings.players:
            p.majority = False
            p.last_bid = 0
        println("[Auction] Każdy gracz wpisuje ofertę w złocie. Najwyższa oferta wygrywa większość.")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        if player:
            return f"{player.name}, podaj ofertę (0..{player.gold}): "
        return ""

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if not player:
            return PhaseResult(done=True)
        raw = (raw or "").strip()
        # walidacja — pytamy dopóki nieprawidłowe
        while True:
            try:
                bid = int(raw)
                if bid < 0 or bid > player.gold:
                    raise ValueError
                break
            except ValueError:
                raw = prompt(f"Nieprawidłowe. {player.name}, wpisz 0..{player.gold}: ")
                continue
        player.last_bid = bid
        return PhaseResult(message=f"{player.name} licytuje {bid} złota.", done=True)

    def exit(self, ctx: GameContext) -> None:
        # wyłonienie zwycięzcy
        bids = [(p.last_bid, idx) for idx, p in enumerate(ctx.settings.players)]
        if not bids:
            return
        bids.sort(reverse=True)  # najwyższa oferta pierwsza
        top_bid, top_idx = bids[0]
        # sprawdź remis
        tie = len(bids) > 1 and bids[1][0] == top_bid
        if top_bid == 0 or tie:
            # brak większości
            for p in ctx.settings.players:
                p.majority = False
            println("[Auction] Remis lub brak ofert > 0 — nikt nie ma większości.")
        else:
            # zwycięzca płaci i ma większość
            winner = ctx.settings.players[top_idx]
            winner.gold -= top_bid
            for p in ctx.settings.players:
                p.majority = (p is winner)
            println(f"[Auction] Większość: {winner.name} (zapłacił {top_bid}).")
        super().exit(ctx)


class SejmPhase(BasePhase):
    name = "SejmPhase"

    def enter(self, ctx: GameContext) -> None:
        println("[Sejm] Gracz z większością wybiera ustawę (1..10).")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        # tylko gracz z większością będzie pytany
        if player and player.majority:
            return f"{player.name}, wybierz numer ustawy (1..10): "
        return ""

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if not player or not player.majority:
            return PhaseResult(done=True)
        raw = (raw or "").strip()
        while True:
            try:
                val = int(raw)
                if 1 <= val <= 10:
                    ctx.round_status.last_law = val
                    return PhaseResult(message=f"[Sejm] {player.name} wybrał ustawę nr {val}.", done=True)
                raise ValueError
            except ValueError:
                raw = prompt("Nieprawidłowe. Wpisz liczbę 1..10: ")

    def exit(self, ctx: GameContext) -> None:
        if ctx.round_status.last_law is None:
            println("[Sejm] Brak większości — żadna ustawa nie przeszła.")
        super().exit(ctx)

class ActionPhase(BasePhase):
    name = "ActionPhase"

    COST_PAID = {
        "wplyw": 2,
        "posiadlosc": 2,
        "rekrutacja": 2,
        "marsz": 0,
        "zamoznosc": 2,
        "administracja": 0,
    }

    def __init__(self) -> None:
        self._ran = False
        # <<< MAPA INICJAŁÓW PROWINCJI >>>
        self._prov_short = {
            "p": ProvinceID.PRUSY,
            "l": ProvinceID.LITWA,
            "u": ProvinceID.UKRAINA,
            "w": ProvinceID.WIELKOPOLSKA,
            "m": ProvinceID.MALOPOLSKA,
        }

    # ====== NOWE HELPERY DLA SKRÓTÓW ======
    @staticmethod
    def _norm(s: str) -> str:
        import unicodedata
        s = (s or "").strip()
        s = unicodedata.normalize("NFKD", s)
        s = "".join(ch for ch in s if not unicodedata.combining(ch))
        return s.lower().strip()

    def _match_action(self, token: str) -> str:
        """Zwraca canonical action id po skrócie/prefiksie."""
        t = self._norm(token)
        if not t:
            return ""
        # jednoznaczne skróty literowe
        letter_map = {
            "w": "wplyw",
            "p": "posiadlosc",
            "r": "rekrutacja",
            "m": "marsz",
            "z": "zamoznosc",
            "a": "administracja",
        }
        if t in letter_map:
            return letter_map[t]

        # pełne/prefiksy nazw
        candidates = {
            "wplyw": ["wplyw", "wpl", "wp", "w"],
            "posiadlosc": ["posiadlosc", "posiadłość", "posiad", "pos", "p"],
            "rekrutacja": ["rekrutacja", "rekr", "rek", "r"],
            "marsz": ["marsz", "mar", "m"],
            "zamoznosc": ["zamoznosc", "zamożność", "zamoz", "z"],
            "administracja": ["administracja", "admin", "adm", "a"],
        }
        for act, keys in candidates.items():
            if any(self._norm(k).startswith(t) or t.startswith(self._norm(k)) for k in keys):
                return act
        return ""

    def _parse_province(self, text: str) -> Optional[ProvinceID]:
        """Akceptuje: pełną nazwę, prefiks lub pojedynczą literę (np. 'P' -> Prusy)."""
        t = self._norm(text)
        if not t:
            return None

        # 1) jednoznaczny skrót literowy (P/L/U/W/M)
        if len(t) == 1 and t in self._prov_short:
            return self._prov_short[t]

        # 2) pełna nazwa lub prefiks (np. 'Lit', 'Prus', 'Malop')
        for pid in ProvinceID:
            name_n = self._norm(pid.value)
            if t == name_n or name_n.startswith(t) or t.startswith(name_n):
                return pid

        # 3) awaryjnie: dopasuj po inicjale, gdyby nie było w mapie
        if len(t) == 1:
            for pid in ProvinceID:
                if self._norm(pid.value)[0] == t:
                    return pid

        return None

    # ====== RESZTA KLASY BEZ ZMIAN... (pokazuję tylko fragmenty, które trzeba podmienić) ======

    def _prompt_action(self, player: Player) -> tuple[str, str]:
        """Zwraca (action, args_str). Obsługuje skróty typu 'w L' lub 'm L->P'."""
        println(f"[Akcje] Tura gracza {player.name} (złoto={player.gold}).")
        raw = (prompt("Podaj akcję: ").strip() or "")

        if not raw:
            return "", ""

        # Pierwszy token = akcja (skrót lub pełna nazwa); reszta to argumenty (np. prowincja)
        parts = raw.split(maxsplit=1)
        action_token = parts[0]
        args = parts[1] if len(parts) > 1 else ""

        action = self._match_action(action_token)
        if not action:
            return "", ""

        # Jeżeli nie podano argumentów, dopytaj (zgodnie z typem akcji)
        if not args:
            if action == "marsz":
                args = prompt("Z (np. L->P lub Litwa->Prusy): ")
            elif action in ("wplyw", "posiadlosc", "rekrutacja", "zamoznosc"):
                args = prompt("Prowincja: ")
            else:
                args = ""

        # Normalizacja skrótu marszu: L->P itd. rozwiążemy później w _one_action_turn
        return action, args

    def enter(self, ctx: GameContext) -> None:
        println("[Akcje] Dwie kolejki akcji. Kolejność: od marszałka, po 1 akcji na kolejkę.")
        println("Dostępne: Wplyw(2), Posiadlosc(2), Rekrutacja(2), Marsz(0), Zamoznosc(2), Administracja(0)")
        println("Przykłady:")
        println("  wplyw Litwa")
        println("  posiadlosc Prusy")
        println("  rekrutacja Ukraina")
        println("  marsz Litwa->Prusy")
        println("  zamoznosc Malopolska")
        println("  administracja")

    # RoundEngine i tak woła ask/handle per gracz, ale my sterujemy całą fazą wewnętrznie,
    # więc ask nic nie pyta (unikamy podwójnych promptów).
    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        # Uruchom pełną fazę tylko przy pierwszym wywołaniu
        if self._ran:
            return PhaseResult(done=True)
        self._ran = True

        players = ctx.settings.players
        m = ctx.round_status.marshal_index
        order = players[m:] + players[:m]

        # Dwie kolejki: w każdej każdy gracz wykona dokładnie jedną akcję
        for pass_no in (1, 2):
            println(f"[Akcje] --- Kolejka {pass_no}/2 ---")
            for pl in order:
                self._one_action_turn(ctx, pl)

        return PhaseResult(done=True)

    # ---------- Helpers ----------

    def _player_index(self, ctx: GameContext, player: Player) -> int:
        return ctx.settings.players.index(player)

    def _has_noble(self, ctx: GameContext, pid: ProvinceID, pidx: int) -> bool:
        return ctx.nobles.per_province[pid][pidx] > 0

    def _one_action_turn(self, ctx: GameContext, player: Player) -> None:
        # pętla do skutku: jedna poprawnie wykonana akcja
        while True:
            action, args = self._prompt_action(player)
            if not action:
                println("Nieznana akcja. Spróbuj ponownie.")
                continue

            cost = self.COST_PAID[action]
            if player.gold < cost:
                println(f"Za mało złota. Akcja '{action}' kosztuje {cost}, masz {player.gold}.")
                continue

            pidx = self._player_index(ctx, player)
            ok = False
            msg = ""

            if action == "administracja":
                player.gold += 2
                ok = True
                msg = f"{player.name} otrzymuje +2 złota (teraz {player.gold})."

            elif action == "wplyw":
                pid = self._parse_province(args)
                if not pid:
                    println("Nie rozpoznano prowincji.")
                    continue
                add_nobles(ctx, pid, pidx, 1)
                player.gold -= cost
                ok = True
                msg = f"{player.name} stawia szlachcica w {pid.value}. (złoto {player.gold})"

            elif action == "posiadlosc":
                pid = self._parse_province(args)
                if not pid:
                    println("Nie rozpoznano prowincji.")
                    continue
                if not self._has_noble(ctx, pid, pidx):
                    println("Musisz mieć szlachcica na tej prowincji.")
                    continue
                if build_estate(ctx, pid, pidx):
                    player.gold -= cost
                    ok = True
                    msg = f"{player.name} buduje posiadłość w {pid.value}. (złoto {player.gold})"
                else:
                    println("Brak wolnych slotów posiadłości w tej prowincji.")
                    continue

            elif action == "rekrutacja":
                pid = self._parse_province(args)
                if not pid:
                    println("Nie rozpoznano prowincji.")
                    continue
                if not self._has_noble(ctx, pid, pidx):
                    println("Musisz mieć szlachcica na tej prowincji.")
                    continue
                add_units(ctx, pid, pidx, 1)
                player.gold -= cost
                ok = True
                msg = f"{player.name} rekrutuje 1 jednostkę w {pid.value}. (złoto {player.gold})"

            elif action == "marsz":
                if "->" not in args:
                    println("Podaj format: Źródło->Cel (np. Litwa->Prusy).")
                    continue
                src_txt, dst_txt = [s.strip() for s in args.split("->", 1)]
                src = self._parse_province(src_txt)
                dst = self._parse_province(dst_txt)
                if not src or not dst:
                    println("Nie rozpoznano prowincji.")
                    continue
                if not self._has_noble(ctx, src, pidx) or not self._has_noble(ctx, dst, pidx):
                    println("Marsz tylko między prowincjami, gdzie masz szlachcica na obu.")
                    continue
                if move_units(ctx, src, dst, pidx, 1):
                    ok = True
                    msg = f"{player.name} maszeruje 1 jednostką: {src.value} -> {dst.value}."
                else:
                    println("Brak jednostek do przesunięcia na prowincji źródłowej.")
                    continue

            elif action == "zamoznosc":
                pid = self._parse_province(args)
                if not pid:
                    println("Nie rozpoznano prowincji.")
                    continue
                before = ctx.provinces[pid].wealth
                if before >= 3:
                    println("Zamożność już wynosi 3 (maksimum).")
                    continue
                add_province_wealth(ctx, pid, 1)
                player.gold -= cost
                ok = True
                msg = f"{player.name} podnosi zamożność {pid.value} z {before} do {ctx.provinces[pid].wealth}. (złoto {player.gold})"

            if ok:
                println(msg)
                # po jednej poprawnej akcji kończymy turę tego gracza
                break

class PlayerBattlePhase(BasePhase):
    name = "PlayerBattlePhase"

    def __init__(self) -> None:
        self._ran = False

    def enter(self, ctx: GameContext) -> None:
        println("[Starcia] Rozstrzyganie bitew między graczami na tych samych prowincjach.")
        println("Zasady: każdy gracz podaje tyle rzutów (1–6), ile ma jednostek.")
        println("Wynik 5–6 zabija 1 jednostkę przeciwnika; 1–4 nic. Straty odejmujemy po obu seriach rzutów.")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""  # sterowanie centralne

    def _turn_order(self, ctx: GameContext) -> List[Player]:
        m = ctx.round_status.marshal_index
        players = ctx.settings.players
        return players[m:] + players[:m]

    def _players_with_units(self, ctx: GameContext, pid: ProvinceID) -> List[int]:
        arr = ctx.troops.per_province[pid]
        return [i for i, n in enumerate(arr) if n > 0]

    @staticmethod
    def _read_rolls(name: str, count: int) -> List[int]:
        """Czyta dokładnie `count` rzutów 1–6. Akceptuje spacje/komy; dopytuje aż będzie poprawnie."""
        while True:
            raw = (prompt(f"  {name}: podaj {count} rzutów 1–6 (np. '1 6 4 ...'): ") or "").strip()
            if not raw:
                continue
            # akceptuj spacje i przecinki
            toks = [t for t in raw.replace(",", " ").split() if t]
            try:
                rolls = [int(t) for t in toks]
                if len(rolls) != count or any(r < 1 or r > 6 for r in rolls):
                    raise ValueError
                return rolls
            except ValueError:
                println("    Nieprawidłowe dane. Upewnij się, że liczba rzutów i wartości (1–6) się zgadzają.")

    @staticmethod
    def _kills_from_rolls(rolls: List[int]) -> int:
        return sum(1 for r in rolls if r >= 5)

    def _resolve_duel(self, ctx: GameContext, pid: ProvinceID, i: int, j: int) -> None:
        """Potyczka 1v1 na prowincji pid między graczami i oraz j. Straty po obu seriach."""
        troops_arr = ctx.troops.per_province[pid]
        pi = ctx.settings.players[i]
        pj = ctx.settings.players[j]

        units_i_start = troops_arr[i]
        units_j_start = troops_arr[j]
        println(f"[Starcia] {pid.value}: {pi.name} ({units_i_start}) vs {pj.name} ({units_j_start})")

        # brak sensu walczyć, jeśli ktoś jednak 0 (sprawdzamy defensywnie)
        if units_i_start <= 0 or units_j_start <= 0:
            println("  (Ktoś nie ma jednostek — pomijam potyczkę.)")
            return

        rolls_i = self._read_rolls(pi.name, units_i_start)
        rolls_j = self._read_rolls(pj.name, units_j_start)

        kills_i = self._kills_from_rolls(rolls_i)  # zadaje straty przeciwnikowi
        kills_j = self._kills_from_rolls(rolls_j)

        # Straty stosujemy dopiero teraz, limitując do liczby jednostek przeciwnika na początku potyczki
        loss_i = min(kills_j, units_i_start)
        loss_j = min(kills_i, units_j_start)

        troops_arr[i] = max(0, troops_arr[i] - loss_i)
        troops_arr[j] = max(0, troops_arr[j] - loss_j)

        println(f"  {pi.name} zadał {loss_j} strat; {pj.name} zadał {loss_i} strat.")
        println(f"  Stan po potyczce: {pi.name}={troops_arr[i]}, {pj.name}={troops_arr[j]}.")

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if self._ran:
            return PhaseResult(done=True)
        self._ran = True

        order = self._turn_order(ctx)
        name_to_idx = {p.name: idx for idx, p in enumerate(ctx.settings.players)}

        any_battle = False
        # Dla każdej prowincji rozstrzygamy kolejne potyczki aż zostanie ≤1 gracz z jednostkami.
        for pid in ProvinceID:
            # pętla kolejnych potyczek na tej prowincji
            while True:
                present = self._players_with_units(ctx, pid)
                if len(present) < 2:
                    break
                any_battle = True

                # wybierz DWÓCH pierwszych wg kolejności tur od marszałka
                ordered_present = [name_to_idx[p.name] for p in order if name_to_idx[p.name] in present]
                a = ordered_present[0]
                # drugi to następny różny od a
                b = next(idx for idx in ordered_present if idx != a)

                self._resolve_duel(ctx, pid, a, b)

        if not any_battle:
            println("[Starcia] Brak prowincji z armiami ≥2 graczy — nic do rozstrzygnięcia.")

        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        super().exit(ctx)  # pokaż zaktualizowane statystyki po bitwach


class EnemyReinforcementPhase(BasePhase):
    name = "EnemyReinforcementPhase"

    def __init__(self) -> None:
        self._ran = False

    @staticmethod
    def _roll_to_delta(roll: int) -> int:
        if roll <= 2:
            return 0
        elif roll <= 4:
            return 1
        else:
            return 2

    def enter(self, ctx: GameContext) -> None:
        println("[Wrogowie] Wzmacnianie wrogich armii.")
        println("Dla każdego toru podaj wynik 1–6. Modyfikacje: 1–2:+0, 3–4:+1, 5–6:+2.")

    # Nie pytamy per gracza — faza sama prowadzi wejście/wyjście.
    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if self._ran:
            return PhaseResult(done=True)
        self._ran = True

        # stała kolejność: N, S, E (Szwecja, Tatarzy, Moskwa)
        order = [RaidTrackID.N, RaidTrackID.S, RaidTrackID.E]
        for rid in order:
            name = rid.value
            while True:
                val = (prompt(f"[Wrogowie] Rzut dla {name} (1–6): ") or "").strip()
                try:
                    roll = int(val)
                    if 1 <= roll <= 6:
                        break
                    raise ValueError
                except ValueError:
                    println("Nieprawidłowe — wpisz liczbę 1–6.")

            delta = self._roll_to_delta(roll)
            if delta != 0:
                new_val = add_raid(ctx, rid, delta)
                println(f"  {name}: +{delta} → {new_val}")
            else:
                println(f"  {name}: +0 (bez zmian)")

        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        super().exit(ctx)  # pokaże zaktualizowane statystyki wraz z torami najazdów

class AttackInvadersPhase(BasePhase):
    name = "AttackInvadersPhase"

    def __init__(self) -> None:
        # mapy skrótów i dozwolonych prowincji startowych
        self._prov_short = {
            "p": ProvinceID.PRUSY,
            "l": ProvinceID.LITWA,
            "u": ProvinceID.UKRAINA,
            "w": ProvinceID.WIELKOPOLSKA,
            "m": ProvinceID.MALOPOLSKA,
        }
        self._enemy_keys = {
            "n": RaidTrackID.N,  # Szwecja
            "s": RaidTrackID.S,  # Tatarzy
            "e": RaidTrackID.E,  # Moskwa
        }
        self._allowed_sources = {
            RaidTrackID.N: {ProvinceID.PRUSY, ProvinceID.LITWA},
            RaidTrackID.E: {ProvinceID.LITWA, ProvinceID.UKRAINA},
            RaidTrackID.S: {ProvinceID.MALOPOLSKA, ProvinceID.UKRAINA},
        }

    # --- utils ---
    @staticmethod
    def _norm(s: str) -> str:
        import unicodedata
        s = (s or "").strip()
        s = unicodedata.normalize("NFKD", s)
        s = "".join(ch for ch in s if not unicodedata.combining(ch))
        return s.lower().strip()

    def _parse_enemy(self, text: str) -> Optional[RaidTrackID]:
        t = self._norm(text)
        if not t:
            return None
        # skróty literowe
        if t in self._enemy_keys:
            return self._enemy_keys[t]
        # nazwy
        names = {
            "szwecja": RaidTrackID.N,
            "tatarzy": RaidTrackID.S,
            "moskwa": RaidTrackID.E,
        }
        for k, v in names.items():
            if t == k or k.startswith(t) or t.startswith(k):
                return v
        return None

    def _parse_province(self, text: str) -> Optional[ProvinceID]:
        t = self._norm(text)
        if not t:
            return None
        if len(t) == 1 and t in self._prov_short:
            return self._prov_short[t]
        for pid in ProvinceID:
            name_n = self._norm(pid.value)
            if t == name_n or name_n.startswith(t) or t.startswith(name_n):
                return pid
        if len(t) == 1:
            for pid in ProvinceID:
                if self._norm(pid.value)[0] == t:
                    return pid
        return None

    def enter(self, ctx: GameContext) -> None:
        println("[Ataki] Gracze mogą atakować najeźdźców.")
        println("Zasięgi: Szwecja z Prus/Litwy; Moskwa z Litwy/Ukrainy; Tatarzy z Małopolski/Ukrainy.")
        println("Tura gracza: 'atak' lub 'pass'.")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""  # sterujemy interaktywnie wewnątrz handle_input

    def _player_index(self, ctx: GameContext, player: Player) -> int:
        return ctx.settings.players.index(player)

    def _has_any_attack_troops(self, ctx: GameContext, pidx: int) -> bool:
        # Czy gracz ma wojsko w prowincjach, z których da się atakować ktokolwiek?
        for rid, sources in self._allowed_sources.items():
            if ctx.raid_tracks[rid].value <= 0:
                continue
            for src in sources:
                if ctx.troops.per_province[src][pidx] > 0:
                    return True
        return False

    def _any_side_has_troops(self, ctx: GameContext) -> bool:
        # Czy istnieje gracz, który w ogóle ma wojsko (globalnie)?
        for arr in ctx.troops.per_province.values():
            if sum(arr) > 0:
                return True
        return False

    def _attack_from(self, ctx: GameContext, rid: RaidTrackID, src: ProvinceID, pidx: int, player: Player) -> None:
        units_here = ctx.troops.per_province[src][pidx]
        if units_here <= 0:
            println("Brak jednostek na wybranej prowincji.")
            return
        if ctx.raid_tracks[rid].value <= 0:
            println("Ten tor najazdu ma już 0 — brak celu do bicia.")
            return

        println(f"[Atak] {player.name} atakuje {rid.value} z {src.value}. Masz {units_here} jednostek.")
        # Rzucamy dla KAŻDEJ jednostki aktualnie na prowincji (stan na start ataku)
        rolls = []
        for i in range(units_here):
            while True:
                val = (prompt(f"  Rzut #{i+1} (1–6): ") or "").strip()
                try:
                    r = int(val)
                    if 1 <= r <= 6:
                        rolls.append(r)
                        break
                    raise ValueError
                except ValueError:
                    println("Nieprawidłowe — wpisz liczbę 1–6.")

        # Przetwarzamy rzuty w kolejności
        for r in rolls:
            if ctx.raid_tracks[rid].value <= 0:
                println("  Cel już zbity do 0 — dalsze sukcesy nie obniżą więcej.")
            if r == 1:
                add_units(ctx, src, pidx, -1)
                player.honor += 1
                println("  Wynik 1 → porażka, tracisz 1 jednostkę.")
            elif 2 <= r <= 5:
                add_raid(ctx, rid, -1)
                add_units(ctx, src, pidx, -1)
                player.honor += 1
                println("  Wynik 2–5 → sukces: tor -1 i tracisz 1 jednostkę.")
            else:  # r == 6
                add_raid(ctx, rid, -1)
                player.honor += 1
                println("  Wynik 6 → sukces: tor -1 i jednostka pozostaje.")

        println(f"  Po ataku: {rid.value} = {ctx.raid_tracks[rid].value}, jednostek w {src.value} = {ctx.troops.per_province[src][pidx]}")

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        players = ctx.settings.players
        m = ctx.round_status.marshal_index
        order = players[m:] + players[:m]

        # pętle tur do momentu aż wszyscy spasuja lub nie ma już znaczących wojsk
        passed = {p.name: False for p in players}

        while True:
            # zakończ, jeśli wszyscy spasuja
            if all(passed.values()):
                println("[Ataki] Wszyscy spasu­ją — koniec fazy.")
                break
            # albo jeśli nikt nie ma już wojsk (globalnie)
            if not self._any_side_has_troops(ctx):
                println("[Ataki] Brak wojsk na mapie — koniec fazy.")
                break

            for pl in order:
                # pomiń jeśli już spassował wcześniej, ale resetujemy po jego akcji jeśli zdecyduje się jednak atakować
                if not self._has_any_attack_troops(ctx, self._player_index(ctx, pl)):
                    println(f"[Ataki] {pl.name} nie ma wojsk w zasięgu — PASS automatyczny.")
                    passed[pl.name] = True
                    continue

                choice = (prompt(f"[Ataki] Tura {pl.name}. 'atak' czy 'pass'? ").strip() or "").lower()
                if choice.startswith("p"):
                    passed[pl.name] = True
                    continue

                if not choice.startswith("a"):
                    println("Nie rozpoznano — wpisz 'atak' albo 'pass'.")
                    # gracz nie traci kolejki, spróbujemy jeszcze raz
                    choice = (prompt(f"[Ataki] Tura {pl.name}. 'atak' czy 'pass'? ").strip() or "").lower()
                    if not choice.startswith("a"):
                        passed[pl.name] = False
                        continue

                # atak — reset pasa dla tego gracza
                passed[pl.name] = False

                # wybór prowincji źródłowej zgodnej z mapą zasięgu
                src_txt = prompt("  Z której prowincji? (np. Prusy/P, Litwa/L, Ukraina/U, Małopolska/M): ")
                src = self._parse_province(src_txt)
                if not src:
                    println("  Nie rozpoznano prowincji.")
                    passed[pl.name] = False
                    continue

                pidx = self._player_index(ctx, pl)
                if ctx.troops.per_province[src][pidx] <= 0:
                    println("  Nie masz tu jednostek.")
                    passed[pl.name] = False
                    continue

                # wybór najeźdźcy
                enemy_txt = prompt("  Kogo atakujesz? (Szwecja/N, Tatarzy/S, Moskwa/E): ")
                rid = self._parse_enemy(enemy_txt)
                if not rid:
                    println("  Nie rozpoznano najeźdźcy.")
                    passed[pl.name] = False
                    continue

                if ctx.raid_tracks[rid].value <= 0:
                    println("  Tego najeźdźcy nie można już atakować (tor = 0). Wybierz innego lub 'pass'.")
                    # pozwalamy graczowi spróbować jeszcze raz w tej samej turze
                    passed[pl.name] = False
                    continue

                if src not in self._allowed_sources[rid]:
                    println("  Z tej prowincji nie można atakować wybranego najeźdźcy.")
                    passed[pl.name] = False
                    continue

                self._attack_from(ctx, rid, src, pidx, pl)

        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        super().exit(ctx)  # pokaże podsumowanie i tory

class DevastationPhase(BasePhase):
    name = "DevastationPhase"

    def __init__(self) -> None:
        # kolejność i mapowanie 'pierwsza/druga' prowincja dla każdego toru
        self._pairs = {
            RaidTrackID.N: (ProvinceID.PRUSY, ProvinceID.LITWA),       # Szwecja
            RaidTrackID.E: (ProvinceID.LITWA, ProvinceID.UKRAINA),     # Moskwa
            RaidTrackID.S: (ProvinceID.UKRAINA, ProvinceID.MALOPOLSKA) # Tatarzy
        }
        self._order = [RaidTrackID.N, RaidTrackID.S, RaidTrackID.E]
        self._ran = False

    def enter(self, ctx: GameContext) -> None:
        println("[Spustoszenia] Jeśli tor najeźdźcy ≥ 3, następuje splądrowanie jednej prowincji.")
        println("Wybór prowincji k6: 1–3 pierwsza z pary, 4–6 druga z pary.")
        println("Pary: Szwecja: Prusy/Litwa; Moskwa: Litwa/Ukraina; Tatarzy: Ukraina/Małopolska.")

    def ask(self, ctx: GameContext, player: Optional[Player] = None) -> str:
        return ""  # faza sterowana centralnie

    def _pick_target(self, first: ProvinceID, second: ProvinceID) -> ProvinceID:
        while True:
            val = (prompt("  Rzut k6 (1–6): ") or "").strip()
            try:
                r = int(val)
                if 1 <= r <= 6:
                    break
                raise ValueError
            except ValueError:
                println("Nieprawidłowe — wpisz liczbę 1–6.")
        return first if r <= 3 else second

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        if self._ran:
            return PhaseResult(done=True)
        self._ran = True

        any_happened = False
        for rid in self._order:
            track = ctx.raid_tracks[rid]
            if track.value >= 3:
                any_happened = True
                first, second = self._pairs[rid]
                println(f"[Spustoszenia] {rid.value} (tor={track.value}) plądruje: {first.value}/{second.value}.")
                target = self._pick_target(first, second)
                msg = plunder_province(ctx, target)
                # po splądrowaniu tor spada do 1
                track.value = 1
                println(msg + f" Tor {rid.value} ustawiony na 1.")

        if not any_happened:
            println("[Spustoszenia] Brak torów ≥ 3 — nic się nie dzieje.")

        return PhaseResult(done=True)

    def exit(self, ctx: GameContext) -> None:
        super().exit(ctx)  # pokaże aktualny stan mapy i torów


# --------------- Round Engine --------------- #

class RoundEngine:
    def __init__(self, phases: List[BasePhase]):
        self.phases = phases
        self._index = 0
        self._turn_order: List[Player] = []

    def start(self, ctx: GameContext) -> None:
        self._index = 0
        marshal_idx = ctx.round_status.marshal_index
        players = ctx.settings.players
        # ustal kolejność: zaczyna marszałek, potem reszta w kolejności
        self._turn_order = players[marshal_idx:] + players[:marshal_idx]
        if self.phases:
            self.phases[0].enter(ctx)

    def current_phase(self) -> Optional[BasePhase]:
        if 0 <= self._index < len(self.phases):
            return self.phases[self._index]
        return None

    def step(self, ctx: GameContext) -> Optional[str]:
        phase = self.current_phase()
        if not phase:
            return None

        for player in self._turn_order:
            question = phase.ask(ctx, player)
            raw = prompt(question) if question else ""
            result = phase.handle_input(ctx, raw, player)
            if result.message:
                println(result.message)
        phase.exit(ctx)
        self._index += 1
        nxt = self.current_phase()
        if nxt:
            nxt.enter(ctx)
        return None

    def finished(self) -> bool:
        return self._index >= len(self.phases)


# --------------- States --------------- #

class BaseState:
    id: StateID

    def enter(self, ctx: GameContext) -> None:
        pass

    def tick(self, ctx: GameContext) -> Optional[StateID]:
        return None

    def exit(self, ctx: GameContext) -> None:
        pass


class StartMenuState(BaseState):
    id = StateID.START_MENU

    def enter(self, ctx: GameContext) -> None:
        println("=== START MENU ===")
        println("Set up the game.")

    def tick(self, ctx: GameContext) -> Optional[StateID]:
        try:
            num_players = int(prompt("Number of players: ").strip())
            ctx.settings.players = []
            for i in range(num_players):
                name = prompt(f"Enter name for player {i+1}: ").strip() or f"Player{i+1}"
                ctx.settings.players.append(Player(name=name, gold=6))  # startowo 6 złota
        except ValueError:
            println("Invalid input, defaulting to 1 player.")
            ctx.settings.players = [Player(name="Player1", gold=6)]

        try:
            rounds_raw = prompt("Number of rounds: ").strip()
            if rounds_raw:
                ctx.settings.max_rounds = max(1, int(rounds_raw))
        except ValueError:
            println("Invalid number, keeping default.")

        ctx.round_status = RoundStatus(current_round=1, total_rounds=ctx.settings.max_rounds, marshal_index=0)
        
        # --- INIT TROOPS: po znaniu liczby graczy przygotuj tablice wojsk ---
        pcount = len(ctx.settings.players)
        ctx.troops.per_province = {
            pid: [0] * pcount
            for pid in ctx.provinces.keys()
        }

        # --- INIT NOBLES: analogicznie do wojsk ---
        ctx.nobles.per_province = {
            pid: [0] * pcount
            for pid in ctx.provinces.keys()
        }
        
        return StateID.GAMEPLAY


class GameplayState(BaseState):
    id = StateID.GAMEPLAY

    def __init__(self) -> None:
        self.round_engine: Optional[RoundEngine] = None

    def enter(self, ctx: GameContext) -> None:
        println("=== GAMEPLAY ===")
        self._start_round(ctx)

    def _start_round(self, ctx: GameContext) -> None:
        println(f"=== ROUND {ctx.round_status.current_round} / {ctx.round_status.total_rounds} ===")
        self.round_engine = RoundEngine([
            IncomePhase(),
            AuctionPhase(),
            SejmPhase(),
            ActionPhase(),
            PlayerBattlePhase(),
            EnemyReinforcementPhase(),
            AttackInvadersPhase(),
            DevastationPhase(),   
        ])
        self.round_engine.start(ctx)

    def tick(self, ctx: GameContext) -> Optional[StateID]:
        assert self.round_engine is not None
        self.round_engine.step(ctx)
        if self.round_engine.finished():
            if ctx.round_status.current_round < ctx.round_status.total_rounds:
                ctx.round_status.current_round += 1
                # rotate marshal
                ctx.round_status.marshal_index = (ctx.round_status.marshal_index + 1) % len(ctx.settings.players)
                # reset wybranej ustawy na następną rundę
                ctx.round_status.last_law = None
                self._start_round(ctx)
            else:
                return StateID.GAME_OVER
        return None


class GameOverState(BaseState):
    id = StateID.GAME_OVER

    def enter(self, ctx: GameContext) -> None:
        println("=== GAME OVER ===")
        # policz końcowe punkty wg zasad
        report = compute_final_scores(ctx)
        println(report)
        println("Final scores:")
        for p in ctx.settings.players:
            tag = " (MAJORITY)" if p.majority else ""
            println(f"  {p.name}: {p.score} points, {p.gold} gold, {p.honor} honor{tag}")

    def tick(self, ctx: GameContext) -> Optional[StateID]:
        again = prompt("Play again? [y/N]: ").strip().lower()
        if again == "y":
            return StateID.START_MENU
        println("Thanks for playing!")
        return None



# --------------- FSM Orchestrator --------------- #

class StateMachine:
    def __init__(self, states: Dict[StateID, BaseState], start: StateID) -> None:
        self.states = states
        self.current: BaseState = self.states[start]

    def run(self, ctx: GameContext) -> None:
        self.current.enter(ctx)
        while True:
            nxt = self.current.tick(ctx)
            if nxt is None:
                if isinstance(self.current, GameOverState):
                    break
                continue
            self.current.exit(ctx)
            self.current = self.states[nxt]
            self.current.enter(ctx)


# --------------- Entry Point --------------- #

def main(argv: List[str]) -> int:
    ctx = GameContext()
    states: Dict[StateID, BaseState] = {
        StateID.START_MENU: StartMenuState(),
        StateID.GAMEPLAY: GameplayState(),
        StateID.GAME_OVER: GameOverState(),
    }
    sm = StateMachine(states, start=StateID.START_MENU)
    sm.run(ctx)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
