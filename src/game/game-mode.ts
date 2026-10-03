export type GameMode = 'hunt' | 'adventure';

export const DEFAULT_GAME_MODE: GameMode = 'hunt';

export const parseGameMode = (value: string | null | undefined): GameMode | null => {
  if (value === 'hunt' || value === 'adventure') return value;
  return null;
};

export const getGameModeFromUrl = (): GameMode | null => {
  if (typeof window === 'undefined') return null;
  return parseGameMode(new URLSearchParams(window.location.search).get('mode'));
};

export const isAdventureMode = (mode: GameMode | null): boolean => mode === 'adventure';
