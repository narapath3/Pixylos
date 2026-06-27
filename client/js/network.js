// Network - Supabase Realtime & Auth client
const Network = {
    channel: null,
    connected: false,
    handlers: {},
    lastSeq: 0,
    currentUser: null,
    currentWorld: null,
    profile: null,

    async init() {
        if (typeof supa === 'undefined') {
            console.warn('[Network] Supabase client (supa) is not defined. Check supabase.js');
            return;
        }

        try {
            // Check for existing session
            const { data: { session } } = await supa.auth.getSession();
            if (session) {
                this.currentUser = session.user;
                await this.fetchProfile();
                this.connected = true;
            }
        } catch (e) {
            console.error('[Network] Failed to get session:', e);
        }

        // Listen for auth changes
        supa.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                this.currentUser = session.user;
                await this.fetchProfile();
                this.connected = true;
            } else {
                this.currentUser = null;
                this.profile = null;
                this.connected = false;
                this.knownPlayers.clear();
            }
        });
    },

    async fetchProfile() {
        if (!this.currentUser) return;
        let { data, error } = await supa
            .from('profiles')
            .select('*')
            .eq('id', this.currentUser.id)
            .single();

        if (error && error.code === 'PGRST116') {
            // Profile missing, create it
            console.log('[Network] Profile missing, creating default...');
            const newProfile = {
                id: this.currentUser.id,
                username: this.currentUser.user_metadata?.username || 'Player',
                gems: 100,
                inventory: []
            };
            const { data: created, error: createErr } = await supa
                .from('profiles')
                .insert([newProfile])
                .select()
                .single();

            if (createErr) {
                console.error('[Network] Error creating profile:', createErr);
                return;
            }
            data = created;
        } else if (error) {
            console.error('[Network] Error fetching profile:', error);
            return;
        }
        this.profile = data;
    },

    async saveProfile() {
        if (!this.currentUser || !this.profile) return;
        const { error } = await supa
            .from('profiles')
            .update({
                gems: this.profile.gems,
                inventory: this.profile.inventory,
                updated_at: new Date().toISOString()
            })
            .eq('id', this.currentUser.id);

        if (error) console.error('[Network] Error saving profile:', error);
    },

    async login(username, password) {
        // Note: Supabase Auth uses email, so we might need to map username to email
        // Or use anonymous login / custom auth if needed.
        // For this migration, we'll assume the user uses email as login.
        const { data, error } = await supa.auth.signInWithPassword({
            email: username.includes('@') ? username : `${username}@pixelworld.com`,
            password: password
        });

        if (error) return { error: error.message };
        this.currentUser = data.user;
        await this.fetchProfile();
        this.connected = true;

        // Trigger S_JOIN_OK for compatibility
        if (this.handlers[PacketTypes.S_JOIN_OK]) {
            this.handlers[PacketTypes.S_JOIN_OK]({ name: this.profile?.username || data.user.user_metadata.username });
        }

        return { data };
    },

    async register(username, password, displayName) {
        const { data, error } = await supa.auth.signUp({
            email: `${username}@pixelworld.com`,
            password: password,
            options: {
                data: {
                    username: displayName || username
                }
            }
        });

        if (error) return { error: error.message };
        return { data };
    },

    async joinWorld(worldName) {
        worldName = worldName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!worldName) worldName = 'START';

        // 0. Ensure profile exists
        if (!this.profile && this.currentUser) {
            await this.fetchProfile();
        }

        // 1. Fetch world data from Postgres
        let { data: world, error } = await supa
            .from('worlds')
            .select('*')
            .eq('name', worldName)
            .single();

        if (error && error.code === 'PGRST116') {
            // World doesn't exist, create it
            console.log(`[Network] World "${worldName}" not found, creating...`);
            const newWorld = {
                name: worldName,
                width: 100,
                height: 60,
                tiles: this.generateInitialWorldData(),
                owner_id: this.currentUser?.id || null
            };
            const { data: created, error: createErr } = await supa
                .from('worlds')
                .insert([newWorld])
                .select()
                .single();

            if (createErr) {
                console.error('Failed to create world:', createErr);
                if (window.UI) UI.showNotification('❌ Failed to create world: ' + createErr.message);
                return;
            }
            world = created;
        } else if (error) {
            console.error('Error fetching world:', error);
            if (window.UI) UI.showNotification('❌ Error loading world: ' + error.message);
            return;
        }

        this.currentWorld = world;
        this.knownPlayers.clear();

        // 2. Setup Realtime Channel
        if (this.channel) this.channel.unsubscribe();

        this.channel = supa.channel(`world:${worldName}`, {
            config: {
                presence: {
                    key: this.currentUser?.id || 'guest-' + Math.random().toString(36).substring(7),
                },
            },
        });

        // Handle Broadcasts (Chat, Block Updates)
        this.channel
            .on('broadcast', { event: 'packet' }, ({ payload }) => {
                const handler = this.handlers[payload.type];
                if (handler) handler(payload);
            })
            // Handle Presence (Player Joins/Leaves/Moves)
            .on('presence', { event: 'sync' }, () => {
                const state = this.channel.presenceState();
                this.updatePresence(state);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('Join:', key, newPresences);
                if (this.handlers[PacketTypes.S_PLAYER_JOIN]) {
                    newPresences.forEach(p => {
                        if (key !== this.currentUser?.id) {
                            this.handlers[PacketTypes.S_PLAYER_JOIN]({ player: p });
                        }
                    });
                }
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                if (this.handlers[PacketTypes.S_PLAYER_LEAVE]) {
                    leftPresences.forEach(p => {
                        this.knownPlayers.delete(p.name);
                        this.handlers[PacketTypes.S_PLAYER_LEAVE]({ name: p.name });
                    });
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    const spawnX = 50 * CONSTANTS.TILE_SIZE;
                    const spawnY = (CONSTANTS.SURFACE_LEVEL - 3) * CONSTANTS.TILE_SIZE;

                    // Initial presence state
                    await this.channel.track({
                        name: this.currentUser?.user_metadata?.username || 'Guest',
                        id: this.currentUser?.id,
                        x: spawnX,
                        y: spawnY
                    });

                    // Trigger S_WORLD_DATA for compatibility
                    if (this.handlers[PacketTypes.S_WORLD_DATA]) {
                        this.handlers[PacketTypes.S_WORLD_DATA]({
                            world: {
                                name: world.name,
                                width: world.width,
                                height: world.height,
                                tiles: world.tiles
                            },
                            player: {
                                name: this.profile?.username || this.currentUser?.user_metadata?.username || 'Guest',
                                x: spawnX,
                                y: spawnY,
                                gems: this.profile?.gems || 100,
                                inventory: this.profile?.inventory || []
                            },
                            players: [] // Will be populated by presence sync
                        });
                    }
                }
            });
    },

    knownPlayers: new Set(),

    updatePresence(state) {
        // Map presence state to S_PLAYER_MOVE for all players
        for (const key in state) {
            const p = state[key][0];
            if (key !== this.currentUser?.id) {
                // If this is a new player we haven't seen in this session, trigger JOIN
                if (!this.knownPlayers.has(p.name)) {
                    this.knownPlayers.add(p.name);
                    if (this.handlers[PacketTypes.S_PLAYER_JOIN]) {
                        this.handlers[PacketTypes.S_PLAYER_JOIN]({ player: p });
                    }
                }

                if (this.handlers[PacketTypes.S_PLAYER_MOVE]) {
                    this.handlers[PacketTypes.S_PLAYER_MOVE]({
                        name: p.name,
                        x: p.x,
                        y: p.y
                    });
                }
            }
        }
    },

    send(type, data = {}) {
        if (!this.channel) return;

        // Map movement to Presence instead of Broadcast for efficiency
        if (type === PacketTypes.C_MOVE) {
            this.channel.track({
                name: this.currentUser?.user_metadata?.username || 'Guest',
                x: data.x,
                y: data.y
            });
            return;
        }

        // Send as Packet broadcast
        this.channel.send({
            type: 'broadcast',
            event: 'packet',
            payload: { type, ...data }
        });

        // Special handling for block interactions (persist to DB)
        if (type === PacketTypes.C_HIT_BLOCK || type === PacketTypes.C_PLACE_BLOCK) {
            this.persistBlockChange(data);
        }
    },

    async persistBlockChange(data) {
        if (!this.currentWorld) return;

        // Update local tile state
        // We assume tiles is a 1D array from deserialized world
        const idx = data.y * this.currentWorld.width + data.x;
        if (this.currentWorld.tiles[idx]) {
            if (data.fg !== undefined) this.currentWorld.tiles[idx].fg = data.fg;
            if (data.bg !== undefined) this.currentWorld.tiles[idx].bg = data.bg;
            if (data.extra !== undefined) this.currentWorld.tiles[idx].extra = data.extra;
            if (data.breakHits !== undefined) this.currentWorld.tiles[idx].breakHits = data.breakHits;
        }

        // Debounce database update (500ms)
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            const { error } = await supa
                .from('worlds')
                .update({ tiles: this.currentWorld.tiles })
                .eq('id', this.currentWorld.id);
            if (error) console.error('Failed to persist world:', error);
        }, 500);
    },

    on(type, handler) {
        this.handlers[type] = handler;
    },

    isConnected() {
        return this.connected;
    },

    generateInitialWorldData() {
        const width = CONSTANTS.WORLD_WIDTH;
        const height = CONSTANTS.WORLD_HEIGHT;
        const SURFACE_BASE = CONSTANTS.SURFACE_LEVEL;
        const tiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let fg = 0, bg = 0;
                const h1 = Math.sin(x * 0.1) * 4;
                const h2 = Math.sin(x * 0.05) * 2;
                const surfaceHeight = Math.floor(SURFACE_BASE + h1 + h2);

                if (y === height - 1) fg = 18; // Bedrock
                else if (y >= height - 3) fg = 5; // Lava
                else if (y > surfaceHeight) {
                    fg = 1; // Dirt
                    bg = 12; // Cave
                    if (y > surfaceHeight + 10 && Math.random() < 0.15) fg = 3; // Rock
                } else if (y === surfaceHeight) {
                    fg = 7; // Grass
                }

                tiles.push({ fg, bg, breakHits: 0, extra: {} });
            }
        }

        // Place main door
        const doorIdx = (SURFACE_BASE - 1) * width + 50;
        tiles[doorIdx] = { fg: 14, bg: 0, breakHits: 0, extra: { label: 'EXIT', target: 'START' } };

        return tiles;
    }
};
