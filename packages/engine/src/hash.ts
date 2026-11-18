// Empreintes d'intégrité : JSON canonique (clés triées) et FNV-1a 64 bits en hexadécimal (16 caractères).
// Contrôle contre la corruption, pas contre un adversaire.

export function canonicalJson(value: unknown): string {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(v => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const encoder = new TextEncoder();
/** FNV-1a 64 bits sur les octets du texte encodé, calculé en quatre mots de 16 bits. */
export function fnv1a64(text: string): string {
    let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
    for (const byte of encoder.encode(text)) {
        h0 ^= byte;
        // h × (2^40 + 0x1b3) mod 2^64 : 0x1b3 sur chaque mot, 2^40 = 0x100 sur le mot 2.
        const r0 = h0 * 0x1b3;
        const r1 = h1 * 0x1b3 + (r0 >>> 16);
        const r2 = h2 * 0x1b3 + h0 * 0x100 + Math.floor(r1 / 0x10000);
        const r3 = h3 * 0x1b3 + h1 * 0x100 + Math.floor(r2 / 0x10000);
        h0 = r0 & 0xffff; h1 = r1 & 0xffff; h2 = r2 & 0xffff; h3 = r3 & 0xffff;
    }
    return [h3, h2, h1, h0].map(w => w.toString(16).padStart(4, '0')).join('');
}
