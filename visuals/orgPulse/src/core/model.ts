// Org Pulse core: data model. No Power BI imports, so the browser prototype and the visual share it.
// Seats (positions) form the hierarchy; people fill seats over time. One row = one seat for one period.

export type Day = number; // whole days since 1970-01-01 (calendar date, no time zone)
const DAY_MS = 864e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const toDay = (d: Date): Day => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
export const dayFromISO = (s: string | null | undefined): Day | null => {
    const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : null;
};
const parts = (day: Day) => { const d = new Date(day * DAY_MS); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
export const localDate = (day: Day) => { const p = parts(day); return new Date(p.y, p.m, p.d); };
export const fmtDay = (day: Day) => { const p = parts(day); return `${p.d} ${MON[p.m]} ${p.y}`; };
export const fmtMonth = (day: Day) => { const p = parts(day); return `${MON[p.m]} ${p.y}`; };
export const yearOf = (day: Day) => parts(day).y;
const monthEnd = (y: number, m: number): Day => Math.round(Date.UTC(y, m + 1, 0) / DAY_MS);

export interface SeatRow {
    position: string;
    reportsTo: string | null;
    person: string | null;   // null = open seat
    name: string | null;
    from: Day | null;        // null = since forever
    to: Day | null;          // inclusive; null = still current
    team: string | null;
    group: string | null;    // "Colour by"
    title: string | null;
    status: string | null;   // Filled / Open / On leave (free text, matched loosely)
    reason: string | null;   // why this row started: Hire, Promotion, Transfer, Reorg, Leave, ...
    fte: number;
    targetSpan: number | null;
}

const YOU_MOVED = /hire|promot|transfer|new role|join/i;
const ORG_MOVED = /reorg|restruct/i;
export const isOpen = (r: SeatRow) => !r.person || /open|vacan/i.test(r.status ?? "");
export const isLeave = (r: SeatRow) => !!r.person && /leave/i.test(r.status ?? "") && !/back/i.test(r.status ?? "");
const live = (r: SeatRow, day: Day) => (r.from === null || r.from <= day) && (r.to === null || r.to >= day);
const cmpId = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// ---------------------------------------------------------------- index

export interface Index {
    rows: SeatRow[];
    byPos: Map<string, SeatRow[]>;
    byPerson: Map<string, SeatRow[]>;
    names: Map<string, string>;
    months: Day[];          // month ends covered by the data (a single "today" entry when there's no history)
    hasHistory: boolean;
    groups: string[];       // ordered for the legend
}

export function buildIndex(rows: SeatRow[]): Index {
    const byPos = new Map<string, SeatRow[]>(), byPerson = new Map<string, SeatRow[]>(), names = new Map<string, string>();
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) {
        (byPos.get(r.position) ?? byPos.set(r.position, []).get(r.position)!).push(r);
        if (r.person) {
            (byPerson.get(r.person) ?? byPerson.set(r.person, []).get(r.person)!).push(r);
            if (r.name) names.set(r.person, r.name);
        }
        for (const d of [r.from, r.to]) if (d !== null) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    const byFrom = (a: SeatRow, b: SeatRow) => (a.from ?? -Infinity) - (b.from ?? -Infinity);
    byPos.forEach(v => v.sort(byFrom));
    byPerson.forEach(v => v.sort(byFrom));

    const months: Day[] = [];
    const hasHistory = isFinite(lo) && hi > lo;
    if (hasHistory) {
        const a = parts(lo), b = parts(hi);
        for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m === 11 ? (y++, m = 0) : m++) months.push(monthEnd(y, m));
        if (months.length > 120) months.splice(0, months.length - 120); // keep the latest 10 years
    } else months.push(isFinite(hi) ? hi : toDay(new Date()));

    // groups: the root's group first, then by size
    const count = new Map<string, number>();
    rows.forEach(r => count.set(r.group ?? "", (count.get(r.group ?? "") ?? 0) + 1));
    const rootGroup = rows.find(r => !r.reportsTo)?.group ?? "";
    const groups = [...count.keys()].sort((a, b) => (a === rootGroup ? -1 : b === rootGroup ? 1 : count.get(b)! - count.get(a)!));
    return { rows, byPos, byPerson, names, months, hasHistory, groups };
}

// ---------------------------------------------------------------- snapshot

