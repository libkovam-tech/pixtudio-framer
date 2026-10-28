import { quantizationColorKey, type QuantizationResult } from "../../../editor/QuantizationCore.ts"
import {
    getFixedProfilePaletteForApplication, quantizeWithFixedPalette,
    type QuantizationProfile, type QuantizationSwatch,
} from "../../../editor/paletteQuantizationEngine.ts"
import { prepareImportedPaletteColorsForApplication } from "../../../editor/importedPaletteStrategy.ts"
import {
    quantizeFixedPaletteByColorSpace, type PaletteStrategyColorSpaceId,
} from "../../../editor/quantizationMethods/paletteStrategyQuantizers.ts"
import { preparePaletteSwatchEditApplication, prepareSwatchDelete } from "../../../editor/paletteState.ts"
import { applyDeConfetti, resolveDeConfettiSettings, type DeConfettiSettings } from "../../../editor/DeConfettiCore.ts"

const TRANSPARENT = "__PX_TRANSPARENT__"
type Rgba = readonly [number, number, number, number]
type Atom = Readonly<{ id: string; color: string; target: string | null; transparent: boolean }>
type Output = Readonly<{ id: string; color: string; transparent: boolean; rgba: Rgba }>
type AlphaRule = Readonly<{
    kernel: PaletteReplayRecipe["kernel"]
    colorSpace: PaletteStrategyColorSpaceId
    colorLookup: "first" | "last"
    matchingColors: readonly string[]
    deConfetti: Readonly<DeConfettiSettings>
    classes: readonly Readonly<{ id: string; color: string; transparent: boolean }>[]
}>

// A scoped Stage 3 proof at the quantization checkpoint, not a saved Batch Template.
// Atoms are palette identities, never Reference coordinates or sampled pixels.
export type PaletteReplayRecipe = Readonly<{
    version: 1
    mode: "auto" | "fixed"
    kernel: "oklab" | "strategy"
    colorSpace: PaletteStrategyColorSpaceId
    colorLookup: "first" | "last"
    matchingColors: readonly string[]
    deConfetti: Readonly<DeConfettiSettings>
    provenance: Readonly<{ extractionMethod: string | null }>
    atoms: readonly Atom[]
    outputs: readonly Output[]
    alphaRules: readonly AlphaRule[]
}>

const COLOR_SPACES = ["default", "oklab", "cielab", "din99", "cam16-ucs", "ycbcr", "yuv", "yiq", "hsv", "hsl", "hsi"] as const

function output(swatch: QuantizationSwatch): Output {
    const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(quantizationColorKey(swatch.color))
    if (!match) throw new Error("Invalid palette output color")
    const rgba: Rgba = swatch.isTransparent
        ? [0, 0, 0, 0] : [Number(match[1]), Number(match[2]), Number(match[3]), 255]
    return { id: swatch.id, color: swatch.color, transparent: swatch.isTransparent, rgba }
}

function freeze(recipe: PaletteReplayRecipe): PaletteReplayRecipe {
    return Object.freeze({
        ...recipe,
        provenance: Object.freeze({ ...recipe.provenance }),
        matchingColors: Object.freeze([...recipe.matchingColors]),
        deConfetti: Object.freeze({ ...recipe.deConfetti }),
        atoms: Object.freeze(recipe.atoms.map(atom => Object.freeze({ ...atom }))),
        outputs: Object.freeze(recipe.outputs.map(value => Object.freeze({
            ...value, rgba: Object.freeze([...value.rgba]) as Rgba,
        }))),
        alphaRules: Object.freeze(recipe.alphaRules.map(rule => Object.freeze({ ...rule,
            matchingColors: Object.freeze([...rule.matchingColors]),
            deConfetti: Object.freeze({ ...rule.deConfetti }),
            classes: Object.freeze(rule.classes.map(value => Object.freeze({ ...value }))),
        }))),
    })
}

/** Capture immediately after Core quantization, before edits erase matching colors.
 * Pass the same resolved De-confetti settings used by the authoring Core call.
 */
export function capturePaletteReplay(
    world: QuantizationResult,
    profile: QuantizationProfile = { kind: "extract" },
    deConfetti?: DeConfettiSettings,
): PaletteReplayRecipe {
    if (world.overlayPixels.some(row => row.some(value => value !== null))) {
        throw new Error("Palette checkpoint contains spatial overlay")
    }
    const colorSpace = COLOR_SPACES.find(value => value === world.methodProfile.colorSpaceId)
    if (!colorSpace) throw new Error("Unsupported palette color space")
    const fixed = profile.kind === "fixed"
    const defaultAuto = !fixed && world.methodProfile.methodId === "default"
    const colors = fixed ? getFixedProfilePaletteForApplication(profile) : world.autoSwatches.map(s => s.color)
    if (colors.length !== world.autoSwatches.length) throw new Error("Palette identity length mismatch")
    const transparent = new Set(fixed ? profile.transparentSwatchIds : [])
    const recipe: PaletteReplayRecipe = {
        version: 1, mode: fixed ? "fixed" : "auto",
        kernel: defaultAuto || (fixed && colorSpace === "oklab") ? "oklab" : "strategy",
        colorSpace, colorLookup: defaultAuto ? "first" : "last",
        deConfetti: resolveDeConfettiSettings(deConfetti),
        matchingColors: fixed && colorSpace === "oklab" && (profile.applicationSource ?? profile.source) === "imported"
            ? prepareImportedPaletteColorsForApplication(colors) : colors,
        provenance: { extractionMethod: fixed ? null : world.methodProfile.methodId },
        atoms: colors.map((color, i) => ({ id: world.autoSwatches[i].id, color, target: world.autoSwatches[i].id, transparent: false })),
        outputs: world.autoSwatches.map(swatch => output({ ...swatch, isTransparent: swatch.isTransparent || transparent.has(swatch.id) })),
        alphaRules: [],
    }
    return freeze(recipe)
}

