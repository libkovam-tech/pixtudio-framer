import { describe, expect, it } from "vitest"

import {
    PROJECT_SNAPSHOT_V2_MAGIC,
    PROJECT_SNAPSHOT_V2_VERSION,
    V2_CELL_NULL,
    V2_CELL_TRANSPARENT,
    applyProjectSnapshotV2AutoOverrides,
    buildProjectSnapshotV2ForSave,
    buildProjectSnapshotV2RuntimeLayers,
    buildProjectSnapshotV2SaveLayers,
    buildProjectSnapshotV2SavePalette,
    canonicalizeSnapshotV2,
    createProjectSnapshotV2,
    decodeProjectSnapshotBytesBase64,
    decodeProjectSnapshotRefBytes,
    encodeProjectSnapshotBytesBase64,
    mapProjectSnapshotV2PixelToCell,
    parseProjectSnapshotV2Json,
    pruneProjectSnapshotV2AutoOverrides,
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

    it("builds save palette indexes while keeping transparent swatches out of saved colors", () => {
        const palette = buildProjectSnapshotV2SavePalette(
            [
                {
                    id: "auto-0",
                    color: "#112233",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#445566",
                    isTransparent: true,
                    isUser: false,
                },
            ],
            [
                {
                    id: "user-0",
                    color: "rgb(1, 2, 3)",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            (color) => (color.startsWith("rgb") ? "#010203" : color.toUpperCase())
        )

        expect(palette.swatches).toEqual([
            { index: 0, id: "auto-0", hex: "#112233", isUser: false },
            { index: 1, id: "user-0", hex: "#010203", isUser: true },
        ])
        expect([...palette.indexById.entries()]).toEqual([
            ["auto-0", 0],
            ["user-0", 1],
        ])
        expect([...palette.transparentSwatchIds]).toEqual(["auto-1"])
    })

    it("builds save layers from editor pixel grids", () => {
        const layers = buildProjectSnapshotV2SaveLayers({
            gridSize: 3,
            imagePixels: [
                ["auto-0", "auto-transparent", null],
                ["__TRANSPARENT__", "user-0", "missing"],
                [null, null, "auto-0"],
            ],
            overlayPixels: [
                [null, "auto-0", "missing"],
                ["auto-transparent", "__TRANSPARENT__", null],
                [null, "user-0", null],
            ],
            indexById: new Map([
                ["auto-0", 0],
                ["user-0", 1],
            ]),
            transparentPixel: "__TRANSPARENT__",
            transparentSwatchIds: new Set(["auto-transparent"]),
        })

        expect(layers.importLayer.cells).toEqual([
            0,
            V2_CELL_TRANSPARENT,
            V2_CELL_NULL,
            V2_CELL_TRANSPARENT,
            1,
            V2_CELL_NULL,
            V2_CELL_NULL,
            V2_CELL_NULL,
            0,
        ])
        expect(layers.strokeLayer.cells).toEqual([
            { cellIndex: 1, swatchIndex: 0 },
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 4, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 7, swatchIndex: 1 },
        ])
    })

    it("builds a complete save snapshot from editor state inputs", () => {
        const snapshot = buildProjectSnapshotV2ForSave({
            gridSize: 2,
            paletteCount: 99,
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#112233",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-transparent",
                    color: "#445566",
                    isTransparent: true,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#AABBCC",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            imagePixels: [
                ["auto-0", "auto-transparent"],
                ["__TRANSPARENT__", "user-0"],
            ],
            overlayPixels: [
                [null, "user-0"],
                ["missing", "auto-transparent"],
            ],
            autoOverrides: {
                "auto-transparent": { isTransparent: true },
            },
            quantizationProfile: {
                kind: "fixed",
                source: "imported",
                id: "custom",
                name: "Custom",
                colors: ["#112233", "#aabbcc"],
            },
            smartReferenceBytes: new Uint8ClampedArray([0, 255, 16, 128]),
            smartAdjustments: {
                exposure: 0,
                whiteBalance: 0.5,
                contrast: 0,
                saturation: 0,
                shadows: 0,
                midtones: 0,
                highlights: 0,
            },
            normalizeColor: (color) => color.toUpperCase(),
            transparentPixel: "__TRANSPARENT__",
        })

        expect(snapshot.paletteCount).toBe(32)
        expect(snapshot.palette.swatches).toEqual([
            { index: 0, id: "auto-0", hex: "#112233", isUser: false },
            { index: 1, id: "user-0", hex: "#AABBCC", isUser: true },
        ])
        expect(snapshot.importLayer.cells).toEqual([
            0,
            V2_CELL_TRANSPARENT,
            V2_CELL_TRANSPARENT,
            1,
        ])
        expect(snapshot.strokeLayer.cells).toEqual([
            { cellIndex: 1, swatchIndex: 1 },
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
        ])
        expect(snapshot.autoOverrides).toEqual({
            "auto-transparent": { isTransparent: true },
        })
        expect(snapshot.quantizationProfile).toEqual({
            kind: "fixed",
            source: "imported",
            id: "custom",
            name: "Custom",
            colors: ["#112233", "#AABBCC"],
        })
        expect(snapshot.ref?.b64).toBe("AP8QgA==")
        expect(snapshot.smartObjectState?.adjustments.whiteBalance).toBe(0.5)
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
                    applicationSource: "builtin",
                    applicationProfileId: "sunset-10",
                    applicationColors: ["#001219", "#e9d8a6"],
                },
                (color) => (color.startsWith("rgb") ? "#010203" : color.toUpperCase())
            )
        ).toEqual({
            kind: "fixed",
            source: "imported",
            id: "custom",
            name: "Custom",
            colors: ["#010203", "#AABBCC"],
            applicationSource: "builtin",
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6"],
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
                        applicationSource: "builtin",
                        applicationProfileId: "sunset-10",
                        applicationColors: ["#001219", "#E9D8A6"],
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
            applicationSource: "builtin",
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6"],
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

    it("prunes auto overrides to the current auto swatch ids", () => {
        const overrides = {
            "auto-0": { hex: "#FF0000" },
            "auto-1": { isTransparent: true },
            "auto-stale": { hex: "#00FF00" },
            "user-0": { hex: "#0000FF", isTransparent: true },
            autoEmpty: {},
        }

        expect(
            pruneProjectSnapshotV2AutoOverrides(
                [{ id: "auto-0" }, { id: "auto-1" }, { id: "user-0" }],
                overrides
            )
        ).toEqual({
            "auto-0": { hex: "#FF0000" },
            "auto-1": { isTransparent: true },
        })
    })

    it("copies meaningful auto overrides without mutating the input map", () => {
        const overrides = {
            "auto-0": { hex: "#FF0000", isTransparent: false },
            "auto-1": { hex: "" },
        }

        const result = pruneProjectSnapshotV2AutoOverrides(
            [{ id: "auto-0" }, { id: "auto-1" }],
            overrides
        )

        expect(result).toEqual({
            "auto-0": { hex: "#FF0000", isTransparent: false },
        })
        expect(result).not.toBe(overrides)
        expect(result["auto-0"]).not.toBe(overrides["auto-0"])
        expect(overrides).toEqual({
            "auto-0": { hex: "#FF0000", isTransparent: false },
            "auto-1": { hex: "" },
        })
    })

    it("maps transparent saved swatch ids to transparent cells", () => {
        const indexById = new Map([
            ["auto-0", 0],
            ["auto-2", 1],
        ])
        const transparentSwatchIds = new Set(["auto-1"])

        expect(
            mapProjectSnapshotV2PixelToCell(null, {
                indexById,
                transparentPixel: "__TRANSPARENT__",
                transparentSwatchIds,
            })
        ).toBe(V2_CELL_NULL)
        expect(
            mapProjectSnapshotV2PixelToCell("__TRANSPARENT__", {
                indexById,
                transparentPixel: "__TRANSPARENT__",
                transparentSwatchIds,
            })
        ).toBe(V2_CELL_TRANSPARENT)
        expect(
            mapProjectSnapshotV2PixelToCell("auto-1", {
                indexById,
                transparentPixel: "__TRANSPARENT__",
                transparentSwatchIds,
            })
        ).toBe(V2_CELL_TRANSPARENT)
        expect(
            mapProjectSnapshotV2PixelToCell("auto-2", {
                indexById,
                transparentPixel: "__TRANSPARENT__",
                transparentSwatchIds,
            })
        ).toBe(1)
        expect(
            mapProjectSnapshotV2PixelToCell("missing", {
                indexById,
                transparentPixel: "__TRANSPARENT__",
                transparentSwatchIds,
            })
        ).toBe(V2_CELL_NULL)
    })

    it("drops legacy null stroke cells during canonicalization", () => {
        const snapshot = canonicalProject()
        snapshot.strokeLayer.cells = [
            { cellIndex: 0, swatchIndex: V2_CELL_NULL },
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 15, swatchIndex: 1 },
        ]

        const parsed = parseProjectSnapshotV2Json(JSON.stringify(snapshot))

        expect(parsed.ok).toBe(true)
        if (!parsed.ok) return
        expect(parsed.canonical.strokeLayer.cells).toEqual([
            { cellIndex: 3, swatchIndex: V2_CELL_TRANSPARENT },
            { cellIndex: 15, swatchIndex: 1 },
        ])
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
