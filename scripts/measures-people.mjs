// 14.2 Org Pulse: "as of" people measures.
// 'As Of' is a disconnected table of month ends. Org Pulse (or a slicer) filters it, and every measure here reads
// MAX('As Of'[As Of Date]): with no selection that is the latest month (31 Oct 2026).
// OrgTimeline has one row per seat per period; a row is live on day d when ValidFrom <= d <= ValidTo (blank = still live).
// Entry format: [folder, name, formatString, dax, dataCategory]

const LIVE = `VAR _d = [As Of Date]
VAR _live = FILTER ( OrgTimeline, OrgTimeline[ValidFrom] <= _d && ( ISBLANK ( OrgTimeline[ValidTo] ) || OrgTimeline[ValidTo] >= _d ) )`;

// movements in a window ending on the as-of date, ignoring any Calendar filter on the page
const MOVES = (types, days) => `VAR _d = [As Of Date]
RETURN
    CALCULATE (
        COUNTROWS ( Movements ),
        REMOVEFILTERS ( 'Calendar' ),
        Movements[MoveType] IN { ${types.map(t => `"${t}"`).join(', ')} },
        Movements[MoveDate] > _d - ${days},
        Movements[MoveDate] <= _d
    )`;

export const PEOPLE_MEASURES = [
  ['People', 'As Of Date', 'd mmm yyyy', `MAX ( 'As Of'[As Of Date] )`],
  ['People', 'As Of Label', '', `"as at " & FORMAT ( [As Of Date], "d mmm yyyy" )`],
  ['People', 'Planned FTE', '#,0.0', `-- every live seat, filled or open
${LIVE}
RETURN SUMX ( _live, OrgTimeline[FTE] )`],
  ['People', 'Effective FTE', '#,0.0', `-- seats with someone in them who is not on leave
${LIVE}
RETURN SUMX ( FILTER ( _live, OrgTimeline[Status] = "Filled" ), OrgTimeline[FTE] )`],
  ['People', 'Staffed %', '0%', `DIVIDE ( [Effective FTE], [Planned FTE] )`],
  ['People', 'Headcount', '#,0', `-- people in post, including those on leave
${LIVE}
RETURN COUNTROWS ( FILTER ( _live, NOT ISBLANK ( OrgTimeline[PersonID] ) ) )`],
  ['People', 'Open Roles', '#,0', `${LIVE}
RETURN COUNTROWS ( FILTER ( _live, OrgTimeline[Status] = "Open" ) ) + 0`],
  ['People', 'On Leave', '#,0', `${LIVE}
RETURN COUNTROWS ( FILTER ( _live, OrgTimeline[Status] = "On leave" ) ) + 0`],
  ['People', 'Staff Cost', '$#,0', `-- annual cost of the people in post
${LIVE}
RETURN SUMX ( _live, OrgTimeline[AnnualCost] )`],
  ['People', 'Managers', '#,0', `-- seats that have at least one person reporting to them
${LIVE}
RETURN COUNTROWS ( DISTINCT ( SELECTCOLUMNS ( FILTER ( _live, NOT ISBLANK ( OrgTimeline[PersonID] ) && NOT ISBLANK ( OrgTimeline[ReportsToPositionID] ) ), "m", OrgTimeline[ReportsToPositionID] ) ) )`],
  ['People', 'Avg Span', '0.0', `${LIVE}
VAR _reports = COUNTROWS ( FILTER ( _live, NOT ISBLANK ( OrgTimeline[PersonID] ) && NOT ISBLANK ( OrgTimeline[ReportsToPositionID] ) ) )
RETURN DIVIDE ( _reports, [Managers] )`],
  ['People', 'Hires 90d', '#,0', MOVES(['Hire'], 90) + ' + 0'],
  ['People', 'Exits 12m', '#,0', MOVES(['Exit'], 365) + ' + 0'],
  ['People', 'Internal Moves 12m', '#,0', MOVES(['Transfer', 'Promotion'], 365) + ' + 0'],
  ['People', 'Attrition % 12m', '0.0%', `DIVIDE ( [Exits 12m], [Headcount] )`],
];

// disconnected month-end table that the visual (or a slicer) filters
export const AS_OF_TABLE = {
  name: 'As Of',
  dax: `VAR _months = GENERATESERIES ( 0, DATEDIFF ( DATE ( 2023, 1, 1 ), DATE ( 2026, 10, 31 ), MONTH ) )
RETURN
    SELECTCOLUMNS (
        _months,
        "As Of Date", EOMONTH ( DATE ( 2023, 1, 1 ), [Value] ),
        "As Of Month", FORMAT ( EOMONTH ( DATE ( 2023, 1, 1 ), [Value] ), "mmm yyyy" ),
        "As Of Index", [Value]
    )`,
  cols: [['As Of Date', 'dateTime', 'd mmm yyyy'], ['As Of Month', 'string', null, 'As Of Index'], ['As Of Index', 'int64', '0', null, true]],
};
