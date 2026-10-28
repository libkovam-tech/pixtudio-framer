import { getQuantizationCompatibilityPairs, quantizationColorKey, runQuantization, type QuantizationResult } from "../../../editor/QuantizationCore.ts"
import {
    getFixedProfilePaletteForApplication, getFixedProfilePaletteForDisplay, quantizeWithFixedPalette,
    type QuantizationProfile,
} from "../../../editor/paletteQuantizationEngine.ts"
import { prepareImportedPaletteColorsForApplication } from "../../../editor/importedPaletteStrategy.ts"
import {
    quantizeFixedPaletteByColorSpace, type PaletteStrategyColorSpaceId,
} from "../../../editor/quantizationMethods/paletteStrategyQuantizers.ts"
import { applyDeConfetti, resolveDeConfettiSettings, type DeConfettiSettings } from "../../../editor/DeConfettiCore.ts"
import type { ReplayTimingObserver } from "./replayTiming.ts"

type Rgba = readonly [number, number, number, number]
type Output = Readonly<{ id: string; rgba: Rgba }>

export type FinalPaletteRecipe = Readonly<{
    version: 1
    source: "auto" | "preset" | "imported"
    kernel: "oklab" | "strategy"
    colorSpace: PaletteStrategyColorSpaceId
    colorLookup: "first" | "last"
    matchingColors: readonly string[]
    outputs: readonly Output[]
    deConfetti: Readonly<DeConfettiSettings>
    provenance: Readonly<{ extractionMethod: string | null }>
}>

export type DynamicAutoPaletteRecipe = Readonly<{
    version: 2
    source: "auto"
    method: string
    colorSpace: PaletteStrategyColorSpaceId
    colorCount: number
    deConfetti: Readonly<DeConfettiSettings>
}>

export type BatchPaletteRecipe = FinalPaletteRecipe | DynamicAutoPaletteRecipe

const COLOR_SPACES = ["default", "oklab", "cielab", "din99", "cam16-ucs", "ycbcr", "yuv", "yiq", "hsv", "hsl", "hsi"] as const

export function validateFinalPaletteRecipe(recipe: FinalPaletteRecipe): void {
    if (recipe.version !== 1) throw new Error("Unsupported final palette version")
    if (!["auto", "preset", "imported"].includes(recipe.source) ||
        !["oklab", "strategy"].includes(recipe.kernel) ||
        !COLOR_SPACES.includes(recipe.colorSpace) ||
        !["first", "last"].includes(recipe.colorLookup) ||
        !Array.isArray(recipe.matchingColors) ||
        !Array.isArray(recipe.outputs) ||
        recipe.outputs.length === 0 ||
        recipe.matchingColors.length !== recipe.outputs.length) {
        throw new Error("Invalid final palette recipe")
    }
    if (new Set(recipe.outputs.map(output => output.id)).size !== recipe.outputs.length ||
        recipe.matchingColors.some(color => typeof color !== "string") ||
        recipe.outputs.some(output =>
            typeof output.id !== "string" ||
            !Array.isArray(output.rgba) ||
            output.rgba.length !== 4 ||
            output.rgba.some((channel: number) => !Number.isInteger(channel) || channel < 0 || channel > 255))) {
        throw new Error("Invalid final palette identity")
    }
}

export function validateDynamicAutoPaletteRecipe(recipe: DynamicAutoPaletteRecipe): void {
    if (recipe.version !== 2 || recipe.source !== "auto" ||
        !Number.isSafeInteger(recipe.colorCount) || recipe.colorCount < 2 || recipe.colorCount > 32 ||
        !getQuantizationCompatibilityPairs().some(pair => pair.paletteContextKind === "auto" &&
            pair.methodId === recipe.method && pair.colorSpaceId === recipe.colorSpace)) {
        throw new Error("Invalid dynamic auto palette recipe")
    }
    const settings = recipe.deConfetti
    if (!settings || typeof settings.enabled !== "boolean" || !Number.isInteger(settings.tieBreaker) ||
        settings.tieBreaker < 0 || settings.tieBreaker > 3) {
        throw new Error("Invalid dynamic auto palette De-confetti settings")
    }
}

