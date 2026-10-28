import { describe, expect, it } from "vitest"
import { getQuantizationCompatibilityPairs, quantizationColorKey, runQuantization } from "../../../editor/QuantizationCore.ts"
import { sortSwatchesForUI } from "../../../editor/paletteSwatchSorting.ts"
import type { DeConfettiSettings } from "../../../editor/DeConfettiCore.ts"
import type { QuantizationProfile } from "../../../editor/paletteQuantizationEngine.ts"
import { captureDynamicAutoPalette, captureFinalPalette, replayDynamicAutoPalette, replayFinalPalette,
    type FinalPaletteRecipe } from "./finalPalette.ts"

const pixels = [
    ["#112233", "#CCDDEE", "#882255", null],
    ["#445566", "#BBCCCC", "#992277", "#113355"],
    ["#224466", "#CCDDAA", "#662244", "#DDEEFF"],
]
const overlay = pixels.map(row => row.map(() => null))
const preset: QuantizationProfile = { kind: "fixed", source: "builtin", id: "fixture", name: "Fixture",
    colors: ["#112233", "#CCDDEE", "#882255"] }
const imported: QuantizationProfile = { kind: "fixed", source: "imported", id: "fixture", name: "Fixture",
    colors: ["#882255", "#112233", "#CCDDEE"] }

function expectedRgba(world: ReturnType<typeof runQuantization>) {
    const swatches = new Map(world.autoSwatches.map(swatch => [swatch.id, swatch]))
    return world.imagePixels.map(row => row.map(id => {
        if (id === null) return [0, 0, 0, 0]
        const color = swatches.get(id)?.color
        if (!color) throw new Error("Unknown test swatch")
        return [...quantizationColorKey(color).match(/\d+/g)!.map(Number), 255]
    }))
}

function compare(profile: QuantizationProfile, methodProfile: { methodId: string; colorSpaceId: string },
    deConfetti: DeConfettiSettings = { enabled: false, tieBreaker: 0 }) {
    const world = runQuantization({ sourcePixels: pixels, overlayPixels: overlay, paletteCount: 3,
        methodProfile, paletteContext: profile.kind === "fixed" ? "fixed" : "auto",
        fixedPaletteProfile: profile.kind === "fixed" ? profile : undefined,
        deConfettiSettings: deConfetti })
    const recipe = captureFinalPalette(world, profile, deConfetti)
    const reopened: FinalPaletteRecipe = JSON.parse(JSON.stringify(recipe))
    const replay = replayFinalPalette(reopened, pixels)
    expect(replay.map(row => row.map(value => value.label))).toEqual(world.imagePixels)
    expect(replay.map(row => row.map(value => value.rgba))).toEqual(expectedRgba(world))
    return { world, recipe }
}

