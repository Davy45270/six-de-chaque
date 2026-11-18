// Codes et forme d'un refus.
export type RejectCode = 'GAME_OVER' | 'NOT_YOUR_TURN' | 'WRONG_TURN' | 'EMPTY' | 'DUPLICATE_TILE'
    | 'DUPLICATE_CELL' | 'NOT_INTEGER' | 'OUT_OF_BOUNDS' | 'NOT_IN_HAND' | 'OCCUPIED' | 'NOT_ALIGNED'
    | 'GAP' | 'LINE_TOO_LONG' | 'INVALID_LINE' | 'DISCONNECTED' | 'EXCHANGE_IN_OPENING'
    | 'BAG_TOO_SMALL' | 'PASS_NOT_ALLOWED' | 'DUPLICATE_ACTION';
export type Rejection = { ok: false; code: RejectCode; detail: string };
export type Validation = { ok: true } | Rejection;
export const OK: Validation = { ok: true };
export const reject = (code: RejectCode, detail: string): Rejection => ({ ok: false, code, detail });
