import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
    DEFAULT_METHOD_PROFILE,
    FIXED_PALETTE_MAPPING_METHOD_ID,
    OKLAB_COLOR_SPACE_ID,
    PIXTUDIO_METHOD_ID,
    getColorSpaceStrategy,
    getQuantizationMethodStrategy,
} from "./QuantizationCore.ts"
import {
    MethodPanel,
    getMethodPanelCompatibilityState,
} from "./MethodPanel.tsx"

function renderMethodPanel(
    input: Partial<React.ComponentProps<typeof MethodPanel>> = {}
) {
    return renderToStaticMarkup(
        React.createElement(MethodPanel, {
            paletteContext: "auto",
            selectedProfile: DEFAULT_METHOD_PROFILE,
            deConfettiSettings: { enabled: false, tieBreaker: 0 },
            status: "ready",
            canApply: true,
            isMobileUI: false,
            onSelectProfile: () => undefined,
            onSelectDeConfetti: () => undefined,
            onCancel: () => undefined,
            onApply: () => undefined,
            ...input,
        })
    )
}

function parseButtons(markup: string, axis: "method" | "color-space") {
    return Array.from(
        markup.matchAll(
            /<button[^>]*data-axis="([^"]+)"[^>]*data-compatible="([^"]+)"[^>]*data-color-space-id="([^"]+)"[^>]*data-method-id="([^"]+)"[^>]*data-palette-context="([^"]+)"[^>]*>/g
        )
    )
        .filter((match) => match[1] === axis)
        .map((match) => ({
            compatible: match[2] === "true",
            colorSpaceId: match[3],
            methodId: match[4],
            paletteContext: match[5],
            disabled: match[0].includes("disabled"),
        }))
}

