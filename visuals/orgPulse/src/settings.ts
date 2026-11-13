// Format pane for Org Pulse.
"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Slice = formattingSettings.Slice;
import Model = formattingSettings.Model;

const THEMES = [{ value: "dark", displayName: "Night" }, { value: "light", displayName: "Day" }];
const LAYOUTS = [{ value: "constellation", displayName: "Constellation" }, { value: "org", displayName: "Org chart" }];

class DisplayCard extends Card {
    theme = new formattingSettings.ItemDropdown({ name: "theme", displayName: "Theme", items: THEMES, value: THEMES[0] });
    layout = new formattingSettings.ItemDropdown({ name: "layout", displayName: "Start layout", items: LAYOUTS, value: LAYOUTS[0] });
    title = new formattingSettings.TextInput({ name: "title", displayName: "Title", value: "Org Pulse", placeholder: "Org Pulse" });
    feed = new formattingSettings.ToggleSwitch({ name: "feed", displayName: "Show change feed", value: true });
    name = "display";
    displayName = "Display";
    slices: Slice[] = [this.theme, this.layout, this.title, this.feed];
}

// Hybrid time control: when playback pauses, the visual filters this date column so the rest of the page follows.
class SyncCard extends Card {
    enabled = new formattingSettings.ToggleSwitch({ name: "enabled", displayName: "Sync the page date", value: true });
    table = new formattingSettings.TextInput({ name: "table", displayName: "Date table", value: "As Of", placeholder: "As Of" });
    column = new formattingSettings.TextInput({ name: "column", displayName: "Date column", value: "As Of Date", placeholder: "As Of Date" });
    name = "sync";
    displayName = "Page date sync";
    slices: Slice[] = [this.enabled, this.table, this.column];
}

export class VisualFormattingSettingsModel extends Model {
    display = new DisplayCard();
    sync = new SyncCard();
    cards = [this.display, this.sync];
}
