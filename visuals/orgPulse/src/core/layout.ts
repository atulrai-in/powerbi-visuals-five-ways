// Org Pulse core: the two layouts. Both return a position per seat, so a morph is just a transition between them.
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from "d3";
import { Snapshot, SNode, hash01 } from "./model";

export interface Pt { x: number; y: number }
export type Layout = Map<string, Pt>; // seat id -> point

export const radius = (n: SNode) => (n.children.length ? 7 + 1.6 * Math.log2(n.subtree) : 4.5);

// ---------------------------------------------------------------- org chart (compact, wrapped to the viewport's shape)

const LEVEL = 92;   // vertical gap between manager levels
const COL = 46;     // minimum width of a manager column
const LEAF = 15;    // grid cell for people with no reports
const GAP = 14;

interface Box { w: number; h: number }

export function orgChart(s: Snapshot, aspect: number): Layout {
    const out: Layout = new Map();
    const box = new Map<SNode, Box>();
    const leavesOf = (n: SNode) => n.children.filter(c => !c.children.length);
    const innerOf = (n: SNode) => n.children.filter(c => c.children.length);
    const grid = (k: number) => { const cols = Math.max(1, Math.ceil(Math.sqrt(k / 2.2))); return { cols, rows: Math.ceil(k / cols) }; };

    const measure = (n: SNode): Box => {
        const leaves = leavesOf(n), inner = innerOf(n);
        const g = grid(leaves.length);
        const lw = leaves.length ? g.cols * LEAF : 0, lh = leaves.length ? g.rows * LEAF + LEVEL * 0.45 : 0;
        let iw = 0, ih = 0;
        for (const c of inner) { const b = measure(c); iw += b.w; ih = Math.max(ih, b.h); }
        iw += Math.max(0, inner.length - 1) * GAP;
        const b = { w: Math.max(COL, radius(n) * 2 + 10, lw + (lw && iw ? GAP : 0) + iw), h: Math.max(radius(n) * 2, lh, inner.length ? LEVEL + ih : 0) };
        box.set(n, b);
        return b;
    };

    const place = (n: SNode, x0: number, y: number) => {
        const b = box.get(n)!;
        out.set(n.pos, { x: x0 + b.w / 2, y });
        const leaves = leavesOf(n), inner = innerOf(n);
        const g = grid(leaves.length);
        const lw = leaves.length ? g.cols * LEAF : 0;
        const iw = inner.reduce((a, c) => a + box.get(c)!.w, 0) + Math.max(0, inner.length - 1) * GAP;
        let x = x0 + (b.w - (lw + (lw && iw ? GAP : 0) + iw)) / 2;
        leaves.forEach((c, i) => out.set(c.pos, { x: x + (i % g.cols) * LEAF + LEAF / 2, y: y + LEVEL * 0.45 + Math.floor(i / g.cols) * LEAF }));
        if (lw) x += lw + GAP;
        for (const c of inner) { place(c, x, y + LEVEL); x += box.get(c)!.w + GAP; }
    };

    // wrap the root's teams into rows so the chart roughly fits the viewport
    let x = 0;
    for (const root of s.roots) {
        measure(root);
        const inner = innerOf(root);
        if (inner.length < 3) { place(root, x, 0); x += box.get(root)!.w + GAP * 4; continue; }
        const widths = inner.map(c => box.get(c)!.w), total = widths.reduce((a, w) => a + w + GAP, 0);
        let best: SNode[][] = [inner], bestScore = Infinity;
        for (let k = 1; k <= Math.min(4, inner.length); k++) {
            const rows: SNode[][] = [[]];
            let acc = 0;
            inner.forEach((c, i) => { if (acc > 0 && acc + widths[i] / 2 > total / k) { rows.push([]); acc = 0; } rows[rows.length - 1].push(c); acc += widths[i] + GAP; });
            const w = Math.max(...rows.map(r => r.reduce((a, c) => a + box.get(c)!.w + GAP, 0)));
            const h = LEVEL + rows.reduce((a, r) => a + Math.max(...r.map(c => box.get(c)!.h)) + LEVEL * 0.6, 0);
            const score = Math.abs(Math.log((w / h) / aspect));
            if (score < bestScore) { bestScore = score; best = rows; }
        }
        const rowW = best.map(r => r.reduce((a, c) => a + box.get(c)!.w + GAP, -GAP));
        const W = Math.max(...rowW);
        // the root's leaf reports sit under it, left of the first row
        const leaves = leavesOf(root), g = grid(leaves.length);
        out.set(root.pos, { x: x + W / 2, y: 0 });
        leaves.forEach((c, i) => out.set(c.pos, { x: x + W / 2 + 40 + (i % g.cols) * LEAF, y: Math.floor(i / g.cols) * LEAF }));
        let y = LEVEL;
        best.forEach((r, ri) => {
            let cx = x + (W - rowW[ri]) / 2;
            for (const c of r) { place(c, cx, y); cx += box.get(c)!.w + GAP; }
            y += Math.max(...r.map(c => box.get(c)!.h)) + LEVEL * 0.6;
        });
        x += W + GAP * 4;
    }
    return out;
}