export interface SNode {
    key: string;              // person key ("p:…") when filled, seat key ("s:…") when open: people fly between seats
    pos: string;
    row: SeatRow;
    parent: SNode | null;
    children: SNode[];
    depth: number;
    subtree: number;          // seats in this subtree, self included
    open: boolean;
    leave: boolean;
    group: string;
    span: number;             // direct reports (open seats count)
    target: number | null;
    over: number;             // span above target, 0 if fine
    load: number | null;      // effective / planned FTE of everyone below (null for leaves)
    thin: boolean;
}

export interface Issue { kind: string; text: string; pos?: string }
export interface Kpi { headcount: number; open: number; onLeave: number; planned: number; effective: number; staffed: number; overloaded: number; thin: number }
export interface Snapshot { day: Day; nodes: SNode[]; byPos: Map<string, SNode>; byKey: Map<string, SNode>; byPerson: Map<string, SNode>; roots: SNode[]; issues: Issue[]; kpi: Kpi }

export const THIN = 0.8;

export function snapshot(ix: Index, day: Day): Snapshot {
    const issues: Issue[] = [];
    const nodes: SNode[] = [], byPos = new Map<string, SNode>(), byKey = new Map<string, SNode>(), byPerson = new Map<string, SNode>();
    const label = (r: SeatRow) => `${r.title ?? "Seat"} ${r.position}${r.team ? ` (${r.team})` : ""}`;

    for (const [pos, rs] of ix.byPos) {
        const here = ix.hasHistory ? rs.filter(r => live(r, day)) : rs.slice(-1);
        if (!here.length) continue;
        if (here.length > 1) issues.push({ kind: "Overlap", text: `${label(here[0])} has ${here.length} rows on this date`, pos });
        const row = here[here.length - 1];
        const open = isOpen(row);
        let key = open ? `s:${pos}` : `p:${row.person}`;
        if (!open && byPerson.has(row.person!)) {
            issues.push({ kind: "Two seats", text: `${row.name ?? row.person} sits in two seats`, pos });
            key = `s:${pos}`;
        }
        const n: SNode = { key, pos, row, parent: null, children: [], depth: 0, subtree: 1, open, leave: !open && isLeave(row), group: row.group ?? "", span: 0, target: row.targetSpan, over: 0, load: null, thin: false };
        nodes.push(n); byPos.set(pos, n); byKey.set(key, n);
        if (!open && key.startsWith("p:")) byPerson.set(row.person!, n);
    }
    nodes.sort((a, b) => cmpId(a.pos, b.pos));

    for (const n of nodes) {
        const p = n.row.reportsTo;
        if (!p) continue;
        const parent = byPos.get(p);
        if (parent && parent !== n) n.parent = parent;
        else issues.push({ kind: "Orphan", text: `${label(n.row)} reports to seat ${p}, which ${parent ? "is itself" : "isn't live on this date"}`, pos: n.pos });
    }
    // cut cycles
    const state = new Map<SNode, number>();
    for (const start of nodes) {
        const path: SNode[] = [];
        let n: SNode | null = start;
        while (n && !state.get(n)) { state.set(n, 1); path.push(n); n = n.parent; }
        if (n && state.get(n) === 1) {
            const last = path[path.length - 1];
            issues.push({ kind: "Loop", text: `Reporting loop through ${label(last.row)}`, pos: last.pos });
            last.parent = null;
        }
        path.forEach(p => state.set(p, 2));
    }
    for (const n of nodes) if (n.parent) n.parent.children.push(n);
    const roots = nodes.filter(n => !n.parent);
    if (roots.length > 1) issues.push({ kind: "Roots", text: `${roots.length} seats have no manager on this date` });

    // depth, subtree and load (post-order)
    let headcount = 0, open = 0, onLeave = 0, planned = 0, effective = 0, overloaded = 0, thin = 0;
    const walk = (n: SNode, depth: number): [number, number] => {
        n.depth = depth;
        let plan = 0, eff = 0;
        n.subtree = 1;
        for (const c of n.children) {
            const [p, e] = walk(c, depth + 1);
            plan += p + c.row.fte; eff += e + (c.open || c.leave ? 0 : c.row.fte);
            n.subtree += c.subtree;
        }
        n.span = n.children.length;
        n.over = n.target && n.span > n.target ? n.span - n.target : 0;
        n.load = plan > 0 ? eff / plan : null;
        n.thin = n.load !== null && n.load < THIN && n.subtree > 3;
        return [plan, eff];
    };
    roots.forEach(r => walk(r, 0));
    for (const n of nodes) {
        if (n.open) open++; else headcount++;
        if (n.leave) onLeave++;
        planned += n.row.fte;
        if (!n.open && !n.leave) effective += n.row.fte;
        if (n.over) overloaded++;
        if (n.thin && !(n.parent?.thin)) thin++;
    }
    const kpi = { headcount, open, onLeave, planned, effective, staffed: planned ? effective / planned : 0, overloaded, thin };
    return { day, nodes, byPos, byKey, byPerson, roots, issues, kpi };
}

