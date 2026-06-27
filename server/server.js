const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const CONSTANTS = require('../shared/constants');
const { ITEMS } = require('../shared/itemData');
const PacketTypes = require('../shared/packets');
const World = require('./world');
const Player = require('./player');
const AuthManager = require('./auth');
const TradeManager = require('./trade');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve client files
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// World storage
const worlds = new Map();
const players = new Map(); // ws -> Player
const recentWorlds = []; // List of recent world names
const worldSaveDir = path.join(__dirname, 'data', 'worlds');

if (!fs.existsSync(worldSaveDir)) {
    fs.mkdirSync(worldSaveDir, { recursive: true });
}

function getOrCreateWorld(name) {
    name = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name) name = 'START';

    if (worlds.has(name)) {
        updateRecentWorlds(name);
        return worlds.get(name);
    }

    // Try loading from disk
    const filePath = path.join(worldSaveDir, `${name}.json`);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (data.width !== CONSTANTS.WORLD_WIDTH || data.height !== CONSTANTS.WORLD_HEIGHT) {
                console.log(`[World] Dimension mismatch for "${name}", regenerating...`);
                throw new Error('Dimension mismatch');
            }
            const world = World.deserialize(data);
            worlds.set(name, world);
            updateRecentWorlds(name);
            console.log(`[World] Loaded "${name}" from disk`);
            return world;
        } catch (e) {
            console.error(`[World] Error loading "${name}":`, e);
        }
    }

    // Generate new world
    const world = new World(name);
    world.generate();
    worlds.set(name, world);
    updateRecentWorlds(name);
    console.log(`[World] Generated new world "${name}"`);
    return world;
}

function updateRecentWorlds(name) {
    const index = recentWorlds.indexOf(name);
    if (index !== -1) {
        recentWorlds.splice(index, 1);
    }
    recentWorlds.unshift(name);
    if (recentWorlds.length > 20) {
        recentWorlds.pop();
    }
}

function getServerStats() {
    return {
        onlinePlayers: players.size,
        recentWorlds: recentWorlds
    };
}

