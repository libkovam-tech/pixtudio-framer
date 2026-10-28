import { readFile, writeFile } from "node:fs/promises"
import { chromium } from "@playwright/test"
import { parseStoredZip } from "../fixtures/parseStoredZip.ts"
import { parseBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate.ts"

const folder = "C:/Users/Admin/Downloads/"
const sealed = parseBatchTemplate(await readFile(folder + "PIXTUDIO_Batch_Template.pixtudio-batch", "utf8"))
const archives = await Promise.all(["PIXTUDIO_gate9-owner-source_Completed_20260928T170318012Z.zip", "PIXTUDIO_gate9-owner-source_Completed_20260928T170810925Z.zip"].map(async file => parseStoredZip(await readFile(folder + file))))
const name = [...archives[0].keys()].filter(name => name.endsWith(".png")).sort()[0]
const source = await readFile("test-results/gate9-owner-source/" + name.replace(/\.png$/, ".gif"))
const records = []
const modes = ["headless", "headed", "headless-no-gpu", "headed-no-gpu", "headless-cpu-crop", "headless-medium", "headless-high", "headless-no-oop", "headless-oop", "headless-warm-readbacks"]
for (const mode of modes) {
    const args = mode.endsWith("no-gpu") ? ["--disable-gpu"] : mode.endsWith("no-oop") ?
        ["--disable-features=CanvasOopRasterization"] : mode.endsWith("-oop") ? ["--enable-features=CanvasOopRasterization"] : []
    const browser = await chromium.launch({ channel: "chrome", headless: mode.startsWith("headless"),
        args })
    try {
        const page = await browser.newPage()
        await page.goto("http://127.0.0.1:5174/")
        const result = await page.evaluate(async ({ source, name, sealed, pngs, mode }) => {
            const { decodeAndValidateRasterImageFile } = await import("/src/editor/fileIntakeSecurity.ts")
            const { renderResolvedCrop } = await import("/src/editor/cropRender.ts")
            const { prepareFrame } = await import("/src/plugins/batchPixelation/render/prepareFrame.ts")
            const { applyResolvedSmartRecipe } = await import("/src/plugins/batchPixelation/render/smartRecipe.ts")
            const { pixelizeFromImageDominant } = await import("/src/editor/pixelRaster.ts")
            const { replayFinalPalette } = await import("/src/plugins/batchPixelation/render/finalPalette.ts")
            const { renderFinalFrame } = await import("/src/plugins/batchPixelation/render/finalFrame.ts")
            const nativeContext = HTMLCanvasElement.prototype.getContext
            if (mode.endsWith("cpu-crop") || mode.endsWith("medium") || mode.endsWith("high")) {
                HTMLCanvasElement.prototype.getContext = function (type, options) {
                    const isCrop = type === "2d" && this.width === sealed.recipe.crop.outputWidth && this.height === sealed.recipe.crop.outputHeight
                    const context = nativeContext.call(this, type, isCrop && mode.endsWith("cpu-crop") ? { ...options, willReadFrequently: true } : options)
                    if (isCrop && context && !mode.endsWith("cpu-crop")) context.imageSmoothingQuality = mode.endsWith("high") ? "high" : "medium"
                    return context
                }
            }
            const bytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
            const digest = async value => {
                const data = typeof value === "string" ? new TextEncoder().encode(value) : value
                return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].map(byte => byte.toString(16).padStart(2, "0")).join("")
            }
            const image = async base64 => {
                const bitmap = await createImageBitmap(new Blob([bytes(base64)], { type: "image/png" }))
                try {
                    const canvas = document.createElement("canvas")
                    canvas.width = bitmap.width; canvas.height = bitmap.height
                    const ctx = canvas.getContext("2d")
                    ctx.drawImage(bitmap, 0, 0)
                    return ctx.getImageData(0, 0, canvas.width, canvas.height)
                } finally { bitmap.close() }
            }
            const [a, b] = await Promise.all(pngs.map(image))
            const differences = (left, right) => {
                if (left.data.length !== right.data.length) throw new Error("Image size mismatch")
                let count = 0
                for (let i = 0; i < left.data.length; i++) if (left.data[i] !== right.data[i]) count++
                return count
            }
            const file = new File([bytes(source)], name, { type: "image/gif" })
            if (mode.endsWith("warm-readbacks")) {
                const held = []
                for (let i = 0; i < 150; i++) {
                    const canvas = document.createElement("canvas")
                    canvas.width = 256; canvas.height = 256
                    const context = canvas.getContext("2d")
                    context.fillRect(0, 0, 256, 256)
                    for (let read = 0; read < 5; read++) context.getImageData(0, 0, 256, 256)
                    held.push(canvas)
                }
            }
            const results = []
            for (let repeat = 0; repeat < 4; repeat++) {
                const bitmap = await decodeAndValidateRasterImageFile(file)
                try {
                    const canvas = renderFinalFrame(bitmap, sealed.recipe)
                    const output = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height)
                    const crop = renderResolvedCrop(bitmap, sealed.recipe.crop)
                    const prepared = prepareFrame(crop)
                    const smart = applyResolvedSmartRecipe(prepared, sealed.recipe.smart)
                    const sample = pixelizeFromImageDominant(smart, sealed.recipe.grid, 16)
                    const palette = replayFinalPalette(sealed.recipe.palette, sample)
                    results.push({ repeat, vsA: differences(a, output), vsB: differences(b, output),
                        output: await digest(output.data), crop: await digest(crop.data),
                        prepared: await digest(prepared.data), smart: await digest(smart.data),
                        sample: await digest(JSON.stringify(sample)), palette: await digest(JSON.stringify(palette)) })
                    canvas.width = 0; canvas.height = 0
                } finally { bitmap.close() }
            }
            const bitmap = await decodeAndValidateRasterImageFile(file)
            let decodedSource
            try {
                const canvas = document.createElement("canvas")
                canvas.width = bitmap.width; canvas.height = bitmap.height
                const context = nativeContext.call(canvas, "2d", { willReadFrequently: true })
                context.drawImage(bitmap, 0, 0)
                decodedSource = await digest(context.getImageData(0, 0, canvas.width, canvas.height).data)
            } finally { bitmap.close() }
            const gl = document.createElement("canvas").getContext("webgl")
            const extension = gl?.getExtension("WEBGL_debug_renderer_info")
            return { userAgent: navigator.userAgent, decodedSource, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null, results }
        }, { source: source.toString("base64"), name, sealed, mode, pngs: archives.map(archive => Buffer.from(archive.get(name)).toString("base64")) })
        records.push({ mode, ...result })
        console.log(JSON.stringify({ mode, renderer: result.renderer, decodedSource: result.decodedSource,
            first: result.results[0], stable: result.results.every(value => value.output === result.results[0].output) }, null, 2))
    } finally { await browser.close() }
}
await writeFile("docs/evidence/gate11-workflow/owner-render-stages.json", JSON.stringify({ name, records }, null, 2))