// ---------------------------------------------------------------- change between two snapshots

export type ChangeKind = "hire" | "exit" | "moved" | "orgMoved" | "leave" | "back" | "seatNew" | "seatGone";
export interface Change { kind: ChangeKind; reason: string | null; fromPos?: string }

export function diff(a: Snapshot | null, b: Snapshot): Map<string, Change> {
    const out = new Map<string, Change>();
    if (!a) return out;
    for (const n of b.nodes) {
        const was = a.byKey.get(n.key);
        if (!was) { out.set(n.key, { kind: n.open ? "seatNew" : "hire", reason: n.row.reason }); continue; }
        if (n.open) continue;
        if (was.pos !== n.pos) out.set(n.key, { kind: ORG_MOVED.test(n.row.reason ?? "") ? "orgMoved" : "moved", reason: n.row.reason, fromPos: was.pos });
        else if ((was.parent?.key ?? null) !== (n.parent?.key ?? null)) out.set(n.key, { kind: "orgMoved", reason: n.row.reason });
        else if (n.leave && !was.leave) out.set(n.key, { kind: "leave", reason: n.row.reason });
        else if (!n.leave && was.leave) out.set(n.key, { kind: "back", reason: n.row.reason });
    }
    for (const n of a.nodes) if (!b.byKey.has(n.key)) out.set(n.key, { kind: n.open ? "seatGone" : "exit", reason: null });
    return out;
}

// ---------------------------------------------------------------- person profile

export interface ProfileEvent { day: Day | null; kind: "you" | "org" | "info" | "exit"; text: string; person?: string }
export interface Profile {
    person: string;
    name: string;
    node: SNode | null;
    row: SeatRow | null;           // current row, or the last one if they've left
    left: Day | null;
    since: Day | null;             // in this seat since
    joined: Day | null;
    manager: { person: string | null; name: string } | null;
    prevTeam: { team: string; until: Day | null; reason: string | null } | null;
    prevManager: { person: string; name: string; until: Day | null; kind: "you" | "org" } | null;
    events: ProfileEvent[];
}

interface MgrSpan { person: string | null; start: Day | null; end: Day | null; ownRow: SeatRow }

