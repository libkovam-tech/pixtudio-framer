import { describe, expect, it, vi } from "vitest"
import {
    buildReferenceSnapshot, initializeWhiteBalanceDomainStateFromBakedBase,
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    type SmartReferenceAdjustments,
} from "../../../editor/smartRender.ts"
import { applyResolvedSmartRecipe, resolveSmartRecipe, type ResolvedSmartRecipe } from "./smartRecipe.ts"

class TestImageData {
    data: Uint8ClampedArray<ArrayBuffer>
    width: number
    height: number
    colorSpace = "srgb" as const
    constructor(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) {
        this.data = data
        this.width = width
        this.height = height
    }
}
vi.stubGlobal("ImageData", TestImageData)

function fixture(cast: "warm" | "cool") {
    const bytes = new Uint8ClampedArray(64 * 32 * 4)
    for (let i = 0; i < bytes.length; i += 4) {
        const value = 35 + (i * 7) % 140
        bytes.set(cast === "warm" ? [value + 40, value, value - 40, 255]
            : [value - 40, value, value + 40, 255], i)
    }
    bytes.set([255, 0, 25, 0], 0)
    bytes.set([5, 255, 150, 1], 4)
    bytes.set([0, 30, 255, 128], 8)
    return new ImageData(bytes, 64, 32)
}

