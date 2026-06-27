// Shared constants used by both client and server

const CONSTANTS = {
    // World dimensions
    WORLD_WIDTH: 120,
    WORLD_HEIGHT: 65,

    // Tile size in pixels
    TILE_SIZE: 32,

    // Physics
    GRAVITY: 0.6,
    JUMP_FORCE: -10,
    MOVE_SPEED: 4,
    MAX_FALL_SPEED: 12,
    FRICTION: 0.85,

    // Player
    PLAYER_WIDTH: 22,
    PLAYER_HEIGHT: 30,
    MAX_REACH: 5, // tiles

    // Items
    ITEM_TYPES: {
        BLOCK: 'block',
        BACKGROUND: 'background',
        SEED: 'seed',
        LOCK: 'lock',
        DOOR: 'door',
        SIGN: 'sign',
        PLATFORM: 'platform',
        CONSUMABLE: 'consumable'
    },

    // Lock ranges (in tiles radius)
    LOCK_RANGES: {
        SMALL_LOCK: 2, // 5x5 coverage (radius 2)
        BIG_LOCK: 48,
        WORLD_LOCK: 'world'
    },

    // Network
    TICK_RATE: 20, // server ticks per second
    POSITION_SYNC_RATE: 10, // position updates per second

    // Gems
    GEMS_PER_BREAK: { min: 1, max: 5 },

    // Growth
    MIN_GROWTH_TIME: 30, // seconds (for prototype, real game would be minutes/hours)
    MAX_GROWTH_TIME: 120,

    // World generation
    SURFACE_LEVEL: 24, // Y level where ground starts
    ROCK_LEVEL: 35,
    LAVA_LEVEL: 55,

    // Anti-cheat
    MAX_SPEED_TOLERANCE: 1.5, // multiplier on max speed
    MAX_HITS_PER_SECOND: 8,
    ACTION_COOLDOWN: 0.18, // Time between continuous hits/placements (seconds)
};

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONSTANTS;
}
