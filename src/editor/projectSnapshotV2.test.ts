import { describe, expect, it } from "vitest"

import {
    PROJECT_SNAPSHOT_V2_MAGIC,
    PROJECT_SNAPSHOT_V2_VERSION,
    V2_CELL_NULL,
    V2_CELL_TRANSPARENT,
    applyProjectSnapshotV2AutoOverrides,
    buildProjectSnapshotV2RuntimeLayers,
    canonicalizeSnapshotV2,
    createProjectSnapshotV2,
    decodeProjectSnapshotBytesBase64,
    decodeProjectSnapshotRefBytes,
    encodeProjectSnapshotBytesBase64,
    parseProjectSnapshotV2Json,
    resolveProjectSnapshotV2QuantizationProfile,
    serializeQuantizationProfileForSnapshot,
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

    it("creates V2 snapshots through a single format entry point", () => {
        const project = canonicalProject()
        const snapshot = createProjectSnapshotV2({
            gridSize: project.gridSize,
            paletteCount: project.paletteCount,
            palette: project.palette,
            quantizationProfile: project.quantizationProfile,
            smartObjectState: project.smartObjectState,
            importLayer: project.importLayer,
            ref: project.ref,
            autoOverrides: {},
            strokeLayer: {
                cells: [
                    { cellIndex: 15, swatchIndex: 1 },
                    { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
                ],
            },
        })

        expect(snapshot.magic).toBe(PROJECT_SNAPSHOT_V2_MAGIC)
        expect(snapshot.version).toBe(PROJECT_SNAPSHOT_V2_VERSION)
        expect(snapshot.autoOverrides).toBeUndefined()
        expect(snapshot.strokeLayer.cells).toEqual([
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 15, swatchIndex: 1 },
        ])
    })

    it("serializes quantization profile markers for saves", () => {
        expect(
            serializeQuantizationProfileForSnapshot({ kind: "extract" })
        ).toBeUndefined()
        expect(
            serializeQuantizationProfileForSnapshot({
                kind: "fixed",
                source: "builtin",
                id: "neon-cold-32",
                name: "NEON",
            })
        ).toEqual({
            kind: "fixed",
            source: "builtin",
            id: "neon-cold-32",
            name: "NEON",
        })
        expect(
            serializeQuantizationProfileForSnapshot(
                {
                    kind: "fixed",
                    source: "imported",
                    id: "custom",
                    name: "Custom",
                    colors: ["rgb(1, 2, 3)", "#aabbcc"],
                },
                (color) => (color.startsWith("rgb") ? "#010203" : color.toUpperCase())
            )
        ).toEqual({
            kind: "fixed",
            source: "imported",
            id: "custom",
            name: "Custom",
            colors: ["#010203", "#AABBCC"],
        })
    })

    it("encodes reference bytes as base64 for snapshot refs", () => {
        expect(
            encodeProjectSnapshotBytesBase64(
                new Uint8ClampedArray([0, 255, 16, 128])
            )
        ).toBe("AP8QgA==")
    })

    it("decodes snapshot reference bytes without constructing browser ImageData", () => {
        const bytes = new Uint8ClampedArray([0, 255, 16, 128])
        const b64 = encodeProjectSnapshotBytesBase64(bytes)
        const decoded = decodeProjectSnapshotBytesBase64(b64)

        expect([...decoded]).toEqual([...bytes])
        expect(
            decodeProjectSnapshotRefBytes({
                w: 512,
                h: 512,
                ext: "rgba8",
                b64,
            })
        ).toEqual(decoded)
        expect(decodeProjectSnapshotRefBytes(null)).toBeNull()
    })

    it("resolves loaded quantization profile markers for restore", () => {
        const fallback = { kind: "extract" as const }
        const builtinProfile = {
            kind: "fixed" as const,
            source: "builtin" as const,
            id: "neon-cold-32",
            name: "NEON",
            colors: ["#000000", "#FFFFFF"],
        }
        const resolveBuiltin = (id: string) =>
            id === builtinProfile.id ? builtinProfile : undefined

        expect(
            resolveProjectSnapshotV2QuantizationProfile(
                { quantizationProfile: undefined },
                { fallback, resolveBuiltin }
            )
        ).toBe(fallback)
        expect(
            resolveProjectSnapshotV2QuantizationProfile(
                { quantizationProfile: { kind: "extract" } },
                { fallback, resolveBuiltin }
            )
        ).toBe(fallback)
        expect(
            resolveProjectSnapshotV2QuantizationProfile(
                {
                    quantizationProfile: {
                        kind: "fixed",
                        source: "builtin",
                        id: "neon-cold-32",
                        name: "NEON",
                    },
                },
                { fallback, resolveBuiltin }
            )
        ).toBe(builtinProfile)
        expect(
            resolveProjectSnapshotV2QuantizationProfile(
                {
                    quantizationProfile: {
                        kind: "fixed",
                        source: "builtin",
                        id: "missing",
                        name: "Missing",
                    },
                },
                { fallback, resolveBuiltin }
            )
        ).toBe(fallback)
        expect(
            resolveProjectSnapshotV2QuantizationProfile(
                {
                    quantizationProfile: {
                        kind: "fixed",
                        source: "imported",
                        id: "custom",
                        name: "Custom",
                        colors: ["#010203", "#AABBCC"],
                    },
                },
                { fallback, resolveBuiltin }
            )
        ).toEqual({
            kind: "fixed",
            source: "imported",
            id: "custom",
            name: "Custom",
            colors: ["#010203", "#AABBCC"],
        })
    })

    it("builds runtime palette and pixel layers from a validated snapshot", () => {
        const layers = buildProjectSnapshotV2RuntimeLayers(canonicalProject(), {
            transparentPixel: "__TRANSPARENT__",
            paletteMin: 2,
            paletteMax: 32,
        })

        expect(layers.gridSize).toBe(4)
        expect(layers.paletteOrderIds).toEqual(["auto-0", "user-1"])
        expect(layers.paletteCount).toBe(10)
        expect(layers.allSwatches).toEqual([
            {
                id: "auto-0",
                color: "#112233",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "user-1",
                color: "#AABBCC",
                isTransparent: false,
                isUser: true,
            },
        ])
        expect(layers.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
        ])
        expect(layers.userSwatches.map((swatch) => swatch.id)).toEqual([
            "user-1",
        ])
        expect(layers.selectedSwatch).toBe("auto-0")
        expect(layers.autoOverrides).toEqual({
            "auto-0": { hex: "#445566" },
        })
        expect(layers.imagePixels).toEqual([
            ["auto-0", "user-1", null, "__TRANSPARENT__"],
            [null, null, null, null],
            [null, null, null, null],
            ["__TRANSPARENT__", "auto-0", "user-1", null],
        ])
        expect(layers.overlayPixels).toEqual([
            [null, null, null, "__TRANSPARENT__"],
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, "user-1"],
        ])
    })

    it("applies auto swatch overrides without touching unrelated swatches", () => {
        const swatches = [
            {
                id: "auto-0",
                color: "#112233",
                isTransparent: false,
                isUser: false,
                label: "kept",
            },
            {
                id: "auto-1",
                color: "#445566",
                isTransparent: false,
                isUser: false,
                label: "transparent",
            },
            {
                id: "user-1",
                color: "#AABBCC",
                isTransparent: false,
                isUser: true,
                label: "user",
            },
        ]

        expect(applyProjectSnapshotV2AutoOverrides(swatches, {})).toBe(swatches)

        const result = applyProjectSnapshotV2AutoOverrides(swatches, {
            "auto-0": { hex: "#FF0000" },
            "auto-1": { isTransparent: true },
            "user-1": { hex: "#00FF00", isTransparent: true },
            missing: { hex: "#0000FF" },
        })

        expect(result).not.toBe(swatches)
        expect(result).toEqual([
            {
                id: "auto-0",
                color: "#FF0000",
                isTransparent: false,
                isUser: false,
                label: "kept",
            },
            {
                id: "auto-1",
                color: "#445566",
                isTransparent: true,
                isUser: false,
                label: "transparent",
            },
            {
                id: "user-1",
                color: "#AABBCC",
                isTransparent: false,
                isUser: true,
                label: "user",
            },
        ])
        expect(result[2]).toBe(swatches[2])
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

    it("preserves edited imported preset colors when present", () => {
        const snapshot: ProjectSnapshotV2 = {
            ...canonicalProject(),
            quantizationProfile: {
                kind: "fixed",
                source: "imported",
                id: "imported-demo",
                name: "Demo",
                colors: ["#001219", "#FFDD00"],
            },
        }

        const parsed = parseProjectSnapshotV2Json(JSON.stringify(snapshot))

        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.canonical.quantizationProfile).toEqual({
            kind: "fixed",
            source: "imported",
            id: "imported-demo",
            name: "Demo",
            colors: ["#001219", "#FFDD00"],
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