export function captureDynamicAutoPalette(reference: FinalPaletteRecipe, colorCount: number): DynamicAutoPaletteRecipe {
    validateFinalPaletteRecipe(reference)
    if (reference.source !== "auto" || !reference.provenance.extractionMethod) {
        throw new Error("Dynamic palette requires an Auto reference")
    }
    const recipe: DynamicAutoPaletteRecipe = Object.freeze({
        version: 2, source: "auto", method: reference.provenance.extractionMethod,
        colorSpace: reference.colorSpace, colorCount,
        deConfetti: Object.freeze({ ...reference.deConfetti }),
    })
    validateDynamicAutoPaletteRecipe(recipe)
    return recipe
}

function rgba(color: string): Rgba {
    const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(quantizationColorKey(color))
    if (!match) throw new Error("Invalid final palette color")
    return [Number(match[1]), Number(match[2]), Number(match[3]), 255]
}

// Capture the settled Core world, including fixed-palette display colors distinct from matching colors.
export function captureFinalPalette(
    world: QuantizationResult,
    profile: QuantizationProfile = { kind: "extract" },
    deConfetti?: DeConfettiSettings,
): FinalPaletteRecipe {
    if (world.overlayPixels.some(row => row.some(value => value !== null)) ||
        world.autoSwatches.some(swatch => swatch.isTransparent || swatch.isUser) ||
        (profile.kind === "fixed" && profile.transparentSwatchIds?.length)) {
        throw new Error("Final palette contains unsupported spatial or swatch state")
    }
    const colorSpace = COLOR_SPACES.find(value => value === world.methodProfile.colorSpaceId)
    if (!colorSpace) throw new Error("Unsupported final palette color space")
    const fixed = profile.kind === "fixed"
    const source = fixed ? profile.source === "imported" ? "imported" : "preset" : "auto"
    const defaultAuto = !fixed && world.methodProfile.methodId === "default"
    const colors = fixed ? getFixedProfilePaletteForApplication(profile) : world.autoSwatches.map(s => s.color)
    if (colors.length !== world.autoSwatches.length || colors.length === 0) {
        throw new Error("Final palette matching/output length mismatch")
    }
    let displaySwatches = world.autoSwatches
    if (fixed) {
        const displayColors = getFixedProfilePaletteForDisplay(profile)
        if (displayColors.some((color, index) =>
            quantizationColorKey(color) !== quantizationColorKey(displaySwatches[index].color))) {
            if (profile.source !== "imported" || profile.applicationColors) {
                throw new Error("Final palette differs from unedited profile")
            }
            // Imported application order can change after a swatch is added; preserve each Core swatch ID by color.
            const byColor = new Map(displaySwatches.map(swatch => [quantizationColorKey(swatch.color), swatch]))
            if (byColor.size !== displaySwatches.length ||
                displayColors.some(color => !byColor.has(quantizationColorKey(color)))) {
                throw new Error("Final palette differs from unedited profile")
            }
            displaySwatches = displayColors.map(color => byColor.get(quantizationColorKey(color))!)
        }
    }
    const importedOklab = fixed && colorSpace === "oklab" &&
        (profile.applicationSource ?? profile.source) === "imported"
    const matchingColors = importedOklab
        ? prepareImportedPaletteColorsForApplication(colors) : colors
    if (matchingColors.length !== colors.length) throw new Error("Duplicate final palette matching color")
    const orderedSwatches = importedOklab ? matchingColors.map(color => {
        const index = colors.findIndex(candidate => quantizationColorKey(candidate) === quantizationColorKey(color))
        const swatch = displaySwatches[index]
        if (!swatch) throw new Error("Unresolved final palette matching color")
        return swatch
    }) : displaySwatches
    const outputs = orderedSwatches.map(swatch => Object.freeze({
        id: swatch.id, rgba: Object.freeze(rgba(swatch.color)),
    }))
    if (new Set(outputs.map(swatch => swatch.id)).size !== outputs.length) {
        throw new Error("Duplicate final palette identity")
    }
    return Object.freeze({
        version: 1,
        source,
        kernel: defaultAuto || (fixed && colorSpace === "oklab") ? "oklab" : "strategy",
        colorSpace,
        colorLookup: defaultAuto ? "first" : "last",
        matchingColors: Object.freeze([...matchingColors]),
        outputs: Object.freeze(outputs),
        deConfetti: Object.freeze(resolveDeConfettiSettings(deConfetti)),
        provenance: Object.freeze({ extractionMethod: fixed ? null : world.methodProfile.methodId }),
    })
}

