// PixelWorld - Main Entry Point and Game Loop
const Game = {
    state: 'login', // login, loading, playing
    mouseWorld: { x: 0, y: 0 },
    lastTime: 0,

    async init() {
        console.log('🌍 PixelWorld Initializing...');

        // Initialize Sprites and UI immediately
        SpriteManager.init();
        UI.init();
        InventoryUI.init();
        MiniMap.init();

        // Connect network (Supabase) in background
        this.initNetwork();

        // Setup Mouse Tracking

        // Setup Mouse Tracking
        const canvas = document.getElementById('game-canvas');
        Renderer.init(canvas);
        Camera.init(canvas);

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            this.mouseWorld = Camera.screenToWorld(sx, sy);
        });

        canvas.addEventListener('mousedown', (e) => {
            if (this.state !== 'playing') return;
            this.mouseDown = true;
            this.mouseButton = e.button;
            this.actionTimer = CONSTANTS.ACTION_COOLDOWN; // Trigger immediately on first click
        });

        canvas.addEventListener('mouseup', () => {
            this.mouseDown = false;
        });

        canvas.addEventListener('mouseleave', () => {
            this.mouseDown = false;
        });

        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Double-tap sprint tracking
        const tapTracker = { left: 0, right: 0 };
        const DOUBLE_TAP_MS = 300;

        // Keyboard Movement
        document.addEventListener('keydown', (e) => {
            if (UI.chatOpen) return;
            const key = e.key.toLowerCase();
            switch (key) {
                case 'a': case 'arrowleft':
                    if (!LocalPlayer.moveState.left) {
                        const now = Date.now();
                        if (now - tapTracker.left < DOUBLE_TAP_MS) {
                            LocalPlayer.sprinting = true;
                        }
                        tapTracker.left = now;
                    }
                    LocalPlayer.moveState.left = true;
                    break;
                case 'd': case 'arrowright':
                    if (!LocalPlayer.moveState.right) {
                        const now = Date.now();
                        if (now - tapTracker.right < DOUBLE_TAP_MS) {
                            LocalPlayer.sprinting = true;
                        }
                        tapTracker.right = now;
                    }
                    LocalPlayer.moveState.right = true;
                    break;
                case 'w': case 'arrowup': case ' ':
                    LocalPlayer.moveState.up = true;
                    break;
            }
        });

        document.addEventListener('keyup', (e) => {
            switch (e.key.toLowerCase()) {
                case 'a': case 'arrowleft':
                    LocalPlayer.moveState.left = false;
                    LocalPlayer.sprinting = false;
                    break;
                case 'd': case 'arrowright':
                    LocalPlayer.moveState.right = false;
                    LocalPlayer.sprinting = false;
                    break;
                case 'w': case 'arrowup': case ' ':
                    LocalPlayer.moveState.up = false;
                    break;
            }
        });

        // Network Handlers for Joining
        Network.on(PacketTypes.S_JOIN_OK, (data) => {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'block';
            this.state = 'playing';

            // Auto-join pending world (use C_ENTER_WORLD since player is already created during login/register/guest)
            const pendingWorld = sessionStorage.getItem('pendingWorld') || 'START';
            Network.send(PacketTypes.C_ENTER_WORLD, { world: pendingWorld });
        });

        Network.on(PacketTypes.S_WORLD_DATA, (data) => {
            ClientWorld.load(data.world);
            Network.lastSeq = data.world.seq || 0;
            LocalPlayer.init(data.player);
            OtherPlayers.players.clear();
            data.players.forEach(p => OtherPlayers.add(p));
            UI.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, LocalPlayer.gems);
            InventoryUI.render();
            Camera.setTarget(LocalPlayer);
        });

        Network.on(PacketTypes.S_LOGIN_FAIL, (data) => {
            console.log('[Auth] Login/Register failed:', data.msg);
            UI.showNotification(data.msg);
        });

        Network.on(PacketTypes.S_PLAYER_JOIN, (data) => {
            OtherPlayers.add(data.player);
            UI.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, LocalPlayer.gems);
            UI.addChatMessage('>> SYSTEM', `${data.player.name} joined the world`);
        });

        Network.on(PacketTypes.S_PLAYER_LEAVE, (data) => {
            OtherPlayers.remove(data.name);
            UI.updateHUD(ClientWorld.name, OtherPlayers.players.size + 1, LocalPlayer.gems);
        });

        Network.on(PacketTypes.S_PLAYER_MOVE, (data) => {
            OtherPlayers.updatePosition(data.name, data.x, data.y);
        });

        Network.on(PacketTypes.S_BLOCK_UPDATE, (data) => {
            if (data.seq !== undefined && data.seq <= Network.lastSeq) return;
            if (data.seq !== undefined) Network.lastSeq = data.seq;

            ClientWorld.updateTile(data.x, data.y, data);
            if (data.fg === 0 && data.breakHits === 0) {
                // Play break effect if it was destroyed
                const item = ITEMS[data.fg] || { color: '#fff' };
                Renderer.addBreakParticles(data.x, data.y, item.color);
                SoundManager.playBreak();
            }
        });

        Network.on(PacketTypes.S_SNAPSHOT, (data) => {
            if (data.seq !== undefined && data.seq <= Network.lastSeq) return;
            if (data.seq !== undefined) Network.lastSeq = data.seq;
            ClientWorld.processSnapshot(data);
        });

        Network.on(PacketTypes.S_INVENTORY_UPDATE, (data) => {
            const oldGems = LocalPlayer.gems;
            LocalPlayer.inventory = data.inventory;
            if (data.gems !== undefined && data.gems > oldGems) {
                SoundManager.playGemCollect();
            }
            if (data.gems !== undefined) LocalPlayer.gems = data.gems;
            InventoryUI.render();
        });

        Network.on(PacketTypes.S_LOCK_EFFECT, (data) => {
            Renderer.addLockEffect(data.x, data.y);
        });

        // Start loop
        requestAnimationFrame((t) => this.loop(t));
    },

    loop(time) {
        const dt = Math.min(0.1, (time - this.lastTime) / 1000);
        this.lastTime = time;

        if (this.state === 'playing') {
            this.handleContinuousAction(dt);
            LocalPlayer.update(dt);
            OtherPlayers.update(dt);
            Camera.update();
            Renderer.render();
        }

        requestAnimationFrame((t) => this.loop(t));
    },

    handleContinuousAction(dt) {
        if (!this.mouseDown) return;

        this.actionTimer += dt;
        if (this.actionTimer >= CONSTANTS.ACTION_COOLDOWN) {
            this.actionTimer = 0;

            const tx = Math.floor(this.mouseWorld.x / CONSTANTS.TILE_SIZE);
            const ty = Math.floor(this.mouseWorld.y / CONSTANTS.TILE_SIZE);
            const selectedItem = LocalPlayer.getSelectedItem();
            const isWrench = selectedItem && selectedItem.itemId === 25; // Wrench is ID 25, updated from previous 21 check

            if (this.mouseButton === 0) { // Left Click
                if (isWrench) {
                    Network.send(PacketTypes.C_WRENCH, { x: tx, y: ty });
                } else {
                    LocalPlayer.punch();
                    SoundManager.playHit();
                    Network.send(PacketTypes.C_HIT_BLOCK, { x: tx, y: ty });
                }
            } else if (this.mouseButton === 2) { // Right Click
                if (selectedItem && !isWrench) {
                    SoundManager.playPlace();
                    Network.send(PacketTypes.C_PLACE_BLOCK, { x: tx, y: ty, itemId: selectedItem.itemId });
                }
            }
        }
    },

    async initNetwork() {
        try {
            await Network.init();
            // Fetch initial world list or stats if possible
            // For now, we manually update the 'Loading worlds...' text
            const { data: worlds, error } = await supa.from('worlds').select('name').limit(5);
            if (!error && worlds) {
                UI.updateLoginWorldList(worlds);
            } else {
                UI.updateLoginWorldList([]);
            }
        } catch (e) {
            console.error('[Game] Network background init failed:', e);
            UI.updateLoginWorldList([]);
        }
    }
};

window.onload = () => Game.init();
