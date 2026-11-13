// Org Pulse core: the view. Renders a snapshot, animates between months and between layouts, and shows a person's story.
// No Power BI imports: the host passes rows in and gets the committed date back through onCommit.
import * as d3 from "d3";
import { SeatRow, Index, Snapshot, SNode, Change, Day, buildIndex, snapshot, diff, profile, seatHistory, initials, where, shortName, hash01, fmtDay, fmtMonth, yearOf, THIN } from "./model";
import { Layout, Pt, orgChart, constellation, radius } from "./layout";

export type Mode = "constellation" | "org";
export interface ViewOptions {
    onCommit?: (day: Day) => void;     // the user settled on a month (pause, release, step): filter the page
    onSelect?: (person: string | null) => void;
}

const PALETTE = ["#E9B949", "#4C9BE8", "#EF6F5E", "#9A7BEA", "#2BB3A3", "#7CC35A", "#E66AB4", "#F29E4C", "#5CC8E0", "#A3A3A3"];
const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);

type El = HTMLElement;
function h(tag: string, cls?: string | null, ...kids: (string | Node | null | undefined | false)[]): El {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k of kids) if (k !== null && k !== undefined && k !== false) e.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    return e;
}
const clear = (e: Element) => { while (e.firstChild) e.removeChild(e.firstChild); };

export class OrgPulseView {
    private opts: ViewOptions;
    private root: El;
    private stage: El;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private gZoom: d3.Selection<SVGGElement, unknown, null, undefined>;
    private gLinks: d3.Selection<SVGGElement, unknown, null, undefined>;
    private gNodes: d3.Selection<SVGGElement, unknown, null, undefined>;
    private gFx: d3.Selection<SVGGElement, unknown, null, undefined>;
    private gLabels: d3.Selection<SVGGElement, unknown, null, undefined>;
    private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private ui: Record<string, El> = {};
    private range: HTMLInputElement;
    private search: HTMLInputElement;

    private ix: Index | null = null;
    private snaps: Snapshot[] = [];
    private counts: { hires: number; exits: number; moves: number }[] = [];
    private i = 0;
    private mode: Mode = "constellation";
    private conLayout: Layout | null = null;
    private layout: Layout = new Map();
    private lastPt = new Map<string, Pt>();
    private selected: string | null = null;
    private hidden = new Set<string>();
    private color: d3.ScaleOrdinal<string, string> = d3.scaleOrdinal<string, string>().range(PALETTE);
    private timer: number | null = null;
    private speed = 1;
    private userZoomed = false;
    private first = true;
    private showIssues = false;
    private k = 1; // current zoom: cluster labels are counter-scaled to stay the same size on screen

