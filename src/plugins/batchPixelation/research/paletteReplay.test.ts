import { describe, expect, it, vi } from "vitest"
import { runQuantization, getQuantizationCompatibilityPairs, quantizationColorKey } from "../../../editor/QuantizationCore.ts"
import { capturePaletteReplay, applyAutoPaletteReplayEdit, rebasePaletteReplay, replayPalette, type PaletteReplayRecipe } from "./paletteReplay.ts"
import { preparePaletteSwatchEditApplication, prepareSwatchDelete } from "../../../editor/paletteState.ts"
import { prepareFixedPaletteDisplayOverrideSwatchEditApplication, prepareFixedPaletteSwatchDelete, type ImportedPalettePresetRecord, type EditableFixedPaletteProfile } from "../../../editor/palettePresetExtension.ts"
import { sortSwatchesForUI } from "../../../editor/paletteSwatchSorting.ts"
import * as engine from "../../../editor/paletteQuantizationEngine.ts"

const source = [
    ["#112233", "#CCDDEE", "#882255", null],
    ["#445566", "#BBCCCC", "#992277", "#113355"],
    ["#224466", "#CCDDAA", "#662244", "#DDEEFF"],
]
const overlay: (string | null)[][] = source.map(row => row.map(() => null))
const TRANSPARENT = "__PX_TRANSPARENT__"
const roundTrip = (recipe: PaletteReplayRecipe): PaletteReplayRecipe => JSON.parse(JSON.stringify(recipe))

function rgba(world: Pick<ReturnType<typeof runQuantization>, "imagePixels" | "overlayPixels" | "autoSwatches">) {
    const swatches = new Map(world.autoSwatches.map(swatch => [swatch.id, swatch]))
    return world.imagePixels.map((row, y) => row.map((id, x) => {
        const swatch = id === null ? undefined : swatches.get(id)
        if (!swatch || swatch.isTransparent || world.overlayPixels[y][x] === TRANSPARENT) return [0, 0, 0, 0]
        const channels = quantizationColorKey(swatch.color).match(/\d+/g)!.map(Number)
        return [...channels, 255]
    }))
}

