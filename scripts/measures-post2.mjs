// Post 2: "DAX that draws" measures that return SVG images (data category ImageUrl).
// Every SVG uses the same 200x28 canvas so the table's single image size fits them all.
// In data URIs '#' must be written %23 and '%' must be written %25.
// Entry format: [folder, name, formatString, dax, dataCategory]

const HEAD = `"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 28' width='200' height='28'>"`;

export const POST2_MEASURES = [
  ['Post 2', 'SVG Sparkline', '', `-- rolling 12-month net sales at each month end since Jan 2025 (removes the Black Friday spike so the trend shows)
-- months with no sales yet are skipped, so new stores start partway along
VAR _w = 200
VAR _h = 28
VAR _pad = 3
VAR _n = 22 -- Jan 2025 .. Oct 2026
VAR _months =
    CALCULATETABLE (
        VALUES ( 'Calendar'[YearMonth] ),
        REMOVEFILTERS ( 'Calendar' ),
        'Calendar'[Date] >= DATE ( 2025, 1, 1 ),
        'Calendar'[HasActuals] = 1
    )
VAR _t =
    ADDCOLUMNS (
        _months,
        "@i", ( INT ( 'Calendar'[YearMonth] / 100 ) - 2025 ) * 12 + MOD ( 'Calendar'[YearMonth], 100 ),
        "@v",
            VAR _ym = 'Calendar'[YearMonth]
            RETURN
                CALCULATE (
                    [Net Sales],
                    REMOVEFILTERS ( 'Calendar' ),
                    'Calendar'[YearMonth] > _ym - 100,
                    'Calendar'[YearMonth] <= _ym
                )
    )
VAR _pts = FILTER ( _t, NOT ISBLANK ( [@v] ) )
VAR _min = MINX ( _pts, [@v] )
VAR _max = MAXX ( _pts, [@v] )
VAR _range = IF ( _max = _min, 1, _max - _min )
VAR _xy =
    ADDCOLUMNS (
        _pts,
        "@x", _pad + ( [@i] - 1 ) / ( _n - 1 ) * ( _w - 2 * _pad ),
        "@y", _pad + ( 1 - ( [@v] - _min ) / _range ) * ( _h - 2 * _pad )
    )
VAR _poly = CONCATENATEX ( _xy, FORMAT ( [@x], "0.0" ) & "," & FORMAT ( [@y], "0.0" ), " ", [@i], ASC )
VAR _last = TOPN ( 1, _xy, [@i], DESC )
VAR _lx = FORMAT ( MAXX ( _last, [@x] ), "0.0" )
VAR _ly = FORMAT ( MAXX ( _last, [@y] ), "0.0" )
VAR _col = IF ( [YoY %] < 0, "%23C2410C", "%2315803D" )
RETURN
    IF (
        COUNTROWS ( _pts ) > 1,
        ${HEAD}
            & "<polyline points='" & _poly & "' fill='none' stroke='" & _col & "' stroke-width='1.8' stroke-linejoin='round' stroke-linecap='round'/>"
            & "<circle cx='" & _lx & "' cy='" & _ly & "' r='2.8' fill='" & _col & "'/></svg>"
    )`, 'ImageUrl'],

  ['Post 2', 'SVG Bullet', '', `-- bullet chart: bar = actual, tick = target to date, grey bands = 0-90% and 90-130% of target
VAR _a = [Net Sales]
VAR _tgt = [Target to Date]
VAR _pct = DIVIDE ( _a, _tgt )
VAR _scale = 1.3
VAR _bw = 138
VAR _bar = FORMAT ( MIN ( _pct, _scale ) / _scale * _bw, "0.0" )
VAR _tx = FORMAT ( 1 / _scale * _bw, "0.0" )
VAR _band = FORMAT ( 0.9 / _scale * _bw, "0.0" )
VAR _col = SWITCH ( TRUE (), _pct >= 1, "%2315803D", _pct >= 0.95, "%23B45309", "%23C2410C" )
RETURN
    IF (
        NOT ISBLANK ( _tgt ) && NOT ISBLANK ( _a ),
        ${HEAD}
            & "<rect x='0' y='5' width='" & _bw & "' height='18' fill='%23F1F5F9'/>"
            & "<rect x='0' y='5' width='" & _band & "' height='18' fill='%23E2E8F0'/>"
            & "<rect x='0' y='10' width='" & _bar & "' height='8' rx='1' fill='" & _col & "'/>"
            & "<line x1='" & _tx & "' x2='" & _tx & "' y1='3' y2='25' stroke='%231E3A5F' stroke-width='2'/>"
            & "<text x='144' y='20' font-family='Segoe UI' font-size='17' font-weight='600' fill='%231F2937'>" & FORMAT ( _pct * 100, "0" ) & "%25</text></svg>"
    )`, 'ImageUrl'],

  ['Post 2', 'Store Status', '', `VAR _cutoff = EDATE ( MIN ( 'Calendar'[Date] ), -12 )
VAR _open = MIN ( Stores[OpenDate] )
VAR _yoy = [YoY %]
RETURN
    IF (
        HASONEVALUE ( Stores[StoreID] ) && NOT ISBLANK ( [Net Sales] ),
        SWITCH (
            TRUE (),
            _open > _cutoff, "Ramping",
            _yoy >= 0.03, "Growing",
            _yoy <= -0.10, "Declining",
            _yoy < -0.03, "Slipping",
            "Steady"
        )
    )`],

  ['Post 2', 'SVG Status', '', `VAR _s = [Store Status]
VAR _bg = SWITCH ( _s, "Ramping", "%23DBEAFE", "Growing", "%23DCFCE7", "Declining", "%23FEE2E2", "Slipping", "%23FFEDD5", "%23F1F5F9" )
VAR _fg = SWITCH ( _s, "Ramping", "%231D4ED8", "Growing", "%2315803D", "Declining", "%23B91C1C", "Slipping", "%23C2410C", "%23475569" )
RETURN
    IF (
        NOT ISBLANK ( _s ),
        ${HEAD}
            & "<rect x='20' y='1' width='160' height='26' rx='13' fill='" & _bg & "'/>"
            & "<text x='100' y='20' text-anchor='middle' font-family='Segoe UI' font-size='17' font-weight='700' fill='" & _fg & "'>" & _s & "</text></svg>"
    )`, 'ImageUrl'],

  ['Post 2', 'Title Scorecard', '', `VAR _declining = COUNTROWS ( FILTER ( VALUES ( Stores[StoreID] ), [Store Status] = "Declining" ) )
VAR _ramping = COUNTROWS ( FILTER ( VALUES ( Stores[StoreID] ), [Store Status] = "Ramping" ) )
RETURN
    "Store scorecard " & SELECTEDVALUE ( 'Calendar'[Year] ) & " YTD · " & _declining & " stores declining · "
        & _ramping & " new stores ramping"`],
];
