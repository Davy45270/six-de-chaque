import type { LoadedGame } from '../storage/db';
import type { UiState } from './controller';

export interface SavedResume {
    id: string;
    note: string | null;
}

type ResumeOffer =
    | { source: 'current'; ui: UiState }
    | { source: 'saved'; save: SavedResume };

export function resumeOffer(current: UiState | null, saved: SavedResume | null): ResumeOffer | null {
    if (current && current.session.state.phase !== 'finished') return { source: 'current', ui: current };
    return saved && saved.id !== current?.gameId ? { source: 'saved', save: saved } : null;
}

export function savedResumeStatus(
    id: string,
    loaded: LoadedGame | null
): { resume: SavedResume | null; message: string | null } {
    if (!loaded) return { resume: null, message: 'La partie sauvegardée ne peut pas être relue. Elle est conservée.' };
    if (!loaded.consistent) return { resume: null, message: 'Le journal des coups de la sauvegarde ne peut pas être rejoué. La sauvegarde est conservée.' };
    if (loaded.session.state.phase === 'finished') return { resume: null, message: null };
    const note = loaded.recovered ? 'La reprise restaurera la partie depuis son journal de coups.' : null;
    return { resume: { id, note }, message: null };
}