describe("v2 final palette proof", () => {
    it.each(getQuantizationCompatibilityPairs().filter(pair => pair.paletteContextKind === "auto"))(
        "recomputes Auto $methodId/$colorSpaceId for each frame", pair => {
            const { recipe } = compare({ kind: "extract" }, pair)
            const dynamic = captureDynamicAutoPalette(recipe, 3)
            const next = [["#FF0000", "#0000FF", "#00FF00", null], ["#0000FF", "#FF0000", "#00FF00", null]]
            const world = runQuantization({ sourcePixels: next, overlayPixels: next.map(row => row.map(() => null)),
                paletteCount: 3, paletteContext: "auto", methodProfile: pair,
                deConfettiSettings: dynamic.deConfetti })
            const output = replayDynamicAutoPalette(JSON.parse(JSON.stringify(dynamic)), next)
            expect(output.map(row => row.map(value => value.label))).toEqual(world.imagePixels)
            expect(output.map(row => row.map(value => value.rgba))).toEqual(expectedRgba(world))
            expect(new Set(output.flat().filter(value => value.label !== null).map(value => value.rgba.join(","))).size)
                .toBe(3)
            expect(JSON.stringify(dynamic)).not.toContain("matchingColors")
        }
    )
    it.each(getQuantizationCompatibilityPairs().filter(pair => pair.paletteContextKind === "auto"))(
        "replays final Auto $methodId/$colorSpaceId without extraction", pair => {
            const { recipe } = compare({ kind: "extract" }, pair)
            expect(recipe.source).toBe("auto")
            expect(recipe.provenance.extractionMethod).toBe(pair.methodId)
        }
    )

    it.each(getQuantizationCompatibilityPairs().filter(pair => pair.paletteContextKind === "fixed"))(
        "replays final Preset and Imported $methodId/$colorSpaceId", pair => {
            for (const profile of [preset, imported]) {
                const { recipe } = compare(profile, pair)
                expect(recipe.source).toBe(profile.source === "imported" ? "imported" : "preset")
                expect(recipe.provenance.extractionMethod).toBeNull()
            }
        }
    )

    it("keeps computational order and last duplicate-color identity across UI sorting", () => {
        const profile: QuantizationProfile = { kind: "fixed", source: "builtin", id: "tie", name: "Tie",
            colors: ["#000000", "#FEFEFE", "#000000"] }
        const source = [["#7F7F7F", "#000000"]]
        const world = runQuantization({ sourcePixels: source, overlayPixels: [[null, null]],
            paletteCount: 3, paletteContext: "fixed", fixedPaletteProfile: profile,
            methodProfile: { methodId: "fixed-palette-mapping", colorSpaceId: "hsv" } })
        const recipe = captureFinalPalette(world, profile)
        expect(world.imagePixels).toEqual([["auto-2", "auto-2"]])
        const before = replayFinalPalette(recipe, source)
        const sorted = sortSwatchesForUI(world.autoSwatches)
        expect(sorted).not.toBe(world.autoSwatches)
        expect(replayFinalPalette(JSON.parse(JSON.stringify(recipe)), source)).toEqual(before)
        expect(before.map(row => row.map(value => value.label))).toEqual(world.imagePixels)
        expect(recipe.matchingColors).toEqual(profile.colors)
        expect(recipe.outputs.map(value => value.id)).toEqual(world.autoSwatches.map(value => value.id))
    })

    it("keeps De-confetti as a frozen Core setting on the current pixels", () => {
        const settings = { enabled: true, tieBreaker: 2 as const }
        const { recipe } = compare(preset, { methodId: "fixed-palette-mapping", colorSpaceId: "oklab" }, settings)
        expect(recipe.deConfetti).toEqual(settings)
    })

    it("keeps the Reference-resolved Auto palette on a different frame", () => {
        const { recipe } = compare({ kind: "extract" }, { methodId: "default", colorSpaceId: "default" })
        const saved = JSON.stringify(recipe)
        const differentFrame = [["#FF0000", "#00FF00", "#0000FF", null]]
        const output = replayFinalPalette(JSON.parse(saved), differentFrame)[0]
        const identities = new Set(recipe.outputs.map(value => value.id))
        expect(output.slice(0, 3).every(value => value.label !== null && identities.has(value.label))).toBe(true)
        expect(output[3]).toEqual({ label: null, rgba: [0, 0, 0, 0] })
        expect(JSON.stringify(recipe)).toBe(saved)
    })

    it("replays imported preset swatch edits using original matching colors and edited output colors", () => {
        if (imported.kind !== "fixed") throw new Error("Expected imported fixture")
        const profile: QuantizationProfile = {
            ...imported,
            colors: ["#FFAA11", ...imported.colors.slice(1)],
            applicationSource: "imported",
            applicationColors: imported.colors.slice(),
        }
        for (const methodProfile of [
            { methodId: "fixed-palette-mapping", colorSpaceId: "oklab" },
            { methodId: "fixed-palette-mapping", colorSpaceId: "hsv" },
        ]) {
            const { recipe } = compare(profile, methodProfile)
            expect(recipe.matchingColors).not.toContain("#FFAA11")
            expect(recipe.outputs.some(output => output.rgba.join(",") === "255,170,17,255")).toBe(true)
        }
    })

    it.each(["ycbcr", "oklab"])("replays an imported palette extended after application sorting in %s", colorSpaceId => {
        const profile: QuantizationProfile = { kind: "fixed", source: "imported", id: "extended",
            name: "Extended", colors: ["#EFEEF6", "#000000"] }
        const source = [["#000000", "#EFEEF6"]]
        const world = runQuantization({ sourcePixels: source, overlayPixels: [[null, null]],
            paletteCount: 2, paletteContext: "fixed", fixedPaletteProfile: profile,
            methodProfile: { methodId: "fixed-palette-mapping", colorSpaceId } })
        const originalById = new Map(world.autoSwatches.map(swatch => [swatch.id, swatch]))
        const originalByColor = new Map(world.autoSwatches.map(swatch => [quantizationColorKey(swatch.color), swatch]))
        const autoSwatches = profile.colors.map((color, index) => ({
            ...originalByColor.get(quantizationColorKey(color))!, id: `auto-${index}`,
        }))
        const idByColor = new Map(autoSwatches.map(swatch => [quantizationColorKey(swatch.color), swatch.id]))
        const imagePixels = world.imagePixels.map(row => row.map(id => id === null ? null :
            idByColor.get(quantizationColorKey(originalById.get(id)!.color))!))
        const recipe = captureFinalPalette({ ...world, autoSwatches, imagePixels }, profile)
        const replay = replayFinalPalette(recipe, source)
        expect(recipe.matchingColors).toEqual(["#000000", "#EFEEF6"])
        expect(recipe.outputs.map(output => output.id)).toEqual(["auto-1", "auto-0"])
        expect(replay.map(row => row.map(value => value.label))).toEqual(imagePixels)
        expect(replay.map(row => row.map(value => value.rgba))).toEqual(source.map(row => row.map(color =>
            [...quantizationColorKey(color).match(/\d+/g)!.map(Number), 255])))
    })

    it("retains built-in matching order when an edited built-in becomes an imported preset", () => {
        if (preset.kind !== "fixed") throw new Error("Expected fixed fixture")
        const profile: QuantizationProfile = {
            ...preset,
            source: "imported",
            colors: ["#FFAA11", ...preset.colors.slice(1)],
            applicationSource: "builtin",
            applicationColors: preset.colors.slice(),
        }
        const { recipe } = compare(profile, { methodId: "fixed-palette-mapping", colorSpaceId: "oklab" })
        expect(recipe.matchingColors).toEqual(preset.colors)
    })

    it("stores only resolved final matching and output data, not authoring history or source files", () => {
        const { world, recipe } = compare(imported, { methodId: "fixed-palette-mapping", colorSpaceId: "oklab" })
        expect(Object.keys(recipe).sort()).toEqual([
            "colorLookup", "colorSpace", "deConfetti", "kernel", "matchingColors",
            "outputs", "provenance", "source", "version",
        ])
        expect(Object.isFrozen(recipe)).toBe(true)
        expect(Object.isFrozen(recipe.matchingColors)).toBe(true)
        expect(Object.isFrozen(recipe.outputs[0].rgba)).toBe(true)
        const outputBeforeMutation = [...recipe.outputs[0].rgba]
        world.autoSwatches[0].color = "#FFFFFF"
        expect(recipe.outputs[0].rgba).toEqual(outputBeforeMutation)
        expect(replayFinalPalette({ ...recipe, provenance: { extractionMethod: "not-an-extractor" } }, pixels))
            .toEqual(replayFinalPalette(recipe, pixels))
        expect(() => replayFinalPalette({ ...recipe, version: 2 } as unknown as FinalPaletteRecipe, pixels))
            .toThrow("version")
    })

    it("rejects spatial overlays, unmatched fixed colors and transparent swatches at capture", () => {
        const world = runQuantization({ sourcePixels: pixels, overlayPixels: overlay, paletteCount: 3 })
        expect(() => captureFinalPalette({ ...world, overlayPixels: [["auto-0"]] })).toThrow("unsupported")
        expect(() => captureFinalPalette({ ...world, autoSwatches: [
            { ...world.autoSwatches[0], isTransparent: true }, ...world.autoSwatches.slice(1),
        ] })).toThrow("unsupported")
        expect(() => captureFinalPalette({ ...world, autoSwatches: [
            { ...world.autoSwatches[0], isUser: true }, ...world.autoSwatches.slice(1),
        ] })).toThrow("unsupported")
        const fixedWorld = runQuantization({ sourcePixels: pixels, overlayPixels: overlay,
            paletteCount: 3, paletteContext: "fixed", fixedPaletteProfile: preset })
        expect(() => captureFinalPalette({ ...fixedWorld, autoSwatches: [
            { ...fixedWorld.autoSwatches[0], color: "#FFFFFF" }, ...fixedWorld.autoSwatches.slice(1),
        ] }, preset)).toThrow("differs from unedited")
        if (imported.kind !== "fixed") throw new Error("Expected imported fixture")
        expect(() => captureFinalPalette(fixedWorld, {
            ...imported, applicationColors: imported.colors,
        })).toThrow("differs from unedited")
    })
})
