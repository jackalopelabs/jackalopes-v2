/**
 * Jackalopes WebSocket Game Server
 * 
 * A simple WebSocket server that handles game state communication
 * for the Jackalopes multiplayer game.
 * 
 * This is a standalone server that doesn't require npm dependencies.
 * It uses the Node.js built-in modules for networking.
 */

// Use Node.js built-in modules
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const bedtime = require('./bedtime.cjs').createBedtime();

// Get port from environment variable or use default
const PORT = process.env.SERVER_PORT || 8082;

// Storage for active connections and game sessions
const clients = new Map();
const sessions = new Map();
const sessionDeletionTimers = new Map(); // Grace period timers for empty sessions
let clientIdCounter = 1;

// Grace period before deleting empty sessions (ms)
// Extended to 5 minutes to allow for page reloads and reconnections
const SESSION_DELETION_GRACE_PERIOD = 300000;
const MAX_WEBSOCKET_MESSAGE_SIZE = 1024 * 1024;

// Create an HTTP server for WebSocket handshake
const server = http.createServer(async (req, res) => {
    if (await bedtime.handleHttp(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Jackalopes WebSocket Server');
});

// Log startup message
console.log(`Starting Jackalopes WebSocket Server on port ${PORT}`);
logMessage(`Server starting on port ${PORT}`);

// Handle WebSocket connections
server.on('upgrade', (req, socket, head) => {
    handleWebSocketUpgrade(req, socket, head);
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}/`);
    logMessage(`Server running on port ${PORT}`);
});

// Set up graceful shutdown
process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

/**
 * Handle WebSocket upgrade request
 */
function handleWebSocketUpgrade(req, socket, head) {
    try {
        // Parse WebSocket key from request headers
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }

        // Accept the WebSocket connection
        const acceptKey = generateAcceptKey(key);
        const headers = [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${acceptKey}`,
            '\r\n'
        ].join('\r\n');

        socket.write(headers);

        // Set up the connection
        const clientId = clientIdCounter++;
        clients.set(clientId, {
            socket,
            id: clientId,
            sessionId: null,
            playerName: null,
            authenticated: false,
            userAgent: req.headers['user-agent'] || '',
            deviceId: null,
            receiveBuffer: Buffer.alloc(0),
            fragmentedOpcode: null,
            fragmentChunks: [],
            fragmentLength: 0
        });

        // Handle socket events
        socket.on('data', (buffer) => handleWebSocketData(clientId, buffer));
        socket.on('close', () => handleDisconnect(clientId));
        socket.on('error', (err) => {
            logMessage(`Socket error for client ${clientId}: ${err.message}`);
            socket.destroy();
        });

        // Send welcome message
        sendToClient(clientId, {
            type: 'welcome',
            server: 'Jackalopes WebSocket Server',
            timestamp: Date.now()
        });

        logMessage(`Client ${clientId} connected`);
    } catch (err) {
        logMessage(`Error in handleWebSocketUpgrade: ${err.message}`);
        socket.destroy();
    }
}

/**
 * Generate the Sec-WebSocket-Accept header value
 */
function generateAcceptKey(key) {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    const crypto = require('crypto');
    return crypto.createHash('sha1')
        .update(key + GUID, 'binary')
        .digest('base64');
}

/**
 * Handle incoming WebSocket data
 */
