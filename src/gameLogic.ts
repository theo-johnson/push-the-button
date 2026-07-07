import type { GameState, Player, Screen } from './types';
import { PROMPT_PAIRS } from './prompts';

export type Action =
  | { type: 'ADD_PLAYER' }
  | { type: 'REMOVE_PLAYER'; id: string }
  | { type: 'RENAME_PLAYER'; id: string; name: string }
  | { type: 'SET_ROUNDS'; rounds: number }
  | { type: 'SET_HACKS'; hacks: number }
  | { type: 'START_GAME' }
  | { type: 'READY' }
  | { type: 'CONTINUE' }
  | { type: 'START_ROUND' }
  | { type: 'TICK' }
  | { type: 'TIMER_DONE' }
  | { type: 'HACK_PLAYER'; targetId: string }
  | { type: 'REVEAL_ALIEN' }
  | { type: 'NEW_GAME' }
  | { type: 'LOAD'; state: GameState };

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeInitialState(): GameState {
  return {
    players: [{ id: makeId(), name: '' }],
    roundsTotal: 3,
    currentRound: 0,
    order: [],
    alienId: null,
    promptOrder: [],
    promptIndexThisRound: null,
    screen: { kind: 'setup' },
    secondsLeft: 30,
    hacksTotal: 3,
    hacksRemaining: 0,
    hackedPlayerIds: [],
  };
}

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function namedPlayers(players: Player[]): Player[] {
  return players.filter((p) => p.name.trim() !== '');
}

export function canStart(players: Player[]): boolean {
  return namedPlayers(players).length >= 2;
}

function promptIndexForRound(round: number, promptOrder: number[]): { index: number; order: number[] } {
  let order = promptOrder;
  const slot = (round - 1) % PROMPT_PAIRS.length;
  if (slot === 0) {
    order = shuffled(PROMPT_PAIRS.map((_, i) => i));
  }
  return { index: order[slot], order };
}

function startFirstRound(state: GameState): GameState {
  const players = namedPlayers(state.players);
  const order = players.map((p) => p.id);
  const alienId = order[Math.floor(Math.random() * order.length)];
  const { index, order: promptOrder } = promptIndexForRound(1, []);
  return {
    ...state,
    players,
    order,
    alienId,
    currentRound: 1,
    promptOrder,
    promptIndexThisRound: index,
    screen: { kind: 'indicator', playerIndex: 0, contentType: 'role' },
    secondsLeft: 30,
    hacksRemaining: state.hacksTotal,
    hackedPlayerIds: [],
  };
}

function startNextRound(state: GameState): GameState {
  const round = state.currentRound + 1;
  const { index, order: promptOrder } = promptIndexForRound(round, state.promptOrder);
  return {
    ...state,
    currentRound: round,
    promptOrder,
    promptIndexThisRound: index,
    screen: { kind: 'indicator', playerIndex: 0, contentType: 'prompt' },
    secondsLeft: 30,
    hackedPlayerIds: [],
  };
}

function afterReady(screen: Screen): Screen {
  if (screen.kind !== 'indicator') return screen;
  return { kind: 'content', playerIndex: screen.playerIndex, contentType: screen.contentType };
}

function afterContinue(state: GameState): GameState {
  const screen = state.screen;

  if (screen.kind === 'content') {
    const isLastPlayer = screen.playerIndex === state.order.length - 1;
    if (!isLastPlayer) {
      return {
        ...state,
        screen: { kind: 'indicator', playerIndex: screen.playerIndex + 1, contentType: screen.contentType },
      };
    }
    if (screen.contentType === 'role') {
      return { ...state, screen: { kind: 'indicator', playerIndex: 0, contentType: 'prompt' } };
    }
    return { ...state, screen: { kind: 'roundTimer', timerState: 'waiting' } };
  }

  if (screen.kind === 'roundTimer' && (screen.timerState === 'running' || screen.timerState === 'over')) {
    if (state.currentRound >= state.roundsTotal) {
      return { ...state, screen: { kind: 'vote' } };
    }
    return startNextRound(state);
  }

  return state;
}

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'ADD_PLAYER':
      return { ...state, players: [...state.players, { id: makeId(), name: '' }] };

    case 'REMOVE_PLAYER':
      return { ...state, players: state.players.filter((p) => p.id !== action.id) };

    case 'RENAME_PLAYER':
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
      };

    case 'SET_ROUNDS':
      return { ...state, roundsTotal: Math.max(1, action.rounds) };

    case 'SET_HACKS':
      return { ...state, hacksTotal: Math.max(0, action.hacks) };

    case 'START_GAME':
      if (!canStart(state.players)) return state;
      return startFirstRound(state);

    case 'READY':
      return { ...state, screen: afterReady(state.screen) };

    case 'CONTINUE':
      return afterContinue(state);

    case 'START_ROUND':
      if (state.screen.kind !== 'roundTimer') return state;
      return { ...state, screen: { kind: 'roundTimer', timerState: 'running' }, secondsLeft: 30 };

    case 'TICK':
      if (state.screen.kind !== 'roundTimer' || state.screen.timerState !== 'running') return state;
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) };

    case 'TIMER_DONE':
      if (state.screen.kind !== 'roundTimer') return state;
      return { ...state, screen: { kind: 'roundTimer', timerState: 'over' } };

    case 'HACK_PLAYER': {
      if (state.screen.kind !== 'content' || state.screen.contentType !== 'prompt') return state;
      const viewerId = state.order[state.screen.playerIndex];
      if (viewerId !== state.alienId) return state;
      if (action.targetId === state.alienId) return state;
      if (state.hacksRemaining <= 0) return state;
      if (state.hackedPlayerIds.includes(action.targetId)) return state;
      return {
        ...state,
        hacksRemaining: state.hacksRemaining - 1,
        hackedPlayerIds: [...state.hackedPlayerIds, action.targetId],
      };
    }

    case 'REVEAL_ALIEN':
      if (state.screen.kind !== 'vote') return state;
      return { ...state, screen: { kind: 'reveal' } };

    case 'NEW_GAME':
      return makeInitialState();

    case 'LOAD':
      return action.state;

    default:
      return state;
  }
}
