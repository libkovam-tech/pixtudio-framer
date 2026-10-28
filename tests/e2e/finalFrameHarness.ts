import { freezeFinalFrame, renderFinalFrame, type FinalFrameRecipe } from "../../src/plugins/batchPixelation/render/finalFrame"
import { prepareFrame } from "../../src/plugins/batchPixelation/render/prepareFrame"
import { pixelizeFromImageDominant } from "../../src/editor/pixelRaster"
import { initializeWhiteBalanceDomainStateFromBakedBase, ZERO_SMART_REFERENCE_ADJUSTMENTS } from "../../src/editor/smartRender"
import { applyResolvedSmartRecipe, resolveSmartRecipe } from "../../src/plugins/batchPixelation/render/smartRecipe"
import { runQuantization } from "../../src/editor/QuantizationCore"
import { captureFinalPalette } from "../../src/plugins/batchPixelation/render/finalPalette"
import { resolveBuiltinQuantizationProfile, type QuantizationProfile } from "../../src/editor/paletteQuantizationEngine"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"
import type { CapturedCrop } from "./cropCapture"

function activeProfile(snapshot: ProjectSnapshotV2): QuantizationProfile {
    const saved = snapshot.quantizationProfile
    if (!saved || saved.kind === "extract") return { kind: "extract" }
    if (saved.source === "builtin") {
        const profile = resolveBuiltinQuantizationProfile(saved.id)
        if (!profile) throw new Error(`Unknown builtin palette: ${saved.id}`)
        return profile
    }
    return { ...saved }
}

export function captureFinalFrame(crop: CapturedCrop, snapshot: ProjectSnapshotV2): FinalFrameRecipe {
    const baked = prepareFrame(crop.raster)
    if (!snapshot.ref) throw new Error("Missing saved baked Reference")
    const expected = Uint8ClampedArray.from(atob(snapshot.ref.b64), value => value.charCodeAt(0))
    if (expected.length !== baked.data.length || expected.some((value, i) => value !== baked.data[i])) {
        throw new Error("Shared preparation differs from ordinary baked Reference")
    }
    if (snapshot.strokeLayer.cells.length) {
        throw new Error("Spatial editor layers are outside restricted MVP")
    }
    const smart = resolveSmartRecipe(snapshot.smartObjectState?.adjustments ?? ZERO_SMART_REFERENCE_ADJUSTMENTS,
        initializeWhiteBalanceDomainStateFromBakedBase(baked))
    const reference = applyResolvedSmartRecipe(baked, smart)
    const grid = { size: snapshot.gridSize, columns: snapshot.columns ?? snapshot.gridSize, rows: snapshot.rows ?? snapshot.gridSize }
    const source = pixelizeFromImageDominant(reference, grid, 16)
    const profile = activeProfile(snapshot)
    const context = profile.kind === "fixed" ? "fixed" : "auto"
    const deConfetti = snapshot.deConfettiByPaletteContext?.[context]
    const world = runQuantization({ sourcePixels: source,
        overlayPixels: source.map(row => row.map(() => null as string | null)),
        paletteCount: snapshot.paletteCount!, paletteContext: context,
        fixedPaletteProfile: profile.kind === "fixed" ? profile : undefined,
        methodProfile: snapshot.methodProfilesByPaletteContext?.[context],
        deConfettiSettings: deConfetti })
    const savedCells = snapshot.importLayer.cells.map(index => index < 0 ? null : snapshot.palette.swatches[index]?.id ?? null)
    const derivedCells = world.imagePixels.flat()
    if (savedCells.length !== derivedCells.length || savedCells.some((id, i) => id !== derivedCells[i])) {
        throw new Error("Resolved palette grid differs from ordinary saved editor grid")
    }
    return freezeFinalFrame({ crop: crop.geometry, smart, grid,
        palette: captureFinalPalette(world, profile, deConfetti) })
}

export async function compareFinalPng(crop: CapturedCrop, recipe: FinalFrameRecipe, png: number[]) {
    const replay = renderFinalFrame(crop.source, JSON.parse(JSON.stringify(recipe)))
    const blob = await new Promise<Blob | null>(resolve => replay.toBlob(resolve, "image/png"))
    if (!blob) throw new Error("PNG encoding failed")
    const decode = async (input: Blob) => {
        const image = await createImageBitmap(input)
        const canvas = document.createElement("canvas")
        canvas.width = image.width; canvas.height = image.height
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("Missing PNG decode context")
        ctx.drawImage(image, 0, 0)
        image.close()
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
    }
    const expected = await decode(new Blob([new Uint8Array(png)], { type: "image/png" }))
    const actual = await decode(blob)
    let differentBytes = 0
    if (expected.data.length === actual.data.length) {
        for (let i = 0; i < expected.data.length; i++) {
            if (expected.data[i] !== actual.data[i]) differentBytes++
        }
    }
    return { width: actual.width, height: actual.height,
        expectedWidth: expected.width, expectedHeight: expected.height,
        bytes: actual.data.length, expectedBytes: expected.data.length, differentBytes }
}
