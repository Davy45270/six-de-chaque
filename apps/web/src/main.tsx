import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { OpenExample } from './game/examples';
import './styles.css';

const root = document.getElementById('app');
if (root) {
    const app = createRoot(root);
    const render = (example?: OpenExample): void => app.render(<StrictMode><App example={example} /></StrictMode>);
    const id = new URLSearchParams(location.search).get('exemple');
    if (id) {
        void import('virtual:examples').then(({ default: examples }) => {
            render(Object.hasOwn(examples, id) ? examples[id] : undefined);
        });
    } else render();
}
