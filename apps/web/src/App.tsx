// Application : écrans, partie en cours, ordinateur dans un Worker, sauvegarde après chaque coup accepté.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createGame, projectPublicState, stateHash, submit } from '@six-de-chaque/engine';
import type { GameAction, GameConfig, GameState, Session } from '@six-de-chaque/engine';
import { AiClient } from '@six-de-chaque/ai';
import { currentPlayer, humanCount, initialUi, reduce, setGhost, withSession } from './game/controller';
import { chooseAiMove } from './game/ai-turn';
import { loadLastFinishedGame, resumeOffer, savedResumeStatus } from './game/resume';
import type { SavedResume } from './game/resume';
import type { UiCommand, UiState } from './game/controller';
import type { OpenExample } from './game/examples';
import { describeEvent } from './game/describe';
import { completeChallenge, getSetting, listGames, loadGame, openDb, saveAll, saveTurn, setSetting, StaleGameError } from './storage/db';
import type { LoadedGame } from './storage/db';
import { importGame, serializeGame } from './storage/transfer';
import { addCompleted, readAppearance, readCompleted, writeAppearance } from './storage/fallback';
import type { AppearanceKey } from './storage/fallback';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Play } from './screens/Play';
import { Handover } from './screens/Handover';
import { End } from './screens/End';
import { Replay } from './screens/Replay';
import { About } from './screens/About';
import { Challenges } from './screens/Challenges';

type Screen = 'home' | 'setup' | 'play' | 'end' | 'replay' | 'last-replay' | 'about' | 'challenges';
const AI_DELAY_MS = 600;
function newSeed(): string {
    const seed = new URLSearchParams(location.search).get('seed');
    return seed?.trim() ? seed : crypto.randomUUID();
}

