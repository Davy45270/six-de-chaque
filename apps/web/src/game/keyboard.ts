// Clavier → commandes : flèches (curseur), 1 à 6 (tuile annoncée sous ce numéro), Entrée (poser), Retour arrière (retirer),
// Échap (tout annuler), V (valider), E (échange), P (passer), + et - (zoom), I (indice).
import { handLeft } from './controller';
import type { UiCommand, UiState } from './controller';
import { currentPlayer } from './controller';

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
export function keyToCommand(key: string, s: UiState): UiCommand | null {
    const arrow = ARROWS[key];
    if (arrow) return { t: 'moveCursor', dx: arrow[0], dy: arrow[1] };
    if (/^[1-6]$/.test(key)) {
        // La touche N désigne la tuile annoncée « N : … », la N-ième de la main complète : les boutons gardent
        // leur numéro quand une tuile est posée en fantôme. Une tuile déjà posée ne se sélectionne pas.
        const id = currentPlayer(s)?.hand[Number(key) - 1];
        if (!id) return null;
        if (s.mode === 'exchange') return { t: 'toggleExchangeTile', tileId: id };
        return handLeft(s).includes(id) ? { t: 'select', tileId: id } : null;
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
