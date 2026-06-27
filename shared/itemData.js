// Item database - shared between client and server

const ITEMS = {
    0: { id: 0, name: 'Empty', type: 'empty', hardness: 0, rarity: 0, color: '#000000' },
    1: { id: 1, name: 'Dirt', type: 'block', hardness: 2, rarity: 1, color: '#8B4513', dropSeed: 2 },
    2: { id: 2, name: 'Dirt Seed', type: 'seed', hardness: 1, rarity: 1, color: '#8B4513', growthTime: 10, growsInto: 1, treeColor: '#5D4037' },
    3: { id: 3, name: 'Rock', type: 'block', hardness: 4, rarity: 2, color: '#808080', dropSeed: 4 },
    4: { id: 4, name: 'Rock Seed', type: 'seed', hardness: 1, rarity: 2, color: '#808080', growthTime: 20, growsInto: 3, treeColor: '#616161' },
    5: { id: 5, name: 'Lava', type: 'block', hardness: 6, rarity: 5, color: '#FF4500', dropSeed: 6 },
    6: { id: 6, name: 'Lava Seed', type: 'seed', hardness: 1, rarity: 5, color: '#FF4500', growthTime: 40, growsInto: 5, treeColor: '#D84315' },
    7: { id: 7, name: 'Grass', type: 'block', hardness: 2, rarity: 3, color: '#4CAF50', dropSeed: 8 },
    8: { id: 8, name: 'Grass Seed', type: 'seed', hardness: 1, rarity: 3, color: '#4CAF50', growthTime: 15, growsInto: 7, treeColor: '#2E7D32' },
    9: { id: 9, name: 'Wood Block', type: 'block', hardness: 3, rarity: 2, color: '#5D4037', dropSeed: 10 },
    10: { id: 10, name: 'Wood Seed', type: 'seed', hardness: 1, rarity: 2, color: '#5D4037', growthTime: 25, growsInto: 9, treeColor: '#795548' },
    11: { id: 11, name: 'Plank', type: 'platform', hardness: 2, rarity: 2, color: '#CD853F' },
    12: { id: 12, name: 'Cave Background', type: 'background', hardness: 1, rarity: 1, color: '#3E2723' },
    13: { id: 13, name: 'Sign', type: 'sign', hardness: 2, rarity: 3, color: '#FFD54F' },
    14: { id: 14, name: 'Door', type: 'door', hardness: 2, rarity: 3, color: '#795548' },
    15: { id: 15, name: 'Small Lock', type: 'lock', hardness: 10, rarity: 10, color: '#2196F3', lockRange: 2 },
    16: { id: 16, name: 'Big Lock', type: 'lock', hardness: 15, rarity: 25, color: '#9C27B0', lockRange: 10 },
    17: { id: 17, name: 'World Lock', type: 'lock', hardness: 20, rarity: 100, color: '#00BCD4', lockRange: 'world' },
    18: { id: 18, name: 'Bedrock', type: 'block', hardness: -1, rarity: 999, color: '#1a1a1a', unbreakable: true },
    19: { id: 19, name: 'Sand', type: 'block', hardness: 2, rarity: 1, color: '#F4D03F', dropSeed: 20 },
    20: { id: 20, name: 'Sand Seed', type: 'seed', hardness: 1, rarity: 1, color: '#F4D03F', growthTime: 15, growsInto: 19, treeColor: '#FDD835' },
    21: { id: 21, name: 'Crystal Block', type: 'block', hardness: 8, rarity: 10, color: '#E1BEE7', dropSeed: 22 },
    22: { id: 22, name: 'Crystal Seed', type: 'seed', hardness: 1, rarity: 10, color: '#E1BEE7', growthTime: 60, growsInto: 21, treeColor: '#BA68C8' },
    23: { id: 23, name: 'Fruit Block', type: 'block', hardness: 3, rarity: 4, color: '#EF5350', dropSeed: 24 },
    24: { id: 24, name: 'Fruit Seed', type: 'seed', hardness: 1, rarity: 4, color: '#EF5350', growthTime: 30, growsInto: 23, treeColor: '#E53935' },
    25: { id: 25, name: 'Wrench', type: 'tool', hardness: 0, rarity: 0, color: '#BDBDBD' },
};

// Splice recipes: [seedA, seedB] => resultItemId
const SPLICE_RECIPES = [
    { seeds: [8, 4], result: 10 },   // Grass + Rock = Wood
    { seeds: [10, 8], result: 14 },  // Wood + Grass -> Door (approximate using leafy grass)
    { seeds: [24, 4], result: 22 },  // Fruit + Rock = Crystal
    { seeds: [2, 4], result: 8 },    // Dirt + Rock = Grass
    { seeds: [4, 6], result: 20 },   // Rock + Lava = Sand
    { seeds: [10, 4], result: 11 },  // Wood + Rock = Plank
];

// Shop items (exactly 9 items buyable with gems)
const SHOP = [
    { itemId: 2, price: 5, name: 'Dirt Seed' },
    { itemId: 4, price: 10, name: 'Rock Seed' },
    { itemId: 6, price: 50, name: 'Lava Seed' },
    { itemId: 25, price: 10, name: 'Wrench' },
    { itemId: 15, price: 50, name: 'Small Lock' },
    { itemId: 16, price: 200, name: 'Big Lock' },
    { itemId: 17, price: 2000, name: 'World Lock' },
    { itemId: 13, price: 30, name: 'Sign' },
    { itemId: 14, price: 25, name: 'Door' },
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ITEMS, SPLICE_RECIPES, SHOP };
}