describe("MethodPanel", () => {
    it("binds method buttons to the current color space without switching the opposite axis", () => {
        const markup = renderMethodPanel()

        expect(markup).toContain('data-axis="method"')
        expect(markup).toContain('data-method-id="default"')
        expect(markup).toContain('data-color-space-id="default"')
        expect(markup).toContain('data-palette-context="auto"')
        expect(markup).toContain('data-compatible="true"')
        expect(markup).toContain("Default")
        expect(markup).toContain('data-method-id="k-means"')
        expect(markup).toContain('data-color-space-id="default"')
    })

    it("binds color-space buttons to the current method without switching the opposite axis", () => {
        const markup = renderMethodPanel({
            paletteContext: "fixed",
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        expect(markup).toContain("Default")
        expect(markup).not.toContain("Palette Mapping")
        expect(markup).toContain('data-axis="color-space"')
        expect(markup).toContain(
            `data-method-id="${FIXED_PALETTE_MAPPING_METHOD_ID}"`
        )
        expect(markup).toContain(`data-color-space-id="${OKLAB_COLOR_SPACE_ID}"`)
        expect(markup).toContain('data-palette-context="fixed"')
        expect(markup).toContain('data-compatible="true"')
    })

    it("keeps the visible button set identical across palette contexts", () => {
        const autoMarkup = renderMethodPanel()
        const fixedMarkup = renderMethodPanel({
            paletteContext: "fixed",
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        for (const label of [
            "Default",
            "PIXTUDIO",
            "K-Means",
            "K-Medoids",
            "Octree",
            "Median Cut",
            "Fuzzy C-Means",
            "Wu&#x27;s Color Quantizer",
            "OKLAB",
            "CIELAB (Lab)",
            "DIN99",
            "CAM16-UCS",
            "YCbCr",
            "YUV",
            "YIQ",
            "HSV",
            "HSL",
            "HSI",
        ]) {
            expect(autoMarkup).toContain(label)
            expect(fixedMarkup).toContain(label)
        }
        expect(fixedMarkup).not.toContain("Palette Mapping")
    })

    it("does not render method or color-space buttons without registered strategies", () => {
        for (const markup of [
            renderMethodPanel(),
            renderMethodPanel({
                paletteContext: "fixed",
                selectedProfile: {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
            }),
        ]) {
            for (const button of parseButtons(markup, "method")) {
                expect(getQuantizationMethodStrategy(button.methodId)).toBeDefined()
            }
            for (const button of parseButtons(markup, "color-space")) {
                expect(getColorSpaceStrategy(button.colorSpaceId)).toBeDefined()
            }
        }
    })

    it("shows the active default color space for the auto default profile", () => {
        const markup = renderMethodPanel()

        expect(markup).toContain('data-axis="color-space"')
        expect(markup).toContain('data-method-id="default"')
        expect(markup).toContain('data-color-space-id="default"')
        expect(markup).toContain(">Default</button>")
    })

    it("disables incompatible color spaces without experimental markers", () => {
        const markup = renderMethodPanel({
            selectedProfile: {
                methodId: "octree",
                colorSpaceId: "default",
            },
        })

        expect(markup).toContain('data-axis="color-space"')
        expect(markup).toContain('data-method-id="octree"')
        expect(markup).toContain('data-color-space-id="oklab"')
        expect(markup).toContain('data-compatible="false"')
        expect(markup).toContain("disabled=\"\"")
        expect(markup).not.toContain("data-experimental")
        expect(markup).not.toContain("rgba(217,157,40")
    })

    it("disables auto methods inside the fixed palette context", () => {
        const markup = renderMethodPanel({
            paletteContext: "fixed",
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        expect(markup).toContain('data-axis="method"')
        expect(markup).toContain('data-method-id="k-means"')
        expect(markup).toContain('data-palette-context="fixed"')
        expect(markup).toContain('data-compatible="false"')
        expect(markup).toContain("disabled=\"\"")
    })

    it("keeps PIXTUDIO disabled for the default color space", () => {
        const markup = renderMethodPanel()

        expect(markup).toContain('data-axis="method"')
        expect(markup).toContain(`data-method-id="${PIXTUDIO_METHOD_ID}"`)
        expect(markup).toContain('data-color-space-id="default"')
        expect(markup).toContain('data-compatible="false"')
        expect(markup).toContain("disabled=\"\"")
    })

    it("enables PIXTUDIO for real color spaces in the auto context", () => {
        const markup = renderMethodPanel({
            selectedProfile: {
                methodId: "k-means",
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        expect(markup).toContain('data-axis="method"')
        expect(markup).toContain(`data-method-id="${PIXTUDIO_METHOD_ID}"`)
        expect(markup).toContain(`data-color-space-id="${OKLAB_COLOR_SPACE_ID}"`)
        expect(markup).toContain('data-palette-context="auto"')
        expect(markup).toContain('data-compatible="true"')
    })

    it("renders compatible options enabled and incompatible options disabled", () => {
        const markup = renderMethodPanel({
            selectedProfile: {
                methodId: "k-means",
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })
        const methodButtons = parseButtons(markup, "method")
        const colorSpaceButtons = parseButtons(markup, "color-space")

        expect(
            methodButtons.find(
                (button) => button.methodId === PIXTUDIO_METHOD_ID
            )
        ).toMatchObject({
            compatible: true,
            disabled: false,
        })
        expect(
            methodButtons.find((button) => button.methodId === "octree")
        ).toMatchObject({
            compatible: false,
            disabled: true,
        })
        expect(
            colorSpaceButtons.find(
                (button) => button.colorSpaceId === DEFAULT_METHOD_PROFILE.colorSpaceId
            )
        ).toMatchObject({
            compatible: true,
            disabled: false,
        })
        expect(
            colorSpaceButtons.find(
                (button) => button.colorSpaceId === OKLAB_COLOR_SPACE_ID
            )
        ).toMatchObject({
            compatible: true,
            disabled: false,
        })
    })

    it("shows the fixed context default color space button as disabled, not hidden", () => {
        const markup = renderMethodPanel({
            paletteContext: "fixed",
            selectedProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        expect(markup).toContain('data-axis="color-space"')
        expect(markup).toContain('data-method-id="fixed-palette-mapping"')
        expect(markup).toContain('data-color-space-id="default"')
        expect(markup).toContain('data-palette-context="fixed"')
        expect(markup).toContain('data-compatible="false"')
        expect(markup).toContain("disabled=\"\"")
    })

    it("renders De-Confetti below color spaces as an off checkbox with disabled A-D choices", () => {
        const markup = renderMethodPanel()

        expect(markup).toContain("COLOR SPACES")
        expect(markup).toContain("DE-CONFETTI")
        expect(markup.indexOf("DE-CONFETTI")).toBeGreaterThan(
            markup.indexOf("COLOR SPACES")
        )
        expect(markup).toContain('type="checkbox"')
        expect(markup).toContain('data-de-confetti-control="enabled"')
        expect(markup).toContain("Turned OFF")
        for (const option of ["0", "1", "2", "3"]) {
            const button = markup.match(
                new RegExp(
                    `<button[^>]*data-axis="de-confetti"[^>]*data-de-confetti-tie-breaker="${option}"[^>]*>`
                )
            )?.[0]
            expect(button).toContain("disabled")
        }
        expect(markup).not.toContain("AREA")
        expect(markup).not.toContain("PAL")
        expect(markup).not.toContain("CW")
        expect(markup).not.toContain("CCW")
        expect(markup).not.toContain("aggressive")
        expect(markup).not.toContain("quality")
    })

    it("enables De-Confetti A-D choices when the checkbox is on", () => {
        const markup = renderMethodPanel({
            deConfettiSettings: { enabled: true, tieBreaker: 2 },
        })

        expect(markup).toContain("Turned ON")
        expect(markup).toContain('data-axis="de-confetti"')
        expect(markup).toContain(
            'data-de-confetti-tie-breaker="2" data-active="true"'
        )
        expect(markup).not.toMatch(
            /data-axis="de-confetti"[^>]*disabled/
        )
    })

    it("compensates mobile action buttons for the editor fit scale", () => {
        const markup = renderMethodPanel({
            isMobileUI: true,
            viewportScale: 0.8,
        })

        expect(markup).toContain("width:62.5px;height:62.5px")
        expect(markup).toContain("gap:52.5px")
    })

    it("evaluates compatibility from method, color space, and palette context", () => {
        expect(
            getMethodPanelCompatibilityState(DEFAULT_METHOD_PROFILE, "auto")
        ).toEqual({
            compatible: true,
        })
        expect(
            getMethodPanelCompatibilityState(DEFAULT_METHOD_PROFILE, "fixed")
        ).toEqual({
            compatible: false,
        })
        expect(
            getMethodPanelCompatibilityState(
                {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
                "fixed"
            )
        ).toEqual({
            compatible: true,
        })
        expect(
            getMethodPanelCompatibilityState(
                {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
                "auto"
            )
        ).toMatchObject({
            compatible: false,
        })
    })
})
