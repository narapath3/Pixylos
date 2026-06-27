// Inventory UI
const InventoryUI = {
    barEl: null,
    maxSlots: 9,

    init() {
        this.barEl = document.getElementById('inventory-bar');
        this.render();
    },

    render() {
        if (!this.barEl) return;
        this.barEl.innerHTML = '';

        for (let i = 0; i < this.maxSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot' + (i === LocalPlayer.selectedSlot ? ' selected' : '');
            slot.dataset.index = i;

            // Slot key number
            const keyLabel = document.createElement('span');
            keyLabel.className = 'slot-key';
            keyLabel.textContent = i + 1;
            slot.appendChild(keyLabel);

            if (i < LocalPlayer.inventory.length) {
                this.fillSlot(slot, LocalPlayer.inventory[i]);
            }

            slot.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                LocalPlayer.selectedSlot = idx;
                this.render();
            });

            this.barEl.appendChild(slot);
        }
    },

    fillSlot(slot, item) {
        const itemData = ITEMS[item.itemId];
        if (!itemData) return;

        const sprite = SpriteManager.getItemSprite(item.itemId);
        if (sprite) {
            const icon = document.createElement('canvas');
            icon.className = 'item-icon';
            icon.width = 28;
            icon.height = 28;
            const ctx = icon.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, 0, 0, 28, 28);
            slot.appendChild(icon);
        }

        const count = document.createElement('span');
        count.className = 'item-count';
        count.textContent = item.count;
        slot.appendChild(count);
        slot.title = `${itemData.name} x${item.count}`;
    },

    renderBackpack() {
        const grid = document.getElementById('backpack-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Up to 36 slots
        for (let i = 0; i < 36; i++) {
            const slot = document.createElement('div');
            slot.className = 'inv-slot backpack';
            slot.dataset.index = i;

            if (i < LocalPlayer.inventory.length) {
                this.fillSlot(slot, LocalPlayer.inventory[i]);

                // Clicking in backpack swaps with hotbar slot 0 for simplicity, 
                // or just highlights. Let's do swap with current selected slot.
                slot.addEventListener('click', () => {
                    UI.swapInventory(i, LocalPlayer.selectedSlot);
                });
            }

            grid.appendChild(slot);
        }
    },

    selectSlot(index) {
        if (index >= 0 && index < this.maxSlots) {
            LocalPlayer.selectedSlot = index;
            this.render();
        }
    }
};
