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

// Get port from environment variable or use default
const PORT = process.env.SERVER_PORT || 8082;

// Storage for active connections and game sessions
const clients = new Map();
const sessions = new Map();
const sessionDeletionTimers = new Map(); // Grace period timers for empty sessions
let clientIdCounter = 1;

// Grace period before deleting empty sessions (ms)
const SESSION_DELETION_GRACE_PERIOD = 10000;
const PLAYER_INACTIVE_TIMEOUT = 15000;
const INACTIVE_SWEEP_INTERVAL = 5000;
const ROUND_RESET_INACTIVE_TIMEOUT = 8000;

// Create an HTTP server for WebSocket handshake
const server = http.createServer((req, res) => {
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

setInterval(() => {
    const now = Date.now();

    for (const [clientId, client] of clients.entries()) {
        if (!client || !client.sessionId) continue;
        if (!client.lastSeen) continue;

        const inactiveFor = now - client.lastSeen;
        if (inactiveFor < PLAYER_INACTIVE_TIMEOUT) continue;

        logMessage(`Client ${clientId} (${client.playerName || 'unknown'}) inactive for ${inactiveFor}ms - removing from lobby/session`);

        const sessionId = client.sessionId;
        const playerId = client.playerId;
        const playerName = client.playerName;

        handleLeaveSession(clientId);

        if (client.socket && !client.socket.destroyed) {
            try {
                client.socket.destroy();
            } catch (err) {
                logMessage(`Error destroying inactive client ${clientId} socket: ${err.message}`);
            }
        }

        clients.delete(clientId);
        logMessage(`Inactive client ${clientId} (${playerName || playerId || 'unknown'}) purged from session ${sessionId}`);
    }
}, INACTIVE_SWEEP_INTERVAL);

function purgeInactivePlayersInSession(sessionId, inactiveTimeoutMs, reason = 'inactive cleanup') {
    const now = Date.now();

    for (const [clientId, client] of clients.entries()) {
        if (!client || client.sessionId !== sessionId) continue;
        if (!client.lastSeen) continue;

        const inactiveFor = now - client.lastSeen;
        if (inactiveFor < inactiveTimeoutMs) continue;

        logMessage(`Client ${clientId} (${client.playerName || 'unknown'}) inactive for ${inactiveFor}ms during ${reason} - removing from lobby/session`);

        const playerId = client.playerId;
        const playerName = client.playerName;

        handleLeaveSession(clientId);

        if (client.socket && !client.socket.destroyed) {
            try {
                client.socket.destroy();
            } catch (err) {
                logMessage(`Error destroying ${reason} client ${clientId} socket: ${err.message}`);
            }
        }

        clients.delete(clientId);
        logMessage(`${reason} purged client ${clientId} (${playerName || playerId || 'unknown'}) from session ${sessionId}`);
    }
}

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
            lastSeen: Date.now(),
            receiveBuffer: Buffer.alloc(0)
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

        const buffered = client.receiveBuffer && client.receiveBuffer.length
            ? Buffer.concat([client.receiveBuffer, buffer])
            : buffer;

        const { frames, remaining } = decodeWebSocketFrames(buffered);
        client.receiveBuffer = remaining;

        for (const frame of frames) {
            if (frame.opcode === 8) { // Close frame
                handleDisconnect(clientId);
                return;
            }

            if (frame.opcode === 1 || frame.opcode === 0) { // Text / continuation frame
                const isContinuation = frame.opcode === 0;

                if (!isContinuation) {
                    client.textFrameBuffer = frame.payload;
                } else if (client.textFrameBuffer && client.textFrameBuffer.length) {
                    client.textFrameBuffer = Buffer.concat([client.textFrameBuffer, frame.payload]);
                } else {
                    client.textFrameBuffer = frame.payload;
                }

                if (!frame.fin) {
                    continue;
                }

                const completePayload = client.textFrameBuffer || frame.payload;
                client.textFrameBuffer = null;
                const message = completePayload.toString('utf8');
                handleClientMessage(clientId, message);
            }
        }
    } catch (err) {
        logMessage(`Error processing data from client ${clientId}: ${err.message}`);
    }
}

/**
 * Decode WebSocket frames from buffer
 */