describe("Stage 3 palette checkpoint replay", () => {
    it.each(getQuantizationCompatibilityPairs().filter(pair => pair.paletteContextKind === "fixed"))(
        "replays Imported $methodId/$colorSpaceId", methodProfile => {
            const profile = { kind: "fixed" as const, source: "imported" as const, id: "fixture", name: "Fixture", colors: ["#112233", "#CCDDEE", "#882255"] }
            const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3, methodProfile, paletteContext: "fixed", fixedPaletteProfile: profile })
            expect(replayPalette(roundTrip(capturePaletteReplay(world, profile)), source).map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(world))
        },
    )
    it.each(getQuantizationCompatibilityPairs().filter(pair => pair.paletteContextKind === "auto"))(
        "replays initial Auto $methodId/$colorSpaceId without extraction", profile => {
            const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3, methodProfile: profile })
            const recipe = capturePaletteReplay(world)
            const extractor = vi.spyOn(engine, "extractPalette").mockImplementation(() => { throw new Error("Extraction during replay") })
            try {
                const replay = replayPalette(roundTrip(recipe), source)
                expect(replay.map(row => row.map(pixel => pixel.label))).toEqual(world.imagePixels)
                expect(replay.map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(world))
                expect(extractor).not.toHaveBeenCalled()
            } finally { extractor.mockRestore() }
        },
    )

    const cases = [
        ["edit"], ["delete"], ["transparent"], ["collapse"],
        ["edit", "delete"], ["delete", "edit"],
        ["collapse", "transparent"], ["transparent", "collapse"],
        ["collapse", "delete"], ["delete", "transparent"],
        ["transparent", "delete"], ["edit", "collapse", "delete"],
    ]
    it.each(cases.map(steps => [steps.join(" -> "), steps] as const))("compiles %s without Reference masks/history", (_name, steps) => {
        const initial = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 4 })
        let world: Pick<typeof initial, "imagePixels" | "overlayPixels" | "autoSwatches"> = initial
        let recipe = capturePaletteReplay(initial)
        for (const step of steps) {
            const editable = world.autoSwatches.filter(swatch => !swatch.isTransparent)
            expect(editable.length).toBeGreaterThan(0)
            const id = editable[editable.length - 1].id
            const color = step === "collapse" ? editable[0].color : "#334455"
            const input = { ...world, swatchId: id, selectedSwatch: id, userSwatches: [], autoOverrides: {} }
            world = step === "delete" ? prepareSwatchDelete(input)
                : preparePaletteSwatchEditApplication({ ...input, newColorUpper: color,
                    makeTransparent: step === "transparent", transparentPixel: TRANSPARENT })
            recipe = applyAutoPaletteReplayEdit(recipe, step === "delete" ? { kind: "delete", id }
                : { kind: "edit", id, color, transparent: step === "transparent" })
            const replay = replayPalette(roundTrip(recipe), source)
            expect(replay.map(row => row.map(pixel => pixel.label))).toEqual(world.imagePixels)
            expect(replay.map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(world))
        }
        expect(Object.keys(recipe).sort()).toEqual(["alphaRules", "atoms", "colorLookup", "colorSpace", "deConfetti", "kernel", "matchingColors", "mode", "outputs", "provenance", "version"])
        expect(recipe.atoms).toHaveLength(initial.autoSwatches.length)
        expect(Object.isFrozen(recipe)).toBe(true)
        expect(Object.isFrozen(recipe.atoms[0])).toBe(true)
        expect(Object.isFrozen(recipe.outputs[0]?.rgba)).toBe(true)
    })

    it("distinguishes matching colors from output edits and ignores UI sorting", () => {
        const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 4 })
        const original = capturePaletteReplay(world)
        const id = world.autoSwatches[0].id
        const recipe = applyAutoPaletteReplayEdit(original, { kind: "edit", id, color: "#FA0000", transparent: false })
        expect(recipe.atoms).toEqual(original.atoms)
        const before = replayPalette(recipe, source)
        sortSwatchesForUI(world.autoSwatches)
        expect(replayPalette(roundTrip(recipe), source)).toEqual(before)
        expect(original.outputs[0].color).not.toBe("#FA0000")
        const differentFrame = [["#000000", "#FFFFFF", null]]
        expect(replayPalette(roundTrip(recipe), differentFrame)[0]).toHaveLength(3)
    })

    it.each([false, true])("keeps Imported application colors after fixed display edit, transparent=%s", transparent => {
        const profile = { kind: "fixed" as const, source: "imported" as const, id: "fixture", name: "Fixture", colors: ["#112233", "#CCDDEE", "#882255"] }
        const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3, paletteContext: "fixed", fixedPaletteProfile: profile })
        const applied = prepareFixedPaletteDisplayOverrideSwatchEditApplication({ profile,
            swatchId: "auto-0", nextColor: "#FA0000", nextIsTransparent: transparent,
            autoSwatches: world.autoSwatches, importedPalettePresets: [], makeImportedId: () => "fixture-edit" })
        if (applied.kind !== "edited") throw new Error("Expected fixed palette edit")
        const next = { ...world, autoSwatches: applied.autoSwatches }
        const recipe = capturePaletteReplay(next, applied.profile)
        expect(recipe.atoms[0].color).not.toBe("#FA0000")
        expect(replayPalette(roundTrip(recipe), source).map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(next))
    })

    it("rejects hidden transparent-swatch edits and spatial checkpoint capture", () => {
        const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3 })
        const recipe = applyAutoPaletteReplayEdit(capturePaletteReplay(world), { kind: "edit", id: "auto-0", color: "#112233", transparent: true })
        expect(() => applyAutoPaletteReplayEdit(recipe, { kind: "edit", id: "auto-0", color: "#FFFFFF", transparent: false })).toThrow("not editable")
        expect(() => capturePaletteReplay({ ...world, overlayPixels: [[TRANSPARENT]] })).toThrow("spatial overlay")
    })

    it("compiles transparency across palette regeneration at the same sampling checkpoint", () => {
        const initial = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 5 })
        const id = initial.autoSwatches[2].id
        const color = initial.autoSwatches[2].color
        const edited = preparePaletteSwatchEditApplication({ ...initial, swatchId: id, newColorUpper: color,
            makeTransparent: true, transparentPixel: TRANSPARENT, userSwatches: [], selectedSwatch: id, autoOverrides: {} })
        const previous = applyAutoPaletteReplayEdit(capturePaletteReplay(initial), { kind: "edit", id, color, transparent: true })
        const next = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 2 })
        const rebuilt = { ...next, overlayPixels: edited.overlayPixels }
        const recipe = rebasePaletteReplay(previous, capturePaletteReplay(next))
        expect(recipe.alphaRules).toHaveLength(1)
        expect(replayPalette(roundTrip(recipe), source).map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(rebuilt))
        expect(replayPalette(roundTrip(capturePaletteReplay(next)), source).map(row => row.map(pixel => pixel.rgba))).not.toEqual(rgba(rebuilt))
        expect(rebasePaletteReplay(recipe, recipe).alphaRules).toHaveLength(1)
    })

    it("preserves first-distance tie and last duplicate-color label semantics independently", () => {
        const profile = { kind: "fixed" as const, source: "builtin" as const, id: "tie", name: "Tie",
            colors: ["#110000", "#001100", "#000011"], applicationColors: ["#000000", "#FEFEFE", "#000000"] }
        const pixels = [["#7F7F7F", "#000000"]]
        const world = runQuantization({ sourcePixels: pixels, overlayPixels: [[null, null]], paletteCount: 3,
            paletteContext: "fixed", fixedPaletteProfile: profile,
            methodProfile: { methodId: "fixed-palette-mapping", colorSpaceId: "hsv" } })
        expect(world.methodProfile.colorSpaceId).toBe("hsv")
        const recipe = capturePaletteReplay(world, profile)
        expect(world.imagePixels).toEqual([["auto-2", "auto-2"]])
        expect(replayPalette(roundTrip(recipe), pixels).map(row => row.map(p => p.label))).toEqual(world.imagePixels)
        const reordered = { ...recipe, matchingColors: ["#FEFEFE", "#000000", "#000000"] }
        expect(replayPalette(reordered, pixels)[0][0].label).toBe("auto-1")
        const sorted = sortSwatchesForUI(world.autoSwatches)
        expect(sorted).not.toBe(world.autoSwatches)
        expect(recipe.matchingColors).toEqual(profile.applicationColors)
    })

    it.each([false, true])("preserves fixed edit/delete ordering, edit first=%s", editFirst => {
        const original = { kind: "fixed" as const, source: "imported" as const, id: "fixture", name: "Fixture", colors: ["#112233", "#CCDDEE", "#882255"] }
        let profile: engine.QuantizationProfile & { kind: "fixed" } = original
        const quantize = (): ReturnType<typeof runQuantization> => runQuantization({ sourcePixels: source, overlayPixels: overlay,
            paletteCount: profile.colors.length, paletteContext: "fixed", fixedPaletteProfile: profile })
        let world: ReturnType<typeof runQuantization> = quantize()
        for (const step of editFirst ? ["edit", "delete"] : ["delete", "edit"]) {
            if (step === "edit") {
                const applied: ReturnType<typeof prepareFixedPaletteDisplayOverrideSwatchEditApplication<ImportedPalettePresetRecord, engine.QuantizationSwatch>> = prepareFixedPaletteDisplayOverrideSwatchEditApplication({ profile, swatchId: "auto-0",
                    nextColor: "#FA0000", autoSwatches: world.autoSwatches, importedPalettePresets: [], makeImportedId: () => "edited" })
                if (applied.kind !== "edited") throw new Error("Expected edit")
                profile = applied.profile
                world = { ...world, autoSwatches: applied.autoSwatches }
            } else {
                const id = world.autoSwatches[1].id
                const deleted: ReturnType<typeof prepareFixedPaletteSwatchDelete<EditableFixedPaletteProfile, string>> = prepareFixedPaletteSwatchDelete({ profile, swatchColor: world.autoSwatches[1].color,
                    swatchId: id, swatchIndex: 1, selectedSwatch: id })
                expect(deleted.removed).toBe(true)
                profile = deleted.profile
                world = quantize()
            }
            expect(replayPalette(roundTrip(capturePaletteReplay(world, profile)), source).map(row => row.map(pixel => pixel.rgba))).toEqual(rgba(world))
        }
    })

    it("does not consult extraction provenance or mutate the frozen input", () => {
        const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3 })
        const recipe = capturePaletteReplay(world)
        const before = JSON.stringify(recipe)
        expect(replayPalette({ ...recipe, provenance: { extractionMethod: "not-an-extractor" } }, source)).toEqual(replayPalette(recipe, source))
        expect(JSON.stringify(recipe)).toBe(before)
        expect(() => replayPalette({ ...recipe, version: 2 } as unknown as PaletteReplayRecipe, source)).toThrow("version")
    })

    it("keeps distinct fixed identities when display colors become duplicates", () => {
        const profile = { kind: "fixed" as const, source: "imported" as const, id: "fixture", name: "Fixture", colors: ["#112233", "#CCDDEE", "#882255"] }
        const world = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 3, paletteContext: "fixed", fixedPaletteProfile: profile })
        const edited = prepareFixedPaletteDisplayOverrideSwatchEditApplication({ profile, swatchId: "auto-1",
            nextColor: world.autoSwatches[0].color, autoSwatches: world.autoSwatches, importedPalettePresets: [], makeImportedId: () => "duplicate" })
        if (edited.kind !== "edited") throw new Error("Expected fixed edit")
        const recipe = capturePaletteReplay({ ...world, autoSwatches: edited.autoSwatches }, edited.profile)
        expect(recipe.outputs[0].rgba).toEqual(recipe.outputs[1].rgba)
        expect(recipe.outputs[0].id).not.toBe(recipe.outputs[1].id)
        expect(recipe.atoms[0].color).not.toBe(recipe.atoms[1].color)
        const result = replayPalette(roundTrip(recipe), source)
        expect(result.map(row => row.map(pixel => pixel.label))).toEqual(world.imagePixels)
        expect(result.map(row => row.map(pixel => pixel.rgba))).toEqual(rgba({ ...world, autoSwatches: edited.autoSwatches }))
    })

    it("transfers a rebuilt alpha rule to permuted pixels and a different frame shape", () => {
        const initial = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 5 })
        const previous = applyAutoPaletteReplayEdit(capturePaletteReplay(initial), { kind: "edit",
            id: "auto-2", color: initial.autoSwatches[2].color, transparent: true })
        const next = runQuantization({ sourcePixels: source, overlayPixels: overlay, paletteCount: 2 })
        const recipe = roundTrip(rebasePaletteReplay(previous, capturePaletteReplay(next)))
        const original = replayPalette(recipe, source).flat()
        const different = [source.flat().reverse()]
        expect(replayPalette(recipe, different).flat()).toEqual(original.reverse())
        expect(Object.isFrozen(rebasePaletteReplay(previous, capturePaletteReplay(next)).alphaRules[0].classes)).toBe(true)
    })
})
