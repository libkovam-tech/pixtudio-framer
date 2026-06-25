import { describe, expect, it } from "vitest"

import { EXTRACT_QUANTIZATION_PROFILE } from "./paletteQuantizationEngine.ts"
import {
    PROJECT_SNAPSHOT_V2_MAGIC,
    PROJECT_SNAPSHOT_V2_VERSION,
    V2_CELL_NULL,
    type ProjectSnapshotV2,
} from "./projectSnapshotV2.ts"
import { buildProjectLoadStateFromSnapshot } from "./projectLoadAdapter.ts"

const TRANSPARENT_PIXEL = { kind: "transparent" } as const

function projectSnapshot(): ProjectSnapshotV2 {
    return {
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        gridSize: 2,
        paletteCount: 3,
        palette: {
            swatches: [
                { index: 0, id: "auto-0", hex: "#112233", isUser: false },
                { index: 1, id: "auto-1", hex: "#223344", isUser: false },
                { index: 2, id: "user-2", hex: "#AABBCC", isUser: true },
            ],
        },
        importLayer: {
            cells: [0, 1, V2_CELL_NULL, 2],
        },
        strokeLayer: {
            cells: [{ cellIndex: 2, swatchIndex: 2 }],
        },
        autoOverrides: {
            "auto-0": {
                hex: "#445566",
                isTransparent: true,
            },
        },
        quantizationProfile: {
            kind: "fixed",
            source: "imported",
            id: "imported-test",
            name: "Imported Test",
            colors: ["#445566", "#AABBCC"],
        },
        ref: null,
    }
}

describe("projectLoadAdapter", () => {
    it("builds editor restore state from a validated project snapshot", () => {
        const result = buildProjectLoadStateFromSnapshot(projectSnapshot(), {
            transparentPixel: TRANSPARENT_PIXEL,
            paletteMin: 2,
            paletteMax: 32,
            defaultBrushSize: 3,
            defaultQuantizationProfile: EXTRACT_QUANTIZATION_PROFILE,
            resolveBuiltinQuantizationProfile: () => undefined,
            cloneQuantizationProfile: (profile) =>
                profile.kind === "extract"
                    ? profile
                    : { ...profile, colors: profile.colors.slice() },
        })

        expect(result.smartObjectBaseForRestore).toBeNull()
        expect(result.paletteOrderIds).toEqual(["auto-0", "auto-1", "user-2"])
        expect(result.quantizationProfile).toEqual({
            kind: "fixed",
            source: "imported",
            id: "imported-test",
            name: "Imported Test",
            colors: ["#445566", "#AABBCC"],
        })
        expect(result.project.gridSize).toBe(2)
        expect(result.project.paletteCount).toBe(3)
        expect(result.project.brushSize).toBe(3)
        expect(result.project.showImage).toBe(false)
        expect(result.project.hasOriginalImageData).toBe(false)
        expect(result.project.autoSwatches[0]).toMatchObject({
            id: "auto-0",
            color: "#445566",
            isTransparent: true,
        })
        expect(result.project.userSwatches).toEqual([
            {
                id: "user-2",
                color: "#AABBCC",
                isTransparent: false,
                isUser: true,
            },
        ])
        expect(result.project.imagePixels).toEqual([
            ["auto-0", "auto-1"],
            [null, "user-2"],
        ])
        expect(result.project.overlayPixels).toEqual([
            [null, null],
            ["user-2", null],
        ])
        expect(result.project.importedPalettePresets).toHaveLength(1)
        expect(result.project.importedPalettePresets?.[0]?.name).toBe(
            "Imported Test"
        )
    })
})
