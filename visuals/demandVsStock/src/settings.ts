// Format pane: what report authors can change without touching code.
"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

class CoverCard extends Card {
    danger = new formattingSettings.NumUpDown({ name: "danger", displayName: "Red below (weeks)", value: 3 });
    warn = new formattingSettings.NumUpDown({ name: "warn", displayName: "Amber below (weeks)", value: 4 });
    name = "cover";
    displayName = "Weeks of cover";
    slices: Slice[] = [this.danger, this.warn];
}

class ColorsCard extends Card {
    ok = new formattingSettings.ColorPicker({ name: "ok", displayName: "Enough stock", value: { value: "#94A3B8" } });
    warn = new formattingSettings.ColorPicker({ name: "warn", displayName: "Getting low", value: { value: "#F59E0B" } });
    danger = new formattingSettings.ColorPicker({ name: "danger", displayName: "Too low", value: { value: "#DC2626" } });
    stockout = new formattingSettings.ColorPicker({ name: "stockout", displayName: "Days out of stock", value: { value: "#7F1D1D" } });
    name = "colors";
    displayName = "Colours";
    slices: Slice[] = [this.ok, this.warn, this.danger, this.stockout];
}

export const SORT_ITEMS = [
    { value: "stockouts", displayName: "Most days out of stock" },
    { value: "growth", displayName: "Fastest sales growth" },
    { value: "cover", displayName: "Lowest weeks of cover" },
    { value: "name", displayName: "Name" },
];

class RowsCard extends Card {
    sortBy = new formattingSettings.ItemDropdown({ name: "sortBy", displayName: "Sort rows by", items: SORT_ITEMS, value: SORT_ITEMS[0] });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Text size", value: 14 });
    name = "rows";
    displayName = "Rows";
    slices: Slice[] = [this.sortBy, this.fontSize];
}

export class VisualFormattingSettingsModel extends Model {
    cover = new CoverCard();
    colors = new ColorsCard();
    rows = new RowsCard();
    cards = [this.cover, this.colors, this.rows];
}
