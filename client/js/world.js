// Client-side world data cache
const ClientWorld = {
    name: '',
    width: 0,
    height: 0,
    tiles: [],
    locks: [],

    load(data) {
        console.log('[World] Loading world data...', data);
        try {
            this.name = data.name;
            this.width = data.width;
            this.height = data.height;
            this.tiles = [];

            // Initialize empty grid
            for (let y = 0; y < this.height; y++) {
                this.tiles[y] = [];
                for (let x = 0; x < this.width; x++) {
                    this.tiles[y][x] = { fg: 0, bg: 0, extra: {}, breakHits: 0 };
                }
            }

            if (data.version === 3) {
                // Decompress fg/bg layers
                const fg = this.decompressRLE(data.fgRLE, this.width * this.height);
                const bg = this.decompressRLE(data.bgRLE, this.width * this.height);

                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const idx = y * this.width + x;
                        this.tiles[y][x].fg = fg[idx];
                        this.tiles[y][x].bg = bg[idx];
                    }
                }

                // Load extras from "x,y" keys
                if (data.extras) {
                    for (const [coord, info] of Object.entries(data.extras)) {
                        const [x, y] = coord.split(',').map(Number);
                        if (this.tiles[y] && this.tiles[y][x]) {
                            this.tiles[y][x].extra = info.e || {};
                            this.tiles[y][x].breakHits = info.h || 0;
                        }
                    }
                }
            } else if (Array.isArray(data.tiles)) {
                // Supabase format: raw array of objects
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const idx = y * this.width + x;
                        const tile = data.tiles[idx];
                        if (tile) {
                            this.tiles[y][x].fg = tile.fg || 0;
                            this.tiles[y][x].bg = tile.bg || 0;
                            this.tiles[y][x].extra = tile.extra || {};
                            this.tiles[y][x].breakHits = tile.breakHits || 0;
                        }
                    }
                }
            } else {
                // Old format: raw flat arrays
                const fg = data.fg;
                const bg = data.bg;
                const extra = data.extra || {};

                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const idx = y * this.width + x;
                        const tileExtra = extra[idx] || { e: {}, h: 0 };
                        this.tiles[y][x].fg = fg ? fg[idx] : 0;
                        this.tiles[y][x].bg = bg ? bg[idx] : 0;
                        this.tiles[y][x].extra = tileExtra.e;
                        this.tiles[y][x].breakHits = tileExtra.h;
                    }
                }
            }
            this.locks = data.locks || [];
            console.log('[World] World loaded successfully. Tiles:', this.tiles.length);
        } catch (e) {
            console.error('[World] CRITICAL ERROR IN World.load:', e);
        }
    },

    decompressRLE(rle, expectedSize) {
        const result = new Array(expectedSize).fill(0);
        for (const [val, start, count] of rle) {
            for (let i = 0; i < count; i++) {
                if (start + i < expectedSize) {
                    result[start + i] = val;
                }
            }
        }
        return result;
    },

    processSnapshot(snapshot) {
        if (!snapshot.changes) return;
        snapshot.changes.forEach(change => {
            this.updateTile(change.x, change.y, change);
            if (change.fg === 0 && change.breakHits === 0) {
                // Potential particles/sound here
            }
        });
    },

    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
        if (!this.tiles[y]) return null;
        return this.tiles[y][x];
    },

    updateTile(x, y, data) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        if (!this.tiles[y]) return;
        if (data.fg !== undefined) this.tiles[y][x].fg = data.fg;
        if (data.bg !== undefined) this.tiles[y][x].bg = data.bg;
        if (data.extra !== undefined) this.tiles[y][x].extra = data.extra;
        if (data.breakHits !== undefined) this.tiles[y][x].breakHits = data.breakHits;
    },

    isSolid(x, y) {
        const tile = this.getTile(x, y);
        if (!tile) return true; // Out of bounds = solid
        if (tile.fg === 0) return false;
        const item = ITEMS[tile.fg];
        if (!item) return false;
        return item.type === 'block' || item.type === 'lock';
    },

    isPlatform(x, y) {
        const tile = this.getTile(x, y);
        if (!tile) return false;
        if (tile.fg === 0) return false;
        const item = ITEMS[tile.fg];
        return item && item.type === 'platform';
    },

    hitBlock(x, y) {
        const tile = this.getTile(x, y);
        if (!tile) return null;

        const fgItem = ITEMS[tile.fg];
        const bgItem = ITEMS[tile.bg];

        if (fgItem && fgItem.id !== 0) {
            // Unbreakable check
            if (fgItem.unbreakable) return null;

            tile.breakHits = (tile.breakHits || 0) + 1;
            if (tile.breakHits >= fgItem.hardness) {
                const drops = this.getDrops(tile.fg, tile.extra);
                const oldFg = tile.fg;
                tile.fg = 0;
                tile.breakHits = 0;
                tile.extra = {};
                return { destroyed: true, layer: 'fg', itemId: oldFg, drops };
            }
            return { destroyed: false, layer: 'fg', hits: tile.breakHits };
        } else if (bgItem && bgItem.id !== 0) {
            // BG layer
            tile.breakHits = (tile.breakHits || 0) + 1;
            if (tile.breakHits >= bgItem.hardness) {
                const drops = [{ itemId: tile.bg, count: 1 }];
                const oldBg = tile.bg;
                tile.bg = 0;
                tile.breakHits = 0;
                tile.extra = {};
                return { destroyed: true, layer: 'bg', itemId: oldBg, drops };
            }
            return { destroyed: false, layer: 'bg', hits: tile.breakHits };
        }
        return null;
    },

    placeBlock(x, y, itemId) {
        const tile = this.getTile(x, y);
        if (!tile) return null;

        const item = ITEMS[itemId];
        if (!item) return null;

        if (item.type === 'background') {
            if (tile.bg === 0) {
                tile.bg = itemId;
                return { placed: true, layer: 'bg' };
            }
        } else {
            if (tile.fg === 0) {
                tile.fg = itemId;
                tile.extra = {};
                if (item.type === 'seed') {
                    tile.extra = {
                        plantedAt: Date.now(),
                        growthTime: item.growthTime * 1000,
                        fruitCount: Math.floor(Math.random() * 3) + 2
                    };
                }
                return { placed: true, layer: 'fg' };
            }
        }
        return null;
    },

    getDrops(itemId, extra) {
        const item = ITEMS[itemId];
        if (!item) return [];

        if (item.type === 'seed' && extra && extra.plantedAt) {
            const elapsed = Date.now() - extra.plantedAt;
            if (elapsed >= (extra.growthTime || 30000)) {
                const drops = [];
                const growsInto = item.growsInto || 1;
                const fruitCount = extra.fruitCount || 2;
                for (let i = 0; i < fruitCount; i++) drops.push({ itemId: growsInto, count: 1 });
                drops.push({ itemId: itemId, count: 1 }); // Always 1 seed back
                return drops;
            }
            return [{ itemId: itemId, count: 1 }];
        }

        const drops = [];
        if (item.dropSeed) drops.push({ itemId: item.dropSeed, count: 1 });
        if (Math.random() < 0.3) drops.push({ itemId: itemId, count: 1 });
        if (drops.length === 0) drops.push({ itemId: itemId, count: 1 });
        return drops;
    }
};