// ---------------------------------------------------------------- constellation (force clusters by "Colour by")

interface FNode extends SimulationNodeDatum { n: SNode; r: number; gx: number; gy: number }

export function constellation(s: Snapshot, groups: string[], aspect: number, prev: Layout | null, ticks = 320): Layout {
    // cluster centres: the root's group in the middle, the rest on an ellipse
    const size = new Map<string, number>();
    s.nodes.forEach(n => size.set(n.group, (size.get(n.group) ?? 0) + 1));
    const rootGroup = s.roots[0]?.group;
    const ring = groups.filter(g => g !== rootGroup && size.has(g));
    const R = Math.sqrt(s.nodes.length) * 17;
    const centre = new Map<string, Pt>();
    if (rootGroup !== undefined) centre.set(rootGroup, { x: 0, y: 0 });
    ring.forEach((g, i) => {
        const a = -Math.PI / 2 + (i / ring.length) * Math.PI * 2;
        centre.set(g, { x: Math.cos(a) * R * Math.sqrt(aspect), y: Math.sin(a) * R / Math.sqrt(aspect) });
    });
    size.forEach((_, g) => { if (!centre.has(g)) centre.set(g, { x: 0, y: 0 }); });

    const fnodes: FNode[] = s.nodes.map(n => {
        const c = centre.get(n.group)!;
        const p = prev?.get(n.pos) ?? (n.parent && prev?.get(n.parent.pos));
        const j = (salt: string) => (hash01(n.pos + salt) - 0.5) * 30;
        return { n, r: radius(n), gx: c.x, gy: c.y, x: (p ? p.x : c.x) + (prev?.get(n.pos) ? 0 : j("x")), y: (p ? p.y : c.y) + (prev?.get(n.pos) ? 0 : j("y")) };
    });
    const idx = new Map(fnodes.map(f => [f.n, f]));
    const links: SimulationLinkDatum<FNode>[] = fnodes.filter(f => f.n.parent).map(f => ({ source: idx.get(f.n.parent!)!, target: f }));
    const same = (l: SimulationLinkDatum<FNode>) => (l.source as FNode).n.group === (l.target as FNode).n.group;

    const sim = forceSimulation(fnodes)
        .force("link", forceLink(links).distance(l => (same(l) ? ((l.target as FNode).n.children.length ? 26 : 13) + (l.source as FNode).r : R * 0.5)).strength(l => (same(l) ? 0.7 : 0.015)))
        .force("charge", forceManyBody<FNode>().strength(f => (f.n.children.length ? -60 : -9)).distanceMax(160))
        .force("x", forceX<FNode>(f => f.gx).strength(f => (f.n.depth <= 1 ? 0.25 : 0.06)))
        .force("y", forceY<FNode>(f => f.gy).strength(f => (f.n.depth <= 1 ? 0.25 : 0.06)))
        .force("collide", forceCollide<FNode>(f => f.r + 1.6).strength(0.9))
        .stop();
    if (prev) sim.alpha(0.35);
    for (let i = 0; i < ticks; i++) sim.tick();
    return new Map(fnodes.map(f => [f.n.pos, { x: f.x!, y: f.y! }]));
}
