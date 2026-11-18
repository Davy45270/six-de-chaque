// Petits composants partagés : galet en DOM (même dessin que le plateau) et plateau PixiJS.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createBoardView, svgDataUrl, tileName, tileSvg } from '@six-de-chaque/renderer-pixi';
import type { BoardView } from '@six-de-chaque/renderer-pixi';
import type { Placement, Tile, TileId } from '@six-de-chaque/engine';

export function TileImage({ tile, highContrast }: { tile: Tile; highContrast: boolean }) {
    const src = useMemo(() => svgDataUrl(tileSvg(tile.color, tile.shape, { highContrast, px: 96 })), [tile.color, tile.shape, highContrast]);
    return <img className="tile-img" src={src} alt="" aria-hidden="true" draggable={false} />;
}
export const tileLabel = (t: Tile): string => tileName(t.color, t.shape);

export interface BoardProps {
    board: Readonly<Record<string, TileId>>; ghost: readonly Placement[]; cursor: { x: number; y: number } | null;
    tiles: Readonly<Record<TileId, Tile>>; highContrast: boolean; onTap?: (x: number, y: number) => void; zoom?: { n: number; factor: number }; label: string;
}
export function Board({ board, ghost, cursor, tiles, highContrast, onTap, zoom, label }: BoardProps) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<BoardView | null>(null);
    const [ready, setReady] = useState(false);
    const tap = useRef(onTap);
    tap.current = onTap;
    useEffect(() => {
        let alive = true;
        const el = host.current;
        if (!el) return undefined;
        void createBoardView(el, { highContrast }).then(v => {
            if (!alive) { v.destroy(); return; }
            view.current = v;
            v.onCellTap((x, y) => { tap.current?.(x, y); });
            setReady(true);
        });
        return () => { alive = false; view.current?.destroy(); view.current = null; setReady(false); };
        // La vue est créée une fois ; le contraste est appliqué par l'effet suivant.
    }, []);
    useEffect(() => { if (ready) void view.current?.setHighContrast(highContrast); }, [ready, highContrast]);
    useEffect(() => { if (ready) view.current?.render({ board }, ghost, cursor, tiles); }, [ready, board, ghost, cursor, tiles]);
    useEffect(() => { if (ready && zoom && zoom.n > 0) view.current?.zoomBy(zoom.factor); }, [ready, zoom]);
    return <div ref={host} className="board" role="img" aria-label={label} data-ready={ready ? 'oui' : 'non'} data-tiles={Object.keys(board).length} data-ghost={ghost.length}
        data-cursor={cursor ? `${cursor.x}:${cursor.y}` : ''} />;
}