describe("Shared Smart resolve/apply", () => {
    it("uses only final scalar values and the reference-calibrated WB effect", () => {
        const reference = fixture("warm")
        const source = fixture("cool")
        const domain = initializeWhiteBalanceDomainStateFromBakedBase(reference)
        const final: SmartReferenceAdjustments = {
            exposure: 23, whiteBalance: 0.8, contrast: -17,
            saturation: 45, shadows: -40, midtones: 18, highlights: -29,
        }
        const direct = resolveSmartRecipe(final, domain)
        for (const intermediate of [
            { exposure: -70, whiteBalance: 0.1, contrast: 60,
                saturation: -80, shadows: 45, midtones: -20, highlights: 75 },
            ZERO_SMART_REFERENCE_ADJUSTMENTS,
        ]) {
            expect(resolveSmartRecipe(intermediate, domain)).not.toEqual(direct)
            buildReferenceSnapshot(reference, intermediate, domain)
        }
        const afterHistory = resolveSmartRecipe(final, domain)
        expect(afterHistory).toEqual(direct)
        const reopened: ResolvedSmartRecipe = JSON.parse(JSON.stringify(afterHistory))
        expect(applyResolvedSmartRecipe(source, reopened).data).toEqual(
            applyResolvedSmartRecipe(source, direct).data
        )
        expect(applyResolvedSmartRecipe(reference, reopened).data).toEqual(
            buildReferenceSnapshot(reference, final, domain)!.data
        )
    })

    it.each([0, 0.2, 0.5, 0.8, 1])("replays Reference and a different Source with frozen WB %s", wb => {
        const reference = fixture("warm")
        const source = fixture("cool")
        const domain = initializeWhiteBalanceDomainStateFromBakedBase(reference)
        const adjustments = { ...ZERO_SMART_REFERENCE_ADJUSTMENTS, whiteBalance: wb,
            exposure: 23, contrast: -17, saturation: 45, shadows: -40, midtones: 18, highlights: -29 }
        const recipe = resolveSmartRecipe(adjustments, domain)
        // JSON round-trip proves the apply path needs no closures, cached pixels
        // or authoring domain state. File-format validation belongs to a later gate.
        const reopened: ResolvedSmartRecipe = JSON.parse(JSON.stringify(recipe))
        for (const base of [reference, source]) {
            const before = base.data.slice()
            const replay = applyResolvedSmartRecipe(base, reopened)
            expect(replay.data).toEqual(buildReferenceSnapshot(base, adjustments, domain)!.data)
            expect([replay.width, replay.height]).toEqual([64, 32])
            expect(base.data).toEqual(before)
            for (let i = 3; i < replay.data.length; i += 4) expect(replay.data[i]).toBe(before[i])
        }
        if (wb !== 0.5) {
            const sourceDomain = initializeWhiteBalanceDomainStateFromBakedBase(source)
            expect(resolveSmartRecipe(adjustments, sourceDomain).whiteBalance).not.toEqual(recipe.whiteBalance)
            const recalibrated = buildReferenceSnapshot(source, adjustments, sourceDomain)!
            expect(applyResolvedSmartRecipe(source, recipe).data).not.toEqual(recalibrated.data)
        }
    })

    it("copies neutral pixels exactly, including hidden RGB and partial alpha", () => {
        const base = fixture("cool")
        const recipe = resolveSmartRecipe(ZERO_SMART_REFERENCE_ADJUSTMENTS)
        expect(recipe.whiteBalance).toEqual({ kind: "identity" })
        const replay = applyResolvedSmartRecipe(base, recipe)
        expect(replay).not.toBe(base)
        expect(replay.data).not.toBe(base.data)
        expect(replay.data).toEqual(base.data)
        expect(buildReferenceSnapshot(null, ZERO_SMART_REFERENCE_ADJUSTMENTS)).toBeNull()
    })

    it("preserves the distinct whole-pipeline and WB-only neutral thresholds", () => {
        const nearNeutral = { ...ZERO_SMART_REFERENCE_ADJUSTMENTS, whiteBalance: 0.5000008 }
        expect(resolveSmartRecipe(nearNeutral).whiteBalance.kind).toBe("identity")
        expect(resolveSmartRecipe({ ...nearNeutral, exposure: 10 }).whiteBalance.kind).toBe("matrix")
    })

    it("freezes every replay field without retaining calibration or editor-private state", () => {
        const adjustments = { ...ZERO_SMART_REFERENCE_ADJUSTMENTS, whiteBalance: 0.8 }
        const domain = initializeWhiteBalanceDomainStateFromBakedBase(fixture("warm"))
        const recipe = resolveSmartRecipe(adjustments, domain)
        const saved = JSON.stringify(recipe)
        adjustments.whiteBalance = 0
        adjustments.exposure = 100
        domain.sourceKelvin = 16000
        domain.whiteBalanceConfidence = 0
        expect(JSON.stringify(recipe)).toBe(saved)
        expect(Object.keys(recipe)).toEqual(["version", "adjustments", "whiteBalance"])
        expect(Object.keys(recipe.adjustments)).toEqual([
            "exposure", "contrast", "saturation", "shadows", "midtones", "highlights",
        ])
        expect(Object.isFrozen(recipe)).toBe(true)
        expect(Object.isFrozen(recipe.adjustments)).toBe(true)
        expect(Object.isFrozen(recipe.whiteBalance)).toBe(true)
        expect(Reflect.set(recipe.adjustments, "exposure", 100)).toBe(false)
        expect(recipe.whiteBalance.kind).toBe("matrix")
        if (recipe.whiteBalance.kind !== "matrix") throw new Error("Expected WB effect")
        expect(Object.keys(recipe.whiteBalance)).toEqual(["kind", "matrix", "anchorReference"])
        expect(Object.isFrozen(recipe.whiteBalance.matrix)).toBe(true)
        expect(Object.isFrozen(recipe.whiteBalance.anchorReference)).toBe(true)
        expect(Reflect.set(recipe.whiteBalance.matrix, "0", 0)).toBe(false)
        expect(Reflect.set(recipe.whiteBalance.anchorReference, "0", 0)).toBe(false)
    })

    it("requires anchorReference as well as the matrix for faithful gamut fitting", () => {
        const base = fixture("warm")
        const recipe = resolveSmartRecipe({ ...ZERO_SMART_REFERENCE_ADJUSTMENTS, whiteBalance: 1 },
            initializeWhiteBalanceDomainStateFromBakedBase(base))
        if (recipe.whiteBalance.kind !== "matrix") throw new Error("Expected WB effect")
        const altered: ResolvedSmartRecipe = { ...recipe, whiteBalance: {
            ...recipe.whiteBalance, anchorReference: [1, 0, 0],
        } }
        expect(applyResolvedSmartRecipe(base, recipe).data).not.toEqual(applyResolvedSmartRecipe(base, altered).data)
    })

    it.each(["exposure", "contrast", "saturation", "shadows", "midtones", "highlights"] as const)(
        "rejects a non-finite %s rather than silently producing pixels", key => {
            const adjustments: SmartReferenceAdjustments = { ...ZERO_SMART_REFERENCE_ADJUSTMENTS, [key]: NaN }
            expect(() => resolveSmartRecipe(adjustments)).toThrow("Invalid Smart scalar")
        }
    )

    it.each([
        { version: 2 },
        { adjustments: {} },
        { whiteBalance: { kind: "unknown" } },
        { whiteBalance: { kind: "matrix", matrix: [1], anchorReference: [1, 1, 1] } },
        { whiteBalance: { kind: "matrix", matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
        { whiteBalance: { kind: "matrix", matrix: [NaN, 0, 0, 0, 1, 0, 0, 0, 1], anchorReference: [1, 1, 1] } },
    ])("rejects invalid replay data: %j", invalid => {
        const recipe = { ...resolveSmartRecipe(ZERO_SMART_REFERENCE_ADJUSTMENTS), ...invalid }
        expect(() => applyResolvedSmartRecipe(fixture("warm"), recipe as ResolvedSmartRecipe)).toThrow()
    })
})
