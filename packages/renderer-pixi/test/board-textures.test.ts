// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { svgDataUrl, tileSvg } from '../src/art';
import { createBoardView } from '../src/board-view';

// Chaque texture garde l'adresse de l'image dont elle vient ; chaque galet posé garde sa texture.
const pixi = vi.hoisted(() => ({ sprites: [] as Array<{ texture: { src: string } }> }));

vi.mock('pixi.js', () => ({
    Application: class {
        canvas = document.createElement('canvas');
        screen = { width: 320, height: 240 };
        renderer = { background: { color: '' }, on: vi.fn(), off: vi.fn() };
        stage = { addChild: vi.fn() };
        init() {}
        destroy() {}
    },
    Container: class {
        addChild(sprite: { texture: { src: string } }) { pixi.sprites.push(sprite); }
        removeChildren() { return []; }
    },
    Graphics: class {
        clear() {}
        circle() {}
        fill() {}
        roundRect() { return this; }
        stroke() {}
    },
    Sprite: class {
        position = { set: vi.fn() };
        constructor(public texture: { src: string }) {}
    },
    Texture: { from: (img: HTMLImageElement) => ({ src: img.src, destroy: vi.fn() }) }
}));

afterEach(() => { vi.restoreAllMocks(); pixi.sprites.length = 0; });

it('every placed tile on the board uses the texture of its own colour and shape', async () => {
    vi.spyOn(Image.prototype, 'decode').mockResolvedValue(undefined);
    const view = await createBoardView(document.createElement('div'), {});
    try {
        // Six couleurs × six formes, chaque galet sur sa propre case ; aucune forme ne partage la couleur d'une autre case par hasard.
        const tiles = Object.fromEntries(Array.from({ length: 36 }, (_, i) => {
            const id = `t${i}`;
            return [id, { id, color: Math.floor(i / 6), shape: (i + Math.floor(i / 6)) % 6 }];
        }));
        const board = Object.fromEntries(Object.keys(tiles).map((id, i) => [`${i % 6}:${Math.floor(i / 6)}`, id]));
        pixi.sprites.length = 0;
        view.render({ board }, [], null, tiles);
        expect(pixi.sprites).toHaveLength(36);
        const expected = Object.values(board).map(id => {
            const t = tiles[id]!;
            return svgDataUrl(tileSvg(t.color, t.shape, { px: 128 }));
        });
        expect(new Set(expected).size).toBe(36);
        expect(pixi.sprites.map(s => s.texture.src)).toEqual(expected);
    } finally {
        view.destroy();
    }
});
