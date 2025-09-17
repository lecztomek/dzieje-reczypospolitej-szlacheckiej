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

# --------------- Helpers --------------- #

def prompt(text: str) -> str:
    try:
        return input(text)
    except EOFError:
        return ""


def println(*args: Any) -> None:
    print(*args)

def set_raid(ctx: GameContext, track_id: RaidTrackID, value: int) -> int:
    """Ustawia konkretną wartość toru najazdu. Zwraca nową wartość."""
    ctx.raid_tracks[track_id].value = int(value)
    return ctx.raid_tracks[track_id].value

def add_raid(ctx: GameContext, track_id: RaidTrackID, delta: int) -> int:
    """Dodaje (może być ujemne) do licznika toru. Zwraca nową wartość."""
    t = ctx.raid_tracks[track_id]
    t.value += int(delta)
    return t.value

def show_player_stats(ctx: GameContext):
    println("--- Player Stats ---")
    for p in ctx.settings.players:
        tag = " (MAJORITY)" if p.majority else ""
        println(f"{p.name}: Score={p.score}, Gold={p.gold}, Honor={p.honor}{tag}")
    println(f"Marshal: {ctx.settings.players[ctx.round_status.marshal_index].name}")
    if ctx.round_status.last_law is not None:
        println(f"Last law: {ctx.round_status.last_law}")
    # Prowincje
    println("Provinces:")
    # pomocnicza mapka: indeks gracza -> skrót/nazwa
    idx2name = {i: pl.name for i, pl in enumerate(ctx.settings.players)}
    for pid, prov in ctx.provinces.items():
        estates_str = "[" + ",".join(str(v) for v in prov.estates) + "]"
        # opcjonalnie: czytelniej z nazwami graczy zamiast indeksów
        # estates_str = "[" + ",".join(idx2name.get(v, "-") if v != -1 else "-" for v in prov.estates) + "]"
        println(f"  {pid.value}: fort={'TAK' if prov.has_fort else 'NIE'}, posiadłości={estates_str}")
    # Tory najazdów
    println("Raid Tracks:")
    for rid, track in ctx.raid_tracks.items():
        println(f"  {rid.value}: {track.value}")   
    
    println("--------------------")

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
            SejmPhase()
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