function handleWebSocketData(clientId, buffer) {
    try {
        const client = clients.get(clientId);
        if (!client) return;

        client.receiveBuffer = Buffer.concat([client.receiveBuffer, buffer]);
        if (client.receiveBuffer.length > MAX_WEBSOCKET_MESSAGE_SIZE) {
            throw new Error('WebSocket receive buffer exceeded maximum size');
        }

        const { frames, remaining } = decodeWebSocketFrames(client.receiveBuffer);
        client.receiveBuffer = remaining;

        for (const frame of frames) {
            if (frame.opcode === 8) { // Close
                client.socket.write(encodeWebSocketFrame(frame.payload, 8));
                client.socket.end();
                return;
            }

            if (frame.opcode === 9) { // Ping
                client.socket.write(encodeWebSocketFrame(frame.payload, 10));
                continue;
            }

            if (frame.opcode === 10) { // Pong
                continue;
            }

            if (frame.opcode === 0) { // Continuation
                if (client.fragmentedOpcode === null) {
                    throw new Error('Unexpected WebSocket continuation frame');
                }

                client.fragmentChunks.push(frame.payload);
                client.fragmentLength += frame.payload.length;
                if (client.fragmentLength > MAX_WEBSOCKET_MESSAGE_SIZE) {
                    throw new Error('Fragmented WebSocket message exceeded maximum size');
                }

                if (frame.fin) {
                    const messagePayload = Buffer.concat(client.fragmentChunks, client.fragmentLength);
                    const messageOpcode = client.fragmentedOpcode;
                    client.fragmentedOpcode = null;
                    client.fragmentChunks = [];
                    client.fragmentLength = 0;

                    if (messageOpcode === 1) {
                        handleClientMessage(clientId, messagePayload.toString('utf8'));
                    }
                }
                continue;
            }

            if (frame.opcode === 1 && frame.fin) { // Complete text frame
                const message = frame.payload.toString('utf8');
                handleClientMessage(clientId, message);
                continue;
            }

            if (frame.opcode === 1) { // First fragment of a text message
                if (client.fragmentedOpcode !== null) {
                    throw new Error('Started a new WebSocket message before finishing the previous one');
                }
                client.fragmentedOpcode = frame.opcode;
                client.fragmentChunks = [frame.payload];
                client.fragmentLength = frame.payload.length;
                continue;
            }

            if (frame.opcode === 2) {
                throw new Error('Binary WebSocket messages are not supported');
            }
        }
    } catch (err) {
        logMessage(`Error processing data from client ${clientId}: ${err.message}`);
        const client = clients.get(clientId);
        if (client?.socket && !client.socket.destroyed) {
            client.socket.destroy();
        }
    }
}

/**
 * Decode WebSocket frames from buffer
 */
function decodeWebSocketFrames(buffer) {
    const frames = [];
    let offset = 0;

    while (buffer.length - offset >= 2) {
        const firstByte = buffer[offset];
        const secondByte = buffer[offset + 1];

        const fin = Boolean(firstByte & 0x80);
        const opcode = firstByte & 0x0F;
        const masked = Boolean(secondByte & 0x80);
        let payloadLength = secondByte & 0x7F;

        if (firstByte & 0x70) {
            throw new Error('Unsupported WebSocket extension bits');
        }
        if (!masked) {
            throw new Error('Client WebSocket frames must be masked');
        }
        if (opcode >= 8 && (!fin || payloadLength > 125)) {
            throw new Error('Invalid WebSocket control frame');
        }

        let headerLength = 2;

        if (payloadLength === 126) {
            if (buffer.length - offset < 4) break;
            payloadLength = buffer.readUInt16BE(offset + 2);
            headerLength += 2;
        } else if (payloadLength === 127) {
            if (buffer.length - offset < 10) break;
            const largePayloadLength = buffer.readBigUInt64BE(offset + 2);
            if (largePayloadLength > BigInt(Number.MAX_SAFE_INTEGER)) {
                throw new Error('WebSocket frame is too large');
            }
            payloadLength = Number(largePayloadLength);
            headerLength += 8;
        }

        if (payloadLength > MAX_WEBSOCKET_MESSAGE_SIZE) {
            throw new Error('WebSocket frame exceeded maximum size');
        }

        headerLength += 4;
        const frameLength = headerLength + payloadLength;
        if (buffer.length - offset < frameLength) break;

        const maskingKeyOffset = offset + headerLength - 4;
        const maskingKey = buffer.subarray(maskingKeyOffset, maskingKeyOffset + 4);
        const payloadStart = offset + headerLength;
        const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + payloadLength));

        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= maskingKey[i % 4];
        }

        frames.push({
            fin,
            opcode,
            payload
        });

        offset += frameLength;
    }

    return {
        frames,
        remaining: Buffer.from(buffer.subarray(offset))
    };
}

