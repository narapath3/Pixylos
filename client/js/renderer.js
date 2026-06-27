// Renderer - Canvas 2D rendering engine
const Renderer = {
    canvas: null,
    ctx: null,
    particles: [], // Combined particle system
    lockEffects: [],
    skyGradient: null,

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        Camera.resize(this.canvas);

        // Regenerate sky gradient
        this.skyGradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        this.skyGradient.addColorStop(0, '#0a0a2e');
        this.skyGradient.addColorStop(0.3, '#1a1a4e');
        this.skyGradient.addColorStop(0.6, '#2a1a3e');
        this.skyGradient.addColorStop(1, '#0a0a1e');
    },

    render() {
        if (!this.ctx || !this.canvas) return;

        try {
            const ctx = this.ctx;
            const ts = CONSTANTS.TILE_SIZE;

            // Clear + sky
            ctx.fillStyle = this.skyGradient || '#0a0a2e';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw stars
            this.drawStars(ctx);

            if (!ClientWorld.tiles.length) return;

            const visible = Camera.getVisibleTiles();

            // Draw backgrounds
            for (let y = visible.startY; y <= visible.endY; y++) {
                for (let x = visible.startX; x <= visible.endX; x++) {
                    const tile = ClientWorld.getTile(x, y);
                    if (!tile || tile.bg === 0) continue;

                    const screen = Camera.worldToScreen(x * ts, y * ts);
                    const sprite = SpriteManager.getItemSprite(tile.bg);
                    if (sprite) {
                        ctx.globalAlpha = 0.6;
                        ctx.drawImage(sprite, screen.x, screen.y, ts, ts);
                        ctx.globalAlpha = 1;
                    }
                }
            }

            // Draw foreground blocks
            for (let y = visible.startY; y <= visible.endY; y++) {
                for (let x = visible.startX; x <= visible.endX; x++) {
                    const tile = ClientWorld.getTile(x, y);
                    if (!tile || tile.fg === 0) continue;

                    const screen = Camera.worldToScreen(x * ts, y * ts);
                    const item = ITEMS[tile.fg];

                    // Draw tree if it's a seed with plantedAt
                    if (item && item.type === 'seed' && tile.extra && tile.extra.plantedAt) {
                        const elapsed = Date.now() - tile.extra.plantedAt;
                        const growthTime = tile.extra.growthTime || 30000;
                        const progress = Math.min(1, elapsed / growthTime);

                        // Stages: 0 (Sprout), 1 (Small), 2 (Large), 3 (Ripe)
                        let stage = 0;
                        if (progress >= 0.33) stage = 1;
                        if (progress >= 0.66) stage = 2;
                        if (progress >= 1.0) stage = 3;

                        this.drawTree(ctx, screen.x, screen.y, item, stage, progress);
                        continue;
                    }

                    // Normal block
                    const sprite = SpriteManager.getItemSprite(tile.fg);
                    if (sprite) {
                        ctx.drawImage(sprite, screen.x, screen.y, ts, ts);
                    }

                    // Break progress overlay
                    if (tile.breakHits > 0 && item) {
                        const progress = tile.breakHits / item.hardness;
                        this.drawBreakOverlay(ctx, screen.x, screen.y, ts, progress);
                    }
                }
            }

            // Draw lock zones (subtle overlay)
            this.drawLockZones(ctx);

            // Draw other players
            for (const [, p] of OtherPlayers.players) {
                const screen = Camera.worldToScreen(p.x, p.y);
                if (p.sprite) {
                    ctx.save();
                    if (!p.facingRight) {
                        ctx.translate(screen.x + CONSTANTS.PLAYER_WIDTH, screen.y);
                        ctx.scale(-1, 1);
                        ctx.drawImage(p.sprite, 0, 0);
                    } else {
                        ctx.drawImage(p.sprite, screen.x, screen.y);
                    }
                    ctx.restore();

                    // Name tag
                    ctx.font = '10px "Press Start 2P"';
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#000';
                    ctx.fillText(p.name, screen.x + CONSTANTS.PLAYER_WIDTH / 2 + 1, screen.y - 6);
                    ctx.fillStyle = '#fff';
                    ctx.fillText(p.name, screen.x + CONSTANTS.PLAYER_WIDTH / 2, screen.y - 7);
                }
            }

            // Draw local player
            {
                const ps = Camera.worldToScreen(LocalPlayer.x, LocalPlayer.y);
                if (LocalPlayer.sprite) {
                    ctx.save();
                    if (!LocalPlayer.facingRight) {
                        ctx.translate(ps.x + CONSTANTS.PLAYER_WIDTH, ps.y);
                        ctx.scale(-1, 1);
                        ctx.drawImage(LocalPlayer.sprite, 0, 0);
                    } else {
                        ctx.drawImage(LocalPlayer.sprite, ps.x, ps.y);
                    }
                    ctx.restore();
                }

                // Lift Fist Animation
                if (LocalPlayer.punchTimer > 0) {
                    ctx.fillStyle = '#FFE0B2';
                    const fDir = LocalPlayer.facingRight ? 1 : -1;
                    const fistX = ps.x + CONSTANTS.PLAYER_WIDTH / 2 + fDir * 12;
                    const fistY = ps.y + 12 - Math.sin(LocalPlayer.punchTimer * 20) * 5;
                    ctx.fillRect(fistX, fistY, 8, 8);
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(fistX, fistY, 8, 8);
                }
            }

            // Clouds (Parallax)
            this.drawClouds(ctx);

            // Player name
            const ps = Camera.worldToScreen(LocalPlayer.x, LocalPlayer.y);
            ctx.font = '10px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000';
            ctx.fillText(LocalPlayer.name, ps.x + CONSTANTS.PLAYER_WIDTH / 2 + 1, ps.y - 6);
            ctx.fillStyle = '#00e5ff';
            ctx.fillText(LocalPlayer.name, ps.x + CONSTANTS.PLAYER_WIDTH / 2, ps.y - 7);

            // Particles (Break & Gems)
            this.drawParticles(ctx);

            // Lock effects
            this.updateLockEffects(ctx);

            // Cursor highlight
            this.drawCursorHighlight(ctx);

            // Draw Mini Map
            if (typeof MiniMap !== 'undefined') MiniMap.render();
        } catch (e) {
            console.error('[Renderer] Render Loop Error:', e);
        }
    },

    drawStars(ctx) {
        const time = Date.now() * 0.001;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 50; i++) {
            const sx = ((i * 137 + 50) % this.canvas.width);
            const sy = ((i * 97 + 30) % (this.canvas.height * 0.4));
            const brightness = (Math.sin(time + i) + 1) * 0.3 + 0.2;
            ctx.globalAlpha = brightness;
            ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
    },

    drawTree(ctx, x, y, seedItem, stage, progress) {
        ctx.save();

        // Scale based on stage
        const scale = 0.4 + stage * 0.2; // 0.4, 0.6, 0.8, 1.0
        ctx.translate(x + 16, y + 32);
        ctx.scale(scale, scale);
        SpriteManager.drawTree(ctx, -16, -32, seedItem, progress);

        // Add sparkles if ripe (Stage 3)
        if (stage === 3) {
            const time = Date.now() * 0.005;
            for (let i = 0; i < 3; i++) {
                const ox = Math.cos(time + i * 2) * 10;
                const oy = Math.sin(time + i * 2) * 10 - 15;
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = (Math.sin(time * 2 + i) + 1) * 0.5;
                ctx.fillRect(ox, oy, 2, 2);
            }
        }

        ctx.restore();

        // Draw seed base with opacity for stage 0
        if (stage === 0) {
            const sprite = SpriteManager.getItemSprite(seedItem.id);
            if (sprite) {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(sprite, x, y, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);
                ctx.globalAlpha = 1;
            }
        }
    },

    drawBreakOverlay(ctx, x, y, size, progress) {
        ctx.fillStyle = `rgba(0,0,0,${progress * 0.5})`;
        ctx.fillRect(x, y, size, size);

        // Crack lines
        ctx.strokeStyle = `rgba(40,40,40,${progress})`;
        ctx.lineWidth = 2;
        const cracks = Math.floor(progress * 4) + 1;
        for (let i = 0; i < cracks; i++) {
            ctx.beginPath();
            ctx.moveTo(x + size / 2 + Math.cos(i * 2) * 5, y + size / 2 + Math.sin(i * 2) * 5);
            ctx.lineTo(x + Math.cos(i * 1.5) * size * 0.4 + size / 2, y + Math.sin(i * 1.5) * size * 0.4 + size / 2);
            ctx.stroke();
        }
    },

    drawLockZones(ctx) {
        const time = Date.now() * 0.005;
        for (const lock of ClientWorld.locks) {
            const screen = Camera.worldToScreen(lock.x * CONSTANTS.TILE_SIZE, lock.y * CONSTANTS.TILE_SIZE);
            const range = lock.range === 'world' ? 1000 : lock.range * CONSTANTS.TILE_SIZE;

            // Gold sparkling border
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -time * 10;
            ctx.lineWidth = 2;

            if (lock.range !== 'world') {
                const rectSize = (lock.range * 2 + 1) * CONSTANTS.TILE_SIZE;
                const rectX = screen.x - lock.range * CONSTANTS.TILE_SIZE;
                const rectY = screen.y - lock.range * CONSTANTS.TILE_SIZE;
                ctx.strokeRect(rectX, rectY, rectSize, rectSize);

                // Sparkle particles
                if (Math.random() < 0.1) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(rectX + Math.random() * rectSize, rectY + Math.random() * rectSize, 2, 2);
                }
            }
            ctx.setLineDash([]);
        }
    },

    drawClouds(ctx) {
        const time = Date.now() * 0.00005;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 5; i++) {
            const cx = ((i * 400 + time * (100 + i * 50)) % (this.canvas.width + 200)) - 100;
            const cy = 40 + i * 30;
            this.drawCloudShape(ctx, cx, cy);
        }
    },

    drawCloudShape(ctx, x, y) {
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.arc(x + 25, y - 10, 25, 0, Math.PI * 2);
        ctx.arc(x + 50, y, 20, 0, Math.PI * 2);
        ctx.fill();
    },

    drawCursorHighlight(ctx) {
        if (!Game.mouseWorld) return;
        const tx = Math.floor(Game.mouseWorld.x / CONSTANTS.TILE_SIZE);
        const ty = Math.floor(Game.mouseWorld.y / CONSTANTS.TILE_SIZE);
        const screen = Camera.worldToScreen(tx * CONSTANTS.TILE_SIZE, ty * CONSTANTS.TILE_SIZE);

        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(screen.x, screen.y, CONSTANTS.TILE_SIZE, CONSTANTS.TILE_SIZE);
        ctx.setLineDash([]);
    },

    addBreakParticles(x, y, color) {
        const ps = Camera.worldToScreen(x * CONSTANTS.TILE_SIZE + 16, y * CONSTANTS.TILE_SIZE + 16);
        for (let i = 0; i < 8; i++) {
            this.particles.push({
                x: ps.x,
                y: ps.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.8) * 6,
                startTime: Date.now(),
                life: 600 + Math.random() * 400,
                color: color,
                size: Math.random() * 4 + 2
            });
        }
    },

    drawParticles(ctx) {
        const now = Date.now();
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const age = now - p.startTime;
            if (age > (p.life || 600)) {
                this.particles.splice(i, 1);
                continue;
            }

            const progress = age / (p.life || 600);

            // Gem specific floating logic
            if (p.type === 'gem') {
                p.y -= 1.5; // Float up
                p.x += Math.sin(age * 0.01) * 0.5; // Wobble
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3 * (1 - progress), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Normal particle
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2;
                ctx.fillStyle = p.color;
                ctx.globalAlpha = 1 - progress;
                ctx.fillRect(p.x, p.y, p.size, p.size);
                ctx.globalAlpha = 1;
            }
        }
    },

    spawnGemEffect(worldX, worldY) {
        const ps = Camera.worldToScreen(worldX, worldY);
        for (let i = 0; i < 3; i++) {
            this.particles.push({
                x: ps.x + Math.random() * 20 - 10,
                y: ps.y + Math.random() * 20 - 10,
                type: 'gem',
                startTime: Date.now(),
                life: 1000 + Math.random() * 500
            });
        }
    },

    addLockEffect(x, y) {
        this.lockEffects.push({
            x: x * CONSTANTS.TILE_SIZE + CONSTANTS.TILE_SIZE / 2,
            y: y * CONSTANTS.TILE_SIZE + CONSTANTS.TILE_SIZE / 2,
            radius: 5,
            life: 1
        });
    },

    updateLockEffects(ctx) {
        for (let i = this.lockEffects.length - 1; i >= 0; i--) {
            const e = this.lockEffects[i];
            e.radius += 2;
            e.life -= 0.04;

            if (e.life <= 0) {
                this.lockEffects.splice(i, 1);
                continue;
            }

            const screen = Camera.worldToScreen(e.x, e.y);
            ctx.strokeStyle = `rgba(255,68,102,${e.life})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, e.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
};
