import { describe, expect, it } from "vitest"
import { batchTemplateFixture } from "../../../../tests/fixtures/batchTemplateFixture"
import { getQuantizationCompatibilityPairs } from "../../../editor/QuantizationCore"
import { PREP_CONFIG } from "../../../editor/referencePreparation"
import { BATCH_CROP_RASTER_POLICY } from "../cropRasterPolicy"
import { BATCH_RENDER_SEMANTICS, MAX_BATCH_TEMPLATE_BYTES, batchRecipeIdentity, parseBatchTemplate,
    BATCH_DYNAMIC_RENDER_SEMANTICS, readBatchTemplate, serializeBatchTemplate, validateSealedReference } from "./batchTemplate"
import { captureDynamicAutoPalette } from "../render/finalPalette"
import { freezeFinalFrame } from "../render/finalFrame"

const fixture = () => batchTemplateFixture()
type EditableTemplate = { kind: string; schemaVersion: number; renderSemantics: string; sealed: {
    referenceInputGeometry: { width: number; height: number }; recipe: {
        version: number; pipeline: string; crop: Record<string, number>; grid: Record<string, number>
        smart: { version: number; adjustments: Record<string, number>; whiteBalance: Record<string, unknown> }
        palette: { source: string; kernel: string; colorSpace: string; colorLookup: string;
            matchingColors: string[]; outputs: { id: string; rgba: number[] }[];
            provenance: { extractionMethod: string | null }; deConfetti: { enabled: unknown; tieBreaker: number } }
    }
} }
function edit(change: (value: EditableTemplate) => void) {
    const value: EditableTemplate = JSON.parse(serializeBatchTemplate(fixture()))
    change(value)
    return JSON.stringify(value)
}

