// Demand vs Stock: a Power BI custom visual (TypeScript + D3).
// One row per category: monthly sales bars coloured by weeks of cover, days out of stock below the line,
// and growth / cover / stockout figures at the end. Click a row to cross-filter the page.
"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;

import { VisualFormattingSettingsModel } from "./settings";
import { render } from "./render";
import { summarise, sortRows, SortBy } from "./stats";
import type { CategoryRow, Month, MonthPoint, RenderSettings } from "./types";

interface VisualRow extends CategoryRow { id: ISelectionId }

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Accepts a date, a yyyymm number (202503) or text; returns a sortable key and a label
function toMonth(value: PrimitiveValue, index: number): Month {
    if (value instanceof Date) {
        const y = value.getFullYear(), m = value.getMonth();
        return { key: y * 100 + m + 1, label: `${MON[m]} ${y}`, year: y, isJanuary: m === 0 };
    }
    if (typeof value === "number" && value > 190001 && value < 300000) {
        const y = Math.floor(value / 100), m = (value % 100) - 1;
        return { key: value, label: `${MON[m] ?? ""} ${y}`, year: y, isJanuary: m === 0 };
    }
    const parsed = typeof value === "string" ? new Date(`1 ${value}`) : null;
    if (parsed && !isNaN(parsed.getTime())) return toMonth(parsed, index);
    return { key: index, label: String(value ?? ""), year: null, isJanuary: false };
}

const num = (v: PrimitiveValue): number | null => (typeof v === "number" && isFinite(v) ? v : null);

export class Visual implements IVisual {
    private host: IVisualHost;
    private element: HTMLElement;
    private svg: SVGSVGElement;
    private landing: HTMLDivElement;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();
    private rows: VisualRow[] = [];
    private months: Month[] = [];
    private selected = new Set<string>();
    private size = { width: 0, height: 0 };
    private salesIsCurrency = true;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.element = options.element;
        this.selectionManager = this.host.createSelectionManager();
        this.svg = d3.select(this.element).append("svg").classed("dvs", true).node() as SVGSVGElement;
        const landing = d3.select(this.element).append("div").classed("dvs-landing", true);
        landing.append("b").text("Demand vs Stock");
        landing.append("div").text("Add Category, Month, Sales, Weeks of cover and Stockout days.");
        this.landing = landing.node() as HTMLDivElement;
        // keep the fade in sync when the selection changes elsewhere (bookmarks, clearing from another visual)
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => this.syncSelection(ids));
    }

    public update(options: VisualUpdateOptions) {
        this.host.eventService.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            this.size = { width: options.viewport.width, height: options.viewport.height };
            const ok = this.buildModel(dataView);
            this.landing.style.display = ok ? "none" : "block";
            this.svg.style.display = ok ? "block" : "none";
            if (ok) {
                this.syncSelection(this.selectionManager.getSelectionIds() as ISelectionId[], false);
                this.draw();
            }
            this.host.eventService.renderingFinished(options);
        } catch (error) {
            this.host.eventService.renderingFailed(options, String(error));
        }
    }

    private buildModel(dataView: DataView | undefined): boolean {
        const cat = dataView?.categorical;
        const catCol = cat?.categories?.find(c => c.source.roles?.category);
        const values = cat?.values;
        if (!catCol || !values || !values.source?.roles?.month) return false;

        const groups = values.grouped();
        const roleIndex = (role: string) => groups[0]?.values.findIndex(v => v.source.roles?.[role]) ?? -1;
        const iSales = roleIndex("sales"), iCover = roleIndex("cover"), iStock = roleIndex("stockouts");
        if (iSales < 0) return false;
        this.salesIsCurrency = (groups[0].values[iSales].source.format ?? "").includes("$");

        // months, sorted; drop trailing months with no sales at all (future calendar months)
        let ordered = groups.map((g, gi) => ({ g, month: toMonth(g.name, gi) })).sort((a, b) => a.month.key - b.month.key);
        while (ordered.length && ordered[ordered.length - 1].g.values[iSales].values.every(v => num(v) === null)) ordered.pop();
        this.months = ordered.map(o => o.month);

        const at = (o: typeof ordered[number], idx: number, row: number) => (idx < 0 ? null : num(o.g.values[idx].values[row]));
        this.rows = catCol.values.map((value, i) => {
            const points: MonthPoint[] = ordered.map(o => ({ ...o.month, sales: at(o, iSales, i), cover: at(o, iCover, i), stockout: at(o, iStock, i) }));
            const row = summarise(String(value ?? "(Blank)"), points) as VisualRow;
            row.id = this.host.createSelectionIdBuilder().withCategory(catCol, i).createSelectionId();
            return row;
        });
        this.rows = sortRows(this.rows, this.formattingSettings.rows.sortBy.value.value as SortBy);
        return this.rows.length > 0 && this.months.length > 0;
    }

    private renderSettings(): RenderSettings {
        const f = this.formattingSettings;
        return {
            dangerWeeks: f.cover.danger.value,
            warnWeeks: Math.max(f.cover.warn.value, f.cover.danger.value),
            colorOk: f.colors.ok.value.value,
            colorWarn: f.colors.warn.value.value,
            colorDanger: f.colors.danger.value.value,
            colorStockout: f.colors.stockout.value.value,
            fontSize: Math.max(8, f.rows.fontSize.value),
            salesIsCurrency: this.salesIsCurrency,
        };
    }

    private syncSelection(ids: ISelectionId[], redraw = true) {
        this.selected = new Set(this.rows.filter(r => ids.some(id => id.equals(r.id))).map(r => r.name));
        if (redraw) this.draw();
    }

    private draw() {
        const allow = this.host.hostCapabilities.allowInteractions !== false;
        const s = this.renderSettings();
        const money = d3.format(s.salesIsCurrency ? "$,.0f" : ",.0f");
        const pos = (e: MouseEvent): [number, number] => {
            const r = this.element.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        };
        render<VisualRow>(this.svg, this.rows, this.months, this.size.width, this.size.height, s, this.selected, {
            onRowClick: (row, e) => {
                if (!allow) return;
                this.selectionManager.select(row.id, e.ctrlKey || e.metaKey).then(ids => this.syncSelection(ids as ISelectionId[]));
            },
            onBackgroundClick: () => {
                if (!allow) return;
                this.selectionManager.clear().then(() => this.syncSelection([]));
            },
            onContextMenu: (row, e) => {
                e.preventDefault();
                this.selectionManager.showContextMenu(row ? row.id : {}, { x: e.clientX, y: e.clientY });
            },
            onHover: (row, p, e) => {
                const items = [
                    { displayName: "Category", value: row.name },
                    { displayName: "Month", value: p.label },
                    { displayName: "Sales", value: p.sales === null ? "–" : money(p.sales) },
                    { displayName: "Weeks of cover", value: p.cover === null ? "–" : p.cover.toFixed(1) },
                    { displayName: "Days out of stock", value: p.stockout === null ? "–" : p.stockout.toFixed(1) },
                ];
                this.host.tooltipService.show({ coordinates: pos(e), isTouchEvent: false, identities: [row.id], dataItems: items });
            },
            onLeave: () => this.host.tooltipService.hide({ immediately: true, isTouchEvent: false }),
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
