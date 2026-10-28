import { renderResolvedCrop, validateCropDrawGeometry, type CropDrawGeometry } from "../../../editor/cropRender.ts"
import { prepareFrame } from "../render/prepareFrame.ts"
import { applyResolvedSmartRecipe, type ResolvedSmartRecipe } from "../render/smartRecipe.ts"
import { replayPalette, type PaletteReplayRecipe } from "./paletteReplay.ts"
import { pixelizeFromImageDominant, renderPixelGridCanvas } from "../../../editor/pixelRaster.ts"

export type FrameReplayRecipe = Readonly<{
    version: 1
    pipeline: "crop-preparation-smart-sampling-mapping-refinement-remap-png-v1"
    crop: CropDrawGeometry
    smart: ResolvedSmartRecipe
    palette: PaletteReplayRecipe
    grid: Readonly<{ size: number; columns: number; rows: number }>
}>

export function freezeFrameReplayRecipe(input: Omit<FrameReplayRecipe, "version" | "pipeline">): FrameReplayRecipe {
    const recipe: FrameReplayRecipe = {
        version: 1, pipeline: "crop-preparation-smart-sampling-mapping-refinement-remap-png-v1",
        ...structuredClone(input),
    }
    validate(recipe)
    const freeze = (value: object) => {
        for (const nested of Object.values(value)) {
            if (nested !== null && typeof nested === "object") freeze(nested)
        }
        Object.freeze(value)
    }
    freeze(recipe)
    return recipe
}

function validate(recipe: FrameReplayRecipe) {
    if (recipe.version !== 1 || recipe.pipeline !== "crop-preparation-smart-sampling-mapping-refinement-remap-png-v1") {
        throw new Error("Unsupported frame replay pipeline")
    }
    validateCropDrawGeometry(recipe.crop)
    for (const size of Object.values(recipe.grid)) {
        if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid frame replay grid")
    }
}

/** Shared kernels only. Extraction and WB estimation are authoring operations, never replay stages. */
export function renderFrameReplay(source: CanvasImageSource, recipe: FrameReplayRecipe): HTMLCanvasElement {
    validate(recipe)
    const cropped = renderResolvedCrop(source, recipe.crop)
    if (!cropped) throw new Error("Crop canvas unavailable")
    const prepared = prepareFrame(cropped)
    const smart = applyResolvedSmartRecipe(prepared, recipe.smart)
    const sampled = pixelizeFromImageDominant(smart, recipe.grid, 16)
    const pixels = replayPalette(recipe.palette, sampled)
    const canvas = renderPixelGridCanvas({ gridSize: recipe.grid.size,
        columns: recipe.grid.columns, rows: recipe.grid.rows,
        colorAt: (row, column) => {
            const [r, g, b, a] = pixels[row][column].rgba
            return a === 0 ? null : `rgba(${r}, ${g}, ${b}, ${a / 255})`
        },
    })
    if (!canvas) throw new Error("Export canvas unavailable")
    return canvas
}
