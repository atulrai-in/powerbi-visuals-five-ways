// Per-category numbers shown at the end of each row. No Power BI or D3 imports.
import type { CategoryRow, MonthPoint } from "./types";

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

export function summarise(name: string, points: MonthPoint[]): CategoryRow {
    const withSales = points.filter(p => p.sales !== null);
    const last12 = withSales.slice(-12).map(p => p.sales as number);
    const prior12 = withSales.slice(-24, -12).map(p => p.sales as number);
    const growth = prior12.length === 12 && sum(prior12) > 0 ? sum(last12) / sum(prior12) - 1 : null;

    const covers = points.filter(p => p.cover !== null);
    const coverLast = covers.length ? (covers[covers.length - 1].cover as number) : null;

    const stockouts = points.filter(p => p.stockout !== null).slice(-12).map(p => p.stockout as number);
    return { name, points, growth, coverLast, stockoutAvg: mean(stockouts) };
}

export type SortBy = "stockouts" | "growth" | "cover" | "name";

export function sortRows<R extends CategoryRow>(rows: R[], by: SortBy): R[] {
    const desc = (f: (r: R) => number | null) => (a: R, b: R) => (f(b) ?? -Infinity) - (f(a) ?? -Infinity);
    const sorted = [...rows];
    if (by === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (by === "growth") sorted.sort(desc(r => r.growth));
    else if (by === "cover") sorted.sort((a, b) => (a.coverLast ?? Infinity) - (b.coverLast ?? Infinity));
    else sorted.sort(desc(r => r.stockoutAvg));
    return sorted;
}
