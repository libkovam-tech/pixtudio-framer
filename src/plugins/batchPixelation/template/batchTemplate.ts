import { getQuantizationCompatibilityPairs } from "../../../editor/QuantizationCore.ts"
import { ASPECT_RATIO_TEMPLATES, calculateCanvasGridGeometry, calculateReferenceDimensions } from "../../../editor/canvasGeometry.ts"
import { assertDecodedImageDimensions } from "../../../editor/fileIntakeSecurity.ts"
import { PREP_CONFIG } from "../../../editor/referencePreparation.ts"
import { freezeFinalFrame } from "../render/finalFrame.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import type { BatchPaletteRecipe, DynamicAutoPaletteRecipe, FinalPaletteRecipe } from "../render/finalPalette.ts"
import type { ResolvedSmartRecipe } from "../render/smartRecipe.ts"

export const BATCH_TEMPLATE_FILENAME = "PIXTUDIO_Batch_Template.pixtudiobatch"
export const MAX_BATCH_TEMPLATE_BYTES = 256 * 1024
// Bump the revision if a numerical kernel/decode/export convention changes.
// The preparation settings are also pinned, rather than silently reinterpreted.
export const BATCH_RENDER_SEMANTICS = "canonical-static-decode-crop-wrf-true-smart-final-palette-png-v2:" + JSON.stringify(PREP_CONFIG)
export const BATCH_DYNAMIC_RENDER_SEMANTICS = "canonical-static-decode-crop-wrf-true-smart-dynamic-auto-palette-png-v3:" + JSON.stringify(PREP_CONFIG)
export type BatchTemplate = Readonly<{
    kind: "pixtudio-batch-template"
    schemaVersion: 1
    renderSemantics: typeof BATCH_RENDER_SEMANTICS | typeof BATCH_DYNAMIC_RENDER_SEMANTICS
    sealed: SealedReference
}>

export class BatchTemplateError extends Error {}
function invalid(): never { throw new BatchTemplateError("Template contains invalid recipe settings") }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
    const record = value as Record<string, unknown>
    if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) invalid()
    return record
}
function number(value: unknown, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalid()
    return value
}
function integer(value: unknown, min: number, max: number): number {
    const result = number(value, min, max)
    if (!Number.isSafeInteger(result)) invalid()
    return result
}
function member<T extends string>(value: unknown, choices: readonly T[]): T {
    if (typeof value !== "string" || !choices.includes(value as T)) invalid()
    return value as T
}
function exact(value: unknown, expected: unknown) { if (value !== expected) invalid() }
function tuple(value: unknown, length: number): number[] {
    if (!Array.isArray(value) || value.length !== length) invalid()
    return value.map(entry => number(entry))
}
function color(value: unknown): string {
    if (typeof value !== "string") invalid()
    if (/^#[\da-f]{6}$/i.test(value)) return value
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value)
    if (!rgb || rgb.slice(1).some(channel => Number(channel) > 255)) invalid()
    return value
}

