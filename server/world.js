const CONSTANTS = require('../shared/constants');
const { ITEMS, SPLICE_RECIPES } = require('../shared/itemData');

class World {
    constructor(name) {
        this.name = name;
        this.width = CONSTANTS.WORLD_WIDTH;
        this.height = CONSTANTS.WORLD_HEIGHT;
        this.tiles = [];
        this.players = new Map();
        this.locks = []; // { x, y, itemId, owner, accessList: [], range }
        this.lastActivity = Date.now();
        this.seed = this.hashString(name);
        this.sequence = 0;
        this.pendingChanges = []; // Updates collected since last snapshot
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    static compressRLE(flatArray) {
        if (flatArray.length === 0) return [];
        const rle = [];
        let currentVal = flatArray[0];
        let startPos = 0;
        let count = 0;

        for (let i = 0; i <= flatArray.length; i++) {
            if (i < flatArray.length && flatArray[i] === currentVal) {
                count++;
            } else {
                // Format: [value, startPos, count]
                rle.push([currentVal, startPos, count]);
                if (i < flatArray.length) {
                    currentVal = flatArray[i];
                    startPos = i;
                    count = 1;
                }
            }
        }
        return rle;
    }

    static decompressRLE(rle, expectedSize) {
        const result = new Array(expectedSize).fill(0);
        for (const [val, start, count] of rle) {
            for (let i = 0; i < count; i++) {
                if (start + i < expectedSize) {
                    result[start + i] = val;
                }
            }
        }
        return result;
    }

    seededRandom(seed) {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    generate() {
        this.tiles = [];
        let rSeed = this.seed;
        const nextRand = () => { rSeed++; return this.seededRandom(rSeed); };

        const SURFACE_BASE = CONSTANTS.SURFACE_LEVEL || 24;
        const surfaceHeights = [];

        // 1. Generate Rolling Hills (Multiple Sine Waves)
        for (let x = 0; x < this.width; x++) {
            const h1 = Math.sin(x * 0.1) * 4;
            const h2 = Math.sin(x * 0.05) * 2;
            const h3 = nextRand() * 2;
            surfaceHeights[x] = Math.floor(SURFACE_BASE + h1 + h2 + h3);
        }

        // 2. Initialize World Grids
        for (let y = 0; y < this.height; y++) {
            this.tiles[y] = [];
            for (let x = 0; x < this.width; x++) {
                let fg = 0, bg = 0;
                const sH = surfaceHeights[x];

                if (y === this.height - 1) {
                    fg = 18; // Bedrock
                } else if (y >= this.height - 3) {
                    fg = 5; // Lava Floor
                } else if (y > sH) {
                    fg = 1; // Dirt
                    bg = 12; // Cave Background
                    if (y > sH + 10 && nextRand() < 0.15) fg = 3; // Rock Patches
                } else if (y === sH) {
                    fg = 7; // Grass
                }

                this.tiles[y][x] = { fg, bg, breakHits: 0, extra: {} };
            }
        }

        // 3. Floating Islands
        for (let i = 0; i < 8; i++) {
            const ix = Math.floor(nextRand() * (this.width - 10)) + 5;
            const iy = Math.floor(nextRand() * (SURFACE_BASE - 10)) + 5;
            const iWidth = Math.floor(nextRand() * 6) + 4;
            const iHeight = Math.floor(nextRand() * 3) + 2;

            for (let dy = 0; dy < iHeight; dy++) {
                for (let dx = 0; dx < iWidth; dx++) {
                    const tx = ix + dx;
                    const ty = iy + dy;
                    if (this.tiles[ty] && this.tiles[ty][tx]) {
                        this.tiles[ty][tx].fg = (dy === 0) ? 7 : 1; // Grass top, dirt below
                        if (dy > 0) this.tiles[ty][tx].bg = 12;
                    }
                }
            }
        }

        // 4. Caves (Random Spheres)
        for (let i = 0; i < 15; i++) {
            const cx = Math.floor(nextRand() * this.width);
            const cy = Math.floor(nextRand() * (this.height - 25)) + 25;
            const radius = Math.floor(nextRand() * 3) + 2;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    if (dx * dx + dy * dy <= radius * radius) {
                        const tx = cx + dx;
                        const ty = cy + dy;
                        if (tx >= 0 && tx < this.width && ty >= 25 && ty < this.height - 3) {
                            this.tiles[ty][tx].fg = 0;
                        }
                    }
                }
            }
        }

        // 5. Natural Scattered Trees
        for (let i = 0; i < 15; i++) {
            const tx = Math.floor(nextRand() * this.width);
            const ty = surfaceHeights[tx] - 1;
            if (this.tiles[ty] && this.tiles[ty][tx] && this.tiles[ty][tx].fg === 0) {
                const seedId = [2, 4, 8][Math.floor(nextRand() * 3)]; // Dirt, Rock, or Grass tree seed
                this.tiles[ty][tx] = {
                    fg: seedId,
                    bg: 0,
                    breakHits: 0,
                    extra: {
                        plantedAt: Date.now() - (nextRand() * 60000 + 300000), // Randomly matured or growing
                        growthTime: (ITEMS[seedId].growthTime || 30) * 1000,
                        treeColor: ITEMS[seedId].treeColor
                    }
                };
            }
        }

        // 6. Main door at spawn
        const spawnX = 50;
        const spawnY = surfaceHeights[spawnX] - 1;
        if (this.tiles[spawnY] && this.tiles[spawnY][spawnX]) {
            this.tiles[spawnY][spawnX].fg = 14; // Door
            this.tiles[spawnY][spawnX].extra = { label: 'EXIT', target: 'START' };
        }
    }

    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        return this.tiles[y][x];
    }

    hitBlock(x, y, player) {
        const tile = this.getTile(x, y);
        if (!tile || tile.fg === 0) return null;

        const item = ITEMS[tile.fg];
        if (!item || item.unbreakable) return { error: 'unbreakable' };

        // Check lock permission
        const lockCheck = this.checkPermission(x, y, player.name);
        if (!lockCheck.allowed) {
            return { error: 'locked', lockX: lockCheck.lockX, lockY: lockCheck.lockY };
        }

        // Check distance
        const dist = Math.sqrt(Math.pow(player.x / CONSTANTS.TILE_SIZE - x, 2) + Math.pow(player.y / CONSTANTS.TILE_SIZE - y, 2));
        if (dist > CONSTANTS.MAX_REACH) return { error: 'too_far' };

        tile.breakHits++;
        if (tile.breakHits >= item.hardness) {
            // Block destroyed
            const drops = this.getDrops(tile.fg, tile.extra);
            tile.fg = 0;
            tile.breakHits = 0;
            tile.extra = {};
            this.lastActivity = Date.now();
            this.sequence++;
            this.pendingChanges.push({ x, y, fg: 0, bg: tile.bg, extra: {}, seq: this.sequence });

            // Remove lock if it was a lock
            if (item.type === 'lock') {
                this.locks = this.locks.filter(l => l.x !== x || l.y !== y);
            }

            return { destroyed: true, drops, x, y, seq: this.sequence };
        }

        this.sequence++;
        this.pendingChanges.push({ x, y, fg: tile.fg, bg: tile.bg, breakHits: tile.breakHits, seq: this.sequence });
        return { destroyed: false, hits: tile.breakHits, maxHits: item.hardness, x, y, seq: this.sequence };
    }

    placeBlock(x, y, itemId, player) {
        const tile = this.getTile(x, y);
        if (!tile) return { error: 'out_of_bounds' };

        const item = ITEMS[itemId];
        if (!item) return { error: 'invalid_item' };

        // Check distance
        const dist = Math.sqrt(Math.pow(player.x / CONSTANTS.TILE_SIZE - x, 2) + Math.pow(player.y / CONSTANTS.TILE_SIZE - y, 2));
        if (dist > CONSTANTS.MAX_REACH) return { error: 'too_far' };

        // Backgrounds go in bg layer
        if (item.type === 'background') {
            if (tile.bg !== 0) return { error: 'occupied' };
            const lockCheck = this.checkPermission(x, y, player.name);
            if (!lockCheck.allowed) return { error: 'locked', lockX: lockCheck.lockX, lockY: lockCheck.lockY };
            tile.bg = itemId;
            this.lastActivity = Date.now();
            this.sequence++;
            this.pendingChanges.push({ x, y, fg: tile.fg, bg: itemId, extra: tile.extra, seq: this.sequence });
            return { placed: true, layer: 'bg', seq: this.sequence };
        }

        // Seeds: try splice first
        if (item.type === 'seed') {
            return this.handleSeedPlace(x, y, itemId, tile, player);
        }

        // Normal block
        if (tile.fg !== 0) return { error: 'occupied' };

        const lockCheck = this.checkPermission(x, y, player.name);
        if (!lockCheck.allowed) return { error: 'locked', lockX: lockCheck.lockX, lockY: lockCheck.lockY };

        tile.fg = itemId;
        this.lastActivity = Date.now();
        this.sequence++;
        this.pendingChanges.push({ x, y, fg: itemId, bg: tile.bg, extra: tile.extra, seq: this.sequence });

        // If it's a lock, register it
        if (item.type === 'lock') {
            this.locks.push({
                x, y, itemId, owner: player.name,
                accessList: [], range: item.lockRange
            });
        }

        // If it's a sign, store empty text
        if (item.type === 'sign') {
            tile.extra = { text: '' };
        }

        return { placed: true, layer: 'fg', seq: this.sequence };
    }

    handleSeedPlace(x, y, itemId, tile, player) {
        const lockCheck = this.checkPermission(x, y, player.name);
        if (!lockCheck.allowed) return { error: 'locked', lockX: lockCheck.lockX, lockY: lockCheck.lockY };

        // If tile is empty, plant the seed
        if (tile.fg === 0) {
            tile.fg = itemId;
            tile.extra = {
                seedId: itemId,
                plantedAt: Date.now(),
                plantedBy: player.name,
                growthTime: ITEMS[itemId].growthTime * 1000,
                fruitCount: Math.floor(Math.random() * 4) + 2
            };
            this.lastActivity = Date.now();
            this.sequence++;
            this.pendingChanges.push({ x, y, fg: itemId, bg: tile.bg, extra: tile.extra, seq: this.sequence });
            return { placed: true, layer: 'fg', tree: true, seq: this.sequence };
        }

        // If tile has another seed growing, try splice
        if (ITEMS[tile.fg] && ITEMS[tile.fg].type === 'seed' && tile.extra.plantedAt) {
            const existingSeed = tile.fg;
            const newSeed = itemId;
            const recipe = SPLICE_RECIPES.find(r =>
                (r.seeds[0] === existingSeed && r.seeds[1] === newSeed) ||
                (r.seeds[0] === newSeed && r.seeds[1] === existingSeed)
            );
            if (recipe) {
                tile.fg = recipe.result;
                tile.extra = {
                    seedId: recipe.result,
                    plantedAt: Date.now(),
                    plantedBy: player.name,
                    growthTime: ITEMS[recipe.result].growthTime * 1000,
                    fruitCount: Math.floor(Math.random() * 5) + 3,
                    splicedWith: existingSeed === recipe.seeds[0] ? recipe.seeds[1] : recipe.seeds[0]
                };
                this.lastActivity = Date.now();
                this.sequence++;
                this.pendingChanges.push({ x, y, fg: tile.fg, bg: tile.bg, extra: tile.extra, seq: this.sequence });
                return { placed: true, layer: 'fg', tree: true, spliced: true, resultId: recipe.result, seq: this.sequence };
            }
        }

        return { error: 'cannot_place' };
    }

    getTreeStage(tile, now) {
        const item = ITEMS[tile.fg];
        if (!item || item.type !== 'seed' || !tile.extra.plantedAt) return -1;
        const elapsed = now - tile.extra.plantedAt;
        const growTime = tile.extra.growthTime || (item.growthTime * 1000);

        if (elapsed < growTime * 0.33) return 0; // Sprout
        if (elapsed < growTime * 0.66) return 1; // Small tree
        if (elapsed < growTime) return 2;        // Large tree
        return 3;                                // Fully grown
    }

    harvestTree(x, y, player) {
        const tile = this.getTile(x, y);
        if (!tile) return null;

        const item = ITEMS[tile.fg];
        if (!item || item.type !== 'seed') return null;
        if (!tile.extra || !tile.extra.plantedAt) return null;

        const elapsed = Date.now() - tile.extra.plantedAt;
        if (elapsed < tile.extra.growthTime) return null;

        // Tree is ready - harvest
        const drops = [];
        const fruitItem = item.growsInto;
        const fruitCount = tile.extra.fruitCount || 1;

        for (let i = 0; i < fruitCount; i++) {
            drops.push({ itemId: fruitItem, count: 1 });
        }
        // Also drop 1-2 seeds back
        drops.push({ itemId: tile.fg, count: Math.floor(Math.random() * 2) + 1 });

        // Reset tile
        tile.fg = 0;
        tile.extra = {};
        tile.breakHits = 0;
        this.lastActivity = Date.now();
        this.sequence++;
        this.pendingChanges.push({ x, y, fg: 0, bg: tile.bg, extra: {}, seq: this.sequence });

        return { drops, x, y, seq: this.sequence };
    }

    getDrops(itemId, extra) {
        const item = ITEMS[itemId];
        if (!item) return [];

        // If it's a tree/seed that's ready, return harvest
        if (item.type === 'seed' && extra && extra.plantedAt) {
            const elapsed = Date.now() - extra.plantedAt;
            if (elapsed >= (extra.growthTime || 30000)) {
                const drops = [];
                const fruitItem = item.growsInto;
                const fruitCount = extra.fruitCount || 1;
                for (let i = 0; i < fruitCount; i++) {
                    drops.push({ itemId: fruitItem, count: 1 });
                }
                drops.push({ itemId: itemId, count: Math.floor(Math.random() * 2) + 1 });
                return drops;
            }
            // Not ready - just return the seed
            return [{ itemId: itemId, count: 1 }];
        }

        const drops = [];
        // Drop the seed if exists
        if (item.dropSeed) {
            drops.push({ itemId: item.dropSeed, count: 1 });
        }
        // Sometimes drop the block itself
        if (Math.random() < 0.3) {
            drops.push({ itemId: itemId, count: 1 });
        }
        // Add gems
        // const gemCount = Math.floor(Math.random() * (CONSTANTS.GEMS_PER_BREAK.max - CONSTANTS.GEMS_PER_BREAK.min + 1)) + CONSTANTS.GEMS_PER_BREAK.min;

        return drops.length > 0 ? drops : [{ itemId: itemId, count: 1 }];
    }

    checkPermission(x, y, playerName) {
        for (const lock of this.locks) {
            if (lock.owner === playerName || lock.accessList.includes(playerName)) {
                continue;
            }

            if (lock.range === 'world') {
                return { allowed: false, lockX: lock.x, lockY: lock.y };
            }

            const dist = Math.sqrt(Math.pow(lock.x - x, 2) + Math.pow(lock.y - y, 2));
            if (dist <= lock.range) {
                return { allowed: false, lockX: lock.x, lockY: lock.y };
            }
        }
        return { allowed: true };
    }

    addAccess(lockX, lockY, playerName, targetName) {
        const lock = this.locks.find(l => l.x === lockX && l.y === lockY);
        if (!lock || lock.owner !== playerName) return false;
        if (!lock.accessList.includes(targetName)) {
            lock.accessList.push(targetName);
        }
        return true;
    }

    removeAccess(lockX, lockY, playerName, targetName) {
        const lock = this.locks.find(l => l.x === lockX && l.y === lockY);
        if (!lock || lock.owner !== playerName) return false;
        lock.accessList = lock.accessList.filter(n => n !== targetName);
        return true;
    }

    serialize() {
        const fg = [];
        const bg = [];
        const extras = {};

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                fg.push(tile.fg);
                bg.push(tile.bg);

                if (Object.keys(tile.extra).length > 0 || tile.breakHits > 0) {
                    extras[`${x},${y}`] = {
                        extra: tile.extra,
                        hits: tile.breakHits
                    };
                }
            }
        }

        return {
            name: this.name,
            version: 3,
            width: this.width,
            height: this.height,
            fgRLE: World.compressRLE(fg),
            bgRLE: World.compressRLE(bg),
            extras: extras,
            locks: this.locks
        };
    }

    static deserialize(data) {
        const world = new World(data.name);
        world.width = data.width;
        world.height = data.height;
        world.tiles = [];

        // Initialize empty grid
        for (let y = 0; y < world.height; y++) {
            world.tiles[y] = [];
            for (let x = 0; x < world.width; x++) {
                world.tiles[y][x] = { fg: 0, bg: 0, breakHits: 0, extra: {} };
            }
        }

        if (data.version === 3) {
            // Version 3: RLE compressed
            const fg = World.decompressRLE(data.fgRLE, world.width * world.height);
            const bg = World.decompressRLE(data.bgRLE, world.width * world.height);

            for (let y = 0; y < world.height; y++) {
                for (let x = 0; x < world.width; x++) {
                    const idx = y * world.width + x;
                    world.tiles[y][x].fg = fg[idx];
                    world.tiles[y][x].bg = bg[idx];
                }
            }

            // Load extras from "x,y" keys
            if (data.extras) {
                for (const [coord, info] of Object.entries(data.extras)) {
                    const [x, y] = coord.split(',').map(Number);
                    if (world.tiles[y] && world.tiles[y][x]) {
                        world.tiles[y][x].extra = info.extra || {};
                        world.tiles[y][x].breakHits = info.hits || 0;
                    }
                }
            }
        } else {
            // Old format: raw tiles array
            if (Array.isArray(data.tiles)) {
                for (let y = 0; y < world.height; y++) {
                    if (data.tiles[y]) {
                        for (let x = 0; x < world.width; x++) {
                            if (data.tiles[y][x]) {
                                world.tiles[y][x] = data.tiles[y][x];
                            }
                        }
                    }
                }
            }
        }

        world.locks = data.locks || [];
        return world;
    }

    getClientData() {
        const fg = [];
        const bg = [];
        const extras = {};

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const tile = this.tiles[y][x];
                fg.push(tile.fg);
                bg.push(tile.bg);

                if (Object.keys(tile.extra).length > 0 || tile.breakHits > 0) {
                    extras[`${x},${y}`] = {
                        e: tile.extra,
                        h: tile.breakHits
                    };
                }
            }
        }

        return {
            name: this.name,
            version: 3,
            seq: this.sequence,
            width: this.width,
            height: this.height,
            fgRLE: World.compressRLE(fg),
            bgRLE: World.compressRLE(bg),
            extras: extras,
            locks: this.locks.map(l => ({
                x: l.x, y: l.y, itemId: l.itemId,
                owner: l.owner, range: l.range
            }))
        };
    }
}

module.exports = World;
