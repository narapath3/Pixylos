/**
 * TradeManager - Handles secure player-to-player trading
 */
class TradeSession {
    constructor(id, playerA, playerB) {
        this.id = id;
        this.playerA = playerA; // Player object
        this.playerB = playerB;
        this.offerA = []; // { itemId, count }
        this.offerB = [];
        this.confirmedA = false;
        this.confirmedB = false;
        this.status = 'OPEN';
        this.createdAt = Date.now();
        this.timeout = 120000; // 2 minutes
    }

    addOffer(player, itemId, count) {
        const isA = player.name === this.playerA.name;
        const offer = isA ? this.offerA : this.offerB;

        // Reset confirms on any change
        this.confirmedA = false;
        this.confirmedB = false;

        const existing = offer.find(i => i.itemId === itemId);
        if (existing) {
            existing.count += count;
        } else {
            offer.push({ itemId, count });
        }
        return true;
    }

    removeOffer(player, itemId, count) {
        const isA = player.name === this.playerA.name;
        const offer = isA ? this.offerA : this.offerB;

        this.confirmedA = false;
        this.confirmedB = false;

        const index = offer.findIndex(i => i.itemId === itemId);
        if (index === -1) return false;

        offer[index].count -= count;
        if (offer[index].count <= 0) {
            offer.splice(index, 1);
        }
        return true;
    }

    confirm(player) {
        if (player.name === this.playerA.name) this.confirmedA = true;
        if (player.name === this.playerB.name) this.confirmedB = true;

        if (this.confirmedA && this.confirmedB) {
            return this.execute();
        }
        return { status: 'PENDING' };
    }

    execute() {
        // ATOMIC EXECUTION (Simplified since JS is single-threaded, but logic is robust)
        try {
            // 1. Verify Player A still has all items
            for (const item of this.offerA) {
                if (!this.playerA.hasItem(item.itemId, item.count)) throw new Error(`A missing ${item.itemId}`);
            }
            // 2. Verify Player B still has all items
            for (const item of this.offerB) {
                if (!this.playerB.hasItem(item.itemId, item.count)) throw new Error(`B missing ${item.itemId}`);
            }

            // 3. Move items from A to B
            for (const item of this.offerA) {
                this.playerA.removeItem(item.itemId, item.count);
                this.playerB.addItem(item.itemId, item.count);
            }

            // 4. Move items from B to A
            for (const item of this.offerB) {
                this.playerB.removeItem(item.itemId, item.count);
                this.playerA.addItem(item.itemId, item.count);
            }

            this.status = 'COMPLETED';
            return { status: 'SUCCESS' };
        } catch (e) {
            console.error('[Trade] Execution failed:', e.message);
            this.status = 'FAILED';
            return { status: 'ERROR', msg: e.message };
        }
    }

    getClientData() {
        return {
            id: this.id,
            playerA: this.playerA.name,
            playerB: this.playerB.name,
            offerA: this.offerA,
            offerB: this.offerB,
            confirmedA: this.confirmedA,
            confirmedB: this.confirmedB,
            status: this.status
        };
    }
}

class TradeManager {
    constructor() {
        this.sessions = new Map();
        this.requests = new Map(); // targetPlayer -> requestingPlayer
    }

    requestTrade(fromPlayer, toPlayer) {
        this.requests.set(toPlayer.name, fromPlayer.name);
        return true;
    }

    acceptRequest(player, fromPlayer) {
        if (this.requests.get(player.name) === fromPlayer.name) {
            const sid = `T_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const session = new TradeSession(sid, fromPlayer, player);
            this.sessions.set(sid, session);
            this.requests.delete(player.name);
            return session;
        }
        return null;
    }

    getSession(sid) {
        return this.sessions.get(sid);
    }

    cancelSession(sid) {
        this.sessions.delete(sid);
    }

    getPlayerSession(playerName) {
        for (const session of this.sessions.values()) {
            if (session.playerA.name === playerName || session.playerB.name === playerName) {
                return session;
            }
        }
        return null;
    }
}

module.exports = new TradeManager();
