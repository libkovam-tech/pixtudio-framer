import { runQuantization, quantizationColorKey } from "../../src/editor/QuantizationCore"
import { capturePaletteReplay, applyAutoPaletteReplayEdit, replayPalette, rebasePaletteReplay, type PaletteReplayRecipe } from "../../src/plugins/batchPixelation/research/paletteReplay"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"

export function capture(source: (string | null)[][], snapshot: ProjectSnapshotV2) {
    const world = runQuantization({ sourcePixels: source,
        overlayPixels: source.map(row => row.map(() => null as string | null)),
        paletteCount: snapshot.paletteCount!, methodProfile: snapshot.methodProfilesByPaletteContext?.auto })
    return capturePaletteReplay(world)
}

export function transparent(recipe: PaletteReplayRecipe, id: string) {
    const value = recipe.outputs.find(value => value.id === id)
    if (!value) throw new Error("Missing edited swatch")
    return applyAutoPaletteReplayEdit(recipe, { kind: "edit", id, color: value.color, transparent: true })
}

export { rebasePaletteReplay }
export { applyAutoPaletteReplayEdit, quantizationColorKey }
export { pixelizeFromImageDominant } from "../../src/editor/pixelRaster"

export function compare(recipe: PaletteReplayRecipe, source: (string | null)[][], snapshot: ProjectSnapshotV2) {
    const replay = replayPalette(JSON.parse(JSON.stringify(recipe)), source).flat().flatMap(pixel => [...pixel.rgba])
    const palette = new Map(snapshot.palette.swatches.map(value => [value.index, value.hex]))
    const overlay = new Map(snapshot.strokeLayer.cells.map(cell => [cell.cellIndex, cell.swatchIndex]))
    const expected = snapshot.importLayer.cells.flatMap((base, i) => {
        const index = overlay.get(i) ?? base
        if (index < 0) return [0, 0, 0, 0]
        const hex = palette.get(index)
        if (!hex) throw new Error("Missing saved palette entry")
        return [...quantizationColorKey(hex).match(/\d+/g)!.map(Number), 255]
    })
    const mismatchBytes = replay.reduce((count, value, i) => count + Number(value !== expected[i]), 0)
    return { mismatchBytes, length: replay.length, expectedLength: expected.length,
        recipe: JSON.parse(JSON.stringify(recipe)) as PaletteReplayRecipe }
}
