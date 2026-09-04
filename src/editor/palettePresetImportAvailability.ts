import type { PaletteTab } from "./paletteQuantizationEngine.ts"

export type PalettePresetImportAvailabilityInput = {
    activeTab: PaletteTab
    controlsDisabled: boolean
}

export function canUsePalettePresetImport(
    input: PalettePresetImportAvailabilityInput
) {
    return input.activeTab === "presets" && !input.controlsDisabled
}
