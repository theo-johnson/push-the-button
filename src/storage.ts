import type { GameState } from './types';

const KEY = 'push-the-button:game-state';

export function saveGame(state: GameState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function deleteGame(): void {
  localStorage.removeItem(KEY);
}
