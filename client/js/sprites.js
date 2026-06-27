// Sprites - procedural pixel art generation (no external images needed)
const SpriteManager = {
    spriteCache: {},
    playerSprite: null,

    init() {
        // Generate all item sprites procedurally
        for (const [id, item] of Object.entries(ITEMS)) {
            if (item.id === 0) continue;
            this.spriteCache[item.id] = this.generateItemSprite(item);
        }
        this.playerSprite = this.generatePlayerSprite();
    },

    generateItemSprite(item) {
        const size = CONSTANTS.TILE_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const color = item.color;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);

        switch (item.type) {
            case 'block':
                this.drawBlock(ctx, size, r, g, b, item);
                break;
            case 'seed':
                this.drawSeed(ctx, size, r, g, b);
                break;
            case 'background':
                this.drawBackground(ctx, size, r, g, b);
                break;
            case 'platform':
                this.drawPlatform(ctx, size, r, g, b);
                break;
            case 'lock':
                this.drawLock(ctx, size, r, g, b);
                break;
            case 'door':
                this.drawDoor(ctx, size, r, g, b);
                break;
            case 'sign':
                this.drawSign(ctx, size, r, g, b);
                break;
            default:
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, size, size);
        }

        return canvas;
    },

    drawBlock(ctx, s, r, g, b, item) {
        // Main fill
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, s, s);

        // Top highlight
        ctx.fillStyle = `rgba(255,255,255,0.15)`;
        ctx.fillRect(0, 0, s, 4);

        // Bottom shadow
        ctx.fillStyle = `rgba(0,0,0,0.2)`;
        ctx.fillRect(0, s - 4, s, 4);

        // Left highlight
        ctx.fillStyle = `rgba(255,255,255,0.08)`;
        ctx.fillRect(0, 0, 4, s);

        // Right shadow
        ctx.fillStyle = `rgba(0,0,0,0.12)`;
        ctx.fillRect(s - 4, 0, 4, s);

        // Texture dots
        ctx.fillStyle = `rgba(0,0,0,0.1)`;
        for (let i = 0; i < 6; i++) {
            const x = (Math.sin(item.id * 7 + i * 13) * 0.5 + 0.5) * (s - 8) + 4;
            const y = (Math.cos(item.id * 11 + i * 17) * 0.5 + 0.5) * (s - 8) + 4;
            ctx.fillRect(Math.floor(x), Math.floor(y), 3, 3);
        }

        // Border
        ctx.strokeStyle = `rgba(0,0,0,0.3)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },

    drawSeed(ctx, s, r, g, b) {
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(0, 0, s, s);

        // Seed body
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.ellipse(s / 2, s / 2, s / 4, s / 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stem
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(s / 2 - 1, s / 4 - 4, 3, 8);

        // Leaf
        ctx.beginPath();
        ctx.ellipse(s / 2 + 5, s / 4 - 2, 4, 2, 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(0,0,0,0.3)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },

    drawBackground(ctx, s, r, g, b) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, s, s);

        // Grid pattern
        ctx.strokeStyle = `rgba(255,255,255,0.05)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < s; i += 8) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, s);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(s, i);
            ctx.stroke();
        }
    },

    drawPlatform(ctx, s, r, g, b) {
        ctx.clearRect(0, 0, s, s);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, s, 10);
        ctx.fillStyle = `rgba(0,0,0,0.2)`;
        ctx.fillRect(0, 8, s, 2);
        ctx.fillStyle = `rgba(255,255,255,0.15)`;
        ctx.fillRect(0, 0, s, 2);
    },

    drawLock(ctx, s, r, g, b) {
        ctx.fillStyle = `rgb(${Math.floor(r * 0.3)},${Math.floor(g * 0.3)},${Math.floor(b * 0.3)})`;
        ctx.fillRect(0, 0, s, s);

        // Lock body
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(6, 12, s - 12, s - 16);

        // Lock shackle
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(s / 2, 14, 8, Math.PI, 0);
        ctx.stroke();

        // Keyhole
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(s / 2, 22, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(s / 2 - 1, 22, 3, 6);

        // Glow
        ctx.shadowColor = `rgb(${r},${g},${b})`;
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, s, s);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = `rgba(0,0,0,0.3)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },

    drawDoor(ctx, s, r, g, b) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(4, 0, s - 8, s);

        // Door frame
        ctx.fillStyle = `rgba(0,0,0,0.2)`;
        ctx.fillRect(4, 0, 3, s);
        ctx.fillRect(s - 7, 0, 3, s);

        // Panels
        ctx.fillStyle = `rgba(0,0,0,0.1)`;
        ctx.fillRect(9, 4, s - 18, s / 2 - 6);
        ctx.fillRect(9, s / 2 + 2, s - 18, s / 2 - 6);

        // Handle
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(s - 11, s / 2, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(0,0,0,0.3)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },

    drawSign(ctx, s, r, g, b) {
        // Post
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(s / 2 - 2, s / 2, 4, s / 2);

        // Board
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(3, 4, s - 6, s / 2 - 2);

        // Border
        ctx.strokeStyle = '#A0522D';
        ctx.lineWidth = 2;
        ctx.strokeRect(3, 4, s - 6, s / 2 - 2);

        // Text lines
        ctx.fillStyle = '#333';
        ctx.fillRect(7, 10, s - 14, 2);
        ctx.fillRect(7, 16, s - 20, 2);
    },

    drawTree(ctx, x, y, seedItem, progress) {
        const s = CONSTANTS.TILE_SIZE;
        const r = parseInt(seedItem.treeColor.slice(1, 3), 16);
        const g = parseInt(seedItem.treeColor.slice(3, 5), 16);
        const b = parseInt(seedItem.treeColor.slice(5, 7), 16);

        const height = Math.floor(progress * 3 + 1);
        const ready = progress >= 1;

        // Trunk
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(x + s / 2 - 3, y - height * 10 + s, 6, height * 10);

        // Leaves/crown
        if (progress > 0.3) {
            ctx.fillStyle = ready ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},0.6)`;
            const crownSize = Math.floor(8 + progress * 12);
            ctx.beginPath();
            ctx.arc(x + s / 2, y - height * 10 + s - 5, crownSize, 0, Math.PI * 2);
            ctx.fill();

            // Highlight
            ctx.fillStyle = `rgba(255,255,255,0.15)`;
            ctx.beginPath();
            ctx.arc(x + s / 2 - 3, y - height * 10 + s - 8, crownSize * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // Fruits if ready
        if (ready) {
            ctx.fillStyle = seedItem.color;
            for (let i = 0; i < 3; i++) {
                const fx = x + s / 2 + Math.cos(i * 2.1) * 10;
                const fy = y - height * 10 + s - 5 + Math.sin(i * 2.1) * 8;
                ctx.beginPath();
                ctx.arc(fx, fy, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Sparkle effect
            const sparkle = Date.now() % 1000 / 1000;
            ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(sparkle * Math.PI * 2) * 0.3})`;
            ctx.beginPath();
            ctx.arc(x + s / 2 + Math.cos(sparkle * 6) * 12, y - height * 10 + s - 10, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    generatePlayerSprite() {
        const canvas = document.createElement('canvas');
        canvas.width = CONSTANTS.PLAYER_WIDTH;
        canvas.height = CONSTANTS.PLAYER_HEIGHT;
        const ctx = canvas.getContext('2d');
        const w = CONSTANTS.PLAYER_WIDTH;
        const h = CONSTANTS.PLAYER_HEIGHT;

        // Body
        ctx.fillStyle = '#4FC3F7';
        ctx.fillRect(4, 10, w - 8, h - 14);

        // Head
        ctx.fillStyle = '#FFCC80';
        ctx.fillRect(5, 0, w - 10, 12);

        // Eyes
        ctx.fillStyle = '#333';
        ctx.fillRect(7, 4, 3, 3);
        ctx.fillRect(w - 10, 4, 3, 3);

        // Legs
        ctx.fillStyle = '#1565C0';
        ctx.fillRect(5, h - 6, 5, 6);
        ctx.fillRect(w - 10, h - 6, 5, 6);

        return canvas;
    },

    getItemSprite(itemId) {
        return this.spriteCache[itemId] || null;
    },

    getPlayerColors() {
        const colors = [
            '#4FC3F7', '#FF7043', '#66BB6A', '#AB47BC',
            '#FFA726', '#EC407A', '#26A69A', '#5C6BC0'
        ];
        return colors;
    },

    generateColoredPlayer(color) {
        const canvas = document.createElement('canvas');
        canvas.width = CONSTANTS.PLAYER_WIDTH;
        canvas.height = CONSTANTS.PLAYER_HEIGHT;
        const ctx = canvas.getContext('2d');
        const w = CONSTANTS.PLAYER_WIDTH;
        const h = CONSTANTS.PLAYER_HEIGHT;

        // Body
        ctx.fillStyle = color;
        ctx.fillRect(4, 10, w - 8, h - 14);

        // Head
        ctx.fillStyle = '#FFCC80';
        ctx.fillRect(5, 0, w - 10, 12);

        // Eyes
        ctx.fillStyle = '#333';
        ctx.fillRect(7, 4, 3, 3);
        ctx.fillRect(w - 10, 4, 3, 3);

        // Legs
        ctx.fillStyle = '#333';
        ctx.fillRect(5, h - 6, 5, 6);
        ctx.fillRect(w - 10, h - 6, 5, 6);

        return canvas;
    }
};