/**
 * Handle client messages
 */
function handleClientMessage(clientId, message) {
    try {
        const data = JSON.parse(message);
        const client = clients.get(clientId);
        
        if (!client) {
            return;
        }
        
        if (data.type !== 'auth' && enforceBedtime(clientId)) return;
        logMessage(`Received ${data.type} from client ${clientId}`);
        
        switch (data.type) {
            case 'auth':
                handleAuth(clientId, data);
                break;
                
            case 'join_session':
                handleJoinSession(clientId, data);
                break;
                
            case 'player_update':
                handlePlayerUpdate(clientId, data);
                break;

            case 'request_player_list': {
                const client = clients.get(clientId);
                const session = client && sessions.get(client.sessionId);
                if (client?.authenticated && session) {
                    sendToClient(clientId, {
                        type: 'player_list',
                        players: getSessionPlayers(session, client.playerId)
                    });
                }
                break;
            }
                
            case 'game_event':
                handleGameEvent(clientId, data);
                break;
                
            case 'chat':
                handleChat(clientId, data);
                break;

            case 'voice_signal':
                handleVoiceSignal(clientId, data);
                break;

            case 'flashlight_pickup':
                handleFlashlightPickup(clientId, data);
                break;
                
            case 'leave_session':
                handleLeaveSession(clientId);
                break;
                
            default:
                sendToClient(clientId, {
                    type: 'error',
                    message: `Unknown message type: ${data.type}`
                });
                break;
        }
    } catch (err) {
        logMessage(`Error handling message from client ${clientId}: ${err.message}`);
    }
}

function enforceBedtime(clientId) {
    const client = clients.get(clientId);
    if (!client?.deviceId) return false;
    const status = bedtime.status(client.deviceId);
    if (!status.locked) return false;
    sendToClient(clientId, { type: 'bedtime', ...status });
    if (client.sessionId) handleLeaveSession(clientId);
    client.authenticated = false;
    client.socket.end(encodeWebSocketFrame(Buffer.from([0x0f, 0xa1]), 8));
    return true;
}
setInterval(() => {
    for (const clientId of clients.keys()) enforceBedtime(clientId);
}, 1000).unref();

// Track persistentId -> clientId mapping for graceful reconnection
const persistentIdMap = new Map();

/**
 * Handle authentication requests
 */
