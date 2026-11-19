// Petits composants partagés : galet en DOM (même dessin que le plateau) et plateau PixiJS.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createBoardView, panBy, svgDataUrl, tileName, tileSvg } from '@six-de-chaque/renderer-pixi';
import type { BoardView } from '@six-de-chaque/renderer-pixi';
import type { Placement, Tile, TileId } from '@six-de-chaque/engine';

export function TileImage({ tile, highContrast, colourBlind }: { tile: Tile; highContrast: boolean; colourBlind: boolean }) {
    const src = useMemo(() => svgDataUrl(tileSvg(tile.color, tile.shape, { highContrast, colourBlind, px: 96 })), [tile.color, tile.shape, highContrast, colourBlind]);
    return <img className="tile-img" src={src} alt="" aria-hidden="true" draggable={false} />;
}
export const tileLabel = (t: Tile): string => tileName(t.color, t.shape);

export function ZoomControls({ onZoom }: { onZoom(factor: number): void }) {
    return (
        <div className="zoom" role="group" aria-label="Zoom du plateau">
            <button type="button" aria-label="Zoomer" onClick={() => { onZoom(1.2); }}>+</button>
            <button type="button" aria-label="Dézoomer" onClick={() => { onZoom(1 / 1.2); }}>−</button>
        </div>
    );
}

const PAN_STEP = 48;
const panKeys = new Map<string, readonly [number, number]>([
    ['ArrowLeft', [PAN_STEP, 0]], ['ArrowRight', [-PAN_STEP, 0]],
    ['ArrowUp', [0, PAN_STEP]], ['ArrowDown', [0, -PAN_STEP]]
]);

export interface BoardProps {
    keyboardCamera?: boolean;
    board: Readonly<Record<string, TileId>>; ghost: readonly Placement[]; cursor: { x: number; y: number } | null;
    tiles: Readonly<Record<TileId, Tile>>; highContrast: boolean; colourBlind: boolean; onTap?: (x: number, y: number) => void; zoom?: { n: number; factor: number }; label: string;
}
export function Board({ board, ghost, cursor, tiles, highContrast, colourBlind, onTap, zoom, label, keyboardCamera = false }: BoardProps) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<BoardView | null>(null);
    const [ready, setReady] = useState(false);
    const tap = useRef(onTap);
    tap.current = onTap;
    useEffect(() => {
        let alive = true;
        const el = host.current;
        if (!el) return undefined;
        void createBoardView(el, { highContrast, colourBlind }).then(v => {
            if (!alive) { v.destroy(); return; }
            view.current = v;
            v.onCellTap((x, y) => { tap.current?.(x, y); });
            setReady(true);
        });
        return () => { alive = false; view.current?.destroy(); view.current = null; setReady(false); };
        // La vue est créée une fois ; l’apparence est appliquée par l'effet suivant.
    }, []);
    useEffect(() => { if (ready) void view.current?.setAppearance({ highContrast, colourBlind }); }, [ready, highContrast, colourBlind]);
    useEffect(() => { if (ready) view.current?.render({ board }, ghost, cursor, tiles); }, [ready, board, ghost, cursor, tiles]);
    useEffect(() => { if (ready && zoom && zoom.n > 0) view.current?.zoomBy(zoom.factor); }, [ready, zoom]);
    return <div ref={host} className="board" role="img" aria-label={label} tabIndex={onTap || keyboardCamera ? 0 : undefined}
        onKeyDown={keyboardCamera ? event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const current = view.current;
            if (!current) return;
            const pan = panKeys.get(event.key);
            if (pan) current.setCamera(panBy(current.getCamera(), ...pan));
            else if (event.key === '+' || event.key === '=') current.zoomBy(1.2);
            else if (event.key === '-') current.zoomBy(1 / 1.2);
            else return;
            event.preventDefault();
        } : undefined} data-ready={ready ? 'oui' : 'non'} data-tiles={Object.keys(board).length} data-ghost={ghost.length}
        data-cursor={cursor ? `${cursor.x}:${cursor.y}` : ''} />;
}
