// Post 4: measures that turn any selected promotion into a before / during / after window for Deneb.
// Entry format: [folder, name, formatString, dax, dataCategory]

// shared header: the selected promotion and the date on the current row
const PROMO_VARS = `VAR _s = SELECTEDVALUE ( Promotions[StartDate] )
VAR _e = SELECTEDVALUE ( Promotions[EndDate] )
VAR _cats = SELECTEDVALUE ( Promotions[Categories] )
VAR _ch = SELECTEDVALUE ( Promotions[Channels] )
VAR _d = MAX ( 'Calendar'[Date] )`;

export const POST4_MEASURES = [
  ['Post 4', 'Promo Window Sales', '$#,0', `-- net sales of the promoted categories and channels, from 6 weeks before to 8 weeks after the promotion
-- (ignores the promotion filter itself, so non-promo sales of those categories count too)
${PROMO_VARS}
RETURN
    IF (
        NOT ISBLANK ( _s ) && _cats <> "" && HASONEVALUE ( 'Calendar'[Date] )
            && _d >= _s - 42 && _d <= _e + 56 && MAX ( 'Calendar'[HasActuals] ) = 1,
        CALCULATE (
            [Net Sales],
            REMOVEFILTERS ( Promotions ),
            KEEPFILTERS ( FILTER ( ALL ( Categories[Category] ), CONTAINSSTRING ( _cats, Categories[Category] ) ) ),
            KEEPFILTERS ( FILTER ( ALL ( Sales[Channel] ), CONTAINSSTRING ( _ch, Sales[Channel] ) ) )
        ) + 0
    )`],

  ['Post 4', 'Promo Window Sales LY', '$#,0', `-- same categories and channels, same weekday 52 weeks earlier: the baseline that removes seasonality
${PROMO_VARS}
RETURN
    IF (
        NOT ISBLANK ( [Promo Window Sales] ),
        CALCULATE (
            [Net Sales],
            REMOVEFILTERS ( Promotions ),
            REMOVEFILTERS ( 'Calendar' ),
            'Calendar'[Date] = _d - 364,
            KEEPFILTERS ( FILTER ( ALL ( Categories[Category] ), CONTAINSSTRING ( _cats, Categories[Category] ) ) ),
            KEEPFILTERS ( FILTER ( ALL ( Sales[Channel] ), CONTAINSSTRING ( _ch, Sales[Channel] ) ) )
        ) + 0
    )`],

  ['Post 4', 'Promo Phase', '', `${PROMO_VARS}
RETURN
    IF (
        NOT ISBLANK ( [Promo Window Sales] ),
        SWITCH ( TRUE (), _d < _s, "Before", _d <= _e, "During", _d <= _e + 28, "Next 4 weeks", "Weeks 5-8" )
    )`],

  ['Post 4', 'Title Promo', '', `-- Percentages live in the chart's bands: a click cross-filter from another visual
-- does not reach a visual's dynamic title (slicer filters do), so the title would go stale.
VAR _name = SELECTEDVALUE ( Promotions[PromotionName] )
VAR _s = SELECTEDVALUE ( Promotions[StartDate] )
VAR _e = SELECTEDVALUE ( Promotions[EndDate] )
VAR _cats = SELECTEDVALUE ( Promotions[Categories] )
RETURN
    IF (
        ISBLANK ( _name ),
        "Pick one promotion",
        _name & " · " & FORMAT ( _s, IF ( YEAR ( _s ) <> YEAR ( _e ), "d mmm yyyy", "d mmm" ) ) & " – " & FORMAT ( _e, "d mmm yyyy" )
            & " · daily "
            & IF ( LEN ( _cats ) > 60, "sales (all categories)", SUBSTITUTE ( _cats, "; ", ", " ) & " sales" )
            & " vs the same weekdays last year"
    )`],
];
