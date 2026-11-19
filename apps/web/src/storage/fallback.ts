// Copie synchrone (localStorage) des réglages, écrite au moment du choix : un rechargement aussitôt après un clic
// ne perd rien, même si la transaction IndexedDB n'a pas abouti. Lue au premier rendu, elle prime sur la base.
// Toute erreur d'accès (navigation privée, stockage bloqué) est ignorée : la base reste alors seule.
const PREFIX = 'six-de-chaque:';

function read(key: string): unknown {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? undefined : JSON.parse(raw) as unknown;
    } catch { return undefined; }
}
function write(key: string, value: unknown): void {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* stockage indisponible */ }
}

export type AppearanceKey = 'highContrast' | 'colourBlind';

/** Valeur de secours d'un réglage d'apparence, ou `undefined` s'il n'a jamais été choisi ici. */
export function readAppearance(key: AppearanceKey): boolean | undefined {
    const v = read(key);
    return typeof v === 'boolean' ? v : undefined;
}
export function writeAppearance(key: AppearanceKey, on: boolean): void { write(key, on); }

/** Défis réussis gardés en secours ; l'ensemble retenu est l'union avec la base. */
export function readCompleted(): string[] {
    const v = read('completedChallenges');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
export function addCompleted(id: string): void { write('completedChallenges', [...new Set([...readCompleted(), id])]); }
