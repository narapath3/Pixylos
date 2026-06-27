// UI - chat, dialogs, notifications
const UI = {
    chatOpen: false,

    init() {
        this.setupChat();
        this.setupWorldNav();
        this.setupShop();
        this.setupSign();
        this.setupLock();
        this.setupDirectory();
        this.setupTrade();
        this.setupAuth();
        this.setupKeyboardShortcuts();
        this.registerHandlers();
    },

    updateLoginWorldList(worlds) {
        const list = document.getElementById('recent-worlds-list');
        if (!list) return;
        list.innerHTML = '';

        if (!worlds || (Array.isArray(worlds) && worlds.length === 0)) {
            list.innerHTML = '<div class="pixel-list-empty">No worlds found</div>';
            return;
        }

        worlds.forEach(w => {
            const el = document.createElement('div');
            el.className = 'pixel-list-item';
            el.innerHTML = `<span>${w.name}</span>`;
            el.onclick = () => {
                const loginInput = document.getElementById('login-world');
                if (loginInput) loginInput.value = w.name;
                const btn = document.getElementById('btn-show-login');
                if (btn) btn.click();
            };
            list.appendChild(el);
        });
    },

    registerHandlers() {
        Network.on(PacketTypes.S_LOCK_DATA, (data) => {
            if (data.type === 'sign') {
                this.openSign(data.x, data.y, data.text);
            } else if (data.type === 'lock') {
                this.openLock(data);
            }
        });

        Network.on(PacketTypes.S_GEMS_UPDATE, (data) => {
            LocalPlayer.gems = data.gems;
            this.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, LocalPlayer.gems);
        });

        Network.on(PacketTypes.S_CHAT, (data) => {
            this.addChatMessage(data.name, data.text);
        });

        Network.on(PacketTypes.S_ERROR, (data) => {
            this.showNotification(data.msg);
        });

        Network.on(PacketTypes.S_SERVER_STATS, (data) => {
            this.updateLoginStats(data);
        });

        Network.on(PacketTypes.S_TRADE_OPEN, (data) => {
            this.openTrade(data);
        });

        Network.on(PacketTypes.S_TRADE_UPDATE, (data) => {
            this.updateTrade(data);
        });

        Network.on(PacketTypes.S_TRADE_COMPLETE, () => {
            this.showNotification('Trade completed successfully! 🤝');
            this.closeTrade();
        });

        Network.on(PacketTypes.S_TRADE_CANCEL, () => {
            this.showNotification('Trade cancelled.');
            this.closeTrade();
        });

        Network.on(PacketTypes.S_LOGIN_FAIL, (data) => {
            this.showNotification('❌ ' + data.msg);
        });
    },

    updateLoginStats(data) {
        const countEl = document.getElementById('online-count');
        if (countEl) countEl.innerText = data.onlinePlayers;

        const listEl = document.getElementById('recent-worlds-list');
        if (listEl) {
            if (data.recentWorlds && data.recentWorlds.length > 0) {
                listEl.innerHTML = '';
                data.recentWorlds.forEach(worldName => {
                    const item = document.createElement('div');
                    item.className = 'pixel-world-item';
                    item.innerText = worldName;
                    item.onclick = () => {
                        const guestInput = document.getElementById('guest-world');
                        const loginInput = document.getElementById('login-world');
                        if (guestInput) guestInput.value = worldName;
                        if (loginInput) loginInput.value = worldName;
                    };
                    listEl.appendChild(item);
                });
            } else {
                listEl.innerHTML = '<div class="pixel-list-empty">No worlds active</div>';
            }
        }
    },

    setupChat() {
        const input = document.getElementById('chat-input');

        document.addEventListener('keydown', (e) => {
            if (Game.state !== 'playing') return;

            if (e.key === 'Enter') {
                if (this.chatOpen) {
                    const text = input.value.trim();
                    if (text) {
                        // Check for commands
                        if (text.startsWith('/')) {
                            this.handleCommand(text);
                        } else {
                            Network.send(PacketTypes.C_CHAT, { text });
                        }
                        input.value = '';
                    }
                    input.classList.remove('active');
                    input.blur();
                    this.chatOpen = false;
                } else {
                    input.classList.add('active');
                    input.focus();
                    this.chatOpen = true;
                }
                e.preventDefault();
            }

            if (e.key === 'Escape' && this.chatOpen) {
                input.classList.remove('active');
                input.blur();
                this.chatOpen = false;
            }
        });
    },

    handleCommand(text) {
        const parts = text.split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case '/go':
            case '/world':
                if (parts[1]) {
                    Network.send(PacketTypes.C_ENTER_WORLD, { world: parts[1] });
                }
                break;
            case '/shop':
            case '/store':
                this.openShop();
                break;
            case '/help':
                this.addChatMessage('>> SYSTEM', 'Commands: /go [world], /shop, /trade [name], /accept [name], /help');
                break;
            case '/trade':
                if (parts[1]) {
                    Network.send(PacketTypes.C_TRADE_REQUEST, { targetName: parts[1] });
                    this.addChatMessage('>> SYSTEM', `Trade request sent to ${parts[1]}.`);
                }
                break;
            case '/accept':
                if (parts[1]) {
                    Network.send(PacketTypes.C_TRADE_ACCEPT, { fromName: parts[1] });
                }
                break;
            default:
                this.addChatMessage('>> SYSTEM', 'Unknown command. Type /help');
        }
    },

    addChatMessage(name, text) {
        const container = document.getElementById('chat-messages');
        const msg = document.createElement('div');
        msg.className = 'chat-msg' + (name === '>> SYSTEM' ? ' system' : '');

        if (name === '>> SYSTEM') {
            msg.textContent = text;
        } else {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'chat-name';
            nameSpan.textContent = name + ':';
            msg.appendChild(nameSpan);
            msg.appendChild(document.createTextNode(' ' + text));
        }

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        // Auto-hide old messages
        if (container.children.length > 50) {
            container.removeChild(container.firstChild);
        }

        // Fade out after a while
        setTimeout(() => {
            msg.style.transition = 'opacity 1s';
            msg.style.opacity = '0.3';
        }, 10000);
    },

    setupWorldNav() {
        const dialog = document.getElementById('world-nav');
        const input = document.getElementById('nav-world-input');
        const btnGo = document.getElementById('btn-nav-go');
        const btnCancel = document.getElementById('btn-nav-cancel');

        const goToWorld = () => {
            const name = input.value.trim();
            if (name) {
                Network.send(PacketTypes.C_ENTER_WORLD, { world: name });
            }
            dialog.style.display = 'none';
            input.value = '';
        };

        btnGo.addEventListener('click', goToWorld);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') goToWorld();
        });
        btnCancel.addEventListener('click', () => {
            dialog.style.display = 'none';
        });

        const btnLeave = document.getElementById('btn-leave-world');
        if (btnLeave) {
            btnLeave.addEventListener('click', () => {
                if (confirm('Leave current world and return to menu?')) {
                    location.reload();
                }
            });
        }
    },

    openWorldNav() {
        document.getElementById('world-nav').style.display = 'flex';
        document.getElementById('nav-world-input').focus();
    },

    setupShop() {
        const dialog = document.getElementById('shop-dialog');
        const container = document.getElementById('shop-items');
        const btnClose = document.getElementById('btn-shop-close');

        btnClose.addEventListener('click', () => {
            dialog.style.display = 'none';
        });
    },

    openShop() {
        const dialog = document.getElementById('shop-dialog');
        const container = document.getElementById('shop-items');
        container.innerHTML = '';

        for (const shopItem of SHOP) {
            const item = ITEMS[shopItem.itemId];
            if (!item) continue;

            const el = document.createElement('div');
            el.className = 'shop-item';

            const info = document.createElement('div');
            info.className = 'shop-item-info';

            const icon = document.createElement('canvas');
            icon.className = 'shop-item-icon';
            icon.width = 32;
            icon.height = 32;
            const sprite = SpriteManager.getItemSprite(item.id);
            if (sprite) {
                const ctx = icon.getContext('2d');
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(sprite, 0, 0, 32, 32);
            }
            info.appendChild(icon);

            const nameEl = document.createElement('div');
            nameEl.innerHTML = `<div class="shop-item-name">${item.name}</div>
                               <div class="shop-item-price">💎 ${shopItem.price}</div>`;
            info.appendChild(nameEl);

            const buyBtn = document.createElement('button');
            buyBtn.className = 'btn-buy';
            buyBtn.textContent = 'BUY';
            buyBtn.addEventListener('click', () => {
                Network.send(PacketTypes.C_BUY_ITEM, { itemId: shopItem.itemId });
            });

            el.appendChild(info);
            el.appendChild(buyBtn);
            container.appendChild(el);
        }

        dialog.style.display = 'flex';
    },

    setupSign() {
        const dialog = document.getElementById('sign-dialog');
        const textarea = document.getElementById('sign-text');
        const btnSave = document.getElementById('btn-sign-save');
        const btnCancel = document.getElementById('btn-sign-cancel');

        btnSave.addEventListener('click', () => {
            if (this.signData) {
                Network.send(PacketTypes.C_SIGN_EDIT, {
                    x: this.signData.x,
                    y: this.signData.y,
                    text: textarea.value
                });
            }
            dialog.style.display = 'none';
        });

        btnCancel.addEventListener('click', () => {
            dialog.style.display = 'none';
        });
    },

    openSign(x, y, text) {
        this.signData = { x, y };
        document.getElementById('sign-text').value = text || '';
        document.getElementById('sign-dialog').style.display = 'flex';
    },

    setupLock() {
        const dialog = document.getElementById('lock-dialog');
        const btnClose = document.getElementById('btn-lock-close');
        const btnAdd = document.getElementById('btn-lock-add');
        const addInput = document.getElementById('lock-add-name');

        btnClose.addEventListener('click', () => dialog.style.display = 'none');

        btnAdd.addEventListener('click', () => {
            const name = addInput.value.trim();
            if (name && this.lockData) {
                Network.send(PacketTypes.C_LOCK_ACCESS, {
                    x: this.lockData.x,
                    y: this.lockData.y,
                    action: 'add',
                    targetName: name
                });
                addInput.value = '';
            }
        });
    },

    openLock(data) {
        this.lockData = data;
        const dialog = document.getElementById('lock-dialog');
        document.getElementById('lock-owner-name').textContent = data.owner;
        document.getElementById('lock-item-name').textContent = ITEMS[data.itemId]?.name || 'Lock';

        const list = document.getElementById('lock-access-list');
        list.innerHTML = '';

        if (data.accessList.length === 0) {
            list.innerHTML = '<div class="empty-list">No additional access</div>';
        } else {
            data.accessList.forEach(name => {
                const el = document.createElement('div');
                el.className = 'access-item';
                el.innerHTML = `<span>${name}</span>`;
                if (data.isOwner) {
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'btn-remove';
                    removeBtn.textContent = '×';
                    removeBtn.onclick = () => {
                        Network.send(PacketTypes.C_LOCK_ACCESS, {
                            x: data.x, y: data.y,
                            action: 'remove', targetName: name
                        });
                    };
                    el.appendChild(removeBtn);
                }
                list.appendChild(el);
            });
        }

        // Only owner can add access
        document.querySelector('.lock-add-access').style.display = data.isOwner ? 'flex' : 'none';

        dialog.style.display = 'flex';
    },

    setupDirectory() {
        const dialog = document.getElementById('directory-dialog');
        const btnClose = document.getElementById('btn-directory-close');
        btnClose.addEventListener('click', () => dialog.style.display = 'none');
    },

    openDirectory(worlds) {
        const dialog = document.getElementById('directory-dialog');
        const list = document.getElementById('world-list');
        list.innerHTML = '';

        if (!worlds || worlds.length === 0) {
            list.innerHTML = '<div class="empty-list">No active worlds</div>';
        } else {
            worlds.forEach(w => {
                const el = document.createElement('div');
                el.className = 'directory-item';
                el.innerHTML = `
                    <div class="dir-info">
                        <span class="dir-name">${w.name}</span>
                        <span class="dir-players">👤 ${w.playerCount}</span>
                    </div>
                    <button class="btn-visit">Visit</button>
                `;
                el.querySelector('.btn-visit').onclick = () => {
                    Network.send(PacketTypes.C_ENTER_WORLD, { world: w.name });
                    dialog.style.display = 'none';
                };
                list.appendChild(el);
            });
        }
        dialog.style.display = 'flex';
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (this.chatOpen || Game.state !== 'playing') return;
            if (document.getElementById('world-nav').style.display === 'flex') return;
            if (document.getElementById('shop-dialog').style.display === 'flex') return;

            // Number keys for hotbar (1-9)
            if (e.key >= '1' && e.key <= '9') {
                InventoryUI.selectSlot(parseInt(e.key) - 1);
            }

            // 'B' for Backpack
            if (e.key === 'b' || e.key === 'B') {
                this.toggleBackpack();
            }

            // 'R' for Recipes
            if (e.key === 'r' || e.key === 'R') {
                this.openRecipes();
            }

            // Tab to open shop
            if (e.key === 'Tab') {
                e.preventDefault();
                this.openShop();
            }

            // E key for world navigation
            if (e.key === 'e' || e.key === 'E') {
                this.openWorldNav();
            }
        });
    },

    showNotification(text) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        const el = document.createElement('div');
        el.className = 'notification-card';
        el.textContent = text;
        container.appendChild(el);

        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transition = 'opacity 0.5s';
            setTimeout(() => el.remove(), 500);
        }, 3000);
    },

    updateHUD(worldName, playerCount, gems) {
        document.getElementById('world-name-display').textContent = worldName;
        document.getElementById('player-count').textContent = `👤 ${playerCount}`;
        document.getElementById('gems-display').textContent = gems;
    },

    toggleBackpack() {
        const dialog = document.getElementById('backpack-dialog');
        if (dialog.style.display === 'flex') {
            this.closeBackpack();
        } else {
            this.openBackpack();
        }
    },

    openBackpack() {
        document.getElementById('backpack-dialog').style.display = 'flex';
        InventoryUI.renderBackpack();
    },

    closeBackpack() {
        document.getElementById('backpack-dialog').style.display = 'none';
    },

    swapInventory(idxBackpack, idxHotbar) {
        if (idxBackpack >= LocalPlayer.inventory.length) return;

        // Simple swap logic: if they are different indices, swap items in LocalPlayer.inventory
        // Actually, Hotbar is just the first 9 of LocalPlayer.inventory.
        // If user clicks a backpack slot, they might want to move it TO a hotbar slot.
        const temp = LocalPlayer.inventory[idxHotbar];
        LocalPlayer.inventory[idxHotbar] = LocalPlayer.inventory[idxBackpack];
        LocalPlayer.inventory[idxBackpack] = temp;

        InventoryUI.render();
        InventoryUI.renderBackpack();
        this.showNotification("Inventory swapped!");
    },

    setupTrade() {
        const dialog = document.getElementById('trade-dialog');
        if (!dialog) return;

        const btnConfirm = document.getElementById('btn-trade-confirm');
        const btnCancel = document.getElementById('btn-trade-cancel');

        btnConfirm.onclick = () => {
            Network.send(PacketTypes.C_TRADE_ACCEPT, {}); // On open trade, C_TRADE_ACCEPT = confirm
        };

        btnCancel.onclick = () => {
            Network.send(PacketTypes.C_TRADE_CANCEL, {});
        };

        // When inventory slot is clicked while trade is open, add to trade
        InventoryUI.onItemSecondaryAction = (itemId) => {
            if (dialog.style.display === 'flex') {
                Network.send(PacketTypes.C_TRADE_ADD, { itemId, count: 1 });
                return true; // handled
            }
            return false;
        };
    },

    openTrade(session) {
        document.getElementById('trade-dialog').style.display = 'flex';
        this.updateTrade(session);
        this.showNotification('Trade window open. Click items in inventory to offer.');
    },

    updateTrade(session) {
        const dialog = document.getElementById('trade-dialog');
        if (!dialog || dialog.style.display !== 'flex') return;

        const isA = session.playerA === LocalPlayer.name;
        const myOffer = isA ? session.offerA : session.offerB;
        const theirOffer = isA ? session.offerB : session.offerA;
        const myConfirmed = isA ? session.confirmedA : session.confirmedB;
        const theirConfirmed = isA ? session.confirmedB : session.confirmedA;

        const myContainer = document.getElementById('trade-my-offer');
        const theirContainer = document.getElementById('trade-their-offer');
        const btnConfirm = document.getElementById('btn-trade-confirm');

        myContainer.innerHTML = '';
        theirContainer.innerHTML = '';

        [
            { container: myContainer, items: myOffer, name: 'YOU' },
            { container: theirContainer, items: theirOffer, name: session.playerA === LocalPlayer.name ? session.playerB : session.playerA }
        ].forEach(side => {
            side.items.forEach(item => {
                const icon = SpriteManager.getItemSprite(item.itemId);
                const el = document.createElement('div');
                el.className = 'trade-item pixel-border';
                el.innerHTML = `
                    <img src="${icon.src}" width="24" height="24">
                    <span class="count">${item.count}</span>
                `;
                side.container.appendChild(el);
            });
        });

        // Update button status
        if (myConfirmed) {
            btnConfirm.textContent = 'CONFIRMED';
            btnConfirm.classList.add('confirmed');
        } else {
            btnConfirm.textContent = 'CONFIRM';
            btnConfirm.classList.remove('confirmed');
        }

        const statusText = document.getElementById('trade-status');
        if (theirConfirmed) {
            statusText.textContent = `${isA ? session.playerB : session.playerA} has confirmed!`;
            statusText.style.color = '#4caf50';
        } else {
            statusText.textContent = 'Waiting for items...';
            statusText.style.color = '#fff';
        }
    },

    closeTrade() {
        const dialog = document.getElementById('trade-dialog');
        if (dialog) dialog.style.display = 'none';
        InventoryUI.onItemSecondaryAction = null;
    },

    setupAuth() {
        const panels = {
            main: document.getElementById('auth-main-panel'),
            login: document.getElementById('auth-login-panel'),
            register: document.getElementById('auth-register-panel'),
            guest: document.getElementById('auth-guest-panel')
        };

        const showPanel = (name) => {
            Object.values(panels).forEach(p => p.style.display = 'none');
            panels[name].style.display = 'block';
        };

        // Navigation
        document.getElementById('btn-show-login').onclick = () => showPanel('login');
        document.getElementById('btn-show-register').onclick = () => showPanel('register');
        document.getElementById('btn-show-guest').onclick = () => showPanel('guest');

        document.querySelectorAll('.auth-back').forEach(btn => {
            btn.onclick = () => showPanel('main');
        });

        // Submits
        document.getElementById('btn-register-submit').onclick = async () => {
            const name = document.getElementById('register-name').value.trim();
            const username = document.getElementById('register-username').value.trim();
            const password = document.getElementById('register-password').value;
            if (!name || !username || !password) return this.showNotification('Enter name, username and password');

            this.showNotification('Creating account...');
            const { error } = await Network.register(username, password, name);
            if (error) return this.showNotification(error);

            this.showNotification('Account created! Logging in...');
            const loginRes = await Network.login(username, password);
            if (!loginRes.error) {
                sessionStorage.setItem('pendingWorld', 'START');
                Network.joinWorld('START');
            }
        };

        document.getElementById('btn-login-submit').onclick = async () => {
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const world = document.getElementById('login-world').value.trim() || 'START';
            if (!username || !password) return this.showNotification('Enter username and password');

            this.showNotification('Logging in...');
            const { error } = await Network.login(username, password);
            if (error) return this.showNotification(error);

            sessionStorage.setItem('pendingWorld', world);
            Network.joinWorld(world);
        };

        document.getElementById('btn-guest-submit').onclick = async () => {
            const name = document.getElementById('guest-name').value.trim();
            const world = document.getElementById('guest-world').value.trim() || 'START';

            // Guest login in Supabase can be Anonymous login
            const { data, error } = await supa.auth.signInAnonymously({
                options: { data: { username: name || 'Guest' } }
            });

            if (error) return this.showNotification(error);

            sessionStorage.setItem('pendingWorld', world);
            Network.joinWorld(world);
        };
    },

    openRecipes() {
        const dialog = document.getElementById('recipe-dialog');
        const list = document.getElementById('recipe-list');
        list.innerHTML = '';

        SPLICE_RECIPES.forEach(r => {
            const seedA = ITEMS[r.seeds[0]];
            const seedB = ITEMS[r.seeds[1]];
            const result = ITEMS[r.result];
            if (!seedA || !seedB || !result) return;

            const el = document.createElement('div');
            el.className = 'recipe-item';
            el.style.padding = '8px';
            el.style.borderBottom = '1px solid var(--border)';
            el.innerHTML = `${seedA.name} + ${seedB.name} ➔ <span style="color:var(--accent)">${result.name}</span>`;
            list.appendChild(el);
        });

        dialog.style.display = 'flex';
    },
};
