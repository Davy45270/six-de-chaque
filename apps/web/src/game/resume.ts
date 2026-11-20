import { getSetting, hasFinishedSnapshot, loadGame } from '../storage/db';
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
    if (!loaded.consistent) return { resume: null, message: 'Le journal des coups ne permet pas de retrouver une partie cohérente. La sauvegarde est conservée.' };
    if (loaded.session.state.phase === 'finished') return { resume: null, message: null };
    const note = loaded.recovered ? 'La reprise restaurera la partie depuis son journal de coups.' : null;
    return { resume: { id, note }, message: null };
}

async function previewFinishedGame(db: IDBDatabase, id: string): Promise<LoadedGame | null> {
    const loaded = await loadGame(db, id, 'preview').catch(() => null);
    return loaded?.consistent && !loaded.recovered && loaded.session.state.phase === 'finished' ? loaded : null;
}

export async function loadLastFinishedGame(db: IDBDatabase): Promise<LoadedGame | null> {
    const finishedId = await getSetting<unknown>(db, 'lastFinishedGameId').catch(() => undefined);
    if (typeof finishedId === 'string') {
        const finished = await previewFinishedGame(db, finishedId);
        if (finished) return finished;
    }

    try {
        const lastId = await getSetting<unknown>(db, 'lastGameId');
        if (typeof lastId !== 'string' || lastId === finishedId) return null;
        return await hasFinishedSnapshot(db, lastId) ? await previewFinishedGame(db, lastId) : null;
    } catch {
        return null;
    }
}