/** Reconstruct only the native non-spatial recipe; unknown fields fail closed. */
export function validateSealedReference(value: unknown): SealedReference {
    const sealed = object(value, ["referenceInputGeometry", "recipe"])
    const geometry = object(sealed.referenceInputGeometry, ["width", "height"])
    const referenceInputGeometry = Object.freeze({ width: integer(geometry.width, 1, Number.MAX_SAFE_INTEGER),
        height: integer(geometry.height, 1, Number.MAX_SAFE_INTEGER) })
    try { assertDecodedImageDimensions(referenceInputGeometry) } catch { invalid() }
    const r = object(sealed.recipe, ["version", "pipeline", "crop", "smart", "palette", "grid"])
    exact(r.version, 1)
    const c = object(r.crop, ["outputWidth", "outputHeight", "cx", "cy", "drawWidth", "drawHeight", "rotationRadians"])
    const crop = { outputWidth: integer(c.outputWidth, 1, 1024), outputHeight: integer(c.outputHeight, 1, 1024),
        cx: number(c.cx), cy: number(c.cy), drawWidth: number(c.drawWidth, Number.MIN_VALUE),
        drawHeight: number(c.drawHeight, Number.MIN_VALUE), rotationRadians: number(c.rotationRadians) }
    const g = object(r.grid, ["size", "columns", "rows"])
    const grid = { size: integer(g.size, 1, 512), columns: integer(g.columns, 1, 1024), rows: integer(g.rows, 1, 1024) }
    // Authoring uses these same aspect templates and rounding conventions.
    const aspect = ASPECT_RATIO_TEMPLATES.find(t => {
        const dims = calculateReferenceDimensions(t.id)
        return dims.width === crop.outputWidth && dims.height === crop.outputHeight
    })
    if (!aspect) invalid()
    const expected = calculateCanvasGridGeometry({ gridSize: grid.size, aspectRatioId: aspect.id })
    if (expected.columns !== grid.columns || expected.rows !== grid.rows) invalid()
    const s = object(r.smart, ["version", "adjustments", "whiteBalance"])
    exact(s.version, 1)
    const a = object(s.adjustments, ["exposure", "contrast", "saturation", "shadows", "midtones", "highlights"])
    const adjustments = { exposure: number(a.exposure, -100, 100), contrast: number(a.contrast, -100, 100),
        saturation: number(a.saturation, -100, 100), shadows: number(a.shadows, -100, 100),
        midtones: number(a.midtones, -100, 100), highlights: number(a.highlights, -100, 100) }
    const wbRecord = s.whiteBalance as Record<string, unknown> | null
    let whiteBalance: ResolvedSmartRecipe["whiteBalance"]
    if (wbRecord?.kind === "identity") {
        object(s.whiteBalance, ["kind"])
        whiteBalance = { kind: "identity" }
    } else {
        const wb = object(s.whiteBalance, ["kind", "matrix", "anchorReference"])
        exact(wb.kind, "matrix")
        const matrix = tuple(wb.matrix, 9)
        const anchor = tuple(wb.anchorReference, 3)
        // Check arithmetic used by the renderer, not an invented WB slider range.
        if (anchor.every(v => v === 0) || [0, 3, 6].some(i =>
            !Number.isFinite(matrix[i] * anchor[0] + matrix[i + 1] * anchor[1] + matrix[i + 2] * anchor[2]))) invalid()
        whiteBalance = { kind: "matrix", matrix: matrix as [number, number, number, number, number, number, number, number, number],
            anchorReference: anchor as [number, number, number] }
    }
    const paletteRecord = r.palette as Record<string, unknown> | null
    const dynamic = paletteRecord?.version === 2
    const p = object(r.palette, dynamic
        ? ["version", "source", "method", "colorSpace", "colorCount", "deConfetti"]
        : ["version", "source", "kernel", "colorSpace", "colorLookup", "matchingColors", "outputs", "deConfetti", "provenance"])
    exact(p.version, dynamic ? 2 : 1)
    const source = member(p.source, ["auto", "preset", "imported"] as const)
    let palette: BatchPaletteRecipe
    if (dynamic) {
        exact(source, "auto")
        const pair = getQuantizationCompatibilityPairs().find(pair => pair.paletteContextKind === "auto" &&
            pair.methodId === p.method && pair.colorSpaceId === p.colorSpace)
        if (!pair) invalid()
        palette = { version: 2, source: "auto", method: pair.methodId,
            colorSpace: pair.colorSpaceId as DynamicAutoPaletteRecipe["colorSpace"],
            colorCount: integer(p.colorCount, 2, 32), deConfetti: { enabled: false, tieBreaker: 0 } }
    } else {
        const kernel = member(p.kernel, ["oklab", "strategy"] as const)
        const colorLookup = member(p.colorLookup, ["first", "last"] as const)
        const provenance = object(p.provenance, ["extractionMethod"])
        const method = source === "auto" ? provenance.extractionMethod : "fixed-palette-mapping"
        if (source !== "auto") exact(provenance.extractionMethod, null)
        const pair = getQuantizationCompatibilityPairs().find(pair => pair.paletteContextKind === (source === "auto" ? "auto" : "fixed") &&
            pair.methodId === method && pair.colorSpaceId === p.colorSpace)
        if (!pair) invalid()
        const defaultAuto = source === "auto" && method === "default"
        exact(kernel, defaultAuto || (source !== "auto" && pair.colorSpaceId === "oklab") ? "oklab" : "strategy")
        exact(colorLookup, defaultAuto ? "first" : "last")
        if (!Array.isArray(p.matchingColors) || !Array.isArray(p.outputs) || !p.outputs.length ||
            p.outputs.length > 4096 || p.outputs.length !== p.matchingColors.length) invalid()
        const matchingColors = p.matchingColors.map(color)
        const outputs = p.outputs.map(value => {
            const output = object(value, ["id", "rgba"])
            if (typeof output.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(output.id)) invalid()
            const rgba = tuple(output.rgba, 4).map(v => integer(v, 0, 255)) as [number, number, number, number]
            if (rgba[3] !== 255) invalid()
            return { id: output.id, rgba }
        })
        palette = { version: 1, source, kernel,
            colorSpace: pair.colorSpaceId as FinalPaletteRecipe["colorSpace"], colorLookup, matchingColors, outputs,
            deConfetti: { enabled: false, tieBreaker: 0 },
            provenance: { extractionMethod: source === "auto" ? pair.methodId : null } }
    }
    const dc = object(p.deConfetti, ["enabled", "tieBreaker"])
    if (typeof dc.enabled !== "boolean") invalid()
    palette = { ...palette, deConfetti: { enabled: dc.enabled, tieBreaker: integer(dc.tieBreaker, 0, 3) as 0 | 1 | 2 | 3 } }
    exact(r.pipeline, dynamic ? "crop-preparation-smart-sampling-dynamic-auto-palette-png-v3"
        : "crop-preparation-smart-sampling-final-palette-png-v2")
    try {
        return Object.freeze({ referenceInputGeometry,
            recipe: freezeFinalFrame({ crop, grid, smart: { version: 1, adjustments, whiteBalance }, palette }) })
    } catch { invalid() }
}

