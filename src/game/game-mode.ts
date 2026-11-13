export type GameMode = 'hunt' | 'adventure' | 'everly';

export const DEFAULT_GAME_MODE: GameMode = 'hunt';

export const parseGameMode = (value: string | null | undefined): GameMode | null => {
  if (value === 'hunt' || value === 'adventure' || value === 'everly') return value;
  return null;
};

export const getGameModeFromUrl = (): GameMode | null => {
  if (typeof window === 'undefined') return null;
  return parseGameMode(new URLSearchParams(window.location.search).get('mode'));
};

export const isAdventureMode = (mode: GameMode | null): boolean => mode === 'adventure';

/** Only classic shared modes initialize the collaborative Adventure terrain/session. */
export const shouldInitializeSharedTerrain = (mode: GameMode | null, editorActive = false): boolean => editorActive || mode === 'adventure';
export const shouldConnectToSharedSession = (mode: GameMode | null): boolean => mode === 'hunt' || mode === 'adventure';
export const shouldReloadForModeEntry = (nextMode: GameMode, currentMode: GameMode | null): boolean =>
  nextMode === 'adventure' && currentMode !== 'adventure';
