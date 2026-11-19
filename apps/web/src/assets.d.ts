declare module '*.css';

declare module 'virtual:examples' {
    const examples: Readonly<Record<string, import('./game/examples').OpenExample | undefined>>;
    export default examples;
}