function handleAuth(clientId, data) {
    const client = clients.get(clientId);

    if (data.deviceId) {
        try {
            bedtime.register(data.deviceId, client.userAgent, data);
            client.deviceId = data.deviceId;
        } catch (_) { return; }
    }
    if (enforceBedtime(clientId)) return;

    if (!data.playerName) {
        sendToClient(clientId, {
            type: 'error',
            message: 'Missing playerName in auth request'
        });
        return;
    }

    const playerName = data.playerName.replace(/[^\w\s]/g, '');
    const persistentId = data.persistentId;

    // Graceful reconnection: only swap if old socket is actually dead
    // This prevents localStorage-shared persistentIds from kicking each other out
    if (persistentId && persistentIdMap.has(persistentId)) {
        const oldClientId = persistentIdMap.get(persistentId);
        const oldClient = clients.get(oldClientId);

        if (oldClient && oldClientId !== clientId) {
            // Check if old socket is actually dead/disconnected
            const oldSocketDead = !oldClient.socket || oldClient.socket.destroyed;

            if (oldSocketDead) {
                // Old socket is dead - this is a true reconnection, swap sockets
                logMessage(`Reconnection detected for persistentId ${persistentId}: swapping client ${oldClientId} -> ${clientId}`);

                // Transfer session membership to new client
                client.sessionId = oldClient.sessionId;
                client.playerName = oldClient.playerName || playerName;
                client.authenticated = true;
                client.playerId = oldClient.playerId;
                client.persistentId = persistentId;

                // Update session's player map to point to new clientId
                if (oldClient.sessionId) {
                    const session = sessions.get(oldClient.sessionId);
                    if (session && session.players.has(oldClient.playerId)) {
                        session.players.set(oldClient.playerId, clientId);
                        logMessage(`Session ${oldClient.sessionId}: swapped clientId for player ${oldClient.playerId}`);
                    }
                }

                clients.delete(oldClientId);

                // Update persistentId map
                persistentIdMap.set(persistentId, clientId);

                // Send auth_success with existing playerId
                sendToClient(clientId, {
                    type: 'auth_success',
                    player: {
                        id: client.playerId,
                        name: client.playerName
                    }
                });

                logMessage(`Client ${clientId} reconnected as ${client.playerName} (swap from ${oldClientId})`);
                return;
            } else {
                // Old socket is still alive - this is a DIFFERENT player with same persistentId
                // (e.g., two browser windows sharing localStorage)
                // Treat as a new player, don't overwrite the persistentId mapping
                logMessage(`New connection with existing persistentId ${persistentId} but old socket still alive - treating as new player`);
                // Fall through to normal auth flow below
            }
        }
    }

    // Normal auth flow for new connections
    client.playerName = playerName;
    client.authenticated = true;
    client.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
    client.persistentId = persistentId;
    client.playerType = data.playerType || null; // Store playerType from auth if provided

    // Track persistentId -> clientId
    if (persistentId) {
        persistentIdMap.set(persistentId, clientId);
    }

    sendToClient(clientId, {
        type: 'auth_success',
        player: {
            id: client.playerId,
            name: playerName
        }
    });

    logMessage(`Client ${clientId} authenticated as ${playerName}`);
}

/**
 * Handle session join requests
 */
