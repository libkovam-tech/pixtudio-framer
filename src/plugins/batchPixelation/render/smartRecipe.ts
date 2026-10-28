import {
    applySmartPixelPipeline, resolveSmartWhiteBalanceApplyInputs,
    type SmartPixelAdjustments, type SmartReferenceAdjustments,
    type SmartObjectWhiteBalanceDomainState, type SmartWhiteBalanceApplyInputs,
} from "../../../editor/smartRender.ts"

export const SMART_RENDER_RECIPE_VERSION = 1 as const

export type ResolvedWhiteBalance =
    | Readonly<{ kind: "identity" }>
    | Readonly<{ kind: "matrix" } & SmartWhiteBalanceApplyInputs>

export type ResolvedSmartRecipe = Readonly<{
    version: typeof SMART_RENDER_RECIPE_VERSION
    adjustments: SmartPixelAdjustments
    whiteBalance: ResolvedWhiteBalance
}>

/** Stage 2 proof adapter; recipe storage and validation belong outside Core. */
export function resolveSmartRecipe(
    adjustments: SmartReferenceAdjustments,
    domainState?: SmartObjectWhiteBalanceDomainState | null
): ResolvedSmartRecipe {
    const transform = resolveSmartWhiteBalanceApplyInputs(adjustments, domainState)
    let whiteBalance: ResolvedWhiteBalance = Object.freeze({ kind: "identity" })
    if (transform) {
        const matrix: SmartWhiteBalanceApplyInputs["matrix"] = [...transform.matrix]
        const anchorReference: SmartWhiteBalanceApplyInputs["anchorReference"] = [...transform.anchorReference]
        whiteBalance = Object.freeze({ kind: "matrix", matrix: Object.freeze(matrix),
            anchorReference: Object.freeze(anchorReference) })
    }
    const recipe: ResolvedSmartRecipe = Object.freeze({
        version: SMART_RENDER_RECIPE_VERSION,
        adjustments: Object.freeze({
            exposure: adjustments.exposure,
            contrast: adjustments.contrast,
            saturation: adjustments.saturation,
            shadows: adjustments.shadows,
            midtones: adjustments.midtones,
            highlights: adjustments.highlights,
        }),
        whiteBalance,
    })
    validateResolvedSmartRecipe(recipe)
    return recipe
}

export function validateResolvedSmartRecipe(recipe: ResolvedSmartRecipe): void {
    if (recipe.version !== SMART_RENDER_RECIPE_VERSION) {
        throw new Error("Unsupported Smart recipe version")
    }
    const a = recipe.adjustments
    if (!a || ![a.exposure, a.contrast, a.saturation, a.shadows, a.midtones, a.highlights]
        .every(value => typeof value === "number" && Number.isFinite(value))) {
        throw new Error("Invalid Smart scalar adjustments")
    }
    const wb = recipe.whiteBalance
    if (wb?.kind === "identity") return
    if (wb?.kind !== "matrix" ||
        !Array.isArray(wb.matrix) || wb.matrix.length !== 9 ||
        !Array.isArray(wb.anchorReference) || wb.anchorReference.length !== 3 ||
        ![...wb.matrix, ...wb.anchorReference]
            .every(value => typeof value === "number" && Number.isFinite(value))) {
        throw new Error("Invalid resolved White Balance effect")
    }
}

export function applyResolvedSmartRecipe(
    base: ImageData,
    recipe: ResolvedSmartRecipe
): ImageData {
    validateResolvedSmartRecipe(recipe)
    return applySmartPixelPipeline(base, recipe.adjustments,
        recipe.whiteBalance.kind === "identity" ? null : recipe.whiteBalance)
}
