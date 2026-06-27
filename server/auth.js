const fs = require('fs');
const path = require('path');

class AuthManager {
    constructor() {
        this.accountsPath = path.join(__dirname, 'data', 'accounts.json');
        this.accounts = {};
        this.loadAccounts();
    }

    loadAccounts() {
        if (!fs.existsSync(path.dirname(this.accountsPath))) {
            fs.mkdirSync(path.dirname(this.accountsPath), { recursive: true });
        }
        if (fs.existsSync(this.accountsPath)) {
            try {
                this.accounts = JSON.parse(fs.readFileSync(this.accountsPath, 'utf8'));
            } catch (e) {
                console.error('[Auth] Error loading accounts:', e);
                this.accounts = {};
            }
        }
    }

    saveAccounts() {
        try {
            fs.writeFileSync(this.accountsPath, JSON.stringify(this.accounts, null, 2));
        } catch (e) {
            console.error('[Auth] Error saving accounts:', e);
        }
    }

    register(username, password, displayName) {
        username = username.toLowerCase().trim();
        if (this.accounts[username]) return { error: 'Username already taken' };

        this.accounts[username] = {
            username: username,
            displayName: displayName || username,
            password: password, // In a real app, hash this!
            inventory: [],
            gems: 100,
            experience: 0,
            level: 1,
            lastSeen: Date.now()
        };
        this.saveAccounts();
        return { success: true };
    }

    login(username, password) {
        username = username.toLowerCase().trim();
        const account = this.accounts[username];
        if (!account) return { error: 'User not found' };
        if (account.password !== password) return { error: 'Incorrect password' };

        return { success: true, data: account };
    }

    savePlayerData(username, data) {
        username = username.toLowerCase().trim();
        if (this.accounts[username]) {
            this.accounts[username].inventory = data.inventory;
            this.accounts[username].gems = data.gems;
            this.accounts[username].lastSeen = Date.now();
            this.saveAccounts();
        }
    }
}

module.exports = new AuthManager();
