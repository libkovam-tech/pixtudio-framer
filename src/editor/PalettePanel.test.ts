import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PalettePanel } from "./PalettePanel.tsx"

const noop = () => undefined

function renderPalettePanel(
    input: Partial<React.ComponentProps<typeof PalettePanel>> = {}
) {
    return renderToStaticMarkup(
        React.createElement(PalettePanel, {
            activeTab: "size",
            activePresetButtonId: null,
            autoSwatches: [],
            bg: "#eadca8",
            checkerBackground: "",
            disabled: false,
            importedPresetProfiles: [],
            isMobileUI: false,
            paletteCount: 16,
            paletteCountActual: 16,
            paletteMax: 64,
            paletteMin: 2,
            rangeStyleBase: {},
            rangeTrackStyle: () => ({}),
            selectedSwatch: "",
            shouldShowPresetSwatches: true,
            trackWrap: {},
            userSwatches: [],
            visibleBuiltinPresetProfiles: [],
            onAddSwatch: noop,
            onApplyPreset: noop,
            onDeletePreset: noop,
            onOpenColorEditor: noop,
            onOpenPalettePresetFileDialog: noop,
            onPaletteSliderBlur: noop,
            onPaletteSliderChange: noop,
            onPaletteSliderKeyDown: noop,
            onPaletteSliderKeyUp: noop,
            onPaletteSliderPointerCancel: noop,
            onPaletteSliderPointerDown: noop,
            onPaletteSliderPointerLeave: noop,
            onPaletteSliderPointerUp: noop,
            onPaletteSliderTouchCancel: noop,
            onPaletteSliderTouchEnd: noop,
            onPaletteSliderTouchStart: noop,
            onSelectSwatch: noop,
            onSwitchPaletteTab: noop,
            ...input,
        })
    )
}

describe("PalettePanel", () => {
    it("makes palette tab controls unavailable while disabled", () => {
        const markup = renderPalettePanel({ disabled: true })

        expect(markup).toContain("AUTO PALETTE")
        expect(markup).toContain("PALETTE PRESETS")
        expect((markup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(
            3
        )
        expect(markup).toContain("pointer-events:none")
        expect(markup).toContain("opacity:0.5")
    })
})