function handleJoinSession(clientId, data) {
    const client = clients.get(clientId);
    const gameMode = data.gameMode === 'adventure' ? 'adventure' : 'hunt';
    
    if (!client.authenticated) {
        sendToClient(clientId, {
            type: 'error',
            message: 'You must authenticate before joining a session'
        });
        return;
    }
    
    // Generate or use provided session key
    let sessionId;
    let sessionKey;
    
    if (data.sessionKey) {
        sessionKey = data.sessionKey;

        // Log session search
        logMessage(`Client ${clientId} looking for session with key: "${sessionKey}"`);
        logMessage(`Current sessions: ${Array.from(sessions.entries()).map(([id, s]) => `${id}="${s.key}"`).join(', ') || 'none'}`);

        // Find session with this key
        let found = false;
        for (const [id, session] of sessions.entries()) {
            if (session.key === sessionKey && session.gameMode === gameMode) {
                sessionId = id;
                found = true;
                logMessage(`Found existing session ${sessionId} with key "${sessionKey}" (${session.players.size} players)`);
                break;
            }
        }

        if (!found) {
            // Create new session with the provided key
            sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
            sessions.set(sessionId, {
                key: sessionKey,
                gameMode,
                players: new Map(),
                created: Date.now(),
                matchStartTime: Date.now(),
                matchDuration: 300,
            });
            logMessage(`Created NEW session ${sessionId} with key "${sessionKey}"`);
        }
    } else {
        // Create a new session with a random key
        sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
        sessionKey = Math.random().toString(36).substr(2, 9).toUpperCase();
        
        sessions.set(sessionId, {
            key: sessionKey,
            gameMode,
            players: new Map(),
            created: Date.now(),
            matchStartTime: Date.now(),
            matchDuration: 300,
        });
    }
    
    const session = sessions.get(sessionId);

    // A client can belong to only one lobby, including when switching modes.
    if (client.sessionId && client.sessionId !== sessionId) {
        handleLeaveSession(clientId);
        client.lastState = null;
    }

    if (!session.matchStartTime) {
        session.matchStartTime = Date.now();
    }
    if (!session.matchDuration) {
        session.matchDuration = 300;
    }

    // Cancel any pending deletion timer for this session
    if (sessionDeletionTimers.has(sessionId)) {
        clearTimeout(sessionDeletionTimers.get(sessionId));
        sessionDeletionTimers.delete(sessionId);
        logMessage(`Session ${sessionId} deletion cancelled - player rejoining`);
    }

    // CRITICAL: Clean up any ghost players from the same persistentId in this session
    // This handles cases where React StrictMode or page reloads create duplicate connections
    // BUT only remove if the old socket is actually dead - don't kill live connections
    if (client.persistentId) {
        const ghostsToRemove = [];
        for (const [playerId, otherClientId] of session.players.entries()) {
            if (otherClientId === clientId) continue; // Skip ourselves
            const otherClient = clients.get(otherClientId);
            if (otherClient && otherClient.persistentId === client.persistentId) {
                // Only treat as ghost if socket is actually dead
                const socketDead = !otherClient.socket || otherClient.socket.destroyed;
                if (socketDead) {
                    ghostsToRemove.push({ playerId, clientId: otherClientId, client: otherClient });
                } else {
                    logMessage(`Same persistentId but socket still alive - allowing both connections (client ${otherClientId} and ${clientId})`);
                }
            }
        }

        // Remove ghost players and notify others
        for (const ghost of ghostsToRemove) {
            logMessage(`Removing ghost player ${ghost.playerId} (client ${ghost.clientId}) with same persistentId as joining client ${clientId}`);
            session.players.delete(ghost.playerId);

            // Notify other players about the removal
            for (const [otherId, otherClientId] of session.players.entries()) {
                sendToClient(otherClientId, {
                    type: 'player_left',
                    id: ghost.playerId,
                    player: ghost.playerId,
                    playerName: ghost.client.playerName
                });
            }

            // Close the ghost's socket if still open
            if (ghost.client.socket && !ghost.client.socket.destroyed) {
                ghost.client.socket.destroy();
            }
            clients.delete(ghost.clientId);
        }
    }

    client.gameMode = gameMode;

    // Adventure is cooperative: every connection is a jackalope.
    if (gameMode === 'adventure') {
        client.playerType = 'jackalope';
    } else if (data.preferredRole) {
        client.playerType = data.preferredRole;
    }
    
    // Auto-assign playerType if not set: balance teams
    if (!client.playerType) {
        let mercCount = 0;
        let jackalopeCount = 0;
        for (const [pid, cid] of session.players.entries()) {
            const c = clients.get(cid);
            if (c && c.playerType === 'merc') mercCount++;
            else if (c && c.playerType === 'jackalope') jackalopeCount++;
        }
        client.playerType = mercCount <= jackalopeCount ? 'merc' : 'jackalope';
        logMessage(`Auto-assigned playerType '${client.playerType}' to ${client.playerName} (mercs=${mercCount}, jackalopes=${jackalopeCount})`);
    }
    
    if (!session.flashlightPickup) {
        const flashlightSpawnPoints = [
            [-55, 2.4, -18],
            [-42, 2.4, 24],
            [-68, 2.4, 8],
            [-32, 2.4, -36],
            [-78, 2.4, -8],
            [-26, 2.4, 36],
        ];
        session.flashlightPickup = {
            collected: false,
            spawnPoint: flashlightSpawnPoints[Math.floor(Math.random() * flashlightSpawnPoints.length)],
            collectedBy: null,
        };
    }

    // Add player to session
    session.players.set(client.playerId, clientId);
    client.sessionId = sessionId;
    
    // Include authoritative state so late joiners see stationary players too.
    const existingPlayers = getSessionPlayers(session, client.playerId);

    // Notify client of successful join
    sendToClient(clientId, {
        type: 'join_success',
        session: {
            id: sessionId,
            key: sessionKey
        },
        player: {
            id: client.playerId,
            name: client.playerName
        },
        playerType: client.playerType,
        players: existingPlayers,
        gameMode,
        flashlightPickup: session.flashlightPickup,
        matchStartTime: session.matchStartTime,
        matchDuration: session.matchDuration,
        serverTime: Date.now(),
    });

    // CRITICAL: Send joining player info about all existing players in session
    // This is what allows them to see other players who joined before them
    for (const existingPlayer of Object.values(existingPlayers)) {
        logMessage(`Sending player_joined for existing player ${existingPlayer.id} to new client ${clientId}`);
        sendToClient(clientId, {
            type: 'player_joined',
            player: {
                id: existingPlayer.id,
                name: existingPlayer.name
            },
            playerType: existingPlayer.playerType,
            initialState: existingPlayer
        });
    }

    // Notify other players in session about the new player
    for (const [otherId, otherClientId] of session.players.entries()) {
        if (otherId !== client.playerId) {
            sendToClient(otherClientId, {
                type: 'player_joined',
                player: {
                    id: client.playerId,
                    name: client.playerName
                },
                playerType: client.playerType,
                initialState: getPlayerState(client)
            });
        }
    }

    logMessage(`Client ${clientId} (${client.playerName}) joined session ${sessionId} with ${Object.keys(existingPlayers).length} existing players`);
}

