// Shared shapes. Type-only: render.ts and stats.ts import these with `import type`,
// so both compile to plain JS that can also run outside Power BI (offline render tests).

export interface Month {
    key: number;          // sortable key, e.g. 202503
    label: string;        // "Mar 2025"
    year: number | null;
    isJanuary: boolean;
}

export interface MonthPoint extends Month {
    sales: number | null;
    cover: number | null;     // weeks of stock on hand at month end
    stockout: number | null;  // days out of stock in the month
}

export interface CategoryRow {
    name: string;
    points: MonthPoint[];
    growth: number | null;       // sales, last 12 months vs the 12 before
    coverLast: number | null;    // latest month with a value
    stockoutAvg: number | null;  // average days out of stock, last 12 months
}

export interface RenderSettings {
    dangerWeeks: number;
    warnWeeks: number;
    colorOk: string;
    colorWarn: string;
    colorDanger: string;
    colorStockout: string;
    fontSize: number;
    salesIsCurrency: boolean;
}

export interface RenderHandlers<R extends CategoryRow = CategoryRow> {
    onRowClick?: (row: R, event: MouseEvent) => void;
    onBackgroundClick?: (event: MouseEvent) => void;
    onContextMenu?: (row: R | null, event: MouseEvent) => void;
    onHover?: (row: R, point: MonthPoint, event: MouseEvent) => void;
    onLeave?: () => void;
}
