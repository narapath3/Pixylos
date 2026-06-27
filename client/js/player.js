// Client-side player with physics and input
const LocalPlayer = {
    name: '',
    x: 0,
    y: 0,
    velX: 0,
    velY: 0,
    onGround: false,
    facingRight: true,
    punching: false,
    punchTimer: 0,
    inventory: [],
    selectedSlot: 0,
    gems: 0,
    moveState: { left: false, right: false, up: false },
    sprinting: false,
    lastSendTime: 0,
    sprite: null,
    walkFrame: 0,
    walkTimer: 0,

    init(data) {
        this.name = data.name;
        this.x = data.x;
        this.y = data.y;
        this.inventory = data.inventory || [];
        this.gems = data.gems || 0;
        this.sprite = SpriteManager.playerSprite;
    },

    update(dt) {
        // Horizontal movement
        let moveX = 0;
        if (this.moveState.left) moveX -= 1;
        if (this.moveState.right) moveX += 1;

        const speed = this.sprinting ? CONSTANTS.MOVE_SPEED : (CONSTANTS.MOVE_SPEED * 0.55);
        this.velX = moveX * speed;

        if (moveX !== 0) this.facingRight = moveX > 0;

        // Jump (single press only — consume the input)
        if (this.moveState.up && this.onGround) {
            this.velY = CONSTANTS.JUMP_FORCE;
            this.onGround = false;
            this.moveState.up = false;
            SoundManager.playJump();
        }

        // Gravity
        this.velY += CONSTANTS.GRAVITY;
        if (this.velY > CONSTANTS.MAX_FALL_SPEED) this.velY = CONSTANTS.MAX_FALL_SPEED;

        // Move X
        const newX = this.x + this.velX;
        if (!this.checkCollision(newX, this.y)) {
            this.x = newX;
        } else {
            this.velX = 0;
        }

        // Move Y
        const newY = this.y + this.velY;
        if (!this.checkCollision(this.x, newY)) {
            this.y = newY;
            this.onGround = false;
        } else {
            if (this.velY > 0) {
                if (!this.onGround) SoundManager.playLand();
                this.onGround = true;
            }
            this.velY = 0;
        }

        // Clamp to world
        this.x = Math.max(0, Math.min(this.x, (CONSTANTS.WORLD_WIDTH - 1) * CONSTANTS.TILE_SIZE));
        this.y = Math.max(0, Math.min(this.y, (CONSTANTS.WORLD_HEIGHT - 2) * CONSTANTS.TILE_SIZE));

        // Punch animation timer
        if (this.punchTimer > 0) this.punchTimer -= dt;

        // Walk animation
        if (Math.abs(this.velX) > 0.5) {
            this.walkTimer += dt;
            if (this.walkTimer > 0.15) {
                this.walkTimer = 0;
                this.walkFrame = (this.walkFrame + 1) % 4;
                if (this.onGround) SoundManager.playFootstep(this.sprinting);
            }
        } else {
            this.walkFrame = 0;
            this.walkTimer = 0;
        }

        // Send position to server
        const now = Date.now();
        if (now - this.lastSendTime > 1000 / CONSTANTS.POSITION_SYNC_RATE) {
            this.lastSendTime = now;
            Network.send(PacketTypes.C_MOVE, {
                x: Math.round(this.x),
                y: Math.round(this.y)
            });
        }
    },

    checkCollision(x, y) {
        const pw = CONSTANTS.PLAYER_WIDTH;
        const ph = CONSTANTS.PLAYER_HEIGHT;
        const ts = CONSTANTS.TILE_SIZE;

        // Check corners and edges
        const points = [
            { x: x + 2, y: y + 2 },          // top-left
            { x: x + pw - 2, y: y + 2 },      // top-right
            { x: x + 2, y: y + ph - 1 },      // bottom-left
            { x: x + pw - 2, y: y + ph - 1 }, // bottom-right
            { x: x + pw / 2, y: y + ph - 1 }, // bottom-center
        ];

        for (const p of points) {
            const tx = Math.floor(p.x / ts);
            const ty = Math.floor(p.y / ts);
            if (ClientWorld.isSolid(tx, ty)) return true;
        }

        // Platform check (only when falling)
        if (this.velY > 0) {
            const feetY = y + ph;
            const prevFeetY = this.y + ph;
            const tx1 = Math.floor((x + 2) / ts);
            const tx2 = Math.floor((x + pw - 2) / ts);
            const ty = Math.floor(feetY / ts);
            const prevTy = Math.floor(prevFeetY / ts);

            if (ty !== prevTy) {
                if (ClientWorld.isPlatform(tx1, ty) || ClientWorld.isPlatform(tx2, ty)) {
                    return true;
                }
            }
        }

        return false;
    },

    getSelectedItem() {
        if (this.selectedSlot >= 0 && this.selectedSlot < this.inventory.length) {
            return this.inventory[this.selectedSlot];
        }
        return null;
    },

    getTilePos() {
        return {
            x: Math.floor((this.x + CONSTANTS.PLAYER_WIDTH / 2) / CONSTANTS.TILE_SIZE),
            y: Math.floor((this.y + CONSTANTS.PLAYER_HEIGHT / 2) / CONSTANTS.TILE_SIZE)
        };
    },

    punch() {
        this.punchTimer = 0.2;
        this.punching = true;
        setTimeout(() => this.punching = false, 200);
    },

    addItem(itemId, count) {
        const item = ITEMS[itemId];
        if (!item) return;

        const existing = this.inventory.find(slot => slot.itemId === itemId);
        if (existing) {
            existing.count += count;
        } else {
            this.inventory.push({ itemId, count });
        }

        if (window.UI) UI.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, this.gems);
        if (window.InventoryUI) InventoryUI.render();
        Network.saveProfile();
    },

    removeItem(itemId, count) {
        const idx = this.inventory.findIndex(slot => slot.itemId === itemId);
        if (idx === -1) return false;
        if (this.inventory[idx].count < count) return false;

        this.inventory[idx].count -= count;
        if (this.inventory[idx].count <= 0) {
            this.inventory.splice(idx, 1);
        }

        if (window.UI) UI.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, this.gems);
        if (window.InventoryUI) InventoryUI.render();
        Network.saveProfile();
        return true;
    },

    hasItem(itemId, count = 1) {
        const slot = this.inventory.find(s => s.itemId === itemId);
        return slot && slot.count >= count;
    },

    buyItem(itemId) {
        const shopItem = SHOP.find(s => s.itemId === itemId);
        if (!shopItem) return { error: 'not_in_shop' };
        if (this.gems < shopItem.price) return { error: 'not_enough_gems' };

        this.gems -= shopItem.price;
        this.addItem(itemId, 1);
        return { success: true, remaining: this.gems };
    }
};

// Other players
const OtherPlayers = {
    players: new Map(),

    add(data) {
        const colors = SpriteManager.getPlayerColors();
        const colorIdx = Math.abs(this.hashName(data.name)) % colors.length;
        data.sprite = SpriteManager.generateColoredPlayer(colors[colorIdx]);
        data.targetX = data.x;
        data.targetY = data.y;
        data.walkFrame = 0;
        data.facingRight = true;
        this.players.set(data.name, data);
    },

    remove(name) {
        this.players.delete(name);
    },

    updatePosition(name, x, y) {
        const p = this.players.get(name);
        if (p) {
            if (x > p.x) p.facingRight = true;
            else if (x < p.x) p.facingRight = false;
            p.targetX = x;
            p.targetY = y;
        }
    },

    update(dt) {
        for (const [, p] of this.players) {
            // Interpolate
            p.x += (p.targetX - p.x) * 0.2;
            p.y += (p.targetY - p.y) * 0.2;
        }
    },

    hashName(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash = hash & hash;
        }
        return hash;
    }
};