function getPlayerState(client) {
    return {
        position: [0, 1, 0],
        rotation: [0, 0, 0, 1],
        health: 100,
        flashlightOn: false,
        ...client.lastState,
        id: client.playerId,
        name: client.playerName,
        playerType: client.playerType
    };
}

function getSessionPlayers(session, excludedPlayerId) {
    const players = {};
    for (const [playerId, clientId] of session.players) {
        const client = clients.get(clientId);
        if (playerId === excludedPlayerId || !client || client.socket.destroyed) continue;
        players[playerId] = getPlayerState(client);
    }
    return players;
}

/**
 * Handle player update messages
 */
function handlePlayerUpdate(clientId, data) {
    const client = clients.get(clientId);
    
    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }
    
    if (!data.state) {
        sendToClient(clientId, {
            type: 'error',
            message: 'Missing state in player_update'
        });
        return;
    }
    
    const session = sessions.get(client.sessionId);
    if (!session) return;

    // Retain the latest state for joins and explicit roster recovery requests.
    client.lastState = { ...client.lastState, ...data.state, playerType: client.playerType };
    
    // Broadcast to other players in session
    for (const [otherId, otherClientId] of session.players.entries()) {
        if (otherId !== client.playerId) {
            sendToClient(otherClientId, {
                type: 'player_update',
                id: client.playerId,  // Client expects 'id' not 'player'
                position: data.state?.position,
                rotation: data.state?.rotation,
                state: data.state,
                timestamp: Date.now()
            });
        }
    }
}

/**
 * Handle game events
 */
function handleGameEvent(clientId, data) {
    const client = clients.get(clientId);
    
    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }
    
    if (!data.event) {
        sendToClient(clientId, {
            type: 'error',
            message: 'Missing event in game_event'
        });
        return;
    }
    
    const session = sessions.get(client.sessionId);
    if (!session) return;
    
    // Add player and timestamp information
    const event = data.event;
    event.player = client.playerId;
    event.timestamp = Date.now();

    if (event.event_type === 'game_score_update' && event.source === 'timer_reset') {
        session.matchStartTime = Date.now();
        if (!session.matchDuration) {
            session.matchDuration = 300;
        }

        for (const [_, otherClientId] of session.players.entries()) {
            sendToClient(otherClientId, {
                type: 'match_timer',
                matchStartTime: session.matchStartTime,
                matchDuration: session.matchDuration,
                serverTime: Date.now(),
            });
        }
    }

    // Broadcast to all players in session (including sender)
    for (const [_, otherClientId] of session.players.entries()) {
        sendToClient(otherClientId, {
            type: 'game_event',
            event: event
        });
    }
}

/**
 * Handle chat messages
 */
