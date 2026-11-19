// Modèle de partie. Les identifiants de tuiles vont de « t-000 » à « t-107 ».
export type TileId = string;
export interface Tile { id: TileId; color: number; shape: number }
export interface Placement { tileId: TileId; x: number; y: number }
interface ActionBase { actorId: string; expectedTurn: number; actionId: string }
export type PlaceAction = ActionBase & { type: 'PLACE'; placements: Placement[] };
export type ExchangeAction = ActionBase & { type: 'EXCHANGE'; tileIds: TileId[] };
export type PassAction = ActionBase & { type: 'PASS' };
export type GameAction = PlaceAction | ExchangeAction | PassAction;
export type AiLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export const GAME_VERSION = 2;
export interface PlayerState { id: string; name: string; type: 'human' | 'ai'; aiLevel?: AiLevel; score: number; hand: TileId[] }
export interface RulesConfig { blockedEndPolicy: 'fullPassRound'; coordinateLimit: number }
export type RngState = [number, number, number, number];
export interface GameState {
    version: typeof GAME_VERSION;
    seed: string;
    rngState: RngState;
    phase: 'opening' | 'playing' | 'finished';
    turnNumber: number;
    currentPlayerIndex: number;
    tilesById: Record<TileId, Tile>;
    /** Clé « x:y ». */
    board: Record<string, TileId>;
    players: PlayerState[];
    bag: TileId[];
    consecutivePasses: number;
    config: RulesConfig;
    endReason: null | 'out' | 'blocked';
}
export interface GameConfig { players: Array<Pick<PlayerState, 'id' | 'name' | 'type' | 'aiLevel'>>; rules?: Partial<RulesConfig> }
