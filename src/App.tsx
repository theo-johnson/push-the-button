import { useEffect, useRef, useReducer, useState } from 'react';
import { gameReducer, makeInitialState, canStart } from './gameLogic';
import { saveGame, loadGame, deleteGame } from './storage';
import { PROMPT_PAIRS } from './prompts';
import type { GameState, Screen } from './types';

function screenKey(screen: Screen): string {
  switch (screen.kind) {
    case 'setup':
      return 'setup';
    case 'indicator':
      return `indicator-${screen.playerIndex}-${screen.contentType}`;
    case 'content':
      return `content-${screen.playerIndex}-${screen.contentType}`;
    case 'roundTimer':
      return `roundTimer-${screen.timerState}`;
    case 'vote':
      return 'vote';
    case 'reveal':
      return 'reveal';
  }
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, makeInitialState);
  const [savedGame, setSavedGame] = useState<GameState | null>(null);
  const timerDoneFired = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Check for a saved game once, on mount.
  useEffect(() => {
    setSavedGame(loadGame());
  }, []);

  // Persist any in-progress or finished game (not the blank setup screen).
  useEffect(() => {
    if (state.screen.kind !== 'setup') {
      saveGame(state);
    }
  }, [state]);

  // Countdown timer while a round is running.
  useEffect(() => {
    if (state.screen.kind !== 'roundTimer' || state.screen.timerState !== 'running') return;
    const interval = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(interval);
  }, [state.screen]);

  // Once the countdown reaches zero, flip the screen to "Time's up!" (once).
  useEffect(() => {
    if (state.screen.kind === 'roundTimer' && state.screen.timerState === 'running' && state.secondsLeft === 0) {
      if (!timerDoneFired.current) {
        timerDoneFired.current = true;
        dispatch({ type: 'TIMER_DONE' });
      }
    } else {
      timerDoneFired.current = false;
    }
  }, [state.screen, state.secondsLeft]);

  // Beep on every second for the last 10 seconds; a harsher buzzer on the final zero.
  useEffect(() => {
    if (state.screen.kind === 'roundTimer' && state.screen.timerState === 'running') {
      if (state.secondsLeft > 0 && state.secondsLeft <= 10) {
        playBeep(audioCtxRef.current);
      } else if (state.secondsLeft === 0) {
        playBuzzer(audioCtxRef.current);
      }
    }
  }, [state.secondsLeft, state.screen]);

  function ensureAudioUnlocked() {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    // resume() must be called from a real user gesture to unlock audio on mobile browsers.
    audioCtxRef.current.resume();
  }

  function handleResume() {
    if (savedGame) {
      dispatch({ type: 'LOAD', state: savedGame });
      setSavedGame(null);
    }
  }

  function handleDeleteSaved() {
    deleteGame();
    setSavedGame(null);
  }

  function handleNewGame() {
    deleteGame();
    dispatch({ type: 'NEW_GAME' });
  }

  function handleExitGame() {
    if (window.confirm('Are you sure you want to end the game? Progress will be deleted.')) {
      handleNewGame();
    }
  }

  function handleStartRound() {
    ensureAudioUnlocked();
    dispatch({ type: 'START_ROUND' });
  }

  const screen = state.screen;

  return (
    <>
      {screen.kind !== 'setup' && (
        <button className="exit-button" onClick={handleExitGame}>
          Exit Game
        </button>
      )}

      <div className="app">
        <div key={screenKey(screen)} className="screen-fade">
          {screen.kind === 'setup' && (
            <SetupScreen
              state={state}
              dispatch={dispatch}
              savedGame={savedGame}
              onResume={handleResume}
              onDeleteSaved={handleDeleteSaved}
            />
          )}

          {screen.kind === 'indicator' && (
            <IndicatorScreen
              title={screen.contentType === 'role' ? 'Roles Setup' : `Round ${state.currentRound} - Prompt`}
              playerName={state.order.map((id) => state.players.find((p) => p.id === id)!.name)[screen.playerIndex]}
              playerIndex={screen.playerIndex}
              totalPlayers={state.order.length}
              onReady={() => dispatch({ type: 'READY' })}
            />
          )}

          {screen.kind === 'content' && (
            <ContentScreen
              title={screen.contentType === 'role' ? 'Roles Setup' : `Round ${state.currentRound} - Prompt`}
              state={state}
              playerIndex={screen.playerIndex}
              contentType={screen.contentType}
              onHack={(targetId) => dispatch({ type: 'HACK_PLAYER', targetId })}
              onContinue={() => dispatch({ type: 'CONTINUE' })}
            />
          )}

          {screen.kind === 'roundTimer' && (
            <RoundTimerScreen
              title={`Round ${state.currentRound} - Drawing`}
              round={state.currentRound}
              roundsTotal={state.roundsTotal}
              timerState={screen.timerState}
              secondsLeft={state.secondsLeft}
              onStart={handleStartRound}
              onContinue={() => dispatch({ type: 'CONTINUE' })}
            />
          )}

          {screen.kind === 'vote' && <VoteScreen onReveal={() => dispatch({ type: 'REVEAL_ALIEN' })} />}

          {screen.kind === 'reveal' && (
            <RevealScreen
              alienName={state.players.find((p) => p.id === state.alienId)?.name ?? '?'}
              onNewGame={handleNewGame}
            />
          )}
        </div>
      </div>
    </>
  );
}