    constructor(container: El, opts: ViewOptions = {}) {
        this.opts = opts;
        this.root = h("div", "op op-dark");
        this.root.tabIndex = 0;
        container.appendChild(this.root);

        // top bar
        const top = h("div", "op-top");
        this.ui.asOf = h("div", "op-asof");
        this.ui.title = h("div", "op-title", "Org Pulse");
        top.appendChild(h("div", "op-heading", this.ui.title, this.ui.asOf));
        this.ui.kpis = h("div", "op-kpis");
        top.appendChild(this.ui.kpis);
        const tools = h("div", "op-tools");
        this.ui.modeCon = h("button", "on", "Constellation");
        this.ui.modeOrg = h("button", null, "Org chart");
        tools.appendChild(h("div", "op-seg", this.ui.modeCon, this.ui.modeOrg));
        this.search = h("input", "op-search") as HTMLInputElement;
        this.search.type = "search";
        this.search.placeholder = "Find a person";
        this.search.setAttribute("list", "op-people");
        this.ui.people = h("datalist");
        this.ui.people.id = "op-people";
        tools.appendChild(this.search);
        tools.appendChild(this.ui.people);
        this.ui.issues = h("button", "op-issues");
        tools.appendChild(this.ui.issues);
        top.appendChild(tools);
        this.root.appendChild(top);

        // stage
        this.stage = h("div", "op-stage");
        this.root.appendChild(this.stage);
        this.svg = d3.select(this.stage).append("svg").attr("class", "op-svg");
        this.gZoom = this.svg.append("g");
        this.gLinks = this.gZoom.append("g").attr("class", "op-links");
        this.gFx = this.gZoom.append("g").attr("class", "op-fx");
        this.gNodes = this.gZoom.append("g").attr("class", "op-nodes");
        this.gLabels = this.gZoom.append("g").attr("class", "op-glabels");
        this.zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.05, 8]).on("zoom", e => {
            this.gZoom.attr("transform", e.transform.toString());
            this.k = e.transform.k;
            this.gLabels.selectAll(".op-gl-in").attr("transform", `scale(${1 / this.k})`);
            this.root.classList.toggle("op-far", e.transform.k < 0.9);
            if (e.sourceEvent) this.userZoomed = true;
        });
        this.svg.call(this.zoom).on("dblclick.zoom", null);
        this.svg.on("click", e => { if (e.target === this.svg.node()) this.select(null); });
        this.ui.stamp = h("div", "op-stamp");
        this.ui.feed = h("div", "op-feed");
        this.ui.legend = h("div", "op-legend");
        this.ui.tip = h("div", "op-tip");
        this.ui.panel = h("aside", "op-panel");
        this.ui.fit = h("button", "op-fit", "Fit");
        this.ui.fit.title = "Fit the whole organisation in view";
        for (const k of ["stamp", "feed", "legend", "tip", "panel", "fit"]) this.stage.appendChild(this.ui[k]);

        // time bar
        const time = h("div", "op-time");
        this.ui.prev = h("button", "op-step", "‹");
        this.ui.play = h("button", "op-play", "▶");
        this.ui.next = h("button", "op-step", "›");
        this.ui.speed = h("button", "op-speed", "1×");
        this.ui.prev.title = "Previous month"; this.ui.next.title = "Next month"; this.ui.speed.title = "Playback speed";
        const track = h("div", "op-track");
        this.ui.bars = h("div", "op-bars");
        this.range = h("input") as HTMLInputElement;
        this.range.type = "range";
        this.ui.years = h("div", "op-years");
        track.appendChild(this.ui.bars);
        track.appendChild(this.range);
        track.appendChild(this.ui.years);
        this.ui.month = h("div", "op-month");
        for (const e of [this.ui.prev, this.ui.play, this.ui.next, track, this.ui.month, this.ui.speed]) time.appendChild(e);
        this.ui.time = time;
        this.root.appendChild(time);

        // events
        this.ui.modeCon.onclick = () => this.setMode("constellation");
        this.ui.modeOrg.onclick = () => this.setMode("org");
        this.ui.fit.onclick = () => this.fit(600);
        this.ui.play.onclick = () => (this.timer === null ? this.play() : this.pause());
        this.ui.prev.onclick = () => { this.pause(false); this.go(this.i - 1, true); };
        this.ui.next.onclick = () => { this.pause(false); this.go(this.i + 1, true); };
        this.ui.speed.onclick = () => { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 4 : 1; this.ui.speed.textContent = `${this.speed}×`; };
        this.range.oninput = () => { this.pause(false); this.go(+this.range.value, false); };
        this.range.onchange = () => this.commit();
        this.ui.issues.onclick = () => { this.showIssues = !this.showIssues; this.selected = null; this.renderPanel(); };
        this.search.onchange = () => this.find(this.search.value);
        this.root.addEventListener("keydown", e => {
            if (e.target === this.search) return;
            if (e.key === "ArrowRight") { this.pause(false); this.go(this.i + 1, true); }
            else if (e.key === "ArrowLeft") { this.pause(false); this.go(this.i - 1, true); }
            else if (e.key === " ") { e.preventDefault(); this.ui.play.click(); }
            else if (e.key === "Escape") this.select(null);
        });
    }

    // ------------------------------------------------------------ public API

    public setData(rows: SeatRow[], day?: Day | null) {
        this.pause(false);
        this.ix = buildIndex(rows);
        this.color.domain(this.ix.groups);
        this.snaps = this.ix.months.map(d => snapshot(this.ix!, d));
        this.counts = this.snaps.map((s, k) => {
            const c = { hires: 0, exits: 0, moves: 0 };
            if (k) diff(this.snaps[k - 1], s).forEach(ch => { if (ch.kind === "hire") c.hires++; else if (ch.kind === "exit") c.exits++; else if (ch.kind === "moved") c.moves++; });
            return c;
        });
        this.i = day !== undefined && day !== null ? this.indexOf(day) : this.snaps.length - 1;
        this.conLayout = null;
        this.ui.time.style.display = this.ix.hasHistory ? "" : "none";
        this.range.min = "0";
        this.range.max = String(this.snaps.length - 1);
        this.scaleUi();
        this.drawTrack();
        this.render(null, 0);
        this.fit(0);
    }

    /** The page moved to another date (report filter or slicer). Ignored while playing. */
    public setDay(day: Day) {
        if (this.timer !== null || !this.snaps.length) return;
        const k = this.indexOf(day);
        if (k !== this.i) this.go(k, false);
    }

    public get day(): Day | null { return this.snaps[this.i]?.day ?? null; }

    public setTheme(theme: "dark" | "light") {
        this.root.classList.toggle("op-dark", theme === "dark");
        this.root.classList.toggle("op-light", theme === "light");
    }

    public setTitle(t: string) { this.ui.title.textContent = t; }

    /** Show or hide the change feed (the month's notable moves, bottom right). */
    public setFeed(show: boolean) { this.root.classList.toggle("op-nofeed", !show); }

    public setMode(mode: Mode) {
        if (mode === this.mode) return;
        this.mode = mode;
        this.ui.modeCon.classList.toggle("on", mode === "constellation");
        this.ui.modeOrg.classList.toggle("on", mode === "org");
        this.root.classList.toggle("op-mode-org", mode === "org");
        this.render(null, 1100, true);
        this.fit(1100);
    }

    public resize() {
        this.scaleUi();
        this.drawTrack();
        if (!this.userZoomed) this.fit(0);
    }

    /** Bigger chrome on big visuals: the controls are designed for up to ~1600px wide. */
    private scaleUi() {
        const w = this.root.clientWidth || 1200;
        this.root.style.setProperty("--ui", String(Math.max(1, Math.min(1.4, w / 1600))));
    }

    public setVisible(v: boolean) { this.root.style.display = v ? "" : "none"; }

    public destroy() { this.pause(false); this.root.remove(); }

    // ------------------------------------------------------------ time

    private indexOf(day: Day) {
        let best = this.snaps.length - 1;
        for (let k = 0; k < this.snaps.length; k++) if (this.snaps[k].day >= day) { best = k; break; }
        return best;
    }

    private stepMs() { return 1300 / this.speed; }

    private play() {
        if (this.i >= this.snaps.length - 1) this.go(0, false);
        this.ui.play.textContent = "❚❚";
        this.root.classList.add("op-playing");
        const tick = () => {
            if (this.i >= this.snaps.length - 1) return this.pause();
            this.go(this.i + 1, false);
            this.timer = window.setTimeout(tick, this.stepMs());
        };
        this.timer = window.setTimeout(tick, 250);
    }

    private pause(commit = true) {
        if (this.timer === null) return;
        window.clearTimeout(this.timer);
        this.timer = null;
        this.ui.play.textContent = "▶";
        this.root.classList.remove("op-playing");
        if (commit) this.commit();
    }

    private commit() { const d = this.day; if (d !== null) this.opts.onCommit?.(d); }

    private go(k: number, commit: boolean) {
        if (!this.snaps.length) return;
        k = Math.max(0, Math.min(this.snaps.length - 1, k));
        if (k === this.i) return;
        const before = this.snaps[this.i];
        this.i = k;
        const playing = this.timer !== null;
        this.render(diff(before, this.snaps[k]), playing ? this.stepMs() * 0.8 : 750);
        if (commit) this.commit();
    }

    // ------------------------------------------------------------ rendering

    private computeLayout(s: Snapshot): Layout {
        const r = this.stage.getBoundingClientRect();
        const aspect = Math.max(0.5, Math.min(3.5, (r.width || 1200) / (r.height || 700)));
        if (this.mode === "org") return orgChart(s, aspect);
        this.conLayout = constellation(s, this.ix!.groups, aspect, this.conLayout, this.conLayout ? 70 : 260);
        return this.conLayout;
    }

    private render(changes: Map<string, Change> | null, dur: number, morph = false) {
        const s = this.snaps[this.i];
        if (!s) return;
        this.layout = this.computeLayout(s);
        const P = (n: SNode): Pt => this.layout.get(n.pos) ?? { x: 0, y: 0 };
        const mode = this.mode;
        const intro = this.first;
        this.first = false;
        const centre = s.roots[0] ? P(s.roots[0]) : { x: 0, y: 0 };
        const delay = (n: SNode) => (morph ? n.depth * 70 : intro ? 150 + n.depth * 160 + hash01(n.key) * 250 : 0);
        const t = (sel: any, n?: SNode) => sel.transition().duration(intro ? 900 : dur).delay(n ? delay(n) : 0).ease(d3.easeCubicInOut);

        // links
        const linkPath = (a: Pt, b: Pt) => mode === "org"
            ? `M${a.x},${a.y}C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`
            : `M${a.x},${a.y}C${a.x + (b.x - a.x) / 3},${a.y + (b.y - a.y) / 3} ${a.x + (2 * (b.x - a.x)) / 3},${a.y + (2 * (b.y - a.y)) / 3} ${b.x},${b.y}`;
        const links = this.gLinks.selectAll<SVGPathElement, SNode>("path").data(s.nodes.filter(n => n.parent), n => n.key);
        links.exit().transition().duration(dur * 0.5).style("opacity", 0).remove();
        const le = links.enter().append("path").style("opacity", 0).attr("d", n => linkPath(intro ? centre : P(n.parent!), intro ? centre : P(n)));
        le.merge(links)
            .attr("class", n => `op-link${n.children.length ? "" : " op-leaf"}${n.parent!.group !== n.group ? " op-cross" : ""}`)
            .each(function (n) { t(d3.select(this), n).attr("d", linkPath(P(n.parent!), P(n))).style("opacity", null); });

        // nodes
        const nodes = this.gNodes.selectAll<SVGGElement, SNode>("g.op-n").data(s.nodes, n => n.key);
        nodes.exit().each((n: SNode, k, g) => {
            const el = d3.select(g[k] as SVGGElement);
            const p = this.lastPt.get(n.key);
            if (p && changes?.get(n.key)?.kind === "exit") this.halo(p, "op-fx-exit", radius(n));
            el.interrupt().transition().duration(dur * 0.8).style("opacity", 0).attr("transform", p ? `translate(${p.x},${p.y}) scale(0.2)` : null).remove();
        });
        const ne = nodes.enter().append("g").attr("class", "op-n")
            .attr("transform", n => { const p = intro ? centre : P(n); return `translate(${p.x},${p.y}) scale(0.01)`; });
        ne.append("circle").attr("class", "op-body");
        ne.append("path").attr("class", "op-track");
        ne.append("path").attr("class", "op-ring");
        ne.append("text").attr("class", "op-ini").attr("dy", "0.35em");
        ne.append("text").attr("class", "op-name");
        const badge = ne.append("g").attr("class", "op-badge");
        badge.append("circle").attr("r", 6.5);
        badge.append("text").attr("dy", "0.35em");
        ne.on("mouseenter", (e: MouseEvent, n) => this.tip(e, n)).on("mousemove", (e: MouseEvent, n) => this.tip(e, n)).on("mouseleave", () => (this.ui.tip.style.display = "none"))
            .on("click", (e: MouseEvent, n) => { e.stopPropagation(); this.select(n.key); });

        const all = ne.merge(nodes);
        const arc = d3.arc<number>();
        all.each((n, k, g) => {
            const el = d3.select(g[k] as SVGGElement);
            const r = radius(n), p = P(n), ch = changes?.get(n.key);
            el.attr("class", `op-n${n.open ? " op-open" : ""}${n.leave ? " op-leave" : ""}${n.children.length ? " op-mgr" : ""}${n.depth <= 1 ? " op-top1" : ""}${n.depth === 1 ? " op-d1" : ""}`)
                .style("--c", this.color(n.group));
            el.select(".op-body").attr("r", r);
            const ring = n.load === null ? null : { inner: r + 1.8, outer: r + 4.2 };
            el.select(".op-track").attr("d", ring ? arc({ innerRadius: ring.inner, outerRadius: ring.outer, startAngle: 0, endAngle: Math.PI * 2 } as any) : null);
            el.select(".op-ring").attr("d", ring ? arc({ innerRadius: ring.inner, outerRadius: ring.outer, startAngle: 0, endAngle: Math.PI * 2 * Math.min(1, n.load!) } as any) : null)
                .attr("class", `op-ring ${n.load === null ? "" : n.load >= 0.9 ? "ok" : n.load >= THIN ? "warn" : "bad"}`);
            el.select(".op-ini").text(r >= 10 ? (n.open ? "?" : initials(n.row.name)) : "").style("font-size", `${Math.min(13, r * 0.78)}px`);
            el.select(".op-name").attr("y", r + 15).text(n.children.length ? (n.open ? `Open · ${n.row.title ?? ""}` : mode === "org" ? shortName(n.row.name) : n.row.name ?? "") : "");
            el.select(".op-badge").style("display", n.over ? null : "none").attr("transform", `translate(${r * 0.8},${-r * 0.8})`).select("text").text(`+${n.over}`);
            const from = this.lastPt.get(n.key);
            if (ch && from && (ch.kind === "moved" || ch.kind === "orgMoved") && (Math.abs(from.x - p.x) + Math.abs(from.y - p.y) > 2)) this.trail(from, p, ch.kind, dur);
            if (ch?.kind === "hire") this.halo(p, "op-fx-hire", r, dur * 0.4);
            if (ch?.kind === "orgMoved") this.halo(p, "op-fx-org", r, dur * 0.6);
            t(el, n).attr("transform", `translate(${p.x},${p.y}) scale(1)`);
        });
        this.lastPt = new Map(s.nodes.map(n => [n.key, P(n)]));

        // cluster labels (constellation only): group name and its head, just above each cluster
        type GL = { group: string; x: number; y: number; sub: string };
        const gl: GL[] = [];
        if (mode === "constellation") {
            const rootGroup = s.roots[0]?.group;
            for (const g of this.ix!.groups) {
                if (g === rootGroup) continue;
                const ns = s.nodes.filter(n => n.group === g);
                if (!ns.length) continue;
                let cx = 0, top = Infinity;
                ns.forEach(n => { const p = P(n); cx += p.x; top = Math.min(top, p.y - radius(n)); });
                const head = ns.reduce((a, b) => (b.subtree > a.subtree ? b : a)); // biggest team, so an orphaned seat can't take the label
                gl.push({ group: g, x: cx / ns.length, y: top - 4, sub: `${head.open ? "Open seat" : head.row.name ?? ""} · ${ns.filter(n => !n.open).length} people` });
            }
        }
        const labels = this.gLabels.selectAll<SVGGElement, GL>("g.op-gl").data(gl, d => d.group);
        labels.exit().transition().duration(300).style("opacity", 0).remove();
        const lnew = labels.enter().append("g").attr("class", "op-gl").style("opacity", 0).attr("transform", d => `translate(${d.x},${d.y})`);
        const inner = lnew.append("g").attr("class", "op-gl-in");
        inner.append("text").attr("class", "op-gl-name").attr("y", -20);
        inner.append("text").attr("class", "op-gl-sub").attr("y", -6);
        lnew.merge(labels).select(".op-gl-in").attr("transform", `scale(${1 / this.k})`);
        const lall = lnew.merge(labels).style("--c", d => this.color(d.group));
        lall.select(".op-gl-name").text(d => (d.group || "(none)").toUpperCase());
        lall.select(".op-gl-sub").text(d => d.sub);
        lall.transition().duration(intro ? 900 : morph ? 600 : dur).delay(intro ? 1100 : morph ? 700 : 0).ease(d3.easeCubicInOut)
            .attr("transform", d => `translate(${d.x},${d.y})`).style("opacity", 1);

        this.applyHighlight();
        this.renderChrome(changes);
        this.renderPanel();
    }

    private halo(p: Pt, cls: string, r: number, wait = 0) {
        this.gFx.append("circle").attr("class", cls).attr("cx", p.x).attr("cy", p.y).attr("r", r).style("opacity", 0)
            .transition().delay(wait).duration(60).style("opacity", 0.9)
            .transition().duration(1100).ease(d3.easeCubicOut).attr("r", r + 26).style("opacity", 0).remove();
    }

    private trail(a: Pt, b: Pt, kind: string, dur: number) {
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.25, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.25;
        const path = this.gFx.append("path").attr("class", kind === "moved" ? "op-fx-move" : "op-fx-orgline").attr("d", `M${a.x},${a.y}Q${mx},${my} ${b.x},${b.y}`);
        const len = (path.node() as SVGPathElement).getTotalLength();
        path.attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
            .transition().duration(dur).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
            .transition().duration(1400).style("opacity", 0).remove();
    }

    private applyHighlight() {
        const s = this.snaps[this.i];
        const sel = this.selected ? s.byKey.get(this.selected) : null;
        const keep = new Set<string>();
        if (sel) {
            for (let n: SNode | null = sel; n; n = n.parent) keep.add(n.key);
            sel.children.forEach(c => keep.add(c.key));
        }
        const dim = (n: SNode) => (sel ? !keep.has(n.key) : this.hidden.has(n.group));
        this.gNodes.selectAll<SVGGElement, SNode>("g.op-n").classed("op-dim", dim).classed("op-sel", n => n.key === this.selected);
        this.gLinks.selectAll<SVGPathElement, SNode>("path").classed("op-dim", n => dim(n) || dim(n.parent!)).classed("op-hot", n => !!sel && keep.has(n.key) && keep.has(n.parent!.key));
        this.placeNames(sel, keep);
    }

    /** In focus, draw the selected chain on top and move its names off each other (below, above, right, left). */
    private placeNames(sel: SNode | null, keep: Set<string>) {
        const all = this.gNodes.selectAll<SVGGElement, SNode>("g.op-n");
        all.select(".op-name").attr("x", 0).attr("y", n => radius(n) + 15).style("text-anchor", null);
        if (!sel) return;
        const focus = all.filter(n => keep.has(n.key));
        focus.raise();
        focus.filter(n => n.key === sel.key).raise();

        type Box = { x0: number; y0: number; x1: number; y1: number };
        const taken: Box[] = [];
        focus.each(n => { const p = this.lastPt.get(n.key); if (p) { const r = radius(n) + 4.5; taken.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r }); } });
        const overlap = (b: Box) => taken.reduce((s, o) => s + Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0)), 0);
        const order = focus.nodes().map(g => d3.select<SVGGElement, SNode>(g)).sort((a, b) => (b.datum().key === sel.key ? 1 : 0) - (a.datum().key === sel.key ? 1 : 0) || a.datum().depth - b.datum().depth);
        for (const el of order) {
            const n = el.datum(), p = this.lastPt.get(n.key), node = el.select<SVGTextElement>(".op-name").node();
            const label = node?.textContent ?? "";
            if (!p || !node || !label) continue;
            const fs = parseFloat(getComputedStyle(node).fontSize) || 10;
            const measured = node.getComputedTextLength?.() ?? 0;
            const r = radius(n) + 4.5, w = (measured > 0 ? measured : label.length * fs * 0.56) + 4, h = fs * 1.2, d = fs * 0.35;
            // candidate spots: text anchor point (x, y = baseline) and the box it covers, in order of preference
            const spot = (cx: number, cy: number, anchor: "middle" | "start" | "end") => {
                const x0 = anchor === "middle" ? cx - w / 2 : anchor === "start" ? cx : cx - w;
                return { x: cx, y: cy, anchor, b: { x0: p.x + x0, y0: p.y + cy - h + d, x1: p.x + x0 + w, y1: p.y + cy + d } };
            };
            const diag = r * 0.75;
            const spots = [
                spot(0, r + h - d, "middle"), spot(0, -r - d, "middle"),
                spot(r + 2, d, "start"), spot(-r - 2, d, "end"),
                spot(diag, -diag - d, "start"), spot(-diag, -diag - d, "end"),
                spot(diag, diag + h - d, "start"), spot(-diag, diag + h - d, "end"),
                spot(0, r + 2 * h - d, "middle"), spot(0, -r - h - d, "middle"),
            ];
            let best = spots[0], bestScore = Infinity;
            for (const s of spots) { const sc = overlap(s.b); if (sc < bestScore) { best = s; bestScore = sc; if (sc === 0) break; } }
            d3.select(node).attr("x", best.x).attr("y", best.y).style("text-anchor", best.anchor);
            taken.push(best.b);
        }
    }

    private fit(dur: number) {
        const r = this.stage.getBoundingClientRect();
        if (!r.width || !this.layout.size) return;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        this.layout.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
        const pad = 40, panel = this.ui.panel.classList.contains("on") ? this.ui.panel.getBoundingClientRect().width : 0;
        if (this.mode === "constellation") y0 -= 48; // room for the cluster labels
        const W = r.width - panel, H = r.height;
        const k = Math.min(4, (W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0 + 30));
        const tr = d3.zoomIdentity.translate(W / 2 - ((x0 + x1) / 2) * k, H / 2 - ((y0 + y1) / 2) * k).scale(k);
        (dur ? this.svg.transition().duration(dur).ease(d3.easeCubicInOut) : this.svg).call(this.zoom.transform as any, tr);
        this.userZoomed = false;
    }

    // ------------------------------------------------------------ chrome: KPIs, legend, feed, time bar

    private renderChrome(changes: Map<string, Change> | null) {
        const s = this.snaps[this.i], k = s.kpi, c = this.counts[this.i];
        const dated = this.ix!.hasHistory; // static data (no dates) never claims a date
        this.ui.asOf.textContent = dated ? `as at ${fmtDay(s.day)}` : "Current structure";
        this.ui.stamp.textContent = dated ? fmtMonth(s.day) : "";
        this.ui.month.textContent = fmtMonth(s.day);
        this.range.value = String(this.i);
        this.ui.bars.style.setProperty("--at", `${(this.i / Math.max(1, this.snaps.length - 1)) * 100}%`);

        clear(this.ui.kpis);
        const kpi = (label: string, value: string, cls = "", hint = "") => {
            const e = h("div", `op-kpi ${cls}`, h("b", null, value), h("span", null, label));
            if (hint) e.title = hint;
            this.ui.kpis.appendChild(e);
        };
        kpi("people", String(k.headcount), "", `${k.onLeave} on leave`);
        kpi("open roles", String(k.open), k.open ? "warn" : "");
        kpi("staffed", pct(k.staffed), k.staffed < 0.9 ? "warn" : "", "Effective FTE (filled, not on leave) / planned FTE");
        kpi("over span", String(k.overloaded), k.overloaded ? "bad" : "", "Managers with more direct reports than their target span");
        kpi("thin teams", String(k.thin), k.thin ? "bad" : "", `Teams below ${pct(THIN)} staffed`);
        if (this.ix!.hasHistory) kpi("this month", `+${c.hires} −${c.exits} ↔${c.moves}`, "flow", "Joined, left and moved since the previous month end");

        // issues
        const n = s.issues.length;
        this.ui.issues.textContent = n ? `⚠ ${n} data issue${n > 1 ? "s" : ""}` : "✓ data checks pass";
        this.ui.issues.classList.toggle("bad", n > 0);

        // people finder
        clear(this.ui.people);
        s.nodes.filter(x => !x.open).forEach(x => { const o = document.createElement("option"); o.value = x.row.name ?? x.row.person!; o.label = where(x.row); this.ui.people.appendChild(o); });

        // legend
        clear(this.ui.legend);
        const groups = this.ix!.groups.filter(g => s.nodes.some(x => x.group === g));
        const chips = h("div", "op-chips");
        for (const g of groups) {
            const chip = h("button", `op-chip${this.hidden.has(g) ? " off" : ""}`, h("i"), `${g || "(none)"} `, h("small", null, String(s.nodes.filter(x => x.group === g && !x.open).length)));
            chip.style.setProperty("--c", this.color(g));
            chip.onclick = () => { this.hidden.has(g) ? this.hidden.delete(g) : this.hidden.add(g); if (this.hidden.size === groups.length) this.hidden.clear(); this.selected = null; this.applyHighlight(); this.renderChrome(null); };
            chips.appendChild(chip);
        }
        this.ui.legend.appendChild(chips);
        this.ui.legend.appendChild(h("div", "op-key",
            h("span", "k-open", "Open role"), h("span", "k-leave", "On leave"), h("span", "k-ring", "Team staffed"), h("span", "k-badge", "Over span")));

        // feed: notable moves this month
        if (changes) {
            const lines: { cls: string; text: string }[] = [];
            changes.forEach((ch, key) => {
                const n = s.byKey.get(key);
                const was = this.snaps[Math.max(0, this.i - 1)].byKey.get(key);
                const who = n ?? was;
                if (!who || who.open) return;
                const senior = (who.children.length > 0) || (was?.children.length ?? 0) > 0;
                const name = who.row.name ?? "";
                if (ch.kind === "moved" && (senior || /promot/i.test(ch.reason ?? ""))) lines.push({ cls: "you", text: `${name}: ${/promot/i.test(ch.reason ?? "") ? "promoted to" : "moved to"} ${where(who.row)}` });
                else if (ch.kind === "orgMoved" && senior) lines.push({ cls: "org", text: `${name}: reorg, now under ${n?.parent?.row.name ?? "an open seat"}` });
                else if (ch.kind === "exit" && senior) lines.push({ cls: "exit", text: `${name} left (${where(who.row)})` });
                else if (ch.kind === "hire" && senior) lines.push({ cls: "you", text: `${name} joined as ${where(who.row)}` });
            });
            const newTeams = s.nodes.filter(x => x.children.length && changes.get(x.key)?.kind === "seatNew").length;
            if (newTeams) lines.push({ cls: "info", text: `${newTeams} new team lead seat${newTeams > 1 ? "s" : ""} opened` });
            for (const l of lines.slice(0, 4)) {
                const e = h("div", `op-feed-item ${l.cls}`, h("small", null, fmtMonth(s.day)), l.text);
                this.ui.feed.insertBefore(e, this.ui.feed.firstChild);
                window.setTimeout(() => e.classList.add("gone"), 4200);
                window.setTimeout(() => e.remove(), 5200);
            }
            while (this.ui.feed.children.length > 6) this.ui.feed.lastChild!.remove();
        }
    }

    private drawTrack() {
        clear(this.ui.bars); clear(this.ui.years);
        const n = this.counts.length;
        if (n < 2) return;
        const max = Math.max(1, ...this.counts.map(c => Math.max(c.hires, c.exits)));
        this.counts.forEach((c, k) => {
            const col = h("div", "op-bar");
            col.style.left = `${(k / (n - 1)) * 100}%`;
            const up = h("i", "up"), down = h("i", "down");
            up.style.height = `${(c.hires / max) * 50}%`;
            down.style.height = `${(c.exits / max) * 50}%`;
            col.appendChild(up); col.appendChild(down);
            col.title = `${fmtMonth(this.snaps[k].day)}: ${c.hires} joined, ${c.exits} left, ${c.moves} moved`;
            this.ui.bars.appendChild(col);
        });
        let last = -1;
        this.snaps.forEach((s, k) => {
            const y = yearOf(s.day);
            if (y !== last) { const e = h("span", null, String(y)); e.style.left = `${(k / (n - 1)) * 100}%`; this.ui.years.appendChild(e); last = y; }
        });
    }

    // ------------------------------------------------------------ tooltip, selection, profile panel

    private tip(e: MouseEvent, n: SNode) {
        const r = this.stage.getBoundingClientRect(), tip = this.ui.tip;
        clear(tip);
        tip.appendChild(h("b", null, n.open ? `Open role: ${n.row.title ?? ""}` : n.row.name ?? ""));
        tip.appendChild(h("div", null, n.open ? n.row.team ?? "" : where(n.row, " · ")));
        if (n.leave) tip.appendChild(h("div", "warn", "On leave"));
        if (n.children.length) {
            tip.appendChild(h("div", n.over ? "bad" : null, `Direct reports ${n.span}${n.target ? ` / target ${n.target}` : ""}${n.over ? ` (+${n.over})` : ""}`));
            tip.appendChild(h("div", n.thin ? "bad" : null, `Team staffed ${pct(n.load)} · ${n.subtree - 1} seats below`));
        }
        tip.style.display = "block";
        const x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
        tip.style.left = `${Math.min(x, r.width - tip.offsetWidth - 8)}px`;
        tip.style.top = `${Math.min(y, r.height - tip.offsetHeight - 8)}px`;
    }

    private select(key: string | null) {
        this.selected = key;
        this.showIssues = false;
        this.applyHighlight();
        this.renderPanel();
        const n = key ? this.snaps[this.i].byKey.get(key) : null;
        this.opts.onSelect?.(n && !n.open ? n.row.person : null);
    }

    private find(text: string) {
        const q = text.trim().toLowerCase();
        if (!q) return;
        const s = this.snaps[this.i];
        const n = s.nodes.find(x => (x.row.name ?? "").toLowerCase() === q) ?? s.nodes.find(x => (x.row.name ?? "").toLowerCase().includes(q));
        if (!n) return;
        this.select(n.key);
        const p = this.layout.get(n.pos)!, r = this.stage.getBoundingClientRect();
        const k = Math.max(1.6, d3.zoomTransform(this.svg.node()!).k);
        const pw = this.ui.panel.getBoundingClientRect().width || 320;
        this.svg.transition().duration(800).call(this.zoom.transform as any, d3.zoomIdentity.translate((r.width - pw) / 2 - p.x * k, r.height / 2 - p.y * k).scale(k));
        this.userZoomed = true; // a search zoom is the user's own: resizes must not snap back to fit-all
    }

    private renderPanel() {
        const panel = this.ui.panel, s = this.snaps[this.i];
        clear(panel);
        const close = h("button", "op-close", "×");
        close.onclick = () => this.select(null);
        const row = (label: string, value: string | Node | null, cls = "") => (value ? h("div", `op-row ${cls}`, h("span", null, label), typeof value === "string" ? h("b", null, value) : value) : null);
        const link = (name: string, person: string | null) => {
            const a = h("a", null, name);
            if (person) a.onclick = () => { const n = s.byPerson.get(person); if (n) this.select(n.key); };
            return a;
        };

        if (this.showIssues) {
            panel.appendChild(close);
            panel.appendChild(h("h4", null, s.issues.length ? `${s.issues.length} data issue${s.issues.length > 1 ? "s" : ""}` : "No data issues"));
            panel.appendChild(h("p", "op-muted", `${this.ix!.hasHistory ? `Checked on ${fmtDay(s.day)}` : "Checked"}: overlapping rows, one person in two seats, managers missing on the date, reporting loops, more than one top seat.`));
            for (const is of s.issues) {
                const e = h("div", "op-issue", h("b", null, is.kind), is.text);
                if (is.pos) e.onclick = () => { const n = s.byPos.get(is.pos!); if (n) this.select(n.key); };
                panel.appendChild(e);
            }
            panel.classList.add("on");
            return;
        }
        const n = this.selected ? s.byKey.get(this.selected) : null;
        if (!this.selected) { panel.classList.remove("on"); return; }
        panel.appendChild(close);
        panel.classList.add("on");

        // a filled seat can carry a seat key ("s:…") when its person also sits in another seat (data issue)
        const person = this.selected.startsWith("p:") ? this.selected.slice(2) : n && !n.open ? n.row.person : null;
        if (person && n && this.selected.startsWith("s:")) panel.appendChild(h("div", "op-pill exit", `Data issue: also sits in another seat (this one is ${n.row.title ?? "seat"} ${n.pos})`));
        if (person) {
            const pr = profile(this.ix!, s, person);
            if (!pr) { panel.appendChild(h("p", "op-muted", `Not in the organisation on ${fmtDay(s.day)}.`)); return; }
            const avatar = h("div", "op-avatar", initials(pr.name));
            avatar.style.setProperty("--c", this.color(pr.row?.group ?? ""));
            panel.appendChild(h("div", "op-who", avatar, h("div", null, h("h4", null, pr.name), h("div", "op-muted", where(pr.row, " · ")))));
            if (pr.left !== null) panel.appendChild(h("div", "op-pill exit", `Left on ${fmtDay(pr.left)}`));
            else if (n?.leave) panel.appendChild(h("div", "op-pill warn", "On leave"));
            panel.appendChild(h("div", "op-rows",
                pr.manager ? row("Reports to", pr.manager.person ? link(pr.manager.name, pr.manager.person) : pr.manager.name) : row("Reports to", "Nobody (top of the organisation)"),
                n?.children.length ? row("Direct reports", `${n.span}${n.target ? ` / target ${n.target}` : ""}`, n.over ? "bad" : "") : null,
                n?.children.length ? row("Team staffed", `${pct(n.load)} of ${n.subtree - 1} seats`, n.thin ? "bad" : "") : null,
                pr.since !== null ? row("In this seat since", fmtDay(pr.since)) : null,
                pr.joined !== null ? row("First seen", fmtDay(pr.joined)) : null));
            if (!this.ix!.hasHistory) {
                // no dates: we can't know previous teams or managers, so don't claim "same throughout"
                panel.appendChild(h("p", "op-muted", "No history in this data. Add Valid from and Valid to to see previous teams, previous managers and moves."));
                return;
            }
            const prev = h("div", "op-prev");
            prev.appendChild(h("div", "op-prev-card", h("span", null, "Previous team"), pr.prevTeam ? h("b", null, pr.prevTeam.team) : h("b", "op-muted", "Same team throughout"),
                pr.prevTeam ? h("small", null, `until ${pr.prevTeam.until !== null ? fmtDay(pr.prevTeam.until) : "–"}${pr.prevTeam.reason ? ` · ${pr.prevTeam.reason}` : ""}`) : null));
            prev.appendChild(h("div", "op-prev-card", h("span", null, "Previous manager"), pr.prevManager ? link(pr.prevManager.name, pr.prevManager.person) : h("b", "op-muted", "Same manager throughout"),
                pr.prevManager ? h("small", null, `until ${pr.prevManager.until !== null ? fmtDay(pr.prevManager.until) : "–"}`) : null,
                pr.prevManager ? h("em", pr.prevManager.kind, pr.prevManager.kind === "you" ? "You moved" : "The org moved around you") : null));
            panel.appendChild(prev);
            panel.appendChild(h("h5", null, "History"));
            const list = h("ol", "op-events");
            for (const ev of pr.events) {
                const li = h("li", ev.kind, h("small", null, ev.day !== null ? fmtDay(ev.day) : "–"), ev.person ? link(ev.text, ev.person) : ev.text);
                list.appendChild(li);
            }
            panel.appendChild(list);
            return;
        }
        if (!n) { panel.appendChild(h("p", "op-muted", `This seat isn't live on ${fmtDay(s.day)}.`)); return; }
        const hist = seatHistory(this.ix!, n.pos, s.day);
        panel.appendChild(h("div", "op-who", h("div", "op-avatar open", "?"), h("div", null, h("h4", null, `Open role`), h("div", "op-muted", where(n.row, " · ")))));
        panel.appendChild(h("div", "op-rows",
            row("Reports to", n.parent ? (n.parent.open ? `Open seat (${n.parent.row.title})` : link(n.parent.row.name ?? "", n.parent.row.person)) : "Nobody"),
            hist.openSince !== null ? row("Open since", fmtDay(hist.openSince)) : null,
            row("Last held by", hist.lastHolder ? link(hist.lastHolder.name ?? hist.lastHolder.person!, hist.lastHolder.person) : "Nobody yet (new seat)"),
            hist.lastHolder?.to != null ? row("Until", fmtDay(hist.lastHolder.to)) : null,
            n.children.length ? row("Seats below", `${n.subtree - 1}, ${pct(n.load)} staffed`, n.thin ? "bad" : "") : null));
    }
}
