import { expect, it } from 'vitest';
import { tileSvg } from '../src/art';

// Le motif de couleur et l'initiale daltonienne sont les seuls signes non colorés d'une couleur : ils doivent se
// peindre. Le SVG du galet est analysé en arbre ; l'élément et chacun de ses ancêtres doivent avoir une opacité non
// nulle, ni display="none" ni visibility="hidden", et une peinture (fill, ou contour pour l'anneau) ni « none » ni
// transparente. En apparence normale et en contraste élevé.
interface Node { tag: string; attrs: Record<string, string>; parent: Node | null; children: Node[] }

function parse(svg: string): Node {
    const root: Node = { tag: '#root', attrs: {}, parent: null, children: [] };
    let current = root;
    for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g)) {
        const [, closing, tag = '', rawAttrs = '', selfClosing] = m;
        if (closing) {
            if (current.tag !== tag) throw new Error(`balise ${tag} fermée dans ${current.tag}`);
            current = current.parent ?? root;
            continue;
        }
        const attrs: Record<string, string> = {};
        for (const a of rawAttrs.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
        // Les propriétés de style en ligne valent comme des attributs de présentation.
        for (const decl of (attrs.style ?? '').split(';')) {
            const [k, v] = decl.split(':').map(s => s.trim());
            if (k && v) attrs[k] = v;
        }
        const node: Node = { tag, attrs, parent: current, children: [] };
        current.children.push(node);
        if (!selfClosing) current = node;
    }
    if (current !== root) throw new Error(`balise ${current.tag} non fermée`);
    return root;
}
const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)];
const invisiblePaint = (v: string | undefined): boolean => v !== undefined && /^(none|transparent)$|^(rgba|hsla)\([^)]*,\s*0(\.0*)?\s*\)$|^#[0-9a-f]{6}00$|^#[0-9a-f]{3}0$/i.test(v.trim());
const zero = (v: string | undefined): boolean => v !== undefined && Number(v.replace(/%$/, '')) === 0;

/** Raisons pour lesquelles `node` ne se peindrait pas ; vide s'il se voit. */
function hidden(node: Node, paint: 'fill' | 'stroke'): string[] {
    const why: string[] = [];
    const own = node.attrs[paint];
    if (own === undefined || invisiblePaint(own)) why.push(`${node.tag} : ${paint}=${own ?? 'absent'}`);
    if (zero(node.attrs[`${paint}-opacity`])) why.push(`${node.tag} : ${paint}-opacity nulle`);
    for (let n: Node | null = node; n && n.tag !== '#root'; n = n.parent) {
        const where = n === node ? n.tag : `ancêtre ${n.tag}`;
        if (zero(n.attrs.opacity)) why.push(`${where} : opacity=${n.attrs.opacity}`);
        if (n.attrs.display === 'none') why.push(`${where} : display=none`);
        if (n.attrs.visibility === 'hidden' || n.attrs.visibility === 'collapse') why.push(`${where} : visibility=${n.attrs.visibility}`);
        if (n !== node && invisiblePaint(n.attrs.fill)) why.push(`${where} : fill=${n.attrs.fill}`);
    }
    return why;
}

for (const highContrast of [false, true]) {
    const look = highContrast ? 'high-contrast' : 'normal';
    it(`every colour pattern and its ancestors are painted, ${look} appearance`, () => {
        for (const color of [0, 1, 2, 3, 4, 5]) {
            const nodes = all(parse(tileSvg(color, color, { highContrast, colourBlind: true })));
            const what = `couleur ${color}, ${look}`;
            const marks: Array<[Node, 'fill' | 'stroke']> = [];
            if (color === 0) marks.push(...nodes.filter(n => n.tag === 'rect' && n.attrs.opacity !== undefined && n.attrs.fill?.startsWith('#')).map(n => [n, 'fill'] as [Node, 'fill']));
            else if (color === 4) marks.push(...nodes.filter(n => n.tag === 'rect' && n.attrs.fill === 'none' && n.attrs.stroke).map(n => [n, 'stroke'] as [Node, 'stroke']));
            else {
                const layer = nodes.filter(n => n.tag === 'rect' && n.attrs.fill === 'url(#m)');
                const pattern = nodes.find(n => n.tag === 'pattern' && n.attrs.id === 'm');
                expect(pattern, `${what} : motif`).toBeDefined();
                // Le dessin du motif lui-même : chaque trait ou point se peint (contour s'il en a un, sinon remplissage).
                for (const n of pattern ? all(pattern).slice(1) : []) marks.push([n, n.attrs.stroke ? 'stroke' : 'fill']);
                marks.push(...layer.map(n => [n, 'fill'] as [Node, 'fill']));
                expect(layer, `${what} : calque du motif`).toHaveLength(1);
            }
            expect(marks.length, `${what} : aucun élément de motif`).toBeGreaterThan(0);
            for (const [n, paint] of marks) expect(hidden(n, paint), what).toEqual([]);
        }
    });
    it(`every colour-blind initial and its ancestors are painted, ${look} appearance`, () => {
        for (const color of [0, 1, 2, 3, 4, 5]) {
            const texts = all(parse(tileSvg(color, 0, { highContrast, colourBlind: true }))).filter(n => n.tag === 'text');
            expect(texts, `couleur ${color}, ${look}`).toHaveLength(1);
            for (const t of texts) expect(hidden(t, 'fill'), `couleur ${color}, ${look}`).toEqual([]);
        }
    });
}
