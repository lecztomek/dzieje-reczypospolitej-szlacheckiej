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


# --- New Phases: Auction & Sejm --- #

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


class ScoringPhase(BasePhase):
    name = "ScoringPhase"

    def handle_input(self, ctx: GameContext, raw: str, player: Optional[Player] = None) -> PhaseResult:
        summary = "Round %d summary:" % ctx.round_status.current_round
        for p in ctx.settings.players:
            summary += f"  {p.name}: {p.score} points, {p.gold} gold, {p.honor} honor\n"
        return PhaseResult(message=summary, done=True)


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
            AuctionPhase(),
            SejmPhase(),
            ActionPhase()
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
