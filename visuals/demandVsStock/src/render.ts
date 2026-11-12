// Draws the whole visual with D3. Pure: takes rows, size and settings, knows nothing about Power BI,
// so the same code runs in the report and in an offline jsdom test.
//
// Layout, one row per category:
//   [ name ] [ monthly sales bars (up), coloured by weeks of cover | days out of stock (down) ] [ growth | cover | out of stock ]
import * as d3 from "d3";
import type { CategoryRow, Month, MonthPoint, RenderHandlers, RenderSettings } from "./types";

type Status = "danger" | "warn" | "ok" | "none";
const INK = "#1F2937", MUTED = "#6B7280", RULE = "#E5E7EB", GOOD = "#15803D";

function coverStatus(cover: number | null, s: RenderSettings): Status {
    if (cover === null) return "none";
    if (cover < s.dangerWeeks) return "danger";
    if (cover < s.warnWeeks) return "warn";
    return "ok";
}

export function render<R extends CategoryRow>(
    svgEl: SVGSVGElement,
    rows: R[],
    months: Month[],
    width: number,
    height: number,
    s: RenderSettings,
    selected: Set<string>,
    h: RenderHandlers<R> = {},
): void {
    const svg = d3.select(svgEl).attr("width", width).attr("height", height);
    svg.selectAll("*").remove();
    if (!rows.length || !months.length || width < 200 || height < 120) return;

    const fs = s.fontSize;
    const charW = fs * 0.56;
    const colour: Record<Status, string> = { danger: s.colorDanger, warn: s.colorWarn, ok: s.colorOk, none: "#D1D5DB" };

    // ---- layout
    const headerH = Math.round(fs * 4.3);
    const footerH = Math.round(fs * 1.7);
    const labelW = Math.max(110, Math.min(190, width * 0.12));
    const kpiW = Math.max(240, Math.min(390, width * 0.26));
    const plotX0 = labelW;
    const plotX1 = width - kpiW - 16;
    const rowH = (height - headerH - footerH) / rows.length;
    const upShare = 0.6, downShare = 0.24;

    const x = d3.scaleBand<number>().domain(months.map(m => m.key)).range([plotX0, plotX1]).paddingInner(0.22);
    const maxStock = Math.max(5, d3.max(rows, r => d3.max(r.points, p => p.stockout ?? 0)) ?? 0);
    const kpiX = (j: number) => plotX1 + 16 + (kpiW / 3) * (j + 0.5);

    // background catches clicks that should clear the selection
    svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#000").attr("fill-opacity", 0)
        .on("click", (e: MouseEvent) => h.onBackgroundClick?.(e))
        .on("contextmenu", (e: MouseEvent) => h.onContextMenu?.(null, e));

    // ---- header: legend on the left, KPI column titles on the right
    const legend = svg.append("g").attr("transform", `translate(0, ${fs})`);
    let lx = 0;
    const legendText = (t: string, opts: { bold?: boolean } = {}) => {
        legend.append("text").attr("x", lx).attr("y", 0).attr("dominant-baseline", "middle")
            .attr("font-size", fs * 0.9).attr("fill", opts.bold ? INK : MUTED).attr("font-weight", opts.bold ? 600 : 400).text(t);
        lx += t.length * charW * 0.9 + 14;
    };
    const swatch = (c: string, down = false) => {
        legend.append("rect").attr("x", lx).attr("y", down ? 0 : -fs * 0.45).attr("width", fs * 0.7).attr("height", fs * 0.45).attr("fill", c);
        lx += fs * 0.7 + 6;
    };
    legendText("Monthly sales, coloured by weeks of cover:", { bold: true });
    swatch(s.colorOk); legendText(`${s.warnWeeks}+ weeks`);
    swatch(s.colorWarn); legendText(`under ${s.warnWeeks}`);
    swatch(s.colorDanger); legendText(`under ${s.dangerWeeks}`);
    lx += 10;
    swatch(s.colorStockout, true); legendText("Below the line: days out of stock", { bold: true });

    const kpiTitles = [["Sales growth", "vs prior 12 months"], ["Weeks of cover", "latest month end"], ["Out of stock", "avg days a month"]];
    kpiTitles.forEach(([t, sub], j) => {
        svg.append("text").attr("x", kpiX(j)).attr("y", fs * 2.7).attr("text-anchor", "middle")
            .attr("font-size", fs * 0.95).attr("font-weight", 600).attr("fill", INK).text(t);
        svg.append("text").attr("x", kpiX(j)).attr("y", fs * 3.7).attr("text-anchor", "middle")
            .attr("font-size", fs * 0.78).attr("fill", MUTED).text(sub);
    });

    // ---- year gridlines and labels (footer)
    const step = x.step(), gap = step * x.paddingInner();
    const years = d3.groups(months.filter(m => m.year !== null), m => m.year as number);
    for (const [year, ms] of years) {
        const first = ms[0], last = ms[ms.length - 1];
        const x0 = (x(first.key) ?? 0) - gap / 2;
        const x1 = (x(last.key) ?? 0) + x.bandwidth() + gap / 2;
        if (first.isJanuary) svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", headerH - 4).attr("y2", height - footerH + 4)
            .attr("stroke", RULE).attr("stroke-width", 1);
        if (x1 - x0 > fs * 2.5) svg.append("text").attr("x", (x0 + x1) / 2).attr("y", height - footerH / 2 + 2).attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle").attr("font-size", fs * 0.9).attr("fill", MUTED).text(String(year));
    }

    // ---- rows
    const fmtPct = d3.format("+.0%");
    rows.forEach((row, i) => {
        const top = headerH + i * rowH;
        const base = top + rowH * (upShare + 0.06);
        const rowMax = d3.max(row.points, p => p.sales ?? 0) || 1;
        const ySales = d3.scaleLinear().domain([0, rowMax]).range([base, base - rowH * upShare]);
        const yStock = d3.scaleLinear().domain([0, maxStock]).range([0, rowH * downShare]);
        const dim = selected.size > 0 && !selected.has(row.name);

        const g = svg.append("g").attr("opacity", dim ? 0.28 : 1).style("cursor", "pointer")
            .on("click", (e: MouseEvent) => { e.stopPropagation(); h.onRowClick?.(row, e); })
            .on("contextmenu", (e: MouseEvent) => { e.stopPropagation(); h.onContextMenu?.(row, e); });

        // hit area for the whole row, then a hairline between rows
        g.append("rect").attr("x", 0).attr("y", top).attr("width", width).attr("height", rowH).attr("fill", "#000").attr("fill-opacity", 0);
        if (i > 0) g.append("line").attr("x1", 0).attr("x2", width).attr("y1", top).attr("y2", top).attr("stroke", RULE);

        // name
        const maxChars = Math.floor((labelW - 12) / (charW * 1.05));
        const name = row.name.length > maxChars ? row.name.slice(0, maxChars - 1) + "…" : row.name;
        g.append("text").attr("x", 2).attr("y", top + rowH / 2).attr("dominant-baseline", "middle")
            .attr("font-size", fs * 1.05).attr("font-weight", 600).attr("fill", INK).text(name);

        // baseline
        g.append("line").attr("x1", plotX0).attr("x2", plotX1).attr("y1", base + 0.5).attr("y2", base + 0.5).attr("stroke", "#CBD5E1");

        const hover = (sel: d3.Selection<SVGRectElement, MonthPoint, SVGGElement, unknown>) => sel
            .on("mousemove", (e: MouseEvent, p: MonthPoint) => h.onHover?.(row, p, e))
            .on("mouseleave", () => h.onLeave?.());

        // sales bars, coloured by weeks of cover at month end
        g.selectAll<SVGRectElement, MonthPoint>("rect.sales").data(row.points.filter(p => p.sales !== null && (p.sales as number) > 0))
            .join("rect").attr("class", "sales")
            .attr("x", p => x(p.key) ?? 0).attr("width", x.bandwidth())
            .attr("y", p => ySales(p.sales as number)).attr("height", p => base - ySales(p.sales as number))
            .attr("fill", p => colour[coverStatus(p.cover, s)])
            .call(hover);

        // stockout bars hang below the line
        g.selectAll<SVGRectElement, MonthPoint>("rect.stockout").data(row.points.filter(p => (p.stockout ?? 0) > 0))
            .join("rect").attr("class", "stockout")
            .attr("x", p => x(p.key) ?? 0).attr("width", x.bandwidth())
            .attr("y", base + 2).attr("height", p => yStock(p.stockout as number))
            .attr("fill", s.colorStockout)
            .call(hover);

        // KPIs
        const kpiY = top + rowH / 2;
        const kpi = (j: number, text: string, fill: string, bold: boolean) => g.append("text")
            .attr("x", kpiX(j)).attr("y", kpiY).attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .attr("font-size", fs * 1.25).attr("font-weight", bold ? 700 : 400).attr("fill", fill).text(text);
        kpi(0, row.growth === null ? "–" : fmtPct(row.growth), row.growth !== null && row.growth >= 0.2 ? GOOD : INK, row.growth !== null && row.growth >= 0.2);
        const st = coverStatus(row.coverLast, s);
        kpi(1, row.coverLast === null ? "–" : `${row.coverLast.toFixed(1)} wks`, st === "ok" || st === "none" ? INK : colour[st], st === "danger" || st === "warn");
        const bad = (row.stockoutAvg ?? 0) >= 2;
        kpi(2, row.stockoutAvg === null ? "–" : `${row.stockoutAvg.toFixed(1)} days`, bad ? s.colorStockout : INK, bad);
    });
}
