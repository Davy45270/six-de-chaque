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
