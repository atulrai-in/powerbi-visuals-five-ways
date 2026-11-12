# Brightvale Stores: synthetic retail dataset

A fictional US multi-channel lifestyle retailer: 36 physical stores in 5 regions plus an online store. Sales run from **1 Jan 2023 to 31 Oct 2026**. Calendar and targets run to 31 Dec 2026, so "rest of year" visuals work.

Regenerate with `node scripts/generate-retail-data.mjs`. The output is deterministic: the same seed always gives the same data.

## Tables (star schema)

| Table | Grain | Rows | Key columns |
|---|---|---|---|
| **Sales** (fact) | one order line | ~273k | OrderLineID, OrderID, OrderDate, OrderHour, StoreID, Channel, CustomerID, ProductID, PromotionID, Quantity, UnitPrice, DiscountPct, NetSales, CostAmount |
| **Returns** (fact) | one returned line | ~15.6k | ReturnID, OrderLineID → Sales, ReturnDate, StoreID, ReturnQty, RefundAmount, ReturnReason |
| **Targets** (fact) | month × store × category | ~13.6k | MonthStart, StoreID, CategoryID, TargetSales |
| **Inventory** (fact) | month-end × store × category | ~13k | SnapshotDate, StoreID, CategoryID, OnHandUnits, OnHandCost, StockoutDays, WeeksOfCover |
| **Calendar** | day | 1,461 | Date, Year, Quarter, Month, ISOWeek, Weekday, IsWeekend, RetailEvent, FiscalYear (Feb–Jan), HasActuals |
| **Products** | product | 400 | ProductID, ProductName, CategoryID, Subcategory, Brand, PriceTier (Good/Better/Best), ListPrice, UnitCost, LaunchDate |
| **Categories** | category | 8 | CategoryID, Category, Department |
| **Stores** | store | 37 | StoreID (99 = Online), StoreName, City, State, Region, Format, OpenDate, SquareFeet, Latitude, Longitude, StoreManager |
| **Customers** | customer | 18,001 | CustomerID (0 = Guest), Gender, AgeBand, Segment, LoyaltyTier, JoinDate, HomeStoreID |
| **Promotions** | promotion | 34 | PromotionID (0 = none), Name, Type, Start/End, DiscountPct, Categories, Channels |

## Relationships

- Sales[OrderDate] → Calendar[Date]; Sales → Stores, Products, Customers, Promotions
- Products[CategoryID] → Categories
- Returns[ReturnDate] → Calendar (active); Returns[StoreID] → Stores; Returns[OrderLineID] → Sales (use for return rate by product/category)
- Targets[MonthStart] → Calendar[Date]; Targets → Stores, Categories
- Inventory[SnapshotDate] → Calendar[Date]; Inventory → Stores, Categories

Measures: Gross Sales = Quantity × UnitPrice. Net Sales = NetSales. Margin = NetSales − CostAmount.

## Planted stories (each one is post material)

| # | Story | Where to see it |
|---|---|---|
| 1 | **Seasonality**: Nov/Dec peak, Black Friday spike (×3), Cyber Monday is huge online, stores close on Thanksgiving and Christmas Day | Calendar heatmap, daily trend |
| 2 | **Online shift**: online share grows from 18% (2023) to 30% (2026 YTD) | Channel mix over time |
| 3 | **Breakout category**: Beauty sales up ~50% in 2025 and beating target. Inventory can't keep up: 1–3 weeks of cover and 3–10 stockout days a month from 2025 | Category growth, target variance, stock vs sales |
| 4 | **Failing store**: Dayton Riverside falls ~40% from 2023 to 2026 | Store ranking, slope chart |
| 5 | **New stores ramp up**: Austin (Apr 2024), Raleigh (Mar 2025), Salt Lake City (Sep 2025) take ~6 months to mature | Store ramp curves |
| 6 | **West looks flat but isn't**: 2026 region total matches 2025 only because Salt Lake City opened. Like-for-like stores are down ~9% and the region misses target by ~12% | Like-for-like vs total, target variance by region |
| 7 | **Promo hangover**: Electronics Mega Week (10–23 Mar 2025, 30% off) doubles sales vs the same weekdays last year (+107%), then sales run ~28% below last year for four weeks (the generator halves Electronics' basket share, which dilutes to −28%). Returns also rise | Promo lift analysis |
| 8 | **Margin squeeze**: Electronics margin falls from ~19% to ~12% as cost inflation outruns price | Margin trend, waterfall |
| 9 | **Returns problem**: online Footwear returns ~24% of lines, online Apparel ~15%, mostly "Wrong size" | Return rate matrix, reason breakdown |
| 10 | **Shopping rhythm**: stores peak Saturday at lunchtime and early evening; online peaks Monday, 8–10pm | Hour × weekday heatmap |
| 11 | **Pareto customers**: a small share of customers drives a large share of sales. Loyalty tiers come from actual spend | Pareto / Lorenz curve |
| 12 | **Outlets** sell everything at ~25% off and carry extra Electronics stock | Discount depth, weeks of cover |
