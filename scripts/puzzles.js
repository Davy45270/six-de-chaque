import { log } from 'node:console';
import { argv } from 'node:process';
import { URL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const campaign = new URL('../packages/puzzles/data/defis.json', import.meta.url);
const receiptFile = new URL('../packages/puzzles/data/defis.recu.json', import.meta.url);
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false } });
try {
    if (argv[2] === 'generate') {
        const { generateCampaign, verifyCampaign } = await server.ssrLoadModule('/scripts/puzzle-campaign.ts');
        const { puzzles, receipt } = generateCampaign();
        verifyCampaign(puzzles, receipt);
        await writeFile(campaign, JSON.stringify(puzzles, null, 2) + '\n');
        await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
    } else {
        const { validateReferenceSolutions } = await server.ssrLoadModule('/scripts/validate-puzzles.ts');
        const puzzles = JSON.parse(await readFile(campaign, 'utf8'));
        for (const puzzle of puzzles) validateReferenceSolutions(puzzle);
        log(`${puzzles.length} défis validés par le moteur.`);
    }
} finally {
    await server.close();
}
