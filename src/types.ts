export interface Player {
  id: string;
  name: string;
}

export type ContentType = 'role' | 'prompt';

export type Screen =
  | { kind: 'setup' }
  | { kind: 'indicator'; playerIndex: number; contentType: ContentType }
  | { kind: 'content'; playerIndex: number; contentType: ContentType }
  | { kind: 'roundTimer'; timerState: 'waiting' | 'running' | 'over' }
  | { kind: 'vote' }
  | { kind: 'reveal' };

export interface PromptPair {
  human: string;
  alien: string;
}

export interface GameState {
  players: Player[];
  roundsTotal: number;
  currentRound: number; // 0 before game starts, 1-indexed once started
  order: string[]; // player ids, fixed play order for this game
  alienId: string | null; // fixed for the whole game
  promptOrder: number[]; // shuffled indices into PROMPT_PAIRS, cycled as needed
  promptIndexThisRound: number | null;
  screen: Screen;
  secondsLeft: number;
  hacksTotal: number; // configured on the setup screen
  hacksRemaining: number; // persists across the whole game
  hackedPlayerIds: string[]; // players hacked THIS round only, reset each round
}
