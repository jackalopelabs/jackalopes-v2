import { StrictMode } from 'react';
import { BedtimeGate, BedtimeParent } from './bedtime/BedtimeGate';
import { GameErrorBoundary } from './common/components/canvas';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { TerrainEditor } from './game/terrain/TerrainEditor.tsx';
import { initializeSharedTerrainLevel, syncSharedTerrainLevel } from './game/terrain/level-document.ts';

const params = new URLSearchParams(window.location.search);
const terrainEditorActive = params.get('editor') === 'terrain';

async function boot() {
  if (params.get('bedtime') === 'parent') {
    createRoot(document.getElementById('root')!).render(<BedtimeParent />);
    return;
  }
  await initializeSharedTerrainLevel();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BedtimeGate><GameErrorBoundary>{terrainEditorActive ? <TerrainEditor /> : <App />}</GameErrorBoundary></BedtimeGate>
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
