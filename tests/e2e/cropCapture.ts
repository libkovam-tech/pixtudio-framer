import type { Page } from "@playwright/test"

export type CapturedCrop = {
    source: HTMLImageElement | ImageBitmap
    raster: ImageData
    geometry: {
        outputWidth: number
        outputHeight: number
        cx: number
        cy: number
        drawWidth: number
        drawHeight: number
        rotationRadians: number
    }
}

declare global {
    interface Window {
        cropEvidence: { armed: boolean; captured: CapturedCrop | null }
    }
}

// Observe the real editor boundary without adding test hooks to production code.
export async function installCropCapture(page: Page) {
    await page.addInitScript(() => {
        window.cropEvidence = { armed: false, captured: null }
        const states = new WeakMap<CanvasRenderingContext2D, {
            cx: number; cy: number; rotation: number
        }>()
        const candidates = new WeakMap<CanvasRenderingContext2D, {
            source: HTMLImageElement | ImageBitmap; drawWidth: number; drawHeight: number
        }>()
        const proto = CanvasRenderingContext2D.prototype
        const translate = proto.translate
        const rotate = proto.rotate
        const drawImage = proto.drawImage
        const getImageData = proto.getImageData
        proto.translate = function (x, y) {
            states.set(this, { cx: x, cy: y, rotation: 0 })
            return translate.call(this, x, y)
        }
        proto.rotate = function (angle) {
            const state = states.get(this)
            if (state) state.rotation = angle
            return rotate.call(this, angle)
        }
        proto.drawImage = function (source: CanvasImageSource, ...coordinates: number[]) {
            const [x, y, width, height] = coordinates
            if (window.cropEvidence.armed && coordinates.length === 4 &&
                (source instanceof HTMLImageElement || source instanceof ImageBitmap) && states.has(this) &&
                x === -width / 2 && y === -height / 2) {
                candidates.set(this, { source, drawWidth: width, drawHeight: height })
            }
            return Reflect.apply(drawImage, this, [source, ...coordinates])
        }
        proto.getImageData = function (...args: Parameters<typeof getImageData>) {
            const raster = Reflect.apply(getImageData, this, args) as ImageData
            const candidate = candidates.get(this)
            const state = states.get(this)
            if (window.cropEvidence.armed && candidate && state) {
                window.cropEvidence.captured = {
                    source: candidate.source,
                    raster,
                    geometry: {
                        outputWidth: raster.width, outputHeight: raster.height,
                        cx: state.cx, cy: state.cy, rotationRadians: state.rotation,
                        drawWidth: candidate.drawWidth, drawHeight: candidate.drawHeight,
                    },
                }
                window.cropEvidence.armed = false
            }
            return raster
        }
    })
}

export async function captureCropDigest(page: Page) {
    return page.evaluate(async () => {
        const capture = window.cropEvidence.captured
        if (!capture) throw new Error("No editor Crop raster captured")
        const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(capture.raster.data))
        return {
            width: capture.raster.width,
            height: capture.raster.height,
            sha256: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
        }
    })
}
