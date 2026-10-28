import { BatchRasterPreflightError, decodeStaticBatchRaster } from "../../src/plugins/batchPixelation/staticRasterPolicy"
import type { CapturedCrop } from "./cropCapture"

function raster(source: CanvasImageSource, width: number, height: number) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Missing decode comparison context")
    context.drawImage(source, 0, 0)
    return context.getImageData(0, 0, width, height).data
}

async function sha256(bytes: Uint8ClampedArray) {
    const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
}

export async function compareAuthoringAndReplayDecode(
    capture: CapturedCrop, bytes: number[], name: string, mimeType: string,
) {
    const file = new File([new Uint8Array(bytes)], name, { type: mimeType })
    const replay = await decodeStaticBatchRaster(file)
    try {
        const authoring = capture.source
        const authoringWidth = authoring instanceof ImageBitmap ? authoring.width : authoring.naturalWidth
        const authoringHeight = authoring instanceof ImageBitmap ? authoring.height : authoring.naturalHeight
        const authoringPixels = raster(authoring, authoringWidth, authoringHeight)
        const replayPixels = raster(replay, replay.width, replay.height)
        let opaquePixels = 0
        for (let i = 3; i < authoringPixels.length; i += 4) {
            if (authoringPixels[i] === 255) opaquePixels++
        }
        let differentBytes = 0
        if (authoringPixels.length === replayPixels.length) {
            for (let i = 0; i < authoringPixels.length; i++) {
                if (authoringPixels[i] !== replayPixels[i]) differentBytes++
            }
        }
        return { authoringWidth, authoringHeight, replayWidth: replay.width, replayHeight: replay.height,
            authoringBytes: authoringPixels.length, replayBytes: replayPixels.length, differentBytes, opaquePixels,
            authoringSha256: await sha256(authoringPixels), replaySha256: await sha256(replayPixels) }
    } finally {
        replay.close()
    }
}

export async function inspectAnimatedRejection(bytes: number[], name: string, mimeType: string) {
    const original = createImageBitmap
    let decoderCalls = 0
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
        decoderCalls++
        return original(...args)
    }) as typeof createImageBitmap
    try {
        await decodeStaticBatchRaster(new File([new Uint8Array(bytes)], name, { type: mimeType }))
        return { rejected: false, code: null, decoderCalls }
    } catch (error) {
        if (!(error instanceof BatchRasterPreflightError)) throw error
        return { rejected: true, code: error.code, decoderCalls }
    } finally {
        window.createImageBitmap = original
    }
}