export function App({ example }: { example?: OpenExample }) {
    // Une seule ouverture ; chaque écriture attend la base, même si l'utilisateur agit avant qu'elle soit prête.
    const dbReady = useMemo(() => openDb(), []);
    const withDb = useCallback((fn: (d: IDBDatabase) => Promise<unknown>) => { void dbReady.then(fn).catch(() => { setMessage('La sauvegarde n’est pas disponible dans ce navigateur.'); }); }, [dbReady]);
    const [screen, setScreen] = useState<Screen>(example?.screen ?? 'home');
    const [ui, setUi] = useState<UiState | null>(example?.ui ?? null);
    const exampleId = example?.ui.gameId;
    const standardUi = ui?.gameId === exampleId ? null : ui;
    // Réglages d'apparence : la copie synchrone fait foi dès le premier rendu ; la base ne sert qu'à défaut.
    const [highContrast, setHighContrast] = useState(() => readAppearance('highContrast') ?? false);
    const [colourBlind, setColourBlind] = useState(() => readAppearance('colourBlind') ?? false);
    const knownAppearance = useRef({ highContrast: readAppearance('highContrast') !== undefined, colourBlind: readAppearance('colourBlind') !== undefined });
    const [completed, setCompleted] = useState<ReadonlySet<string>>(() => new Set(readCompleted()));
    const [lastFinished, setLastFinished] = useState<LoadedGame | null>(null);
    const [resume, setResume] = useState<SavedResume | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [announce, setAnnounce] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveFailure, setSaveFailure] = useState<'initial' | 'turn' | null>(null);
    const savingTurn = useRef(false);
    const unsavedSince = useRef<GameState | null>(null);
    const [zoom, setZoom] = useState({ n: 0, factor: 1 });
    const client = useRef<AiClient | null>(null);
    const uiRef = useRef<UiState | null>(null);
    const hintRevision = useRef(0);
    useLayoutEffect(() => { uiRef.current = ui; }, [ui]);

    useEffect(() => {
        void dbReady.then(async d => {
            const [contrast, letters, progress] = await Promise.all([
                getSetting<boolean>(d, 'highContrast'),
                getSetting<boolean>(d, 'colourBlind'),
                getSetting<string[]>(d, 'completedChallenges')
            ]);
            // Valeur de la base retenue seulement si aucun choix n'est connu ici (sauvegarde d'une version antérieure).
            if (!knownAppearance.current.highContrast && contrast !== undefined) setHighContrast(contrast);
            if (!knownAppearance.current.colourBlind && letters !== undefined) setColourBlind(letters);
            setCompleted(previous => new Set([...(progress ?? []), ...previous]));
            const last = await getSetting<string>(d, 'lastGameId');
            const games = await listGames(d);
            const g = games.find(x => x.id === last);
            if (g) {
                const loaded = await loadGame(d, g.id, 'preview').catch(() => null);
                const status = savedResumeStatus(g.id, loaded);
                setResume(status.resume);
                if (status.message) setMessage(status.message);
            }
        }).catch(() => { setMessage('La sauvegarde n’est pas disponible dans ce navigateur : la partie ne sera pas gardée.'); });
        try {
            const worker = new Worker(new URL('../../../packages/ai/src/worker.ts', import.meta.url), { type: 'module' });
            const ai = new AiClient(worker);
            client.current = ai;
            return () => { client.current = null; ai.cancel(); worker.terminate(); };
        } catch {
            return undefined;
        }
    }, []);
    useEffect(() => {
        if (screen !== 'home') return undefined;
        let active = true;
        void dbReady.then(loadLastFinishedGame, () => null).then(game => {
            if (active) setLastFinished(game);
        });
        return () => { active = false; };
    }, [dbReady, screen]);
    useLayoutEffect(() => { document.documentElement.classList.toggle('hc', highContrast); }, [highContrast]);

    const open = useCallback((session: Session, config: GameConfig, gameId: string, cursorStart: 'board' | 'origin') => {
        client.current?.cancel();
        const next = initialUi(session, config, gameId, cursorStart);
        setUi(next);
        setAnnounce('');
        setSaveFailure(null);
        unsavedSince.current = null;
        setMessage(null);
        setScreen(session.state.phase === 'finished' ? 'end' : 'play');
    }, []);

    const apply = useCallback(async (action: GameAction) => {
        const cur = uiRef.current;
        if (!cur || savingTurn.current) return;
        const { session, result } = submit(cur.session, action);
        if (!result.ok) { setUi({ ...cur, previewError: result.error.detail, aiThinking: false }); return; }
        if (cur.gameId !== exampleId) {
            savingTurn.current = true;
            setSaving(true);
            try {
                await saveTurn(await dbReady, cur.gameId, session, cur.config, unsavedSince.current ?? cur.session.state);
                unsavedSince.current = null;
                if (session.state.phase === 'finished') setLastFinished(null);
                setSaveFailure(null);
            } catch (error) {
                if (error instanceof StaleGameError) {
                    uiRef.current = null;
                    setUi(null);
                    setResume(null);
                    unsavedSince.current = null;
                    setSaveFailure(null);
                    setMessage(error.message);
                    setScreen('home');
                    return;
                }
                unsavedSince.current ??= cur.session.state;
                setSaveFailure(previous => previous ?? 'turn');
            } finally {
                savingTurn.current = false;
                setSaving(false);
            }
        }
        setUi(withSession(cur, session));
        setAnnounce(describeEvent(result.event, cur.config, session.state.tilesById));
        if (session.state.phase === 'finished') {
            setResume(saved => saved?.id === cur.gameId ? null : saved);
            setScreen('end');
        }
    }, [dbReady, exampleId]);

    const dispatch = useCallback((c: UiCommand) => {
        const cur = uiRef.current;
        if (!cur) return;
        if (c.t === 'zoom') { setZoom(z => ({ n: z.n + 1, factor: c.factor })); return; }
        if (savingTurn.current) return;
        if (c.t === 'hint') {
            const me = currentPlayer(cur);
            if (!me || me.type !== 'human' || !client.current) return;
            const revision = ++hintRevision.current;
            const gameHash = stateHash(cur.session.state);
            const current = () => hintRevision.current === revision
                && uiRef.current?.session === cur.session && uiRef.current.gameId === cur.gameId;
            void client.current.request({ type: 'REQUEST_HINT', gameHash, view: projectPublicState(cur.session.state, me.id), hand: [...me.hand], playerId: me.id, level: 'intermediate', budgetNodes: 5000 }, () => current() ? gameHash : '')
                .then(response => {
                    const now = uiRef.current;
                    if (response.status !== 'ok' || !now || !current()) return;
                    const { move, explanation } = response.decision;
                    if (move.type === 'PLACE') { setUi(setGhost(now, move.placements)); setAnnounce(`Indice : ${explanation}`); }
                });
            return;
        }
        if (c.t !== 'moveCursor') hintRevision.current++;
        const { state, submit: action } = reduce(cur, c);
        setUi(state);
        if (action) void apply(action);
    }, [apply]);

    const turnSession = ui?.session;
    const turnGameId = ui?.gameId;
    const handoverFor = ui?.handoverFor;
    useLayoutEffect(() => {
        if (!turnSession || screen !== 'play' || turnSession.state.phase === 'finished' || handoverFor
            || currentPlayer({ session: turnSession })?.type !== 'ai') return undefined;
        let stopped = false;
        const sameTurn = (now: UiState | null): now is UiState => now?.session === turnSession && now.gameId === turnGameId;
        const isCurrent = () => !stopped && sameTurn(uiRef.current);
        const setThinking = (value: boolean) => {
            setUi(now => sameTurn(now) && now.aiThinking !== value ? { ...now, aiThinking: value } : now);
        };
        setThinking(true);
        const timer = setTimeout(() => {
            void chooseAiMove(turnSession, client.current, isCurrent).then(move => {
                if (move && isCurrent()) return apply(move);
                return undefined;
            }).finally(() => {
                if (isCurrent()) setThinking(false);
            });
        }, AI_DELAY_MS);
        return () => {
            stopped = true;
            clearTimeout(timer);
            client.current?.cancel();
            setThinking(false);
        };
    }, [turnSession, turnGameId, handoverFor, screen, apply]);

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
        open(session, config, gameId, 'origin');
        void dbReady.then(d => saveAll(d, gameId, session, config, { resumeOnReload: true })).catch(() => {
            if (uiRef.current?.gameId === gameId) setSaveFailure('initial');
        });
    };
    // Le choix est écrit d'abord en copie synchrone (survit à un rechargement immédiat), puis dans la base.
    const toggleAppearance = (key: AppearanceKey, on: boolean, set: (on: boolean) => void): void => {
        knownAppearance.current[key] = true;
        writeAppearance(key, on);
        set(on);
        withDb(d => setSetting(d, key, on));
    };
    const toggleContrast = (on: boolean): void => { toggleAppearance('highContrast', on, setHighContrast); };
    const toggleColourBlind = (on: boolean): void => { toggleAppearance('colourBlind', on, setColourBlind); };
    const markComplete = (id: string): void => {
        addCompleted(id);
        setCompleted(previous => new Set([...previous, id]));
        withDb(d => completeChallenge(d, id));
    };
    const doExport = (session: Session, config: GameConfig): void => {
        const json = serializeGame(session, config);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        a.download = `six-de-chaque-${session.state.turnNumber}.json`;
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
    };

    const saveMessage = saveFailure === 'initial'
        ? 'La partie n’a pas pu être sauvegardée. Elle continue, mais un rechargement la perdrait.'
        : saveFailure === 'turn' ? 'Le dernier tour n’a pas pu être sauvegardé.' : null;
    const saveAlert = saveMessage && <p className="error" role="alert">{saveMessage}</p>;
    if (screen === 'challenges') return <Challenges completed={completed} highContrast={highContrast} colourBlind={colourBlind}
        onComplete={markComplete} onHome={() => { setScreen('home'); }} />;
    if (screen === 'setup') return <Setup onStart={startNew} onBack={() => { setScreen('home'); }} />;
    if (screen === 'about') return <About onBack={() => { setScreen('home'); }} />;
    if (screen === 'end' && ui) return <End saveAlert={saveAlert} state={ui.session.state} config={ui.config} onReplay={() => { setScreen('replay'); }} onExport={() => { doExport(ui.session, ui.config); }} onNew={() => { setScreen('setup'); }} onHome={() => { setScreen('home'); }} />;
    const replayGame = screen === 'last-replay' ? lastFinished : screen === 'replay' ? ui : null;
    if (replayGame?.session.state.phase === 'finished') {
        const { session, config } = replayGame;
        return <Replay config={config} seed={session.state.seed} events={session.events} highContrast={highContrast} colourBlind={colourBlind}
            onExport={() => { doExport(session, config); }} onBack={() => { setScreen(screen === 'last-replay' ? 'home' : 'end'); }} />;
    }
    if (screen === 'play' && ui && view) {
        if (ui.handoverFor) {
            const name = ui.config.players.find(p => p.id === ui.handoverFor)?.name ?? '';
            return <Handover saveAlert={saveAlert} name={name} onReady={() => { dispatch({ t: 'handoverDone' }); }} />;
        }
        return <Play ui={ui} view={view.pub} viewerHand={view.hand} highContrast={highContrast} colourBlind={colourBlind} announce={announce} zoom={zoom} dispatch={dispatch} saving={saving} saveAlert={saveAlert} onMenu={() => {
            if (savingTurn.current) return;
            hintRevision.current++;
            if (currentPlayer(ui)?.type === 'human') client.current?.cancel();
            setScreen('home');
        }} />;
    }
    const offer = resumeOffer(standardUi, resume);
    return <Home canResume={Boolean(offer)} resumeNote={offer?.source === 'saved' ? offer.save.note : null} highContrast={highContrast} colourBlind={colourBlind} message={saveMessage ?? message}
        onNew={() => { setScreen('setup'); }}
        onReplayLast={lastFinished ? () => { setScreen('last-replay'); } : undefined}
        onChallenges={() => { setScreen('challenges'); }}
        onResume={() => {
            if (offer?.source === 'current') {
                setUi(withSession(offer.ui, offer.ui.session));
                setScreen('play');
            }
            if (offer?.source === 'saved') withDb(async d => {
                const { id } = offer.save;
                const g = await loadGame(d, id, 'resume').catch(() => null);
                const status = savedResumeStatus(id, g);
                if (g && status.resume) {
                    open(g.session, g.config, id, 'board');
                    await setSetting(d, 'lastGameId', id);
                } else {
                    setResume(saved => saved?.id === id ? null : saved);
                    setMessage(status.message);
                }
            });
        }}
        onImport={text => {
            withDb(async d => {
                const r = await importGame(d, text);
                if (!r.ok) { setMessage(`Import refusé : ${r.reason}`); return; }
                setMessage(null);
                const g = await loadGame(d, r.gameId);
                open(g.session, g.config, r.gameId, 'board');
                if (g.session.state.phase !== 'finished') await setSetting(d, 'lastGameId', r.gameId);
            });
        }}
        onToggleContrast={toggleContrast} onToggleColourBlind={toggleColourBlind} onAbout={() => { setScreen('about'); }} />;
}
