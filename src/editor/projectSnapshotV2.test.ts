import { describe, expect, it } from "vitest"

import {
    PROJECT_SNAPSHOT_V2_MAGIC,
    PROJECT_SNAPSHOT_V2_VERSION,
    V2_CELL_NULL,
    V2_CELL_TRANSPARENT,
    canonicalizeSnapshotV2,
    parseProjectSnapshotV2Json,
    validateProjectSnapshotV2OrThrow,
    type ProjectSnapshotV2,
} from "./projectSnapshotV2.ts"

function canonicalProject(): ProjectSnapshotV2 {
    return {
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        gridSize: 4,
        paletteCount: 10,
        palette: {
            swatches: [
                { index: 0, id: "auto-0", hex: "#112233", isUser: false },
                { index: 1, id: "user-1", hex: "#AABBCC", isUser: true },
            ],
        },
        importLayer: {
            cells: [
                0, 1, V2_CELL_NULL, V2_CELL_TRANSPARENT,
                V2_CELL_NULL, V2_CELL_NULL, V2_CELL_NULL, V2_CELL_NULL,
                V2_CELL_NULL, V2_CELL_NULL, V2_CELL_NULL, V2_CELL_NULL,
                V2_CELL_TRANSPARENT, 0, 1, V2_CELL_NULL,
            ],
        },
        strokeLayer: {
            cells: [
                { cellIndex: 15, swatchIndex: 1 },
                { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            ],
        },
        autoOverrides: {
            "auto-0": { hex: "#445566" },
        },
        ref: null,
    }
}

describe("ProjectSnapshotV2 invariants", () => {
    it("accepts a canonical saved project and preserves critical restore state", () => {
        const snapshot = canonicalProject()
        const parsed = parseProjectSnapshotV2Json(JSON.stringify(snapshot))

        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return

        expect(parsed.canonical.gridSize).toBe(snapshot.gridSize)
        expect(parsed.canonical.palette.swatches).toEqual(snapshot.palette.swatches)
        expect(parsed.canonical.importLayer.cells).toEqual(
            snapshot.importLayer.cells
        )
        expect(parsed.canonical.strokeLayer.cells).toEqual([
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 15, swatchIndex: 1 },
        ])
        expect(parsed.canonical.ref).toBeNull()
    })

    it("canonicalization is stable for a valid saved project", () => {
        const once = canonicalizeSnapshotV2(validateProjectSnapshotV2OrThrow(canonicalProject()))
        const twice = canonicalizeSnapshotV2(validateProjectSnapshotV2OrThrow(once))

        expect(twice).toEqual(once)
    })

    it("preserves the active built-in preset marker when present", () => {
        const snapshot: ProjectSnapshotV2 = {
            ...canonicalProject(),
            quantizationProfile: {
                kind: "fixed",
                source: "builtin",
                id: "neon-cold-32",
                name: "NEON",
            },
        }

        const parsed = parseProjectSnapshotV2Json(JSON.stringify(snapshot))

        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.canonical.quantizationProfile).toEqual({
            kind: "fixed",
            source: "builtin",
            id: "neon-cold-32",
            name: "NEON",
        })
    })

    it("rejects malformed saved payloads without accepting partial state", () => {
        const malformed = {
            ...canonicalProject(),
            version: 1,
        }

        const parsed = parseProjectSnapshotV2Json(JSON.stringify(malformed))

        expect(parsed.ok).toBe(false)
        if (parsed.ok) return
        expect(parsed.error.code).toBe("E_VERSION")
    })

    it("rejects ambiguous stroke restores fail-closed", () => {
        const ambiguous = canonicalProject()
        ambiguous.strokeLayer.cells = [
            { cellIndex: 3, swatchIndex: 0 },
            { cellIndex: 3, swatchIndex: 1 },
        ]

        const parsed = parseProjectSnapshotV2Json(JSON.stringify(ambiguous))

        expect(parsed.ok).toBe(false)
        if (parsed.ok) return
        expect(parsed.error.code).toBe("E_STROKE_LAYER")
    })
})