export function profile(ix: Index, snap: Snapshot, person: string): Profile | null {
    const rows = (ix.byPerson.get(person) ?? []).filter(r => r.from === null || r.from <= snap.day);
    if (!rows.length) return null;
    const name = ix.names.get(person) ?? person;
    const node = snap.byPerson.get(person) ?? null;
    const row = node?.row ?? rows[rows.length - 1];
    const left = node ? null : row.to;
    const nameOf = (p: string | null) => (p ? ix.names.get(p) ?? p : "nobody (seat open)");

    // who managed them, over time
    const spans: MgrSpan[] = [];
    for (const r of rows) {
        const end = r.to === null || r.to > snap.day ? snap.day : r.to;
        const parents = r.reportsTo ? ix.byPos.get(r.reportsTo) ?? [] : [];
        let any = false;
        for (const p of parents) {
            if ((p.to !== null && r.from !== null && p.to < r.from) || (p.from !== null && p.from > end)) continue;
            const start = r.from === null ? p.from : p.from === null ? r.from : Math.max(r.from, p.from);
            spans.push({ person: isOpen(p) ? null : p.person, start, end: p.to === null ? end : Math.min(p.to, end), ownRow: r });
            any = true;
        }
        if (!any && r.reportsTo === null) spans.push({ person: null, start: r.from, end, ownRow: r });
    }
    spans.sort((a, b) => (a.start ?? -Infinity) - (b.start ?? -Infinity));
    const merged: MgrSpan[] = [];
    for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && last.person === s.person) last.end = s.end; else merged.push({ ...s });
    }
    const cur = merged[merged.length - 1];
    const manager = row.reportsTo ? { person: cur?.person ?? null, name: nameOf(cur?.person ?? null) } : null;
    let prevManager: Profile["prevManager"] = null;
    for (let i = merged.length - 1; i > 0; i--) {
        const prev = merged[i - 1];
        if (prev.person && prev.person !== cur.person) {
            const change = merged[i];
            const you = change.ownRow.from === change.start && YOU_MOVED.test(change.ownRow.reason ?? "");
            prevManager = { person: prev.person, name: nameOf(prev.person), until: prev.end, kind: you ? "you" : "org" };
            break;
        }
    }

    // team history
    let prevTeam: Profile["prevTeam"] = null;
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].team && rows[i].team !== row.team) { prevTeam = { team: rows[i].team!, until: rows[i].to, reason: rows[i + 1]?.reason ?? null }; break; }
    }
    let since = row.from;
    for (let i = rows.indexOf(row) - 1; i >= 0 && rows[i].position === row.position; i--) since = rows[i].from;

    // events, newest first
    const events: ProfileEvent[] = [];
    rows.forEach((r, i) => {
        const where_ = where(r);
        const reason = r.reason ?? "";
        const prev = rows[i - 1];
        if (prev && prev.position === r.position && /leave/i.test(reason)) events.push({ day: r.from, kind: "info", text: /back/i.test(reason) ? "Back from leave" : "Went on leave" });
        else if (/hire|join/i.test(reason)) events.push({ day: r.from, kind: "you", text: `Joined as ${where_}` });
        else if (/promot/i.test(reason)) events.push({ day: r.from, kind: "you", text: `Promoted to ${where_}` });
        else if (/transfer/i.test(reason)) events.push({ day: r.from, kind: "you", text: `Moved to ${where_}` });
        else if (ORG_MOVED.test(reason)) events.push({ day: r.from, kind: "org", text: `Reorg: now ${where_}` });
        else if (!prev) events.push({ day: r.from, kind: "info", text: `${ix.hasHistory ? "In post as" : ""} ${where_}`.trim() });
        else if (prev.position !== r.position) events.push({ day: r.from, kind: "you", text: `New seat: ${where_}` });
    });
    for (let i = 1; i < merged.length; i++) {
        const m = merged[i];
        if (m.ownRow.from === m.start && YOU_MOVED.test(m.ownRow.reason ?? "")) continue; // their own move already says it
        events.push({ day: m.start, kind: "org", text: m.person ? `New manager: ${nameOf(m.person)}` : "Manager's seat became vacant", person: m.person ?? undefined });
    }
    if (left !== null) events.push({ day: left, kind: "exit", text: "Left the organisation" });
    events.sort((a, b) => (b.day ?? -Infinity) - (a.day ?? -Infinity));
    return { person, name, node, row, left, since, joined: rows[0].from, manager, prevTeam, prevManager, events };
}

// who sat in an open seat before
export function seatHistory(ix: Index, pos: string, day: Day) {
    const rs = (ix.byPos.get(pos) ?? []).filter(r => r.from === null || r.from <= day);
    const cur = rs[rs.length - 1];
    let openSince = cur?.from ?? null;
    for (let i = rs.length - 2; i >= 0 && isOpen(rs[i]); i--) openSince = rs[i].from;
    const lastHolder = [...rs].reverse().find(r => !isOpen(r)) ?? null;
    return { openSince, lastHolder, created: rs[0]?.from ?? null };
}

/** "Title, Team", dropping the team when the title already names it ("District Manager, Texas"). */
export const where = (r: { title: string | null; team: string | null } | null | undefined, sep = ", ") =>
    !r ? "" : r.title && r.team && r.title.includes(r.team) ? r.title : [r.title, r.team].filter(Boolean).join(sep);
export const shortName = (name: string | null) => { const w = (name ?? "").trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0] ?? ""; };

/** Stable pseudo-random number in [0, 1) from a string: repeatable layouts, no Math.random. */
export const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10007) / 10007; };

export const initials = (name: string | null) => {
    if (!name) return "";
    const w = name.trim().split(/\s+/);
    return ((w[0]?.[0] ?? "") + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
};
