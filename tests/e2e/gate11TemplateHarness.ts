import { batchTemplateFixture } from "../fixtures/batchTemplateFixture"
import { batchRecipeIdentity, parseBatchTemplate, serializeBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame"
import { initializeWhiteBalanceDomainStateFromBakedBase, ZERO_SMART_REFERENCE_ADJUSTMENTS } from "../../src/editor/smartRender"
import { resolveSmartRecipe } from "../../src/plugins/batchPixelation/render/smartRecipe"

async function decodePng(bytes: number[]) {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }))
    try {
        const canvas = document.createElement("canvas")
        canvas.width = bitmap.width; canvas.height = bitmap.height
        const ctx = canvas.getContext("2d")!
        ctx.drawImage(bitmap, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    } finally { bitmap.close() }
}
export async function comparePngs(first: number[], second: number[]) {
    const expected = await decodePng(first); const actual = await decodePng(second)
    let differentBytes = Math.abs(expected.data.length - actual.data.length)
    for (let i = 0; i < Math.min(expected.data.length, actual.data.length); i++) {
        if (expected.data[i] !== actual.data[i]) differentBytes++
    }
    return { width: actual.width, height: actual.height, expectedWidth: expected.width, expectedHeight: expected.height, differentBytes }
}
export async function semanticReplayProof() {
    const source = document.createElement("canvas")
    source.width = 4; source.height = 2
    const ctx = source.getContext("2d")!
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = ["#112233", "#CCDDEE", "#883355", "#446688", "#FFFFFF", "#222222", "#00AA99", "#995511"][i]
        ctx.fillRect(i % 4, Math.floor(i / 4), 1, 1)
    }
    ctx.clearRect(3, 1, 1, 1)
    const baked = ctx.getImageData(0, 0, 4, 2)
    const results = []
    for (const [sourceKind, aspect, method, space] of [
        ["auto", "1:1", "default", "default"],
        ["auto", "9:16", "k-means", "cielab"],
        ["preset", "16:9", "fixed-palette-mapping", "hsv"],
        ["imported", "3:2", "fixed-palette-mapping", "oklab"],
    ] as const) {
        const sealed = batchTemplateFixture(sourceKind, aspect, method, space)
        const smart = resolveSmartRecipe({ ...ZERO_SMART_REFERENCE_ADJUSTMENTS, exposure: 12, saturation: 9,
            whiteBalance: 0.8 }, initializeWhiteBalanceDomainStateFromBakedBase(baked))
        const fresh = { ...sealed, recipe: { ...sealed.recipe, smart } }
        const text = serializeBatchTemplate(fresh)
        const opened = parseBatchTemplate(text)
        const png = async (canvas: HTMLCanvasElement) => {
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
            if (!blob) throw new Error("PNG failed")
            return [...new Uint8Array(await blob.arrayBuffer())]
        }
        const comparison = await comparePngs(await png(renderFinalFrame(source, fresh.recipe)), await png(renderFinalFrame(source, opened.recipe)))
        results.push({ source: sourceKind, aspect, method, space, whiteBalance: smart.whiteBalance.kind,
            templateBytes: new TextEncoder().encode(text).length,
            identityEqual: batchRecipeIdentity(fresh) === batchRecipeIdentity(opened),
            deepEqual: JSON.stringify(fresh) === JSON.stringify(opened),
            paletteOrderEqual: JSON.stringify(fresh.recipe.palette) === JSON.stringify(opened.recipe.palette),
            originalReferenceProvidedOnOpen: false, originalPaletteFileProvidedOnOpen: false, ...comparison })
    }
    return results
}
