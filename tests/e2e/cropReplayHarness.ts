import { renderResolvedCrop, resolveCropDrawGeometry, type CropResolveInput } from "../../src/editor/cropRender"
import { ASPECT_RATIO_TEMPLATES, calculateReferenceDimensions } from "../../src/editor/canvasGeometry"
import type { CapturedCrop } from "./cropCapture"

// Test-only oracle: the pre-extraction applyGeometry algorithm from a156b5f.
// Keep independent of the new resolver/renderer; never import into the app.
function originalCrop(source: HTMLCanvasElement, params: CropResolveInput) {
    const out = document.createElement("canvas")
    out.width = params.output.width
    out.height = params.output.height
    const ctx = out.getContext("2d")!
    ctx.clearRect(0, 0, out.width, out.height)
    const imgW = source.width
    const imgH = source.height
    const k = params.output.width / params.viewport.width
    const baseScale = Math.max(params.viewport.width / imgW, params.viewport.height / imgH)
    const drawW = imgW * baseScale * params.scale * k
    const drawH = imgH * baseScale * params.scale * k
    const ox = params.offset.x * k
    const oy = params.offset.y * k
    const cx = out.width / 2 + ox
    const cy = out.height / 2 + oy
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(params.rotationRadians)
    ctx.drawImage(source, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
    return ctx.getImageData(0, 0, out.width, out.height)
}

function assertRasterEqual(expected: ImageData, actual: ImageData | null, label: string) {
    if (!actual || expected.width !== actual.width || expected.height !== actual.height) {
        throw new Error(`${label}: raster dimensions differ`)
    }
    for (let i = 0; i < expected.data.length; i++) {
        if (actual.data[i] !== expected.data[i]) {
            throw new Error(`${label}: RGBA byte ${i}: ${actual.data[i]} != ${expected.data[i]}`)
        }
    }
}

export function replayCapturedCrop(capture: CapturedCrop) {
    const geometry = JSON.parse(JSON.stringify(capture.geometry))
    const replay = renderResolvedCrop(capture.source, geometry)
    assertRasterEqual(capture.raster, replay, "actual editor -> JSON -> shared renderer")
    return { width: replay!.width, height: replay!.height }
}

export function runCropMatrix() {
    let cases = 0
    let transparentBytes = 0
    for (const [width, height] of [[173, 257], [317, 109]]) {
        const source = document.createElement("canvas")
        source.width = width
        source.height = height
        const ctx = source.getContext("2d")!
        const image = ctx.createImageData(width, height)
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4
            image.data.set([x % 256, y % 256, (x * 7 + y * 13) % 256,
                x % 11 === 0 ? 0 : y % 9 === 0 ? 127 : 255], i)
        }
        ctx.putImageData(image, 0, 0)
        for (const aspect of ASPECT_RATIO_TEMPLATES) {
            const output = calculateReferenceDimensions(aspect.id)
            for (const [scale, rotation, x, y] of [
                [1, 0, 0, 0], [1.37, 0.17, 21.25, -31.5],
                [0.25, -0.83, -62, 94], [8, 1.91, 31, -53],
                [1, 0, 10000, 10000], [2.1, Math.PI, 0, 0],
            ]) {
                const params: CropResolveInput = {
                    input: { width, height }, output,
                    viewport: { width: output.width * 0.76, height: output.height * 0.76 },
                    scale, offset: { x, y }, rotationRadians: rotation,
                }
                const frozen = resolveCropDrawGeometry(params)
                const expected = originalCrop(source, params)
                const replay = renderResolvedCrop(source, JSON.parse(JSON.stringify(frozen)))
                assertRasterEqual(expected, replay, `${aspect.id}/${scale}/${rotation}`)
                for (let i = 3; i < expected.data.length; i += 4) {
                    if (expected.data[i] === 0) transparentBytes++
                }
                cases++
            }
        }
    }
    return { cases, transparentBytes }
}
