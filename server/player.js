const CONSTANTS = require('../shared/constants');
const { ITEMS, SHOP } = require('../shared/itemData');

class Player {
    constructor(name, ws, accountData = null) {
        this.name = name;
        this.ws = ws;
        this.worldName = null;
        this.x = 50 * CONSTANTS.TILE_SIZE; // Spawn at center
        this.y = (CONSTANTS.SURFACE_LEVEL - 2) * CONSTANTS.TILE_SIZE;
        this.velX = 0;
        this.velY = 0;
        this.inventory = [];
        this.gems = 0;
        this.selectedSlot = 0;
        this.lastMoveTime = Date.now();
        this.lastHitTime = 0;
        this.hitCount = 0;
        this.isGuest = !accountData;

        if (accountData) {
            this.inventory = accountData.inventory || [];
            this.gems = accountData.gems || 0;
        } else {
            // Starter items for guests/new accounts
            this.addItem(1, 50);  // 50 Dirt
            this.addItem(3, 20);  // 20 Rock
            this.addItem(2, 10);  // 10 Dirt Seeds
            this.addItem(4, 5);   // 5 Rock Seeds
            this.gems = 100;
        }
    }

    addItem(itemId, count) {
        const existing = this.inventory.find(slot => slot.itemId === itemId);
        if (existing) {
            existing.count += count;
        } else {
            this.inventory.push({ itemId, count });
        }
    }

    removeItem(itemId, count) {
        const idx = this.inventory.findIndex(slot => slot.itemId === itemId);
        if (idx === -1) return false;
        if (this.inventory[idx].count < count) return false;
        this.inventory[idx].count -= count;
        if (this.inventory[idx].count <= 0) {
            this.inventory.splice(idx, 1);
        }
        return true;
    }

    hasItem(itemId, count = 1) {
        const slot = this.inventory.find(s => s.itemId === itemId);
        return slot && slot.count >= count;
    }

    getSelectedItem() {
        if (this.selectedSlot >= 0 && this.selectedSlot < this.inventory.length) {
            return this.inventory[this.selectedSlot];
        }
        return null;
    }

    buyItem(itemId) {
        const shopItem = SHOP.find(s => s.itemId === itemId);
        if (!shopItem) return { error: 'not_in_shop' };
        if (this.gems < shopItem.price) return { error: 'not_enough_gems' };
        this.gems -= shopItem.price;
        this.addItem(itemId, 1);
        return { success: true, remaining: this.gems };
    }

    validateMovement(newX, newY) {
        const now = Date.now();
        const dt = (now - this.lastMoveTime) / 1000;
        if (dt <= 0) return false;

        const dx = Math.abs(newX - this.x);
        const dy = Math.abs(newY - this.y);
        const maxDist = CONSTANTS.MOVE_SPEED * CONSTANTS.TILE_SIZE * dt * CONSTANTS.MAX_SPEED_TOLERANCE;

        this.lastMoveTime = now;

        // Allow large teleports on first move or when joining world
        if (dt > 2) return true;

        return (dx <= maxDist + CONSTANTS.TILE_SIZE && dy <= maxDist + CONSTANTS.TILE_SIZE * 2);
    }

    checkHitRate() {
        const now = Date.now();
        if (now - this.lastHitTime > 1000) {
            this.hitCount = 0;
            this.lastHitTime = now;
        }
        this.hitCount++;
        return this.hitCount <= CONSTANTS.MAX_HITS_PER_SECOND;
    }

    getPublicData() {
        return {
            name: this.name,
            x: this.x,
            y: this.y,
        };
    }

    getPrivateData() {
        return {
            name: this.name,
            x: this.x,
            y: this.y,
            inventory: this.inventory,
            gems: this.gems,
        };
    }
}

module.exports = Player;
