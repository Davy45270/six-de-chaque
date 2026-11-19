// Application : écrans, partie en cours, ordinateur dans un Worker, sauvegarde après chaque coup accepté.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGame, projectPublicState, stateHash, submit } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, Session } from '@six-de-chaque/engine';
import { AiClient } from '@six-de-chaque/ai';
import { currentPlayer, humanCount, initialUi, passLegal, reduce, setGhost, withSession } from './game/controller';
import type { UiCommand, UiState } from './game/controller';
import { describeEvent } from './game/describe';
import { getSetting, listGames, loadGame, openDb, saveAll, saveTurn, setSetting } from './storage/db';
import { exportGame, importGame } from './storage/transfer';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Play } from './screens/Play';
import { Handover } from './screens/Handover';
import { End } from './screens/End';
import { Replay } from './screens/Replay';
import { About } from './screens/About';

type Screen = 'home' | 'setup' | 'play' | 'end' | 'replay' | 'about';
const AI_DELAY_MS = 600;
const newSeed = (): string => new URLSearchParams(location.search).get('seed') ?? crypto.randomUUID();

export function App() {
    // Une seule ouverture ; chaque écriture attend la base, même si l'utilisateur agit avant qu'elle soit prête.
    const dbReady = useMemo(() => openDb(), []);
    const withDb = useCallback((fn: (d: IDBDatabase) => Promise<unknown>) => { void dbReady.then(fn).catch(() => { setMessage('La sauvegarde n’est pas disponible dans ce navigateur.'); }); }, [dbReady]);
    const [screen, setScreen] = useState<Screen>('home');
    const [ui, setUi] = useState<UiState | null>(null);
    const [highContrast, setHighContrast] = useState(false);
    const [resume, setResume] = useState<{ id: string; note: string | null } | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [announce, setAnnounce] = useState('');
    const [zoom, setZoom] = useState({ n: 0, factor: 1 });
    const client = useRef<AiClient | null>(null);
    const hashRef = useRef('');
    const uiRef = useRef<UiState | null>(null);
    uiRef.current = ui;
    hashRef.current = ui ? stateHash(ui.session.state) : '';

    useEffect(() => {
        void dbReady.then(async d => {
            setHighContrast((await getSetting<boolean>(d, 'highContrast')) ?? false);
            const last = await getSetting<string>(d, 'lastGameId');
            const games = await listGames(d);
            const g = games.find(x => x.id === last && !x.finished);
            if (g) {
                const loaded = await loadGame(d, g.id).catch(() => null);
                setResume({ id: g.id, note: loaded && !loaded.consistent ? 'La sauvegarde ne correspond plus à son journal de coups : elle est gardée, mais elle peut contenir une erreur.' : null });
            }
        }).catch(() => { setMessage('La sauvegarde n’est pas disponible dans ce navigateur : la partie ne sera pas gardée.'); });
        const worker = new Worker(new URL('../../../packages/ai/src/worker.ts', import.meta.url), { type: 'module' });
        client.current = new AiClient(worker);
        return () => { client.current?.cancel(); worker.terminate(); };
    }, []);
    useEffect(() => { document.documentElement.classList.toggle('hc', highContrast); }, [highContrast]);

    const open = useCallback((session: Session, config: GameConfig, gameId: string) => {
        client.current?.cancel();
        const next = initialUi(session, config, gameId);
        setUi(next);
        setAnnounce('');
        setScreen(session.state.phase === 'finished' ? 'end' : 'play');
        withDb(d => setSetting(d, 'lastGameId', gameId));
    }, [withDb]);

    const apply = useCallback((action: GameAction) => {
        const cur = uiRef.current;
        if (!cur) return;
        const { session, result } = submit(cur.session, action);
        if (!result.ok) { setUi({ ...cur, previewError: result.error.detail, aiThinking: false }); return; }
        const next = withSession({ ...cur, cursor: cur.cursor }, session);
        setUi(next);
        setAnnounce(describeEvent(result.event, cur.config, session.state.tilesById));
        withDb(d => saveTurn(d, cur.gameId, session, cur.config));
        if (session.state.phase === 'finished') setScreen('end');
    }, [withDb]);

    const dispatch = useCallback((c: UiCommand) => {
        const cur = uiRef.current;
        if (!cur) return;
        if (c.t === 'zoom') { setZoom(z => ({ n: z.n + 1, factor: c.factor })); return; }
        if (c.t === 'hint') {
            const me = currentPlayer(cur);
            if (!me || me.type !== 'human' || !client.current) return;
            void client.current.request({ type: 'REQUEST_HINT', gameHash: hashRef.current, view: projectPublicState(cur.session.state, me.id), hand: [...me.hand], playerId: me.id, level: 'intermediate', budgetNodes: 5000 }, () => hashRef.current)
                .then(d => { const now = uiRef.current; if (d && now && d.move.type === 'PLACE') { setUi(setGhost(now, d.move.placements)); setAnnounce(`Indice : ${d.explanation}`); } });
            return;
        }
        const { state, submit: action } = reduce(cur, c);
        setUi(state);
        if (action) apply(action);
    }, [apply]);

    // Tour de l'ordinateur : délai d'affichage, demande au Worker ; une réponse obsolète est ignorée.
    const turnKey = ui ? `${ui.gameId}:${ui.session.state.turnNumber}:${ui.handoverFor ?? ''}:${screen}` : '';
    useEffect(() => {
        const cur = uiRef.current;
        if (!cur || screen !== 'play' || cur.session.state.phase === 'finished' || cur.handoverFor) return undefined;
        const me = currentPlayer(cur);
        if (me?.type !== 'ai' || !client.current) return undefined;
        setUi({ ...cur, aiThinking: true });
        const timer = setTimeout(() => {
            const now = uiRef.current;
            if (!now || !client.current) return;
            void client.current.request({ type: 'REQUEST_MOVES', gameHash: hashRef.current, view: projectPublicState(now.session.state, me.id), hand: [...me.hand], playerId: me.id,
                level: me.aiLevel ?? 'beginner', budgetNodes: 20_000, passLegal: passLegal(now.session) }, () => hashRef.current)
                .then(d => { if (d) apply(d.move); });
        }, AI_DELAY_MS);
        return () => { clearTimeout(timer); client.current?.cancel(); };
    }, [turnKey, screen, apply]);

    const view = useMemo(() => {
        if (!ui) return null;
        const s = ui.session.state;
        const me = currentPlayer(ui);
        const humans = s.players.filter(p => p.type === 'human');
        const viewer = s.phase === 'finished' ? null
            : humanCount(ui.config) === 1 ? humans[0]?.id ?? null
                : me?.type === 'human' && ui.handoverFor === null ? me.id : null;
        return { pub: projectPublicState(s, viewer), hand: viewer ? s.players.find(p => p.id === viewer)?.hand ?? null : null };
    }, [ui]);

    const startNew = (config: GameConfig): void => {
        const gameId = `partie-${crypto.randomUUID()}`;
        const session: Session = { state: createGame(config, newSeed()), events: [] };
        withDb(d => saveAll(d, gameId, session, config));
        open(session, config, gameId);
    };
    const toggleContrast = (on: boolean): void => { setHighContrast(on); withDb(d => setSetting(d, 'highContrast', on)); };
    const doExport = (): void => {
        if (!ui) return;
        withDb(d => exportGame(d, ui.gameId).then(json => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            a.download = `six-de-chaque-${ui.session.state.turnNumber}.json`;
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
        }));
    };

    if (screen === 'setup') return <Setup onStart={startNew} onBack={() => { setScreen('home'); }} />;
    if (screen === 'about') return <About onBack={() => { setScreen(ui ? 'play' : 'home'); }} />;
    if (screen === 'end' && ui) return <End state={ui.session.state} config={ui.config} onReplay={() => { setScreen('replay'); }} onExport={doExport} onNew={() => { setScreen('setup'); }} onHome={() => { setScreen('home'); }} />;
    if (screen === 'replay' && ui && ui.session.state.phase === 'finished') return <Replay config={ui.config} seed={ui.session.state.seed} events={ui.session.events} highContrast={highContrast} onBack={() => { setScreen('end'); }} />;
    if (screen === 'play' && ui && view) {
        if (ui.handoverFor) {
            const name = ui.config.players.find(p => p.id === ui.handoverFor)?.name ?? '';
            return <Handover name={name} onReady={() => { dispatch({ t: 'handoverDone' }); }} />;
        }
        return <Play ui={ui} view={view.pub} viewerHand={view.hand} highContrast={highContrast} announce={announce} zoom={zoom} dispatch={dispatch} onMenu={() => { client.current?.cancel(); setScreen('home'); }} />;
    }
    return <Home canResume={Boolean(resume) || Boolean(ui && ui.session.state.phase !== 'finished')} resumeNote={resume?.note ?? null} highContrast={highContrast} message={message}
        onNew={() => { setScreen('setup'); }}
        onResume={() => {
            if (ui && ui.session.state.phase !== 'finished') { setUi(withSession(ui, ui.session)); setScreen('play'); return; }
            if (resume) withDb(d => loadGame(d, resume.id).then(g => { open(g.session, g.config, resume.id); }).catch(() => { setMessage('Impossible de relire cette partie.'); }));
        }}
        onImport={text => {
            withDb(async d => {
                const r = await importGame(d, text);
                if (!r.ok) { setMessage(`Import refusé : ${r.reason}`); return; }
                setMessage(null);
                const g = await loadGame(d, r.gameId);
                open(g.session, g.config, r.gameId);
            });
        }}
        onToggleContrast={toggleContrast} onAbout={() => { setScreen('about'); }} />;
}
