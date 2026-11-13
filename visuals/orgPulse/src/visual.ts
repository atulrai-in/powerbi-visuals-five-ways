// Org Pulse: Power BI adapter around the shared core (src/core, also used by the browser prototype).
// Hybrid time control: the visual owns playback; when the user settles on a month (pause, release, step)
// it filters a disconnected date table (Format pane > Page date sync) so the page's measures follow.
// A visual's own filter never reaches its own query, so on every update it restores its month from its
// own jsonFilters first, and only falls back to the "Page as-of date" measure when it has no filter of its own.
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import FilterAction = powerbi.FilterAction;
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;

import { VisualFormattingSettingsModel } from "./settings";
import { OrgPulseView, Mode } from "./core/view";
import { SeatRow, Day, toDay, localDate, dayFromISO } from "./core/model";

const asDay = (v: PrimitiveValue | undefined): Day | null => {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : toDay(v);
    if (typeof v === "string") { const d = new Date(v); return isNaN(d.getTime()) ? dayFromISO(v) : toDay(d); }
    return null;
};
const asText = (v: PrimitiveValue | undefined): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const asNum = (v: PrimitiveValue | undefined): number | null => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);

export class Visual implements IVisual {
    private host: IVisualHost;
    private fss = new FormattingSettingsService();
    private settings: VisualFormattingSettingsModel;
    private view: OrgPulseView;
    private landing: HTMLDivElement;
    private dataKey = "";
    private applied = { theme: "", layout: "", title: "" };
    private ownFilterDay: Day | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        options.element.style.overflow = "hidden";
        this.landing = document.createElement("div");
        this.landing.className = "op-landing";
        this.landing.textContent = "Org Pulse: add Position ID and Reports to ID (plus Person ID, Name, Valid from and Valid to for history).";
        options.element.appendChild(this.landing);
        this.view = new OrgPulseView(options.element, { onCommit: day => this.applyFilter(day) });
    }

    public update(options: VisualUpdateOptions) {
        this.host.eventService.renderingStarted(options);
        try {
            const dv = options.dataViews?.[0];
            this.settings = this.fss.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);
            const d = this.settings.display;
            const theme = String(d.theme.value?.value ?? "dark"), layout = String(d.layout.value?.value ?? "constellation"), title = d.title.value || "Org Pulse";
            if (theme !== this.applied.theme) this.view.setTheme(theme === "light" ? "light" : "dark");
            if (title !== this.applied.title) this.view.setTitle(title);
            this.view.setFeed(d.feed.value !== false);

            this.ownFilterDay = this.readOwnFilter(options.jsonFilters);
            if (!this.settings.sync.enabled.value && this.ownFilterDay !== null) {
                this.host.applyJsonFilter(null, "general", "filter", FilterAction.remove);
                this.ownFilterDay = null;
            }

            const read = this.read(dv);
            const ok = !!read && read.rows.length > 0;
            this.landing.style.display = ok ? "none" : "block";
            this.view.setVisible(ok);
            if (ok) {
                const want = this.ownFilterDay ?? read.pageDay;
                if (layout !== this.applied.layout) this.view.setMode(layout as Mode);
                if (read.key !== this.dataKey) { this.dataKey = read.key; this.view.setData(read.rows, want); }
                else {
                    if (want !== null && want !== this.view.day) this.view.setDay(want);
                    if (options.type & powerbi.VisualUpdateType.Resize) this.view.resize();
                }
            }
            this.applied = { theme, layout, title };
            this.host.eventService.renderingFinished(options);
        } catch (e) {
            this.host.eventService.renderingFailed(options, String(e));
        }
    }

    private read(dv: DataView | undefined): { rows: SeatRow[]; pageDay: Day | null; key: string } | null {
        const table = dv?.table;
        if (!table) return null;
        const cols = table.columns;
        const at = (role: string) => cols.findIndex(c => c.roles?.[role]);
        const i = {
            position: at("position"), reportsTo: at("reportsTo"), person: at("person"), name: at("name"), from: at("validFrom"), to: at("validTo"),
            team: at("team"), group: at("group"), title: at("title"), status: at("status"), reason: at("reason"), fte: at("fte"), target: at("targetSpan"), page: at("asOfPage"),
        };
        if (i.position < 0) return null;
        const get = (r: PrimitiveValue[], k: number) => (k < 0 ? undefined : r[k]);
        let hash = 0;
        const rows: SeatRow[] = table.rows.map(r => {
            const position = asText(r[i.position]) ?? "";
            const person = i.person < 0 ? position : asText(get(r, i.person));
            const row: SeatRow = {
                position,
                reportsTo: asText(get(r, i.reportsTo)),
                person,
                name: asText(get(r, i.name)) ?? person,
                from: asDay(get(r, i.from)),
                to: asDay(get(r, i.to)),
                team: asText(get(r, i.team)),
                group: asText(get(r, i.group)) ?? asText(get(r, i.team)),
                title: asText(get(r, i.title)),
                status: asText(get(r, i.status)),
                reason: asText(get(r, i.reason)),
                fte: asNum(get(r, i.fte)) ?? 1,
                targetSpan: asNum(get(r, i.target)),
            };
            const s = `${position}|${row.reportsTo}|${person}|${row.from}|${row.to}|${row.status}|${row.group}`;
            for (let k = 0; k < s.length; k++) hash = (hash * 31 + s.charCodeAt(k)) | 0;
            return row;
        });
        const pageDay = i.page < 0 ? null : asDay(table.rows[0]?.[i.page]);
        const key = `${cols.map(c => c.queryName).join(",")}#${rows.length}#${hash}`;
        return { rows, pageDay, key };
    }

    private readOwnFilter(filters: powerbi.IFilter[] | undefined): Day | null {
        const f = filters?.[0] as unknown as { conditions?: { operator: string; value: unknown }[] } | undefined;
        const lo = f?.conditions?.find(c => c.operator === "GreaterThanOrEqual");
        return lo ? asDay(lo.value as PrimitiveValue) : null;
    }

    private applyFilter(day: Day) {
        const s = this.settings?.sync;
        if (!s?.enabled.value || this.host.hostCapabilities.allowInteractions === false) return;
        if (day === this.ownFilterDay) return;
        const d = localDate(day);
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        const filter = {
            // eslint-disable-next-line powerbi-visuals/no-http-string -- the filter schema id Power BI expects, not a URL that is loaded
            $schema: "http://powerbi.com/product/schema#advanced",
            target: { table: s.table.value || "As Of", column: s.column.value || "As Of Date" },
            logicalOperator: "And",
            conditions: [{ operator: "GreaterThanOrEqual", value: d }, { operator: "LessThan", value: next }],
            filterType: 0,
        };
        this.ownFilterDay = day;
        this.host.applyJsonFilter(filter as unknown as powerbi.IFilter, "general", "filter", FilterAction.merge);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.fss.buildFormattingModel(this.settings);
    }
}
