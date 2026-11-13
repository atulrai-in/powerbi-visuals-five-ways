// Org Pulse prototype: feeds the shared core (compiled to ./build) with the Brightvale CSVs,
// joined the way the Power BI field wells will deliver them. ?theme=light for the light theme.
import * as d3 from "d3";
import { OrgPulseView } from "./build/view.js";
import { dayFromISO, fmtDay } from "./build/model.js";

const status = document.getElementById("status");
const app = document.getElementById("app");
const load = name => d3.csv(`../../../data/${name}.csv`);
const [timeline, people, teams, positions] = await Promise.all(["OrgTimeline", "People", "Teams", "Positions"].map(load));
const byId = (rows, key) => new Map(rows.map(r => [r[key], r]));
const P = byId(people, "PersonID"), T = byId(teams, "TeamID"), S = byId(positions, "PositionID");

const rows = timeline.map(r => ({
    position: r.PositionID,
    reportsTo: r.ReportsToPositionID || null,
    person: r.PersonID || null,
    name: P.get(r.PersonID)?.PersonName ?? null,
    from: dayFromISO(r.ValidFrom),
    to: dayFromISO(r.ValidTo),
    team: T.get(r.TeamID)?.TeamName ?? null,
    group: T.get(r.TeamID)?.Region ?? null,
    title: S.get(r.PositionID)?.Title ?? null,
    status: r.Status,
    reason: r.ChangeReason,
    fte: +r.FTE || 0,
    targetSpan: +(S.get(r.PositionID)?.TargetSpan ?? 0) || null,
}));

const params = new URLSearchParams(location.search);

// Test modes. ?static=1: only the rows live on 31 Oct 2026, with no dates (a plain org chart export).
// ?bad=1: plant one of each data issue the checker looks for. ?feed=0: hide the change feed.
let data = rows;
if (params.get("static")) {
    const d = dayFromISO("2026-10-31");
    data = rows.filter(r => (r.from === null || r.from <= d) && (r.to === null || r.to >= d)).map(r => ({ ...r, from: null, to: null, reason: null }));
}
if (params.get("bad")) {
    const d = dayFromISO("2026-10-31");
    const live = data.filter(r => (r.from === null || r.from <= d) && (r.to === null || r.to >= d));
    const filled = live.filter(r => r.person && !(r.title ?? "").includes("Chief"));
    const [a, b, c, e] = [filled[40], filled[120], filled[200], filled[300]];
    data = data.map(r => (r === b ? { ...r, reportsTo: "9999" } : r));                          // Orphan: reports to a seat that doesn't exist
    data.push({ ...c, position: "8001", reportsTo: c.reportsTo });                              // Two seats: same person in a second seat
    const loopA = live.find(r => r.title === "Store Manager" && r !== a), loopB = live.find(r => r.reportsTo === loopA.position);
    data = data.map(r => (r === loopA ? { ...r, reportsTo: loopB.position } : r));              // Loop: an SM reports to their own ASM
    data.push({ ...e, from: e.from ?? null, person: null, name: null, status: "Open" });        // Overlap: a second live row for the same seat
    console.log("planted issues around", { orphan: b.name, twoSeats: c.name, loop: loopA.name, overlap: e.name });
}
const view = new OrgPulseView(app, {
    onCommit: d => (status.textContent = `onCommit → the visual would filter the page to ${fmtDay(d)}`),
    onSelect: p => console.log("selected", p),
});
view.setTitle("Brightvale · Sales organisation");
if (params.get("feed") === "0") view.setFeed(false);
if (params.get("theme") === "light") { view.setTheme("light"); document.body.style.background = "#fff"; }
const t0 = performance.now();
view.setData(data);
status.textContent = `${data.length} timeline rows · ready in ${Math.round(performance.now() - t0)} ms`;
new ResizeObserver(() => view.resize()).observe(app);
window.view = view;
