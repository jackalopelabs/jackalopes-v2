const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DIST = path.join(__dirname, 'dist');
const LEVEL_DATA_DIR = process.env.LEVEL_DATA_DIR || path.join(__dirname, 'level-data');
const TERRAIN_FILE = path.join(LEVEL_DATA_DIR, 'adventure-valley.json');
const TERRAIN_BACKUP_FILE = path.join(LEVEL_DATA_DIR, 'adventure-valley.backup.json');
const TERRAIN_API_PATH = '/api/terrain/adventure-valley';
const TERRAIN_SIZE = 800;
const TERRAIN_SEGMENTS = 70;
const TERRAIN_VERTEX_COUNT = (TERRAIN_SEGMENTS + 1) ** 2;
const MAX_TERRAIN_BYTES = 512 * 1024;
const lastTerrainWriteByAddress = new Map();

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
};

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}

function normalizeTerrainDocument(value) {
  if (!value || typeof value !== 'object') throw new Error('Terrain document must be an object.');
  if (value.format !== 'jackalopes-terrain' || (value.version !== 1 && value.version !== 2)) {
    throw new Error('Unsupported terrain document format.');
  }
  if (value.size !== TERRAIN_SIZE || value.segments !== TERRAIN_SEGMENTS) {
    throw new Error('Terrain grid does not match the Adventure Valley map.');
  }
  if (!Array.isArray(value.heightOffsets) || value.heightOffsets.length !== TERRAIN_VERTEX_COUNT) {
    throw new Error(`Terrain must contain exactly ${TERRAIN_VERTEX_COUNT} height offsets.`);
  }

  return {
    format: 'jackalopes-terrain',
    version: 2,
    name: typeof value.name === 'string' && value.name.trim()
      ? value.name.trim().slice(0, 80)
      : 'Adventure Valley',
    size: TERRAIN_SIZE,
    segments: TERRAIN_SEGMENTS,
    updatedAt: new Date().toISOString(),
    heightOffsets: value.heightOffsets.map((height) => {
      const numericHeight = Number(height);
      if (!Number.isFinite(numericHeight)) return 0;
      return Math.max(-120, Math.min(120, numericHeight));
    }),
    waterLevel: Number.isFinite(Number(value.waterLevel))
      ? Math.max(-100, Math.min(80, Number(value.waterLevel)))
      : 2,
    waterMask: Array.isArray(value.waterMask) && value.waterMask.length === TERRAIN_VERTEX_COUNT
      ? value.waterMask.map((amount) => {
          const numericAmount = Number(amount);
          if (!Number.isFinite(numericAmount)) return 0;
          return Math.max(0, Math.min(1, numericAmount));
        })
      : Array(TERRAIN_VERTEX_COUNT).fill(0),
  };
}

function requestIsSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function handleTerrainApi(req, res) {
  if (req.method === 'GET') {
    fs.readFile(TERRAIN_FILE, 'utf8', (error, contents) => {
      if (error?.code === 'ENOENT') {
        sendJson(res, 404, { error: 'No shared terrain has been saved yet.' });
        return;
      }
      if (error) {
        console.error('[Terrain API] Read failed:', error);
        sendJson(res, 500, { error: 'Shared terrain could not be read.' });
        return;
      }
      try {
        sendJson(res, 200, JSON.parse(contents));
      } catch (parseError) {
        console.error('[Terrain API] Stored terrain is invalid:', parseError);
        sendJson(res, 500, { error: 'Stored terrain is invalid.' });
      }
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!requestIsSameOrigin(req)) {
    sendJson(res, 403, { error: 'Cross-origin terrain writes are not allowed.' });
    return;
  }

  const address = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (now - (lastTerrainWriteByAddress.get(address) || 0) < 750) {
    sendJson(res, 429, { error: 'Please wait a moment before saving again.' });
    return;
  }

  let body = '';
  let rejected = false;
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    if (rejected) return;
    body += chunk;
    if (Buffer.byteLength(body, 'utf8') > MAX_TERRAIN_BYTES) {
      rejected = true;
      sendJson(res, 413, { error: 'Terrain document is too large.' });
    }
  });
  req.on('end', () => {
    if (rejected) return;
    try {
      const terrain = normalizeTerrainDocument(JSON.parse(body));
      fs.mkdirSync(LEVEL_DATA_DIR, { recursive: true });
      const temporaryFile = `${TERRAIN_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temporaryFile, `${JSON.stringify(terrain)}\n`, { mode: 0o600 });
      if (fs.existsSync(TERRAIN_FILE)) fs.copyFileSync(TERRAIN_FILE, TERRAIN_BACKUP_FILE);
      fs.renameSync(temporaryFile, TERRAIN_FILE);
      lastTerrainWriteByAddress.set(address, now);
      sendJson(res, 200, terrain);
    } catch (error) {
      console.warn('[Terrain API] Rejected save:', error);
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid terrain document.' });
    }
  });
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  if (requestPath === TERRAIN_API_PATH) {
    handleTerrainApi(req, res);
    return;
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  let filePath = path.join(DIST, relativePath);
  
  // SPA fallback - if file doesn't exist, serve index.html
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=31536000',
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Production server running at http://0.0.0.0:${PORT}`);
});
