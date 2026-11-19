import type { ReactNode } from 'react';
export function Handover({ saveAlert, name, onReady }: { saveAlert?: ReactNode; name: string; onReady(): void }) {
    return (
        <main className="screen handover">
            <h1>Passe l’appareil à {name}</h1>
            {saveAlert}
            <p>Sa main reste cachée tant qu’on n’a pas appuyé.</p>
            <button type="button" className="primary" autoFocus onClick={onReady}>C’est moi, {name}</button>
        </main>
    );
}