function decodeWebSocketFrames(buffer) {
    const frames = [];
    let offset = 0;

    while (offset < buffer.length) {
        const frameStart = offset;

        if (buffer.length - offset < 2) {
            break;
        }

        const firstByte = buffer[offset];
        const secondByte = buffer[offset + 1];

        const fin = Boolean(firstByte & 0x80);
        const opcode = firstByte & 0x0F;
        const masked = Boolean(secondByte & 0x80);
        let payloadLength = secondByte & 0x7F;

        offset += 2;

        if (payloadLength === 126) {
            if (buffer.length - offset < 2) {
                offset = frameStart;
                break;
            }
            payloadLength = buffer.readUInt16BE(offset);
            offset += 2;
        } else if (payloadLength === 127) {
            if (buffer.length - offset < 8) {
                offset = frameStart;
                break;
            }
            // 64-bit length is not fully supported, but this keeps framing correct.
            payloadLength = buffer.readUInt32BE(offset + 4);
            offset += 8;
        }

        let maskingKey;
        if (masked) {
            if (buffer.length - offset < 4) {
                offset = frameStart;
                break;
            }
            maskingKey = buffer.slice(offset, offset + 4);
            offset += 4;
        }

        if (buffer.length - offset < payloadLength) {
            offset = frameStart;
            break;
        }

        const payload = Buffer.from(buffer.slice(offset, offset + payloadLength));

        if (masked) {
            for (let i = 0; i < payload.length; i++) {
                payload[i] = payload[i] ^ maskingKey[i % 4];
            }
        }

        frames.push({
            fin,
            opcode,
            masked,
            payloadLength,
            payload
        });

        offset += payloadLength;
    }

    return {
        frames,
        remaining: buffer.slice(offset)
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

            case 'request_player_list':
                handleRequestPlayerList(clientId);
                break;

            case 'game_snapshot':
                // Legacy client message; ignore to avoid noisy unsupported-message churn.
                break;
                
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

// Track persistentId -> clientId mapping for graceful reconnection
const persistentIdMap = new Map();

/**
 * Handle authentication requests
 */
function handleAuth(clientId, data) {
    const client = clients.get(clientId);

    if (!data.playerName) {
        sendToClient(clientId, {
            type: 'error',
            message: 'Missing playerName in auth request'
        });
        return;
    }

    const playerName = data.playerName.replace(/[^\w\s]/g, '');
    const persistentId = data.persistentId;

    // Graceful reconnection: if this persistentId already has a connection, swap sockets
    if (persistentId && persistentIdMap.has(persistentId)) {
        const oldClientId = persistentIdMap.get(persistentId);
        const oldClient = clients.get(oldClientId);

        if (oldClient && oldClientId !== clientId) {
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

            // Close the old socket without triggering player_left
            if (oldClient.socket && !oldClient.socket.destroyed) {
                oldClient.socket.destroy();
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
        
        // Find session with this key
        let found = false;
        for (const [id, session] of sessions.entries()) {
            if (session.key === sessionKey) {
                sessionId = id;
                found = true;
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

    const existingPlayers = {};
    for (const [otherId, otherClientId] of session.players.entries()) {
        if (otherId === client.playerId) continue;

        const otherClient = clients.get(otherClientId);
        const otherState = otherClient?.lastState || {};

        existingPlayers[otherId] = {
            position: otherState.position || [0, 1, 0],
            rotation: otherState.rotation || [0, 0, 0, 1],
            health: 100,
            playerType: otherClient?.playerType || 'merc',
            flashlightOn: !!otherState.flashlightOn,
            cameraPitch: otherState.cameraPitch || 0,
            droneActive: !!otherState.droneActive,
            dronePosition: otherState.dronePosition,
            droneRotation: otherState.droneRotation,
            droneThermalActive: !!otherState.droneThermalActive,
        };
    }
    
    // Notify client
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
        players: existingPlayers,
        playerType: client.playerType,
        gameMode,
        flashlightPickup: session.flashlightPickup,
        matchStartTime: session.matchStartTime,
        matchDuration: session.matchDuration,
        serverTime: Date.now(),
    });
    
    // Notify other players in session
    for (const [otherId, otherClientId] of session.players.entries()) {
        if (otherId !== client.playerId) {
            sendToClient(otherClientId, {
                type: 'player_joined',
                player: {
                    id: client.playerId,
                    name: client.playerName
                },
                playerType: client.playerType,
                initialState: client.lastState || {
                    position: [0, 1, 0],
                    rotation: [0, 0, 0, 1],
                    health: 100,
                    playerType: client.playerType,
                }
            });
        }
    }
    
    logMessage(`Client ${clientId} (${client.playerName}) joined session ${sessionId}`);
}

/**
 * Handle player update messages
 */
function handlePlayerUpdate(clientId, data) {
    const client = clients.get(clientId);
    
    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }
    
    client.lastSeen = Date.now();

    if (!data.state) {
        sendToClient(clientId, {
            type: 'error',
            message: 'Missing state in player_update'
        });
        return;
    }

    client.lastState = data.state;
    
    const session = sessions.get(client.sessionId);
    if (!session) return;
    
    // Broadcast to other players in session
    for (const [otherId, otherClientId] of session.players.entries()) {
        if (otherId !== client.playerId) {
            sendToClient(otherClientId, {
                type: 'player_update',
                player: client.playerId,
                state: data.state,
                timestamp: Date.now()
            });
        }
    }
}

function handleRequestPlayerList(clientId) {
    const client = clients.get(clientId);

    if (!client || !client.authenticated || !client.sessionId) {
        return;
    }

    const session = sessions.get(client.sessionId);
    if (!session) return;

    const players = {};

    for (const [playerId, playerClientId] of session.players.entries()) {
        const sessionClient = clients.get(playerClientId);
        const state = sessionClient?.lastState || {};

        players[playerId] = {
            position: state.position || [0, 1, 0],
            rotation: state.rotation || [0, 0, 0, 1],
            health: 100,
            playerType: sessionClient?.playerType || 'merc',
            flashlightOn: !!state.flashlightOn,
            cameraPitch: state.cameraPitch || 0,
            droneActive: !!state.droneActive,
            dronePosition: state.dronePosition,
            droneRotation: state.droneRotation,
            droneThermalActive: !!state.droneThermalActive,
        };
    }

    sendToClient(clientId, {
        type: 'player_list',
        players,
        session: {
            id: client.sessionId,
            key: session.key,
        },
        serverTime: Date.now(),
    });
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
    
    client.lastSeen = Date.now();

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

        purgeInactivePlayersInSession(client.sessionId, ROUND_RESET_INACTIVE_TIMEOUT, 'round reset cleanup');
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
    
    // Sanitize message
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

/**
 * Handle session leave requests
 */
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
function encodeWebSocketFrame(message) {
    const payload = Buffer.from(message);
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
    
    // Set the first byte: FIN bit and opcode for text frame
    header[0] = 0x81;
    
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
