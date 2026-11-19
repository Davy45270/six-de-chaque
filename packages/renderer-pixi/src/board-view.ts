// Vue PixiJS du plateau : galets posés, fantôme à 55 %, curseur clavier en contour épais. Glisser = déplacer,
// molette ou pincement = zoom, toucher = choisir une case. Aucune règle ici : la vue affiche ce qu'on lui donne.
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Placement, PublicGameState, Tile, TileId } from '@six-de-chaque/engine';
import { svgDataUrl, tileSvg } from './art';
import type { TileAppearance } from './art';
import { cellToScreen, fitBoard, panBy, screenToCell, zoomAt } from './camera';
import type { Camera } from './camera';
import { BOARD_BG, BOARD_BG_HIGH_CONTRAST, INK } from './palette';

export const CELL_PX = 64;
export interface BoardView {
    render(view: Pick<PublicGameState, 'board'>, ghost: readonly Placement[], cursor: { x: number; y: number } | null, tiles: Readonly<Record<TileId, Tile>>): void;
    onCellTap(cb: (x: number, y: number) => void): void;
    setCamera(c: Camera): void;
    getCamera(): Camera;
    zoomBy(factor: number): void;
    fit(): void;
    setAppearance(opts: TileAppearance): Promise<void>;
    destroy(): void;
    readonly canvas: HTMLCanvasElement;
}

async function loadTextures(opts: TileAppearance): Promise<Map<string, Texture>> {
    const out = new Map<string, Texture>();
    await Promise.all(Array.from({ length: 36 }, async (_, i) => {
        const color = Math.floor(i / 6), shape = i % 6;
        const img = new Image();
        img.src = svgDataUrl(tileSvg(color, shape, { ...opts, px: 128 }));
        await img.decode();
        out.set(`${color}:${shape}`, Texture.from(img));
    }));
    return out;
}