function saveWorld(world) {
    const filePath = path.join(worldSaveDir, `${world.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(world.serialize()));
}

function sendTo(ws, type, data) {
    if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type, ...data }));
    }
}

function broadcast(worldName, type, data, excludeWs = null) {
    for (const [ws, player] of players) {
        if (player.worldName === worldName && ws !== excludeWs) {
            sendTo(ws, type, data);
        }
    }
}

function getPlayersInWorld(worldName) {
    const result = [];
    for (const [ws, player] of players) {
        if (player.worldName === worldName) {
            result.push(player.getPublicData());
        }
    }
    return result;
}

function joinWorld(ws, player, worldName) {
    // Leave current world
    if (player.worldName) {
        broadcast(player.worldName, PacketTypes.S_PLAYER_LEAVE, { name: player.name }, ws);
    }

    const world = getOrCreateWorld(worldName);
    player.worldName = world.name;
    player.x = 50 * CONSTANTS.TILE_SIZE;
    player.y = (CONSTANTS.SURFACE_LEVEL - 2) * CONSTANTS.TILE_SIZE;

    // Send world data
    sendTo(ws, PacketTypes.S_WORLD_DATA, {
        world: world.getClientData(),
        player: player.getPrivateData(),
        players: getPlayersInWorld(world.name).filter(p => p.name !== player.name)
    });

    // Notify others
    broadcast(world.name, PacketTypes.S_PLAYER_JOIN, { player: player.getPublicData() }, ws);
    console.log(`[Game] ${player.name} joined world "${world.name}"`);
}

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('[WS] New connection');
    // Send initial stats
    sendTo(ws, PacketTypes.S_SERVER_STATS, getServerStats());

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch (e) {
            return;
        }

        switch (msg.type) {
            case PacketTypes.C_REGISTER: {
                const { username, password, name } = msg;
                console.log(`[Auth] Register Request: user=${username}, name=${name}`);
                const result = AuthManager.register(username, password, name);
                if (result.error) {
                    console.log(`[Auth] Register Error: ${result.error}`);
                    sendTo(ws, PacketTypes.S_LOGIN_FAIL, { msg: result.error });
                } else {
                    console.log(`[Auth] Register Success: ${username}. Auto-logging in...`);
                    // Auto-login after register
                    const loginResult = AuthManager.login(username, password);
                    if (!loginResult.error) {
                        const account = loginResult.data;
                        const player = new Player(account.displayName || username, ws, account);
                        players.set(ws, player);
                        sendTo(ws, PacketTypes.S_JOIN_OK, { name: player.name });
                        sendTo(ws, PacketTypes.S_CHAT, { name: '>> SYSTEM', text: 'Welcome to PixelWorld! Your account has been created.' });
                    } else {
                        console.log(`[Auth] Auto-login unexpected error: ${loginResult.error}`);
                    }
                }
                break;
            }

            case PacketTypes.C_LOGIN: {
                const { username, password } = msg;
                console.log(`[Auth] Login Request: user=${username}`);
                const result = AuthManager.login(username, password);
                if (result.error) {
                    console.log(`[Auth] Login Error: ${result.error}`);
                    sendTo(ws, PacketTypes.S_LOGIN_FAIL, { msg: result.error });
                } else {
                    console.log(`[Auth] Login Success: ${username}`);
                    const account = result.data;
                    const player = new Player(account.displayName || username, ws, account);
                    players.set(ws, player);
                    sendTo(ws, PacketTypes.S_JOIN_OK, { name: player.name });
                }
                break;
            }

            case PacketTypes.C_GUEST_LOGIN: {
                const name = (msg.name || 'Guest_' + Math.floor(Math.random() * 9999)).substring(0, 16);
                const player = new Player(name, ws); // No account data = guest
                players.set(ws, player);
                sendTo(ws, PacketTypes.S_JOIN_OK, { name: player.name });
                break;
            }

            case PacketTypes.C_JOIN: {
                const name = (msg.name || '').trim().substring(0, 16);
                if (!name) {
                    sendTo(ws, PacketTypes.S_ERROR, { msg: 'Invalid name' });
                    return;
                }
                // Check if name already taken
                for (const [, p] of players) {
                    if (p.name === name) {
                        sendTo(ws, PacketTypes.S_ERROR, { msg: 'Name already taken' });
                        return;
                    }
                }

                const player = new Player(name, ws);
                players.set(ws, player);
                sendTo(ws, PacketTypes.S_JOIN_OK, { name: player.name });
                joinWorld(ws, player, msg.world || 'START');
                break;
            }

            case PacketTypes.C_ENTER_WORLD: {
                const player = players.get(ws);
                if (!player) return;
                const worldName = (msg.world || '').trim();
                if (!worldName) return;
                joinWorld(ws, player, worldName);
                break;
            }

            case PacketTypes.C_MOVE: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                // Basic validation
                if (typeof msg.x !== 'number' || typeof msg.y !== 'number') return;

                player.x = msg.x;
                player.y = msg.y;

                broadcast(player.worldName, PacketTypes.S_PLAYER_MOVE, {
                    name: player.name,
                    x: player.x,
                    y: player.y
                }, ws);
                break;
            }

            case PacketTypes.C_HIT_BLOCK: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;
                if (!player.checkHitRate()) return;

                const world = worlds.get(player.worldName);
                if (!world) return;

                const { x, y } = msg;
                if (typeof x !== 'number' || typeof y !== 'number') return;

                // Check if it's a ready tree (harvest instead of break)
                const tile = world.getTile(x, y);
                if (tile && world.getTreeStage(tile, Date.now()) === 3) {
                    const harvest = world.harvestTree(x, y, player);
                    if (harvest) {
                        // Give drops to player
                        const gems = Math.floor(Math.random() * 5) + 1;
                        player.gems += gems;
                        for (const drop of harvest.drops) {
                            player.addItem(drop.itemId, drop.count);
                        }
                        sendTo(ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: player.inventory });
                        sendTo(ws, PacketTypes.S_GEMS_UPDATE, { gems: player.gems });
                        broadcast(player.worldName, PacketTypes.S_BLOCK_UPDATE, {
                            x, y, fg: 0, bg: tile.bg, extra: {}, seq: world.sequence
                        });
                        world.pendingChanges = world.pendingChanges.filter(c => !(c.x === x && c.y === y)); // Avoid redundancy
                        break;
                    }
                }

                const result = world.hitBlock(x, y, player);
                if (!result) break;

                if (result.error === 'locked') {
                    sendTo(ws, PacketTypes.S_LOCK_EFFECT, { x: result.lockX, y: result.lockY });
                    break;
                }
                if (result.error) break;

                if (result.destroyed) {
                    const gems = Math.floor(Math.random() * 5) + 1;
                    player.gems += gems;
                    for (const drop of result.drops) {
                        player.addItem(drop.itemId, drop.count);
                    }
                    sendTo(ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: player.inventory });
                    sendTo(ws, PacketTypes.S_GEMS_UPDATE, { gems: player.gems });

                    broadcast(player.worldName, PacketTypes.S_BLOCK_UPDATE, {
                        x, y, fg: 0, bg: world.getTile(x, y).bg, extra: {}, seq: world.sequence
                    });
                } else {
                    broadcast(player.worldName, PacketTypes.S_BLOCK_UPDATE, {
                        x, y, fg: world.getTile(x, y).fg, bg: world.getTile(x, y).bg,
                        breakHits: result.hits, maxHits: result.maxHits, seq: world.sequence
                    });
                }
                world.pendingChanges = world.pendingChanges.filter(c => !(c.x === x && c.y === y)); // Pre-clear if already sent
                break;
            }

            case PacketTypes.C_PLACE_BLOCK: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                const world = worlds.get(player.worldName);
                if (!world) return;

                const { x, y, itemId } = msg;
                if (typeof x !== 'number' || typeof y !== 'number') return;

                // Check player has the item
                if (!player.hasItem(itemId)) {
                    sendTo(ws, PacketTypes.S_ERROR, { msg: 'No item' });
                    return;
                }

                const result = world.placeBlock(x, y, itemId, player);
                if (result.error === 'locked') {
                    sendTo(ws, PacketTypes.S_LOCK_EFFECT, { x: result.lockX, y: result.lockY });
                    return;
                }
                if (result.error) return;

                if (result.placed) {
                    player.removeItem(itemId, 1);
                    sendTo(ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: player.inventory });

                    const tile = world.getTile(x, y);
                    broadcast(player.worldName, PacketTypes.S_BLOCK_UPDATE, {
                        x, y, fg: tile.fg, bg: tile.bg, extra: tile.extra, seq: world.sequence
                    });
                    world.pendingChanges = world.pendingChanges.filter(c => !(c.x === x && c.y === y)); // Pre-clear if already sent
                }
                break;
            }

            case PacketTypes.C_CHAT: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                const text = (msg.text || '').trim().substring(0, 120);
                if (!text) return;

                broadcast(player.worldName, PacketTypes.S_CHAT, {
                    name: player.name, text
                });
                break;
            }

            case PacketTypes.C_BUY_ITEM: {
                const player = players.get(ws);
                if (!player) return;

                const result = player.buyItem(msg.itemId);
                if (result.error) {
                    sendTo(ws, PacketTypes.S_ERROR, { msg: result.error });
                    return;
                }

                sendTo(ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: player.inventory });
                sendTo(ws, PacketTypes.S_GEMS_UPDATE, { gems: player.gems });
                sendTo(ws, PacketTypes.S_CHAT, { name: '>> SYSTEM', text: `Bought ${ITEMS[msg.itemId].name}!` });
                break;
            }

            case PacketTypes.C_SIGN_EDIT: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                const world = worlds.get(player.worldName);
                if (!world) return;

                const tile = world.getTile(msg.x, msg.y);
                if (!tile || ITEMS[tile.fg]?.type !== 'sign') return;

                const lockCheck = world.checkPermission(msg.x, msg.y, player.name);
                if (!lockCheck.allowed) {
                    sendTo(ws, PacketTypes.S_LOCK_EFFECT, { x: lockCheck.lockX, y: lockCheck.lockY });
                    return;
                }

                tile.extra.text = (msg.text || '').substring(0, 200);
                broadcast(player.worldName, PacketTypes.S_BLOCK_UPDATE, {
                    x: msg.x, y: msg.y, fg: tile.fg, bg: tile.bg, extra: tile.extra
                });
                break;
            }

            case PacketTypes.C_WRENCH: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                const world = worlds.get(player.worldName);
                if (!world) return;

                const { x, y } = msg;
                const tile = world.getTile(x, y);
                if (!tile) return;

                const item = ITEMS[tile.fg];
                if (!item) return;

                // Sign wrenching
                if (item.type === 'sign') {
                    const lockCheck = world.checkPermission(x, y, player.name);
                    if (!lockCheck.allowed) {
                        sendTo(ws, PacketTypes.S_LOCK_EFFECT, { x: lockCheck.lockX, y: lockCheck.lockY });
                        return;
                    }
                    sendTo(ws, PacketTypes.S_LOCK_DATA, {
                        type: 'sign',
                        x, y,
                        text: tile.extra.text || ''
                    });
                }

                // Lock wrenching
                if (item.type === 'lock') {
                    const lock = world.locks.find(l => l.x === x && l.y === y);
                    if (!lock) return;

                    if (lock.owner === player.name || lock.accessList.includes(player.name)) {
                        sendTo(ws, PacketTypes.S_LOCK_DATA, {
                            type: 'lock',
                            x, y,
                            itemId: lock.itemId,
                            owner: lock.owner,
                            accessList: lock.accessList,
                            isOwner: lock.owner === player.name
                        });
                    } else {
                        sendTo(ws, PacketTypes.S_LOCK_EFFECT, { x, y });
                    }
                }
                break;
            }

            case PacketTypes.C_LOCK_ACCESS: {
                const player = players.get(ws);
                if (!player || !player.worldName) return;

                const world = worlds.get(player.worldName);
                if (!world) return;

                const { x, y, action, targetName } = msg;
                const lock = world.locks.find(l => l.x === x && l.y === y);
                if (!lock || lock.owner !== player.name) return;

                if (action === 'add') {
                    if (targetName && !lock.accessList.includes(targetName)) {
                        lock.accessList.push(targetName);
                    }
                } else if (action === 'remove') {
                    lock.accessList = lock.accessList.filter(n => n !== targetName);
                }

                // Resend updated data
                sendTo(ws, PacketTypes.S_LOCK_DATA, {
                    type: 'lock',
                    x, y,
                    itemId: lock.itemId,
                    owner: lock.owner,
                    accessList: lock.accessList,
                    isOwner: true
                });
                break;
            }

            case PacketTypes.C_TRADE_REQUEST: {
                const player = players.get(ws);
                if (!player) return;
                const targetPlayer = Array.from(players.values()).find(p => p.name === msg.targetName);
                if (!targetPlayer || targetPlayer.name === player.name) return;

                TradeManager.requestTrade(player, targetPlayer);
                sendTo(targetPlayer.ws, PacketTypes.S_CHAT, {
                    name: '>> SYSTEM',
                    text: `${player.name} wants to trade! Type /accept ${player.name}`
                });
                break;
            }

            case PacketTypes.C_TRADE_ACCEPT: {
                // This case handles both accepting a request AND confirming an open trade
                const player = players.get(ws);
                if (!player) return;

                const session = TradeManager.getPlayerSession(player.name);
                if (session) {
                    // Confirming an existing trade
                    const result = session.confirm(player);
                    if (result.status === 'SUCCESS') {
                        const otherPlayer = session.playerA.name === player.name ? session.playerB : session.playerA;
                        sendTo(ws, PacketTypes.S_TRADE_COMPLETE, {});
                        sendTo(otherPlayer.ws, PacketTypes.S_TRADE_COMPLETE, {});
                        sendTo(ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: player.inventory });
                        sendTo(otherPlayer.ws, PacketTypes.S_INVENTORY_UPDATE, { inventory: otherPlayer.inventory });
                        TradeManager.cancelSession(session.id);
                    } else {
                        const otherPlayer = session.playerA.name === player.name ? session.playerB : session.playerA;
                        sendTo(ws, PacketTypes.S_TRADE_UPDATE, session.getClientData());
                        sendTo(otherPlayer.ws, PacketTypes.S_TRADE_UPDATE, session.getClientData());
                    }
                } else {
                    // Accepting a new request
                    const requester = Array.from(players.values()).find(p => p.name === msg.fromName);
                    if (!requester) return;
                    const newSession = TradeManager.acceptRequest(player, requester);
                    if (newSession) {
                        sendTo(ws, PacketTypes.S_TRADE_OPEN, newSession.getClientData());
                        sendTo(requester.ws, PacketTypes.S_TRADE_OPEN, newSession.getClientData());
                    }
                }
                break;
            }

            case PacketTypes.C_TRADE_ADD: {
                const player = players.get(ws);
                if (!player) return;
                const session = TradeManager.getPlayerSession(player.name);
                if (!session) return;

                const { itemId, count } = msg;
                if (!player.hasItem(itemId, count)) return;

                session.addOffer(player, itemId, count);
                sendTo(session.playerA.ws, PacketTypes.S_TRADE_UPDATE, session.getClientData());
                sendTo(session.playerB.ws, PacketTypes.S_TRADE_UPDATE, session.getClientData());
                break;
            }

            case PacketTypes.C_TRADE_CANCEL: {
                const player = players.get(ws);
                if (!player) return;
                const session = TradeManager.getPlayerSession(player.name);
                if (session) {
                    const otherPlayer = session.playerA.name === player.name ? session.playerB : session.playerA;
                    sendTo(otherPlayer.ws, PacketTypes.S_TRADE_CANCEL, {});
                    TradeManager.cancelSession(session.id);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        const player = players.get(ws);
        if (player) {
            if (player.worldName) {
                broadcast(player.worldName, PacketTypes.S_PLAYER_LEAVE, { name: player.name }, ws);
            }
            players.delete(ws);
            console.log(`[WS] ${player.name} disconnected`);
        }
    });
});

// Periodic Delta Snapshots (Every 500ms)
setInterval(() => {
    for (const [name, world] of worlds) {
        if (world.pendingChanges.length > 0) {
            broadcast(name, PacketTypes.S_SNAPSHOT, {
                seq: world.sequence,
                changes: world.pendingChanges
            });
            world.pendingChanges = []; // Clear for next cycle
        }
    }
}, 500);

// Auto-save worlds and players periodically
setInterval(() => {
    for (const [name, world] of worlds) {
        saveWorld(world);
    }
    for (const player of players.values()) {
        if (!player.isGuest) {
            AuthManager.savePlayerData(player.name, player.getPrivateData());
        }
    }
}, 30000);

// Unload inactive worlds
setInterval(() => {
    const now = Date.now();
    for (const [name, world] of worlds) {
        if (world.players.size === 0 && now - world.lastActivity > 300000) {
            saveWorld(world);
            worlds.delete(name);
            console.log(`[World] Unloaded inactive world "${name}"`);
        }
    }
}, 60000);

// Broadcast stats periodically to everyone
setInterval(() => {
    const stats = getServerStats();
    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            sendTo(client, PacketTypes.S_SERVER_STATS, stats);
        }
    });
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🌍 Growtopia Server running on http://localhost:${PORT}\n`);
});
