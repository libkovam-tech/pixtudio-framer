import { describe, expect, it } from "vitest"

import { canUsePalettePresetImport } from "./palettePresetImportAvailability.ts"

describe("palette preset import availability", () => {
    it("inherits the existing Load Palette availability from the presets tab", () => {
        expect(
            canUsePalettePresetImport({
                activeTab: "presets",
                controlsDisabled: false,
            })
        ).toBe(true)
    })

    it("is unavailable outside Palette Presets", () => {
        expect(
            canUsePalettePresetImport({
                activeTab: "size",
                controlsDisabled: false,
            })
        ).toBe(false)
    })

    it("is unavailable when editor controls are disabled", () => {
        expect(
            canUsePalettePresetImport({
                activeTab: "presets",
                controlsDisabled: true,
            })
        ).toBe(false)
    })
})