// Use the ordinary Core classifiers; extraction and UI sorting never run here.
export function replayFinalPalette(recipe: FinalPaletteRecipe, pixels: (string | null)[][],
    timing?: ReplayTimingObserver) {
    let started = timing ? performance.now() : 0
    validateFinalPaletteRecipe(recipe)
    timing?.("palette-validation", performance.now() - started)
    started = timing ? performance.now() : 0
    const colors = [...recipe.matchingColors]
    const mapped = recipe.kernel === "oklab"
        ? quantizeWithFixedPalette(pixels, colors)
        : recipe.kernel === "strategy"
            ? quantizeFixedPaletteByColorSpace(pixels, colors, recipe.colorSpace)
            : (() => { throw new Error("Unsupported final palette kernel") })()
    timing?.("palette-classification", performance.now() - started)
    started = timing ? performance.now() : 0
    const byColor = new Map<string, string>()
    for (let i = 0; i < colors.length; i++) {
        const key = quantizationColorKey(colors[i])
        if (recipe.colorLookup === "last" || !byColor.has(key)) byColor.set(key, recipe.outputs[i].id)
    }
    const labels = mapped.map(row => row.map(color => {
        if (color === null) return null
        const id = byColor.get(quantizationColorKey(color))
        if (id === undefined) throw new Error("Unresolved final palette color")
        return id
    }))
    timing?.("palette-label-mapping", performance.now() - started)
    started = timing ? performance.now() : 0
    const refined = applyDeConfetti({ pixels: labels, settings: recipe.deConfetti,
        swatches: recipe.outputs.map(output => ({ index: output.id, isTransparent: false })) }).pixels
    timing?.("deconfetti", performance.now() - started)
    started = timing ? performance.now() : 0
    const outputById = new Map(recipe.outputs.map(output => [output.id, output]))
    const output = refined.map(row => row.map(id => {
        if (id === null) return { label: null, rgba: [0, 0, 0, 0] as Rgba }
        const output = outputById.get(id)
        if (!output) throw new Error("Unresolved final palette identity")
        return { label: id, rgba: output.rgba }
    }))
    timing?.("palette-output-mapping", performance.now() - started)
    return output
}

export function replayDynamicAutoPalette(recipe: DynamicAutoPaletteRecipe, pixels: (string | null)[][],
    timing?: ReplayTimingObserver) {
    const started = timing ? performance.now() : 0
    validateDynamicAutoPaletteRecipe(recipe)
    const world = runQuantization({
        sourcePixels: pixels,
        overlayPixels: pixels.map(row => row.map(() => null)),
        paletteCount: recipe.colorCount,
        paletteContext: "auto",
        methodProfile: { methodId: recipe.method, colorSpaceId: recipe.colorSpace },
        deConfettiSettings: recipe.deConfetti,
    })
    timing?.("palette-classification", performance.now() - started)
    const colors = new Map(world.autoSwatches.map(swatch => [swatch.id, rgba(swatch.color)]))
    return world.imagePixels.map(row => row.map(id => {
        if (id === null) return { label: null, rgba: [0, 0, 0, 0] as Rgba }
        const color = colors.get(id)
        if (!color) throw new Error("Unresolved dynamic auto palette identity")
        return { label: id, rgba: color }
    }))
}
