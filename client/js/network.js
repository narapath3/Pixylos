// Network - Supabase Realtime & Auth client
const Network = {
    channel: null,
    connected: false,
    handlers: {},
    lastSeq: 0,
    currentUser: null,
    currentWorld: null,

    async init() {
        // Check for existing session
        const { data: { session } } = await supa.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            this.connected = true;
        }

        // Listen for auth changes
        supa.auth.onAuthStateChange((event, session) => {
            if (session) {
                this.currentUser = session.user;
                this.connected = true;
            } else {
                this.currentUser = null;
                this.connected = false;
            }
        });
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
        this.connected = true;

        // Trigger S_JOIN_OK for compatibility
        if (this.handlers[PacketTypes.S_JOIN_OK]) {
            this.handlers[PacketTypes.S_JOIN_OK]({ name: data.user.user_metadata.username });
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

        // 1. Fetch world data from Postgres
        let { data: world, error } = await supa
            .from('worlds')
            .select('*')
            .eq('name', worldName)
            .single();

        if (error && error.code === 'PGRST116') {
            // World doesn't exist, create it (Simplified client-side generation for now)
            // In a production app, this should be done via an Edge Function
            const newWorld = {
                name: worldName,
                width: 100,
                height: 60,
                tiles: this.generateInitialWorldData(), // Helper to be defined or moved to shared
                owner_id: this.currentUser?.id
            };
            const { data: created, error: createErr } = await supa
                .from('worlds')
                .insert([newWorld])
                .select()
                .single();

            if (createErr) return console.error('Failed to create world:', createErr);
            world = created;
        } else if (error) {
            return console.error('Error fetching world:', error);
        }

        this.currentWorld = world;

        // 2. Setup Realtime Channel
        if (this.channel) this.channel.unsubscribe();

        this.channel = supa.channel(`world:${worldName}`, {
            config: {
                presence: {
                    key: this.currentUser?.user_metadata?.username || 'Guest',
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
                        if (p.name !== this.currentUser?.user_metadata?.username) {
                            this.handlers[PacketTypes.S_PLAYER_JOIN]({ player: p });
                        }
                    });
                }
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                if (this.handlers[PacketTypes.S_PLAYER_LEAVE]) {
                    leftPresences.forEach(p => {
                        this.handlers[PacketTypes.S_PLAYER_LEAVE]({ name: p.name });
                    });
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    // Initial presence state
                    await this.channel.track({
                        name: this.currentUser?.user_metadata?.username || 'Guest',
                        x: 50 * 32, // Default spawn
                        y: 30 * 32
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
                                name: this.currentUser?.user_metadata?.username || 'Guest',
                                gems: 100, // Fetch from profile in real implementation
                                inventory: []
                            },
                            players: [] // Will be populated by presence sync
                        });
                    }
                }
            });
    },

    updatePresence(state) {
        // Map presence state to S_PLAYER_MOVE for all players
        for (const key in state) {
            const p = state[key][0];
            if (p.name !== this.currentUser?.user_metadata?.username) {
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
        const width = 100;
        const height = 60;
        const SURFACE_BASE = 24;
        const tiles = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let fg = 0, bg = 0;
                const h1 = Math.sin(x * 0.1) * 4;
                const surfaceHeight = Math.floor(SURFACE_BASE + h1);

                if (y === height - 1) fg = 18; // Bedrock
                else if (y > surfaceHeight) {
                    fg = 1; // Dirt
                    bg = 12; // Cave
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
