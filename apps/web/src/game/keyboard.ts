// Clavier → commandes : flèches (curseur), 1 à 6 (tuile de la main), Entrée (poser), Retour arrière (retirer),
// Échap (tout annuler), V (valider), E (échange), P (passer), + et - (zoom), I (indice).
import { handLeft } from './controller';
import type { UiCommand, UiState } from './controller';
import { currentPlayer } from './controller';

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
export function keyToCommand(key: string, s: UiState): UiCommand | null {
    const arrow = ARROWS[key];
    if (arrow) return { t: 'moveCursor', dx: arrow[0], dy: arrow[1] };
    if (/^[1-6]$/.test(key)) {
        const i = Number(key) - 1;
        const hand = s.mode === 'exchange' ? currentPlayer(s)?.hand ?? [] : handLeft(s);
        const id = hand[i];
        if (!id) return null;
        return s.mode === 'exchange' ? { t: 'toggleExchangeTile', tileId: id } : { t: 'select', tileId: id };
    }
    switch (key) {
        case 'Enter': return s.mode === 'exchange' ? { t: 'confirmExchange' } : { t: 'placeAt', x: s.cursor.x, y: s.cursor.y };
        case 'Backspace': return { t: 'undoGhost' };
        case 'Escape': return { t: 'clearGhost' };
        case 'v': case 'V': return { t: 'validate' };
        case 'e': case 'E': return { t: 'toggleExchange' };
        case 'p': case 'P': return { t: 'pass' };
        case '+': case '=': return { t: 'zoom', factor: 1.2 };
        case '-': return { t: 'zoom', factor: 1 / 1.2 };
        case 'i': case 'I': return { t: 'hint' };
        default: return null;
    }
}
