import { renderResolvedCrop, validateCropDrawGeometry, type CropDrawGeometry } from "../../../editor/cropRender.ts"
import { pixelizeFromImageDominant, renderPixelGridCanvas } from "../../../editor/pixelRaster.ts"
import { prepareFrame } from "./prepareFrame.ts"
import { applyResolvedSmartRecipe, validateResolvedSmartRecipe, type ResolvedSmartRecipe } from "./smartRecipe.ts"
import { replayDynamicAutoPalette, replayFinalPalette, validateDynamicAutoPaletteRecipe,
    validateFinalPaletteRecipe, type BatchPaletteRecipe } from "./finalPalette.ts"
import type { ReplayTimingObserver } from "./replayTiming.ts"
import { BATCH_CROP_RASTER_POLICY } from "../cropRasterPolicy.ts"

export type FinalFrameRecipe = Readonly<{
    version: 1
    pipeline: "crop-preparation-smart-sampling-final-palette-png-v2" | "crop-preparation-smart-sampling-dynamic-auto-palette-png-v3"
    crop: CropDrawGeometry
    smart: ResolvedSmartRecipe
    palette: BatchPaletteRecipe
    grid: Readonly<{ size: number; columns: number; rows: number }>
}>

export function validateFinalFrameRecipe(recipe: FinalFrameRecipe): void {
    if (recipe.version !== 1 || recipe.pipeline !== (recipe.palette.version === 2
        ? "crop-preparation-smart-sampling-dynamic-auto-palette-png-v3"
        : "crop-preparation-smart-sampling-final-palette-png-v2")) {
        throw new Error("Unsupported final frame pipeline")
    }
    validateCropDrawGeometry(recipe.crop)
    validateResolvedSmartRecipe(recipe.smart)
    if (recipe.palette.version === 2) validateDynamicAutoPaletteRecipe(recipe.palette)
    else validateFinalPaletteRecipe(recipe.palette)
    for (const size of Object.values(recipe.grid)) {
        if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid final frame grid")
    }
}

export function freezeFinalFrame(input: Omit<FinalFrameRecipe, "version" | "pipeline">): FinalFrameRecipe {
    const recipe: FinalFrameRecipe = {
        ...structuredClone(input),
        version: 1, pipeline: input.palette.version === 2
            ? "crop-preparation-smart-sampling-dynamic-auto-palette-png-v3"
            : "crop-preparation-smart-sampling-final-palette-png-v2",
    }
    validateFinalFrameRecipe(recipe)
    const freeze = (value: object) => {
        for (const nested of Object.values(value)) {
            if (nested !== null && typeof nested === "object") freeze(nested)
        }
        Object.freeze(value)
    }
    freeze(recipe)
    return recipe
}

// Stage order and rendering are the ordinary editor's neutral Core boundaries.
export function renderFinalFrame(source: CanvasImageSource, recipe: FinalFrameRecipe,
    timing?: ReplayTimingObserver): HTMLCanvasElement {
    let started = timing ? performance.now() : 0
    validateFinalFrameRecipe(recipe)
    timing?.("render-validation", performance.now() - started)
    started = timing ? performance.now() : 0
    const cropped = renderResolvedCrop(source, recipe.crop, { rasterPolicy: BATCH_CROP_RASTER_POLICY })
    timing?.("crop", performance.now() - started)
    if (!cropped) throw new Error("Crop canvas unavailable")
    started = timing ? performance.now() : 0
    const prepared = prepareFrame(cropped)
    timing?.("preparation", performance.now() - started)
    started = timing ? performance.now() : 0
    const smart = applyResolvedSmartRecipe(prepared, recipe.smart)
    timing?.("smart-wb", performance.now() - started)
    started = timing ? performance.now() : 0
    const sampled = pixelizeFromImageDominant(smart, recipe.grid, 16)
    timing?.("grid-sampling", performance.now() - started)
    const pixels = recipe.palette.version === 2
        ? replayDynamicAutoPalette(recipe.palette, sampled, timing)
        : replayFinalPalette(recipe.palette, sampled, timing)
    started = timing ? performance.now() : 0
    const canvas = renderPixelGridCanvas({ gridSize: recipe.grid.size,
        columns: recipe.grid.columns, rows: recipe.grid.rows,
        colorAt: (row, column) => {
            const [r, g, b, a] = pixels[row][column].rgba
            return a === 0 ? null : `rgba(${r}, ${g}, ${b}, ${a / 255})`
        },
    })
    timing?.("final-materialization", performance.now() - started)
    if (!canvas) throw new Error("Export canvas unavailable")
    return canvas
}
