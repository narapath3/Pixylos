// Camera - viewport management
const Camera = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    width: 0,
    height: 0,
    target: null,
    smoothing: 0.12,

    init(canvas) {
        this.width = canvas.width;
        this.height = canvas.height;
    },

    resize(canvas) {
        this.width = canvas.width;
        this.height = canvas.height;
    },

    setTarget(obj) {
        this.target = obj;
    },

    follow(targetX, targetY) {
        this.targetX = targetX - this.width / 2;
        this.targetY = targetY - this.height / 2;

        // Clamp to world bounds
        const maxX = CONSTANTS.WORLD_WIDTH * CONSTANTS.TILE_SIZE - this.width;
        const maxY = CONSTANTS.WORLD_HEIGHT * CONSTANTS.TILE_SIZE - this.height;
        this.targetX = Math.max(0, Math.min(this.targetX, maxX));
        this.targetY = Math.max(0, Math.min(this.targetY, maxY));
    },

    update() {
        if (this.target) {
            this.follow(this.target.x + 11, this.target.y + 15); // Center on player
        }
        this.x += (this.targetX - this.x) * this.smoothing;
        this.y += (this.targetY - this.y) * this.smoothing;
    },

    screenToWorld(sx, sy) {
        return {
            x: sx + this.x,
            y: sy + this.y
        };
    },

    worldToScreen(wx, wy) {
        return {
            x: wx - this.x,
            y: wy - this.y
        };
    },

    getVisibleTiles() {
        const startX = Math.max(0, Math.floor(this.x / CONSTANTS.TILE_SIZE));
        const startY = Math.max(0, Math.floor(this.y / CONSTANTS.TILE_SIZE));
        const endX = Math.min(CONSTANTS.WORLD_WIDTH - 1,
            Math.ceil((this.x + this.width) / CONSTANTS.TILE_SIZE));
        const endY = Math.min(CONSTANTS.WORLD_HEIGHT - 1,
            Math.ceil((this.y + this.height) / CONSTANTS.TILE_SIZE));
        return { startX, startY, endX, endY };
    }
};