function handleChat(clientId, data) {
    const client = clients.get(clientId);
    
    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }
    
    if (!data.message || !data.message.trim()) {
        return;
    }
    
    const session = sessions.get(client.sessionId);
    if (!session) return;

    const chatId = data.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const requestedScope = data.scope === 'team' || data.scope === 'proxy' || data.scope === 'all'
        ? data.scope
        : 'all';
    const playerType = client.playerType || data.playerType || 'merc';
    
    const message = data.message.replace(/[^\w\s.!?,:'"()\-]/g, '');

    const recipients = [];
    for (const [_, otherClientId] of session.players.entries()) {
        const otherClient = clients.get(otherClientId);
        if (!otherClient) continue;

        let shouldSend = false;
        let deliveredByProxy = false;
        let effectiveScope = requestedScope;

        if (requestedScope === 'all') {
            shouldSend = true;
        } else if (requestedScope === 'team') {
            shouldSend = (otherClient.playerType || 'merc') === playerType;
        } else if (requestedScope === 'proxy') {
            shouldSend = (otherClient.playerType || 'merc') !== playerType;
            deliveredByProxy = shouldSend;
            effectiveScope = 'team';
        }

        if (shouldSend) {
            recipients.push({ otherClientId, deliveredByProxy, effectiveScope });
        }
    }

    for (const recipient of recipients) {
        sendToClient(recipient.otherClientId, {
            type: 'chat',
            id: chatId,
            player: client.playerId,
            playerName: client.playerName,
            playerType,
            message,
            scope: requestedScope,
            deliveredByProxy: recipient.deliveredByProxy,
            effectiveScope: recipient.effectiveScope,
            timestamp: Date.now()
        });
    }
}

function handleFlashlightPickup(clientId, data) {
    const client = clients.get(clientId);

    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }

    const session = sessions.get(client.sessionId);
    if (!session || !session.flashlightPickup) return;

    if (session.flashlightPickup.collected) return;

    session.flashlightPickup.collected = true;
    session.flashlightPickup.collectedBy = client.playerId;
    session.flashlightPickup.collectedAt = Date.now();

    for (const [_, otherClientId] of session.players.entries()) {
        sendToClient(otherClientId, {
            type: 'flashlight_pickup',
            flashlightPickup: session.flashlightPickup,
            player: client.playerId,
            timestamp: Date.now()
        });
    }
}

function handleVoiceSignal(clientId, data) {
    const client = clients.get(clientId);

    if (!client || !client.authenticated || !client.sessionId || !data.signal) {
        return;
    }

    const session = sessions.get(client.sessionId);
    if (!session) return;

    const requestedScope = data.scope === 'team' || data.scope === 'proxy' || data.scope === 'all'
        ? data.scope
        : 'team';
    const playerType = client.playerType || 'merc';
    const targetPlayerId = data.targetPlayerId || null;

    for (const [otherPlayerId, otherClientId] of session.players.entries()) {
        if (otherPlayerId === client.playerId) continue;
        if (targetPlayerId && otherPlayerId !== targetPlayerId) continue;

        const otherClient = clients.get(otherClientId);
        if (!otherClient) continue;

        const otherType = otherClient.playerType || 'merc';
        const shouldSend = requestedScope === 'all'
            || (requestedScope === 'team' && otherType === playerType)
            || (requestedScope === 'proxy' && otherType !== playerType);

        if (!shouldSend) continue;

        sendToClient(otherClientId, {
            type: 'voice_signal',
            fromPlayerId: client.playerId,
            fromPlayerName: client.playerName,
            fromPlayerType: playerType,
            scope: requestedScope,
            targetPlayerId: otherPlayerId,
            signal: data.signal,
            timestamp: Date.now()
        });
    }
}

/**
 * Handle session leave requests
 */
