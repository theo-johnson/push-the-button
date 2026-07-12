import type { PromptPair } from './types';

// Swap which file is imported here to switch between the production prompt
// bank and the test bank (prompts already seen during development).
import promptData from './prompts.json';
// import promptData from './test-prompts.json';

export const PROMPT_PAIRS: PromptPair[] = promptData as PromptPair[];