export async function createBoardView(host: HTMLElement, opts: TileAppearance): Promise<BoardView> {
    const app = new Application();
    await app.init({ background: opts.highContrast ? BOARD_BG_HIGH_CONTRAST : BOARD_BG, resizeTo: host, antialias: true, autoDensity: true, resolution: Math.min(globalThis.devicePixelRatio || 1, 2), preference: 'webgl' });
    host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    let textures = await loadTextures(opts);
    let appearance = opts;
    let textureRequest = 0;
    const grid = new Graphics();
    const layer = new Container();
    const overlay = new Graphics();
    app.stage.addChild(grid, layer, overlay);
    let camera: Camera = fitBoard({}, app.screen.width, app.screen.height, CELL_PX);
    let last: Parameters<BoardView['render']> | null = null;
    let tap: ((x: number, y: number) => void) | null = null;
    let fitted = false;

    const draw = (): void => {
        if (!last) return;
        const [view, ghost, cursor, tiles] = last;
        const s = CELL_PX * camera.zoom;
        const ink = appearance.highContrast ? '#000000' : INK;
        grid.clear();
        // Repère discret : un point par case visible.
        const c0 = screenToCell(camera, 0, 0, CELL_PX), c1 = screenToCell(camera, app.screen.width, app.screen.height, CELL_PX);
        if ((c1.x - c0.x) * (c1.y - c0.y) < 6000) {
            for (let x = c0.x; x <= c1.x; x++) for (let y = c0.y; y <= c1.y; y++) {
                const { px, py } = cellToScreen(camera, x + 0.5, y + 0.5, CELL_PX);
                grid.circle(px, py, Math.max(1, s * 0.03));
            }
            grid.fill({ color: ink, alpha: appearance.highContrast ? 1 : 0.18 });
        }
        layer.removeChildren().forEach(c => { c.destroy(); });
        const put = (id: TileId, x: number, y: number, alpha: number): void => {
            const t = tiles[id];
            const texture = t ? textures.get(`${t.color}:${t.shape}`) : undefined;
            if (!texture) return;
            const sprite = new Sprite(texture);
            const { px, py } = cellToScreen(camera, x, y, CELL_PX);
            sprite.position.set(px, py);
            sprite.width = s; sprite.height = s;
            sprite.alpha = alpha;
            layer.addChild(sprite);
        };
        for (const [key, id] of Object.entries(view.board)) { const [x, y] = key.split(':').map(Number) as [number, number]; put(id, x, y, 1); }
        for (const g of ghost) put(g.tileId, g.x, g.y, 0.55);
        overlay.clear();
        for (const g of ghost) {
            const { px, py } = cellToScreen(camera, g.x, g.y, CELL_PX);
            overlay.roundRect(px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.92, s * 0.28).stroke({ width: Math.max(2, s * 0.04), color: INK, alpha: 0.55 });
        }
        if (cursor) {
            const { px, py } = cellToScreen(camera, cursor.x, cursor.y, CELL_PX);
            overlay.roundRect(px + 1, py + 1, s - 2, s - 2, s * 0.3).stroke({ width: Math.max(3, s * 0.08), color: ink });
        }
    };
    const onResize = (): void => { if (!fitted && last) camera = fitBoard(last[0].board, app.screen.width, app.screen.height, CELL_PX, last[1]); draw(); };
    app.renderer.on('resize', onResize);

    // Gestes : un pointeur glisse, deux pointeurs pincent ; un toucher sans déplacement choisit une case.
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const local = (e: MouseEvent): { x: number; y: number } => { const r = app.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const canvas = app.canvas;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, local(e)); moved = 0; if (pointers.size === 2) pinch = 0; });
    canvas.addEventListener('pointermove', e => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const p = local(e);
        if (pointers.size === 1) {
            moved += Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
            if (moved > 8) { camera = panBy(camera, p.x - prev.x, p.y - prev.y); fitted = true; draw(); }
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
            const other = a === prev ? b : a;
            const d = Math.hypot(p.x - other.x, p.y - other.y);
            if (pinch > 0) { camera = zoomAt(camera, d / pinch, (p.x + other.x) / 2, (p.y + other.y) / 2); fitted = true; draw(); }
            pinch = d;
            moved = 100;
        }
        pointers.set(e.pointerId, p);
    });
    const up = (e: PointerEvent): void => {
        const p = pointers.get(e.pointerId);
        pointers.delete(e.pointerId);
        if (p && pointers.size === 0 && moved <= 8 && tap) { const c = screenToCell(camera, p.x, p.y, CELL_PX); tap(c.x, c.y); }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); });
    canvas.addEventListener('wheel', e => { e.preventDefault(); const p = local(e); camera = zoomAt(camera, e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y); fitted = true; draw(); }, { passive: false });

    return {
        render(...args) {
            const first = last === null;
            last = args;
            if (first || !fitted) camera = fitBoard(args[0].board, app.screen.width, app.screen.height, CELL_PX, args[1]);
            if (args[2]) {
                // Garder le curseur clavier visible.
                const { px, py } = cellToScreen(camera, args[2].x, args[2].y, CELL_PX);
                const s = CELL_PX * camera.zoom;
                if (px < 0 || py < 0 || px + s > app.screen.width || py + s > app.screen.height) camera = panBy(camera, app.screen.width / 2 - px - s / 2, app.screen.height / 2 - py - s / 2);
            }
            draw();
        },
        onCellTap(cb) { tap = cb; },
        setCamera(c) { camera = c; fitted = true; draw(); },
        getCamera() { return camera; },
        zoomBy(factor) { camera = zoomAt(camera, factor, app.screen.width / 2, app.screen.height / 2); fitted = true; draw(); },
        fit() { fitted = false; if (last) camera = fitBoard(last[0].board, app.screen.width, app.screen.height, CELL_PX, last[1]); draw(); },
        async setAppearance(nextAppearance) {
            const request = ++textureRequest;
            if (appearance.highContrast === nextAppearance.highContrast && appearance.colourBlind === nextAppearance.colourBlind) return;
            const next = await loadTextures(nextAppearance);
            if (request !== textureRequest) { next.forEach(t => { t.destroy(true); }); return; }
            const previous = textures;
            textures = next;
            appearance = nextAppearance;
            app.renderer.background.color = appearance.highContrast ? BOARD_BG_HIGH_CONTRAST : BOARD_BG;
            draw();
            previous.forEach(t => { t.destroy(true); });
        },
        destroy() {
            textureRequest++;
            app.renderer.off('resize', onResize);
            app.destroy(true, { children: true });
            textures.forEach(t => { t.destroy(true); });
        },
        get canvas() { return app.canvas; }
    };
}
