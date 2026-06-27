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
            } else {
                // Old format: raw flat arrays
                const fg = data.fg;
                const bg = data.bg;
                const extra = data.extra || {};

                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const idx = y * this.width + x;
                        const tileExtra = extra[idx] || { e: {}, h: 0 };
                        this.tiles[y][x].fg = fg[idx];
                        this.tiles[y][x].bg = bg[idx];
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
    }
};
