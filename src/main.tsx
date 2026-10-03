import { StrictMode } from 'react';
import { GameErrorBoundary } from './common/components/canvas';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { TerrainEditor } from './game/terrain/TerrainEditor.tsx';
import { initializeSharedTerrainLevel, syncSharedTerrainLevel } from './game/terrain/level-document.ts';

const params = new URLSearchParams(window.location.search);
const terrainEditorActive = params.get('editor') === 'terrain';

async function boot() {
  await initializeSharedTerrainLevel();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <GameErrorBoundary>{terrainEditorActive ? <TerrainEditor /> : <App />}</GameErrorBoundary>
    </StrictMode>
  );

  if (!terrainEditorActive) {
    window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const updated = await syncSharedTerrainLevel();
      if (updated) window.location.reload();
    }, 5000);
  }
}

void boot();
