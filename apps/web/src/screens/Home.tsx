import { useRef } from 'react';

export interface HomeProps {
    onReplayLast?: () => void;
    canResume: boolean; resumeNote: string | null; highContrast: boolean; colourBlind: boolean; message: string | null;
    onNew(): void; onChallenges(): void; onToggleColourBlind(on: boolean): void; onResume(): void; onImport(text: string): void; onToggleContrast(on: boolean): void; onAbout(): void;
}
export function Home(p: HomeProps) {
    const file = useRef<HTMLInputElement>(null);
    return (
        <main className="screen home">
            <h1>Six de chaque</h1>
            <p className="lead">Aligne des galets de même couleur aux glyphes tous différents, ou de même glyphe aux couleurs toutes différentes. Six couleurs, six glyphes, trois exemplaires de chaque.</p>
            <div className="menu">
                <button type="button" className="primary" onClick={p.onNew}>Nouvelle partie</button>
                <button type="button" onClick={p.onChallenges}>Défis</button>
                {p.canResume && <button type="button" onClick={p.onResume}>Reprendre la partie</button>}
                {p.onReplayLast && <button type="button" onClick={p.onReplayLast}>Revoir la dernière partie</button>}
                <button type="button" onClick={() => file.current?.click()}>Importer une partie</button>
                <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Fichier de sauvegarde" data-testid="import-file"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(p.onImport); e.target.value = ''; }} />
                <label className="toggle"><input type="checkbox" checked={p.highContrast} onChange={e => { p.onToggleContrast(e.target.checked); }} /> Contraste élevé</label>
                <label className="toggle"><input type="checkbox" checked={p.colourBlind} onChange={e => { p.onToggleColourBlind(e.target.checked); }} /> Mode daltonien</label>
                <button type="button" className="link" onClick={p.onAbout}>Règles et à propos</button>
            </div>
            {p.resumeNote && <p className="note">{p.resumeNote}</p>}
            {p.message && <p className="error" role="alert">{p.message}</p>}
        </main>
    );
}
