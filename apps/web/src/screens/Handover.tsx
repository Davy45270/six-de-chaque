export function Handover({ name, onReady }: { name: string; onReady(): void }) {
    return (
        <main className="screen handover">
            <h1>Passe l’appareil à {name}</h1>
            <p>Sa main reste cachée tant qu’on n’a pas appuyé.</p>
            <button type="button" className="primary" autoFocus onClick={onReady}>C’est moi, {name}</button>
        </main>
    );
}
