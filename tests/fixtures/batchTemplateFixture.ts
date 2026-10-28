import { runQuantization } from "../../src/editor/QuantizationCore"
import { calculateCanvasGridGeometry, calculateReferenceDimensions, type AspectRatioId } from "../../src/editor/canvasGeometry"
import { captureFinalPalette } from "../../src/plugins/batchPixelation/render/finalPalette"
import { freezeFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"
import { resolveSmartRecipe } from "../../src/plugins/batchPixelation/render/smartRecipe"
import { ZERO_SMART_REFERENCE_ADJUSTMENTS } from "../../src/editor/smartRender"
import type { QuantizationProfile } from "../../src/editor/paletteQuantizationEngine"

export function batchTemplateFixture(source: "auto" | "preset" | "imported" = "auto",
    aspectRatioId: AspectRatioId = "1:1", methodId = source === "auto" ? "default" : "fixed-palette-mapping",
    colorSpaceId = source === "auto" ? "default" : "oklab"): SealedReference {
    const pixels = [["#112233", "#CCDDEE", "#883355", null], ["#445566", "#224455", null, "#FFFFFF"]]
    const profile: QuantizationProfile = source === "auto" ? { kind: "extract" } : {
        kind: "fixed", source: source === "preset" ? "builtin" : "imported", id: "fixture", name: "Fixture",
        colors: ["#112233", "#CCDDEE", "#883355", "#112233"],
    }
    const deConfetti = { enabled: true, tieBreaker: 2 as const }
    const world = runQuantization({ sourcePixels: pixels, overlayPixels: pixels.map(row => row.map(() => null)),
        paletteCount: 4, paletteContext: source === "auto" ? "auto" : "fixed", methodProfile: { methodId, colorSpaceId },
        fixedPaletteProfile: profile.kind === "fixed" ? profile : undefined, deConfettiSettings: deConfetti })
    const dims = calculateReferenceDimensions(aspectRatioId)
    const grid = calculateCanvasGridGeometry({ aspectRatioId, gridSize: 8 })
    return { referenceInputGeometry: { width: 4, height: 2 }, recipe: freezeFinalFrame({
        crop: { outputWidth: dims.width, outputHeight: dims.height, cx: dims.width / 2, cy: dims.height / 2,
            drawWidth: dims.width, drawHeight: dims.height, rotationRadians: 0.17 },
        grid: { size: grid.gridSize, columns: grid.columns, rows: grid.rows },
        smart: resolveSmartRecipe({ ...ZERO_SMART_REFERENCE_ADJUSTMENTS, exposure: 12, contrast: -7, saturation: 9 }),
        palette: captureFinalPalette(world, profile, deConfetti),
    }) }
}