function handleLeaveSession(clientId) {
    const client = clients.get(clientId);
    
    if (!client || !client.sessionId) {
        return;
    }
    
    const session = sessions.get(client.sessionId);
    if (!session) {
        client.sessionId = null;
        return;
    }
    
    // Remove player from session
    session.players.delete(client.playerId);
    
    // Notify other players
    for (const [_, otherClientId] of session.players.entries()) {
        sendToClient(otherClientId, {
            type: 'player_left',
            id: client.playerId,
            player: client.playerId,
            playerName: client.playerName
        });
    }
    
    // Clean up empty sessions with a grace period
    if (session.players.size === 0) {
        const sessionIdToDelete = client.sessionId;
        logMessage(`Session ${sessionIdToDelete} is empty, starting ${SESSION_DELETION_GRACE_PERIOD/1000}s grace period`);

        // Cancel any existing timer for this session
        if (sessionDeletionTimers.has(sessionIdToDelete)) {
            clearTimeout(sessionDeletionTimers.get(sessionIdToDelete));
        }

        // Set a timer to delete after grace period
        const timer = setTimeout(() => {
            const sessionToDelete = sessions.get(sessionIdToDelete);
            if (sessionToDelete && sessionToDelete.players.size === 0) {
                sessions.delete(sessionIdToDelete);
                logMessage(`Session ${sessionIdToDelete} removed after grace period (still empty)`);
            }
            sessionDeletionTimers.delete(sessionIdToDelete);
        }, SESSION_DELETION_GRACE_PERIOD);

        sessionDeletionTimers.set(sessionIdToDelete, timer);
    }
    
    logMessage(`Client ${clientId} (${client.playerName}) left session ${client.sessionId}`);
    client.sessionId = null;
}

/**
 * Handle client disconnection
 */
function handleDisconnect(clientId) {
    const client = clients.get(clientId);

    if (!client) {
        return;
    }

    // Clean up persistentId map
    if (client.persistentId && persistentIdMap.get(client.persistentId) === clientId) {
        persistentIdMap.delete(client.persistentId);
    }

    // Handle session leave if in a session
    if (client.sessionId) {
        handleLeaveSession(clientId);
    }

    // Remove client
    clients.delete(clientId);
    logMessage(`Client ${clientId} disconnected`);
}

/**
 * Send a message to a client
 */
function sendToClient(clientId, message) {
    const client = clients.get(clientId);
    
    if (!client || !client.socket || client.socket.destroyed) {
        return;
    }
    
    try {
        const messageStr = JSON.stringify(message);
        const frame = encodeWebSocketFrame(messageStr);
        client.socket.write(frame);
    } catch (err) {
        logMessage(`Error sending to client ${clientId}: ${err.message}`);
    }
}

/**
 * Encode a message as a WebSocket frame
 */
function encodeWebSocketFrame(message, opcode = 1) {
    const payload = Buffer.isBuffer(message) ? message : Buffer.from(message);
    const payloadLength = payload.length;
    
    let header;
    let headerSize;
    
    // Determine frame header size based on payload length
    if (payloadLength <= 125) {
        header = Buffer.alloc(2);
        header[1] = payloadLength;
        headerSize = 2;
    } else if (payloadLength <= 65535) {
        header = Buffer.alloc(4);
        header[1] = 126;
        header.writeUInt16BE(payloadLength, 2);
        headerSize = 4;
    } else {
        header = Buffer.alloc(10);
        header[1] = 127;
        header.writeUInt32BE(0, 2);
        header.writeUInt32BE(payloadLength, 6);
        headerSize = 10;
    }
    
    // Set the first byte: FIN bit and frame opcode
    header[0] = 0x80 | opcode;
    
    // Create the final buffer
    const frame = Buffer.alloc(headerSize + payloadLength);
    header.copy(frame, 0);
    payload.copy(frame, headerSize);
    
    return frame;
}

/**
 * Handle server shutdown
 */
function shutdownServer() {
    logMessage('Server shutting down...');
    
    // Close all connections
    for (const [clientId, client] of clients.entries()) {
        try {
            if (client.socket && !client.socket.destroyed) {
                client.socket.destroy();
            }
        } catch (err) {
            // Ignore errors during shutdown
        }
    }
    
    // Close the server
    server.close(() => {
        logMessage('Server stopped');
        process.exit(0);
    });
}

/**
 * Log a message to the server log file
 */
function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    
    // Log to console
    console.log(message);
    
    // Log to file
    fs.appendFile(path.join(__dirname, 'server.log'), logLine, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });
} 
