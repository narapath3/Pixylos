// MiniMap - Real-time simplified world view
const MiniMap = {
    canvas: null,
    ctx: null,
    updateRate: 1000, // Update every 1000ms
    lastUpdate: 0,
    scale: 0.4, // Mini Map scale relative to its canvas size

    init() {
        this.canvas = document.getElementById('mini-map');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Resize according to world aspect ratio
        this.resize();
    },

    resize() {
        if (!this.canvas) return;
        // Adjust width for wider world, but keep height manageable
        const width = 240; // Increased width for 800x100 world
        const height = Math.floor(width * (CONSTANTS.WORLD_HEIGHT / CONSTANTS.WORLD_WIDTH));
        this.canvas.width = width;
        this.canvas.height = height;
    },

    render(force = false) {
        if (!this.canvas || !this.ctx) return;

        const now = Date.now();
        if (!force && now - this.lastUpdate < this.updateRate) return;
        this.lastUpdate = now;

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const worldW = CONSTANTS.WORLD_WIDTH;
        const worldH = CONSTANTS.WORLD_HEIGHT;

        ctx.clearRect(0, 0, w, h);

        // Draw background (sky/underground)
        const surfaceY = (CONSTANTS.SURFACE_LEVEL / worldH) * h;
        ctx.fillStyle = '#0a0a2a'; // Sky
        ctx.fillRect(0, 0, w, surfaceY);
        ctx.fillStyle = '#1a1a1a'; // Underground
        ctx.fillRect(0, surfaceY, w, h - surfaceY);

        // Draw tiles (batch by color for performance)
        const tileW = w / worldW;
        const tileH = h / worldH;

        for (let y = 0; y < worldH; y++) {
            for (let x = 0; x < worldW; x++) {
                const tile = ClientWorld.getTile(x, y);
                if (!tile || tile.fg === 0) continue;

                const item = ITEMS[tile.fg];
                if (item && item.color) {
                    ctx.fillStyle = item.color;
                    ctx.fillRect(x * tileW, y * tileH, Math.max(1, tileW), Math.max(1, tileH));
                }
            }
        }

        // Draw local player (blinking dot)
        const px = (LocalPlayer.x / (worldW * CONSTANTS.TILE_SIZE)) * w;
        const py = (LocalPlayer.y / (worldH * CONSTANTS.TILE_SIZE)) * h;

        ctx.fillStyle = '#fff';
        if (Math.floor(now / 500) % 2 === 0) {
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw viewport bounds
        const viewX = (Camera.x / (worldW * CONSTANTS.TILE_SIZE)) * w;
        const viewY = (Camera.y / (worldH * CONSTANTS.TILE_SIZE)) * h;
        const viewW = (Camera.width / (worldW * CONSTANTS.TILE_SIZE)) * w;
        const viewH = (Camera.height / (worldH * CONSTANTS.TILE_SIZE)) * h;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(viewX, viewY, viewW, viewH);
    }
};
