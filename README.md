# Power BI visuals, five ways

Code for a five-post LinkedIn series. It builds the same kind of insight five ways, from built-in visuals to a custom visual written in TypeScript:

| # | Approach | The story it shows | Page in the report |
|---|---|---|---|
| 1 | Native visuals, pushed hard: field parameters, a calculation group, measure-driven colours | The West region looks flat, but like-for-like stores are down | Post 1 · Native |
| 2 | SVG images drawn by DAX inside a table: sparklines, bullets, status pills | Spot the failing store and the new stores ramping up | Post 2 · DAX SVG |
| 3 | Deneb (Vega-Lite) heatmaps: hour × weekday, and a calendar | When customers actually shop, and how big Black Friday is | Post 3 · Deneb |
| 4 | Interactive Deneb: click to filter, cross-highlight, hover readout, slicer-driven chart | Who pays the bills, and what the biggest sale cost | Post 4 · Interactive |
| 5 | A custom visual in TypeScript + D3, packaged as a .pbiviz | The fastest-growing category can't stay in stock | Post 5 · Custom visual |

**The data is synthetic.** "Brightvale Stores" is a made-up retailer generated with Claude: 36 stores plus an online shop, Jan 2023 to Oct 2026, about 273,000 sales lines, and 12 stories planted on purpose (see [data/README.md](data/README.md)). Any resemblance to a real retailer is coincidental.

## Where each post's code lives

| Post | Files |
|---|---|
| 1 | [scripts/build-post1.mjs](scripts/build-post1.mjs) (page), [scripts/build-model.mjs](scripts/build-model.mjs) (field parameters, calculation group, measures) |
| 2 | [scripts/measures-post2.mjs](scripts/measures-post2.mjs) (the SVG measures), [scripts/build-post2.mjs](scripts/build-post2.mjs) |
| 3 | [scripts/deneb/post3-rhythm.vl.json](scripts/deneb/post3-rhythm.vl.json), [post3-calendar.vl.json](scripts/deneb/post3-calendar.vl.json), [post3.config.json](scripts/deneb/post3.config.json), [scripts/build-post3.mjs](scripts/build-post3.mjs) |
| 4 | [scripts/deneb/post4-tiers.vl.json](scripts/deneb/post4-tiers.vl.json), [post4-pareto.vl.json](scripts/deneb/post4-pareto.vl.json), [post4-promo.vl.json](scripts/deneb/post4-promo.vl.json), [scripts/measures-post4.mjs](scripts/measures-post4.mjs), [scripts/build-post4.mjs](scripts/build-post4.mjs) |
| 5 | [visuals/demandVsStock/](visuals/demandVsStock) (`src/render.ts` drawing, `src/visual.ts` Power BI wiring, `src/settings.ts` Format pane, `capabilities.json` field wells), [scripts/build-post5.mjs](scripts/build-post5.mjs), [scripts/custom-visual.mjs](scripts/custom-visual.mjs) |

Screenshots of each page are in [posts/](posts).

## Org Pulse: an animated org chart (follow-up series)

[visuals/orgPulse/](visuals/orgPulse) is a second custom visual: Brightvale's sales org (about 500 people in 522 seats) played month by month, Jan 2023 to Oct 2026. Page "14.2 · Org Pulse" in the report.

- **Two layouts with a morph between them:** a constellation of regions, and a compact org chart. People fly between seats during playback, and open roles show as dashed rings.
- **Profiles:** click or search anyone to see their team's staffing, when they took the seat, their previous team, and their previous manager, tagged "You moved" or "The org moved around you".
- **The page follows the visual:** when playback pauses, the visual filters a disconnected 'As Of' date table, so every people measure on the page (the KPI cards) jumps to that month.

| Part | Files |
|---|---|
| The visual | [src/core/model.ts](visuals/orgPulse/src/core/model.ts) (seats over time, profiles, "you moved"), [src/core/layout.ts](visuals/orgPulse/src/core/layout.ts) (both layouts), [src/core/view.ts](visuals/orgPulse/src/core/view.ts) (D3 drawing, playback, search), [src/visual.ts](visuals/orgPulse/src/visual.ts) (Power BI wiring and the page date filter), [src/settings.ts](visuals/orgPulse/src/settings.ts), [capabilities.json](visuals/orgPulse/capabilities.json) |
| The data | [scripts/generate-people.mjs](scripts/generate-people.mjs) writes `data/People.csv`, `Teams.csv`, `Positions.csv`, `OrgTimeline.csv` and `Movements.csv` (one row per seat per period; a blank person is an open role). It has its own seed, so the retail CSVs are unchanged |
| The model and page | [scripts/measures-people.mjs](scripts/measures-people.mjs) (the 'As Of' table and the 15 people measures), [scripts/build-model.mjs](scripts/build-model.mjs), [scripts/build-orgpulse.mjs](scripts/build-orgpulse.mjs) |
| A browser prototype | [visuals/orgPulse/prototype/](visuals/orgPulse/prototype): the same drawing code on the CSVs, without Power BI |

Tested in Power BI Desktop (Nov 2026), not yet in the Power BI service. The people data is as synthetic as the rest: every name, seat and move was generated with Claude.

## Layout

```
Brightvale Retail.pbip            open this in Power BI Desktop
Brightvale Retail.SemanticModel/  the model as TMDL (20 tables, 22 relationships, 66 measures)
Brightvale Retail.Report/         the report as PBIR JSON (one folder per page)
data/                             the synthetic CSVs + the 12 planted stories
scripts/                          generators: data, model, and one script per report page
visuals/demandVsStock/            post 5's custom visual (TypeScript)
visuals/orgPulse/                 Org Pulse, the animated org chart (TypeScript + D3)
posts/                            screenshots of the pages
```

## Open it

1. Install Power BI Desktop (a recent version: PBIP, TMDL and PBIR are generally available).
2. Clone the repo and open `Brightvale Retail.pbip`.
3. The model reads the CSVs from a `DataFolder` parameter that points at the original machine. In Desktop, go to **Transform data → Edit parameters**, set `DataFolder` to your clone's `data\` folder (with the trailing backslash), then **Refresh**.
4. Posts 3 and 4 use [Deneb](https://deneb-viz.github.io/), a free certified visual from AppSource. Post 5's visual and Org Pulse are included in the report.

## Rebuild it

The report and model are written by Node scripts (Node 18 or later, no npm packages needed). Close Power BI Desktop before running them.

```bash
node scripts/generate-retail-data.mjs   # data/*.csv (seeded, so the output is always the same)
node scripts/generate-people.mjs        # the five people CSVs for Org Pulse (also seeded)
node scripts/build-model.mjs            # Brightvale Retail.SemanticModel (TMDL)
node scripts/build-post1.mjs            # one script per page, post 1 to 5
```

The custom visual:

```bash
cd visuals/demandVsStock
npm install
npx pbiviz package    # dist/*.pbiviz
```

Then `node scripts/build-post5.mjs` registers the newest package from `dist/` in the report, the same way Desktop does when you import a visual from a file and save. Restart Desktop to load a new version.

Org Pulse works the same way: `npm install` and `npx pbiviz package` in `visuals/orgPulse`, then `node scripts/build-orgpulse.mjs`. To run the browser prototype instead:

```bash
cd visuals/orgPulse
npx tsc -p tsconfig.proto.json    # compiles src/core to prototype/build
node prototype/serve.mjs          # then open http://localhost:5178/
```

## Licence

MIT. See [LICENSE](LICENSE). Use, copy and adapt freely.