function playBeep(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // audio not available, ignore
  }
}

function playBuzzer(ctx: AudioContext | null) {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // audio not available, ignore
  }
}

// ---------- A button that's disabled and shows a countdown for a few seconds after appearing ----------

function DelayedButton({ label, onClick, delayMs = 500 }: { label: string; onClick: () => void; delayMs?: number }) {
  const [disabled, setDisabled] = useState(true);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    // Start the fill on the next frame so the 0% -> 100% transition actually animates.
    const raf = requestAnimationFrame(() => setFilled(true));
    const timeout = setTimeout(() => setDisabled(false), delayMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [delayMs]);

  return (
    <button
      className={`btn btn-start btn-progress ${disabled ? 'disabled' : 'enabled'}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="btn-progress-fill" style={{ width: filled ? '100%' : '0%', transitionDuration: `${delayMs}ms` }} />
      <span className="btn-progress-label">{label}</span>
    </button>
  );
}

// ---------- Setup ----------

function SetupScreen({
  state,
  dispatch,
  savedGame,
  onResume,
  onDeleteSaved,
}: {
  state: GameState;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  savedGame: GameState | null;
  onResume: () => void;
  onDeleteSaved: () => void;
}) {
  const startEnabled = canStart(state.players);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const prevPlayerCount = useRef(state.players.length);

  useEffect(() => {
    if (state.players.length > prevPlayerCount.current) {
      const lastPlayer = state.players[state.players.length - 1];
      inputRefs.current.get(lastPlayer.id)?.focus();
    }
    prevPlayerCount.current = state.players.length;
  }, [state.players]);

  return (
    <div className="screen setup-screen">
      <h1>Push the Button</h1>

      {savedGame && (
        <div className="saved-game-banner">
          <span>Saved game found.</span>
          <div className="button-row">
            <button className="btn" onClick={onResume}>
              Resume
            </button>
            <button className="btn btn-secondary" onClick={onDeleteSaved}>
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="player-list">
        {state.players.map((player) => (
          <div className="player-row" key={player.id}>
            <input
              className="player-input"
              type="text"
              placeholder="Player name"
              value={player.name}
              ref={(el) => {
                if (el) inputRefs.current.set(player.id, el);
                else inputRefs.current.delete(player.id);
              }}
              onChange={(e) => dispatch({ type: 'RENAME_PLAYER', id: player.id, name: e.target.value })}
            />
            <button
              className="btn btn-remove"
              onClick={() => dispatch({ type: 'REMOVE_PLAYER', id: player.id })}
              aria-label="Remove player"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <button className="btn btn-secondary" onClick={() => dispatch({ type: 'ADD_PLAYER' })}>
        + Add Player
      </button>

      <div className="rounds-selector">
        <label htmlFor="rounds">Rounds before vote</label>
        <input
          id="rounds"
          type="number"
          min={1}
          value={state.roundsTotal}
          onChange={(e) => dispatch({ type: 'SET_ROUNDS', rounds: parseInt(e.target.value, 10) || 1 })}
        />
      </div>

      <div className="rounds-selector">
        <label htmlFor="hacks">Hacks per game (alien)</label>
        <input
          id="hacks"
          type="number"
          min={0}
          value={state.hacksTotal}
          onChange={(e) => dispatch({ type: 'SET_HACKS', hacks: parseInt(e.target.value, 10) || 0 })}
        />
      </div>

      <button
        className={`btn btn-start ${startEnabled ? 'enabled' : 'disabled'}`}
        disabled={!startEnabled}
        onClick={() => dispatch({ type: 'START_GAME' })}
      >
        Start Game
      </button>
    </div>
  );
}

// ---------- Player Indicator ----------

function IndicatorScreen({
  title,
  playerName,
  playerIndex,
  totalPlayers,
  onReady,
}: {
  title: string;
  playerName: string;
  playerIndex: number;
  totalPlayers: number;
  onReady: () => void;
}) {
  return (
    <div className="screen center-screen">
      <p className="screen-title">{title}</p>
      <p className="subtext">
        Player {playerIndex + 1} of {totalPlayers} &mdash; {playerName}
      </p>
      <h2>{playerName}, are you ready?</h2>
      <p className="subtext">Everyone else, no peeking!</p>
      <DelayedButton label="Ready" onClick={onReady} />
    </div>
  );
}

// ---------- Content (role / prompt reveal) ----------

function ContentScreen({
  title,
  state,
  playerIndex,
  contentType,
  onHack,
  onContinue,
}: {
  title: string;
  state: GameState;
  playerIndex: number;
  contentType: 'role' | 'prompt';
  onHack: (targetId: string) => void;
  onContinue: () => void;
}) {
  const playerId = state.order[playerIndex];
  const isAlien = playerId === state.alienId;
  const playerName = state.players.find((p) => p.id === playerId)?.name ?? '';
  const isHacked = state.hackedPlayerIds.includes(playerId);

  let text: string;
  if (contentType === 'role') {
    text = isAlien ? 'You are the alien!' : 'You are a human!';
  } else {
    const pair = PROMPT_PAIRS[state.promptIndexThisRound!];
    text = isAlien || isHacked ? pair.alien : pair.human;
  }

  const showHackPanel = contentType === 'prompt' && isAlien;

  return (
    <div className="screen center-screen">
      <p className="screen-title">{title}</p>
      <p className="subtext">
        Player {playerIndex + 1} of {state.order.length} &mdash; {playerName}
      </p>

      {showHackPanel ? (
        <div className="content-with-hack">
          <div className="main-content">
            <p className="subtext hack-instructions">Hacking a human will give them the alien prompt for this round.</p>
            <h2>{text}</h2>
            <DelayedButton label="Continue" onClick={onContinue} />
          </div>
          <div className="hack-panel">
            <p className="hack-count">Hacks remaining: {state.hacksRemaining}</p>
            <div className="hack-list">
              {state.order
                .filter((id) => id !== state.alienId)
                .map((id) => {
                  const p = state.players.find((pp) => pp.id === id)!;
                  const hacked = state.hackedPlayerIds.includes(id);
                  const disabled = hacked || state.hacksRemaining <= 0;
                  return (
                    <div className="hack-row" key={id}>
                      <span>{p.name}</span>
                      <button className="btn btn-hack" disabled={disabled} onClick={() => onHack(id)}>
                        {hacked ? 'Hacked' : 'Hack'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <h2>{text}</h2>
          <DelayedButton label="Continue" onClick={onContinue} />
        </>
      )}
    </div>
  );
}

// ---------- Round Timer ----------

function RoundTimerScreen({
  title,
  round,
  roundsTotal,
  timerState,
  secondsLeft,
  onStart,
  onContinue,
}: {
  title: string;
  round: number;
  roundsTotal: number;
  timerState: 'waiting' | 'running' | 'over';
  secondsLeft: number;
  onStart: () => void;
  onContinue: () => void;
}) {
  const isWarning = secondsLeft <= 10;

  return (
    <div className="screen center-screen">
      <p className="screen-title">{title}</p>
      <p className="subtext">
        Round {round} of {roundsTotal}
      </p>
      {timerState === 'waiting' && <DelayedButton label="Start Round" onClick={onStart} />}
      {timerState === 'running' && (
        <>
          <h1 key={secondsLeft} className={`timer-display ${isWarning ? 'timer-warning' : ''}`}>
            {secondsLeft}
          </h1>
          <DelayedButton label="Continue" onClick={onContinue} />
        </>
      )}
      {timerState === 'over' && (
        <>
          <h2>Time&apos;s up!</h2>
          <DelayedButton label="Continue" onClick={onContinue} />
        </>
      )}
    </div>
  );
}

// ---------- Vote ----------

function VoteScreen({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="screen center-screen">
      <p className="screen-title">Game Ended</p>
      <p className="screen-title">Who should be executed as a suspected alien?</p>
      <h2>Vote now!</h2>
      <DelayedButton label="Reveal Alien" onClick={onReveal} />
    </div>
  );
}

// ---------- Reveal ----------

function RevealScreen({ alienName, onNewGame }: { alienName: string; onNewGame: () => void }) {
  return (
    <div className="screen center-screen">
      <h2>The alien was: {alienName}</h2>
      <button className="btn btn-secondary" onClick={onNewGame}>
        New Game
      </button>
    </div>
  );
}
