import { freezeFrameReplayRecipe, renderFrameReplay, type FrameReplayRecipe } from "../../src/plugins/batchPixelation/research/frameReplay"
import { prepareFrame } from "../../src/plugins/batchPixelation/render/prepareFrame"
import { pixelizeFromImageDominant } from "../../src/editor/pixelRaster"
import { initializeWhiteBalanceDomainStateFromBakedBase, ZERO_SMART_REFERENCE_ADJUSTMENTS } from "../../src/editor/smartRender"
import { applyResolvedSmartRecipe, resolveSmartRecipe } from "../../src/plugins/batchPixelation/render/smartRecipe"
import { runQuantization } from "../../src/editor/QuantizationCore"
import { capturePaletteReplay } from "../../src/plugins/batchPixelation/research/paletteReplay"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"
import type { CapturedCrop } from "./cropCapture"

export { applyAutoPaletteReplayEdit } from "../../src/plugins/batchPixelation/research/paletteReplay"
export { freezeFrameReplayRecipe } from "../../src/plugins/batchPixelation/research/frameReplay"

export function captureFrame(crop: CapturedCrop, snapshot: ProjectSnapshotV2) {
    const baked = prepareFrame(crop.raster)
    if (!snapshot.ref) throw new Error("Missing saved baked Reference")
    const expected = Uint8ClampedArray.from(atob(snapshot.ref.b64), value => value.charCodeAt(0))
    if (expected.length !== baked.data.length || expected.some((value, i) => value !== baked.data[i])) {
        throw new Error("Shared preparation differs from ordinary baked Reference")
    }
    const smart = resolveSmartRecipe(snapshot.smartObjectState?.adjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS,
        initializeWhiteBalanceDomainStateFromBakedBase(baked))
    const reference = applyResolvedSmartRecipe(baked, smart)
    const grid = { size: snapshot.gridSize, columns: snapshot.columns ?? snapshot.gridSize, rows: snapshot.rows ?? snapshot.gridSize }
    const source = pixelizeFromImageDominant(reference, grid, 16)
    const deConfetti = snapshot.deConfettiByPaletteContext?.auto
    const world = runQuantization({ sourcePixels: source, overlayPixels: source.map(row => row.map(() => null as string | null)),
        paletteCount: snapshot.paletteCount!, methodProfile: snapshot.methodProfilesByPaletteContext?.auto, deConfettiSettings: deConfetti })
    return freezeFrameReplayRecipe({ crop: crop.geometry, smart, grid, palette: capturePaletteReplay(world, { kind: "extract" }, deConfetti) })
}

export async function comparePng(crop: CapturedCrop, recipe: FrameReplayRecipe, png: number[]) {
    const replay = renderFrameReplay(crop.source, JSON.parse(JSON.stringify(recipe)))
    const replayBlob = await new Promise<Blob | null>(resolve => replay.toBlob(resolve, "image/png"))
    if (!replayBlob) throw new Error("PNG encoding failed")
    const decode = async (blob: Blob) => {
        const image = await createImageBitmap(blob)
        const canvas = document.createElement("canvas")
        canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Missing PNG decode context")
        ctx.drawImage(image, 0, 0)
        image.close()
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
    const expected = await decode(new Blob([new Uint8Array(png)], { type: "image/png" }))
    const actual = await decode(replayBlob)
    let differentBytes = 0
    for (let i = 0; i < expected.data.length; i++) if (expected.data[i] !== actual.data[i]) differentBytes++
    const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(expected.data))
    return { width: actual.width, height: actual.height, expectedWidth: expected.width, expectedHeight: expected.height,
        bytes: actual.data.length, expectedBytes: expected.data.length, differentBytes,
        sha256: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("") }
}