/** Keep resolved alpha predicates across a palette rebuild at the SAME sampling checkpoint.
 * This does not authorize a different grid, Smart transform, or De-confetti placement.
 */
export function rebasePaletteReplay(previous: PaletteReplayRecipe, next: PaletteReplayRecipe): PaletteReplayRecipe {
    const rules = [...previous.alphaRules, ...next.alphaRules]
    if (previous.atoms.some(atom => atom.transparent)) {
        rules.push({ kernel: previous.kernel, colorSpace: previous.colorSpace,
            deConfetti: previous.deConfetti,
            matchingColors: previous.matchingColors,
            colorLookup: previous.colorLookup, classes: previous.atoms.map(({ id, color, transparent }) => ({ id, color, transparent })) })
    }
    const unique = new Map(rules.map(rule => [JSON.stringify(rule), rule]))
    return freeze({ ...next, alphaRules: [...unique.values()] })
}

type AutoEdit = { kind: "edit"; id: string; color: string; transparent: boolean } | { kind: "delete"; id: string }

/** Compile one authoring operation into a flat effective label mapping. No action log survives.
 * The canonical reducer runs on one symbolic slot per atom, not on Reference cells.
 */
export function applyAutoPaletteReplayEdit(recipe: PaletteReplayRecipe, edit: AutoEdit): PaletteReplayRecipe {
    if (recipe.mode !== "auto") throw new Error("Auto operation requires an Auto checkpoint")
    const edited = recipe.outputs.find(value => value.id === edit.id)
    if (!edited || edited.transparent) throw new Error("Swatch is not editable in ordinary palette UI")
    const input = {
        swatchId: edit.id,
        imagePixels: [recipe.atoms.map(atom => atom.target)],
        overlayPixels: [recipe.atoms.map(atom => atom.transparent ? TRANSPARENT : null)],
        autoSwatches: recipe.outputs.map(value => ({ id: value.id, color: value.color, isTransparent: value.transparent, isUser: false })),
        userSwatches: [], selectedSwatch: edit.id, autoOverrides: {},
    }
    const applied = edit.kind === "delete" ? prepareSwatchDelete(input)
        : preparePaletteSwatchEditApplication({ ...input, newColorUpper: edit.color,
            makeTransparent: edit.transparent, transparentPixel: TRANSPARENT })
    return freeze({ ...recipe,
        atoms: recipe.atoms.map((atom, i) => ({ ...atom, target: applied.imagePixels[0][i],
            transparent: applied.overlayPixels[0][i] === TRANSPARENT })),
        outputs: applied.autoSwatches.map(output),
    })
}

/** Input is the current frame's already-prepared/sampled Core pixels, not stored Reference data. */
export function replayPalette(recipe: PaletteReplayRecipe, pixels: (string | null)[][]) {
    if (recipe.version !== 1) throw new Error("Unsupported palette replay version")
    const labels = classifyLabels(recipe, recipe.atoms, pixels)
    const atoms = new Map(recipe.atoms.map(atom => [atom.id, atom]))
    const outputs = new Map(recipe.outputs.map(value => [value.id, value]))
    const alphaMasks = recipe.alphaRules.map(rule => {
        // Classify with the same kernels, retaining identity instead of storing a spatial mask.
        const mapped = classifyLabels(rule, rule.classes, pixels)
        const transparentIds = new Set(rule.classes.filter(value => value.transparent).map(value => value.id))
        return mapped.map(row => row.map(id => id !== null && transparentIds.has(id)))
    })
    return labels.map((row, y) => row.map((id, x) => {
        if (id === null) return { label: null, rgba: [0, 0, 0, 0] as Rgba }
        const atom = atoms.get(id)
        if (!atom) throw new Error("Unresolved palette matching color")
        const value = atom.target === null ? undefined : outputs.get(atom.target)
        if (atom.target !== null && !value) throw new Error("Unresolved palette output identity")
        return { label: atom.target, rgba: atom.transparent || !value || alphaMasks.some(mask => mask[y][x]) ? [0, 0, 0, 0] as Rgba : value.rgba }
    }))
}

function classifyLabels(
    rule: Pick<PaletteReplayRecipe, "kernel" | "matchingColors" | "colorSpace" | "colorLookup" | "deConfetti">,
    classes: readonly Readonly<{ id: string; color: string }>[],
    pixels: (string | null)[][],
) {
    const byColor = new Map<string, string>()
    for (const value of classes) {
        const key = quantizationColorKey(value.color)
        if (rule.colorLookup === "last" || !byColor.has(key)) byColor.set(key, value.id)
    }
    const labels = classify(rule, pixels).map(row => row.map(color => {
        if (color === null) return null
        const id = byColor.get(quantizationColorKey(color))
        if (id === undefined) throw new Error("Unresolved palette matching color")
        return id
    }))
    // Ordinary Core refines original labels BEFORE display overrides/remaps/transparency.
    return applyDeConfetti({ pixels: labels, settings: rule.deConfetti,
        swatches: classes.map(value => ({ index: value.id, isTransparent: false })) }).pixels
}

function classify(rule: Pick<PaletteReplayRecipe, "kernel" | "matchingColors" | "colorSpace">, pixels: (string | null)[][]) {
    const colors = [...rule.matchingColors]
    if (rule.kernel === "oklab") return quantizeWithFixedPalette(pixels, colors)
    if (rule.kernel === "strategy") return quantizeFixedPaletteByColorSpace(pixels, colors, rule.colorSpace)
    throw new Error("Unsupported palette replay kernel")
}