describe("strict source-independent Batch Template", () => {
    it("pins C1 semantics without changing the structural template schema", () => {
        expect(BATCH_CROP_RASTER_POLICY).toBe("canonical-software")
        expect(BATCH_RENDER_SEMANTICS).toBe("canonical-static-decode-crop-wrf-true-smart-final-palette-png-v2:" + JSON.stringify(PREP_CONFIG))
        const saved = JSON.parse(serializeBatchTemplate(fixture()))
        expect(saved.schemaVersion).toBe(1)
        expect(saved.renderSemantics).toBe(BATCH_RENDER_SEMANTICS)
        expect(parseBatchTemplate(JSON.stringify(saved))).toEqual(fixture())
    })
    it("rejects pre-C1 experimental semantics on parsing and file open, without relabeling", async () => {
        const text = edit(value => {
            value.renderSemantics = "canonical-static-decode-crop-smart-final-palette-png-v1:" + JSON.stringify(PREP_CONFIG)
        })
        expect(() => parseBatchTemplate(text)).toThrow("unsupported render semantics")
        await expect(readBatchTemplate(new File([text], "legacy.pixtudio-batch"))).rejects.toThrow("unsupported render semantics")
        expect(JSON.parse(text).renderSemantics).not.toBe(BATCH_RENDER_SEMANTICS)
    })
    it.each(getQuantizationCompatibilityPairs())("admits the native $paletteContextKind $methodId/$colorSpaceId palette", pair => {
        for (const source of pair.paletteContextKind === "auto" ? ["auto"] as const : ["preset", "imported"] as const) {
            const value = batchTemplateFixture(source, "1:1", pair.methodId, pair.colorSpaceId)
            expect(parseBatchTemplate(serializeBatchTemplate(value))).toEqual(value)
        }
    })
    it.each([
        ["auto", "1:1", "default", "default"],
        ["auto", "9:16", "k-means", "cielab"],
        ["preset", "16:9", "fixed-palette-mapping", "hsv"],
        ["imported", "3:2", "fixed-palette-mapping", "oklab"],
    ] as const)("preserves %s %s %s/%s with ordered matching/output identities", (source, aspect, method, space) => {
        const sealed = batchTemplateFixture(source, aspect, method, space)
        const text = serializeBatchTemplate(sealed)
        const reopened = parseBatchTemplate(text)
        expect(reopened).toEqual(sealed)
        expect(batchRecipeIdentity(reopened)).toBe(batchRecipeIdentity(sealed))
        if (reopened.recipe.palette.version !== 1 || sealed.recipe.palette.version !== 1) throw new Error("Expected frozen palette")
        expect(reopened.recipe.palette.matchingColors).toEqual(sealed.recipe.palette.matchingColors)
        expect(reopened.recipe.palette.outputs).toEqual(sealed.recipe.palette.outputs)
        expect(Object.isFrozen(reopened.recipe.palette.outputs[0].rgba)).toBe(true)
        expect(Reflect.set(reopened.recipe.grid, "size", 16)).toBe(false)
        expect(serializeBatchTemplate(reopened)).toBe(text)
        expect(new TextEncoder().encode(text).length).toBeLessThan(4096)
    })
    it("round-trips dynamic Auto settings without storing reference colors", () => {
        const frozen = fixture()
        if (frozen.recipe.palette.version !== 1) throw new Error("Expected frozen fixture")
        const palette = captureDynamicAutoPalette(frozen.recipe.palette, 4)
        const sealed = { ...frozen, recipe: freezeFinalFrame({ ...frozen.recipe, palette }) }
        const text = serializeBatchTemplate(sealed)
        const saved = JSON.parse(text)
        expect(saved.renderSemantics).toBe(BATCH_DYNAMIC_RENDER_SEMANTICS)
        expect(saved.sealed.recipe.palette).toEqual({ version: 2, source: "auto", method: "default",
            colorSpace: "default", colorCount: 4, deConfetti: { enabled: true, tieBreaker: 2 } })
        expect(text).not.toContain("matchingColors")
        expect(text).not.toContain("outputs")
        expect(parseBatchTemplate(text)).toEqual(sealed)
        expect(serializeBatchTemplate(parseBatchTemplate(text))).toBe(text)
        saved.renderSemantics = BATCH_RENDER_SEMANTICS
        expect(() => parseBatchTemplate(JSON.stringify(saved))).toThrow("unsupported render semantics")
    })
    it("rejects invalid dynamic method, count and extra persisted colors", () => {
        const frozen = fixture()
        if (frozen.recipe.palette.version !== 1) throw new Error("Expected frozen fixture")
        const sealed = { ...frozen, recipe: freezeFinalFrame({ ...frozen.recipe,
            palette: captureDynamicAutoPalette(frozen.recipe.palette, 4) }) }
        for (const change of [
            (p: Record<string, unknown>) => { p.method = "not-a-method" },
            (p: Record<string, unknown>) => { p.colorCount = 33 },
            (p: Record<string, unknown>) => { p.matchingColors = ["#FF0000"] },
            (p: Record<string, unknown>) => { p.source = "preset" },
        ]) {
            const value = JSON.parse(serializeBatchTemplate(sealed))
            change(value.sealed.recipe.palette)
            expect(() => parseBatchTemplate(JSON.stringify(value))).toThrow()
        }
    })
    it("reconstructs a deterministic identity independent of JSON object key order", () => {
        const value: EditableTemplate = JSON.parse(serializeBatchTemplate(fixture()))
        const reordered = { sealed: value.sealed, renderSemantics: value.renderSemantics, schemaVersion: 1, kind: value.kind }
        expect(batchRecipeIdentity(parseBatchTemplate(JSON.stringify(reordered)))).toBe(serializeBatchTemplate(fixture()))
    })
    it("keeps full resolved WB matrix/anchor without Reference pixels", () => {
        const value = structuredClone(fixture())
        const matrix = [1.02, -0.01, 0, 0, 1, 0, 0, 0, 0.98] as const
        const recipe = { ...value.recipe, smart: { ...value.recipe.smart, whiteBalance: {
            kind: "matrix" as const, matrix, anchorReference: [1, 0.95, 0.9] as const } } }
        expect(parseBatchTemplate(serializeBatchTemplate({ ...value, recipe })).recipe.smart.whiteBalance)
            .toEqual(recipe.smart.whiteBalance)
    })
    const cases: [string, (value: EditableTemplate) => void][] = [
        ["discriminator", v => { v.kind = "pixtudio" }],
        ["schema version", v => { v.schemaVersion = 2 }],
        ["semantics", v => { v.renderSemantics = BATCH_RENDER_SEMANTICS + "new" }],
        ["missing field", v => { delete v.sealed.recipe.grid.rows }],
        ["crop", v => { v.sealed.recipe.crop.drawWidth = 0 }],
        ["aspect", v => { v.sealed.recipe.crop.outputWidth = 513 }],
        ["huge geometry", v => { v.sealed.referenceInputGeometry.width = 9000 }],
        ["pixel budget", v => { v.sealed.referenceInputGeometry = { width: 8192, height: 8192 } }],
        ["grid mismatch", v => { v.sealed.recipe.grid.rows = 99 }],
        ["huge grid", v => { v.sealed.recipe.grid.size = 99999999 }],
        ["Smart range", v => { v.sealed.recipe.smart.adjustments.exposure = 101 }],
        ["unknown enum", v => { v.sealed.recipe.palette.colorSpace = "unknown" }],
        ["incompatible method/space", v => { v.sealed.recipe.palette.colorSpace = "hsv" }],
        ["kernel", v => { v.sealed.recipe.palette.kernel = "strategy" }],
        ["lookup", v => { v.sealed.recipe.palette.colorLookup = "last" }],
        ["unknown provenance", v => { v.sealed.recipe.palette.provenance.extractionMethod = "evil" }],
        ["mapping count", v => { v.sealed.recipe.palette.matchingColors.pop() }],
        ["bad color", v => { v.sealed.recipe.palette.matchingColors[0] = "rgb(999,0,0)" }],
        ["duplicate labels", v => { v.sealed.recipe.palette.outputs[1].id = v.sealed.recipe.palette.outputs[0].id }],
        ["path label", v => { v.sealed.recipe.palette.outputs[0].id = "C:\\secret" }],
        ["RGBA", v => { v.sealed.recipe.palette.outputs[0].rgba[0] = 256 }],
        ["transparent swatch", v => { v.sealed.recipe.palette.outputs[0].rgba[3] = 0 }],
        ["DeConfetti enum", v => { v.sealed.recipe.palette.deConfetti.tieBreaker = 4 }],
        ["DeConfetti boolean", v => { v.sealed.recipe.palette.deConfetti.enabled = "yes" }],
        ["WB matrix length", v => { v.sealed.recipe.smart.whiteBalance = { kind: "matrix", matrix: [1], anchorReference: [1, 1, 1] } }],
        ["WB zero anchor", v => { v.sealed.recipe.smart.whiteBalance = { kind: "matrix", matrix: [1,0,0,0,1,0,0,0,1], anchorReference: [0,0,0] } }],
    ]
    it.each(cases)("rejects %s atomically", (_, change) => { expect(() => parseBatchTemplate(edit(change))).toThrow() })
    it.each(["referenceBitmap", "history", "sourcePath", "manifest", "runId", "__proto__"])("rejects forbidden extra field %s", field => {
        const value = JSON.parse(serializeBatchTemplate(fixture()))
        Object.defineProperty(value.sealed, field, { value: "private", enumerable: true })
        expect(() => parseBatchTemplate(JSON.stringify(value))).toThrow()
    })
    it.each(["{}", "{", "[]", "null", '"text"', "GIF89a"])("rejects foreign/corrupt %s", text => {
        expect(() => parseBatchTemplate(text)).toThrow()
    })
    it("rejects NaN/infinity, unknown nested fields and malformed shapes before reconstruction", () => {
        const value = structuredClone(fixture())
        expect(() => validateSealedReference({ ...value, recipe: { ...value.recipe, grid: {} } })).toThrow()
        expect(() => validateSealedReference({ ...value, recipe: { ...value.recipe,
            crop: { ...value.recipe.crop, cx: Infinity } } })).toThrow()
        expect(() => validateSealedReference({ ...value, recipe: { ...value.recipe,
            smart: { ...value.recipe.smart, adjustments: { ...value.recipe.smart.adjustments, contrast: NaN } } } })).toThrow()
    })
    it("bounds file reads, rejects wrong extensions and invalid UTF8", async () => {
        const oversized = new File([new Uint8Array(MAX_BATCH_TEMPLATE_BYTES + 1)], "big.pixtudio-batch")
        await expect(readBatchTemplate(oversized)).rejects.toThrow("too large")
        expect(() => parseBatchTemplate(" ".repeat(MAX_BATCH_TEMPLATE_BYTES + 1))).toThrow("too large")
        await expect(readBatchTemplate(new File([serializeBatchTemplate(fixture())], "project.pixtudio"))).rejects.toThrow("Not a")
        await expect(readBatchTemplate(new File([new Uint8Array([255])], "bad.pixtudio-batch"))).rejects.toThrow("corrupted")
        expect(await readBatchTemplate(new File([serializeBatchTemplate(fixture())], "GOOD.PIXTUDIO-BATCH"))).toEqual(fixture())
        expect(await readBatchTemplate(new File([serializeBatchTemplate(fixture())], "NEW.PIXTUDIOBATCH"))).toEqual(fixture())
    })
    it("accepts Android's JSON suffix only for a valid Batch recipe", async () => {
        const text = serializeBatchTemplate(fixture())
        for (const name of ["PIXTUDIO_Batch_Template.pixtudio-batch.json",
            "PIXTUDIO_Batch_Template.pixtudio-batch (2).json",
            "PIXTUDIO_Batch_Template.pixtudiobatch.json",
            "PIXTUDIO_Batch_Template.pixtudiobatch (1).json"]) {
            expect(await readBatchTemplate(new File([text], name, { type: "application/json" }))).toEqual(fixture())
            await expect(readBatchTemplate(new File(["{}"], name, { type: "application/json" })))
                .rejects.toThrow("Not a Batch Pixelation template")
        }
    })
})
