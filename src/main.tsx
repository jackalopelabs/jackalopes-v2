import { StrictMode } from 'react';
import { BedtimeGate, BedtimeParent } from './bedtime/BedtimeGate';
import { GameErrorBoundary } from './common/components/canvas';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { TerrainEditor } from './game/terrain/TerrainEditor.tsx';
import { initializeSharedTerrainLevel, syncSharedTerrainLevel } from './game/terrain/level-document.ts';
import { parseGameMode, shouldInitializeSharedTerrain } from './game/game-mode';

const params = new URLSearchParams(window.location.search);
const terrainEditorActive = params.get('editor') === 'terrain';
const requestedMode = parseGameMode(params.get('mode'));

async function boot() {
  if (params.get('bedtime') === 'parent') {
    createRoot(document.getElementById('root')!).render(<BedtimeParent />);
    return;
  }
  // The Adventure map is a shared user artifact. Do not migrate, fetch, or
  // periodically sync it while the picker, Hunt, or Everly's local realm runs.
  if (shouldInitializeSharedTerrain(requestedMode, terrainEditorActive)) await initializeSharedTerrainLevel();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BedtimeGate><GameErrorBoundary>{terrainEditorActive ? <TerrainEditor /> : <App />}</GameErrorBoundary></BedtimeGate>
    </StrictMode>
  );

  if (!terrainEditorActive) {
    let syncInterval: number | undefined;
    const stopAdventureSync = () => {
      if (syncInterval !== undefined) window.clearInterval(syncInterval);
      syncInterval = undefined;
    };
    const startAdventureSync = () => {
      if (syncInterval !== undefined) return;
      syncInterval = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const updated = await syncSharedTerrainLevel();
      if (updated) window.location.reload();
      }, 5000);
    };
    if (requestedMode === 'adventure') startAdventureSync();
    else window.addEventListener('jackalopes:adventure-selected', () => {
      void initializeSharedTerrainLevel().then(startAdventureSync);
    }, { once: true });
    window.addEventListener('jackalopes:mode-selected', event => {
      if ((event as CustomEvent<{ mode?: string }>).detail?.mode !== 'adventure') stopAdventureSync();
    });
  }
}

void boot();