export function serializeBatchTemplate(sealed: SealedReference): string {
    const template: BatchTemplate = { kind: "pixtudio-batch-template", schemaVersion: 1,
        renderSemantics: sealed.recipe.palette.version === 2 ? BATCH_DYNAMIC_RENDER_SEMANTICS : BATCH_RENDER_SEMANTICS,
        sealed: validateSealedReference(sealed) }
    const text = JSON.stringify(template)
    if (new TextEncoder().encode(text).length > MAX_BATCH_TEMPLATE_BYTES) {
        throw new BatchTemplateError("Batch Template is too large to open safely")
    }
    return text
}

export function parseBatchTemplate(text: string): SealedReference {
    if (new TextEncoder().encode(text).length > MAX_BATCH_TEMPLATE_BYTES) {
        throw new BatchTemplateError("Batch Template is too large to open safely")
    }
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new BatchTemplateError("Template is incomplete or corrupted") }
    if (!value || typeof value !== "object" || (value as Record<string, unknown>).kind !== "pixtudio-batch-template") {
        throw new BatchTemplateError("Not a Batch Pixelation template")
    }
    const template = object(value, ["kind", "schemaVersion", "renderSemantics", "sealed"])
    if (template.schemaVersion !== 1) throw new BatchTemplateError("Unsupported Batch Template version")
    if (template.renderSemantics !== BATCH_RENDER_SEMANTICS && template.renderSemantics !== BATCH_DYNAMIC_RENDER_SEMANTICS) {
        throw new BatchTemplateError("Template uses unsupported render semantics")
    }
    const sealed = validateSealedReference(template.sealed)
    if (template.renderSemantics !== (sealed.recipe.palette.version === 2
        ? BATCH_DYNAMIC_RENDER_SEMANTICS : BATCH_RENDER_SEMANTICS)) {
        throw new BatchTemplateError("Template uses unsupported render semantics")
    }
    return sealed
}

export async function readBatchTemplate(file: File): Promise<SealedReference> {
    const name = file.name.toLowerCase()
    // Android Downloads may append a collision suffix and the JSON MIME extension.
    if (!/\.(?:pixtudiobatch|pixtudio-batch)(?: \(\d+\))?(?:\.json)?$/.test(name)) {
        throw new BatchTemplateError("Not a Batch Pixelation template")
    }
    if (file.size > MAX_BATCH_TEMPLATE_BYTES) throw new BatchTemplateError("Batch Template is too large to open safely")
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
        return parseBatchTemplate(text)
    } catch (error) {
        if (error instanceof BatchTemplateError) throw error
        throw new BatchTemplateError("Template is incomplete or corrupted")
    }
}

// Deterministic semantic identity, not a security signature or a second hash scheme.
export function batchRecipeIdentity(sealed: SealedReference): string { return serializeBatchTemplate(sealed) }
