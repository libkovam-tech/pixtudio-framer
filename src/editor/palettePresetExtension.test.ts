import { describe, expect, it } from "vitest"

import {
    applyFixedPaletteDisplayOverrideSwatches,
    extendFixedPaletteProfile,
    findPaletteColorIndexByHex,
    ensureActiveImportedPalettePresetRegistered,
    makeAutoSwatchesFromFixedProfile,
    makeEditableFixedPresetProfile,
    makeImportedPalettePreset,
    makeImportedPalettePresetName,
    prepareImportedPalettePresetFromColors,
    prepareImportedPresetSwatchCreateDecision,
    prepareActivePresetFallbackToAuto,
    prepareAutoPaletteDrawingProjectApplication,
    prepareAutoPaletteDrawingWorld,
    prepareAutoPaletteReferenceProjectApplication,
    prepareAutoSwatchExclusionReferenceApplication,
    prepareAutoPaletteWorldFromReference,
    prepareFixedPaletteDrawingApplication,
    prepareFixedPaletteDrawingProjectApplication,
    prepareFixedPalettePresetProjectApplication,
    prepareFixedPaletteReferenceProjectApplication,
    prepareFixedPalettePresetSwatchCreate,
    prepareFixedPalettePresetSwatchDeleteApplication,
    prepareFixedPalettePresetSwatchDeleteProjectApplication,
    prepareFixedPaletteDisplayOverrideSwatchEditApplication,
    prepareFixedPalettePresetSwatchEditApplication,
    prepareFixedPaletteSwatchEdit,
    prepareFixedPaletteSwatchExtension,
    prepareFixedPaletteVocabularyExtensionApplication,
    prepareFixedPaletteVocabularyExtensionProjectApplication,
    prepareFixedPaletteVocabularyExtensionProjectApplicationFromReference,
    prepareFixedPaletteVocabularyExtensionWorld,
    preparePaletteTabReferenceWorld,
    prepareFixedPaletteWorldFromReference,
    preparePalettePresetDeleteDecision,
    prepareSharedOverlayPaletteWorld,
    prepareFixedPaletteSwatchDelete,
    removeFixedPaletteProfileColor,
    removeFixedPaletteProfileColorByHex,
    upsertImportedPalettePreset,
} from "./palettePresetExtension.ts"
import { prepareImportedPaletteColorsForApplication } from "./importedPaletteStrategy.ts"
import {
    FIXED_PALETTE_CONTEXT_KIND,
    FIXED_PALETTE_MAPPING_METHOD_ID,
    HSL_COLOR_SPACE_ID,
    runQuantization,
} from "./QuantizationCore.ts"

describe("palette preset extension", () => {
    const profile = {
        kind: "fixed" as const,
        source: "imported" as const,
        id: "imported-demo",
        name: "Demo",
        colors: ["#001219", "#E9D8A6"],
    }

    it("derives imported palette preset names from supported file names", () => {
        expect(makeImportedPalettePresetName("summer.palette.pixtudio")).toBe(
            "summer.palette"
        )
        expect(makeImportedPalettePresetName("  portrait.PNG  ")).toBe(
            "portrait"
        )
        expect(makeImportedPalettePresetName(".png")).toBe("Imported palette")
    })

    it("creates imported palette preset records from fixed profiles", () => {
        expect(makeImportedPalettePreset(profile)).toEqual({
            id: profile.id,
            name: profile.name,
            profile,
        })
    })

    it("ensures an active imported fixed profile has a registry preset", () => {
        expect(
            ensureActiveImportedPalettePresetRegistered([], profile)
        ).toEqual([makeImportedPalettePreset(profile)])
    })

    it("does not add registry presets for builtin fixed profiles", () => {
        expect(
            ensureActiveImportedPalettePresetRegistered([], {
                ...profile,
                id: "builtin-demo",
                source: "builtin",
            })
        ).toEqual([])
    })

    it("prepares imported palette presets from color lists", () => {
        const result = prepareImportedPalettePresetFromColors({
            fileName: "  portrait.palette.PNG  ",
            colors: ["#001219", "#E9D8A6"],
            makeImportedId: () => "imported-fixed-id",
        })

        expect(result).toEqual({
            profile: {
                kind: "fixed",
                source: "imported",
                id: "imported-fixed-id",
                name: "portrait.palette",
                colors: ["#001219", "#E9D8A6"],
            },
            preset: {
                id: "imported-fixed-id",
                name: "portrait.palette",
                profile: {
                    kind: "fixed",
                    source: "imported",
                    id: "imported-fixed-id",
                    name: "portrait.palette",
                    colors: ["#001219", "#E9D8A6"],
                },
            },
        })
    })

    it("prepares builtin preset deletion without duplicating hidden ids", () => {
        const result = preparePalettePresetDeleteDecision({
            profileId: "sunset",
            activePresetButton: null,
            hiddenPresetIds: ["sunset"],
            importedPalettePresets: [makeImportedPalettePreset(profile)],
        })

        expect(result).toEqual({
            hiddenPresetIds: ["sunset"],
            importedPalettePresets: [makeImportedPalettePreset(profile)],
            requiresActivePresetFallback: false,
        })
    })

    it("prepares imported preset deletion from the registry", () => {
        const otherProfile = {
            ...profile,
            id: "imported-other",
            name: "Other",
        }
        const result = preparePalettePresetDeleteDecision({
            profileId: profile.id,
            activePresetButton: null,
            hiddenPresetIds: [],
            importedPalettePresets: [
                makeImportedPalettePreset(profile),
                makeImportedPalettePreset(otherProfile),
            ],
        })

        expect(result).toEqual({
            hiddenPresetIds: [profile.id],
            importedPalettePresets: [makeImportedPalettePreset(otherProfile)],
            requiresActivePresetFallback: false,
        })
    })

    it("marks active preset deletion for canvas fallback", () => {
        const result = preparePalettePresetDeleteDecision({
            profileId: profile.id,
            activePresetButton: profile.id,
            hiddenPresetIds: [],
            importedPalettePresets: [makeImportedPalettePreset(profile)],
        })

        expect(result).toEqual({
            hiddenPresetIds: [profile.id],
            importedPalettePresets: [],
            requiresActivePresetFallback: true,
        })
    })

    it("makes fixed profile auto swatches from application palette order", () => {
        const unsortedProfile = {
            ...profile,
            colors: ["#FFFFFF", "#FF0000", "#00FF00"],
        }

        expect(makeAutoSwatchesFromFixedProfile(unsortedProfile)).toEqual([
            {
                id: "auto-0",
                color: "#FF0000",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-1",
                color: "#00FF00",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-2",
                color: "#FFFFFF",
                isTransparent: false,
                isUser: false,
            },
        ])
    })

    it("makes editable imported copies of built-in fixed profiles", () => {
        const builtinProfile = {
            kind: "fixed" as const,
            source: "builtin" as const,
            id: "sunset-10",
            name: "SUNSET",
            colors: ["rgb(0, 0, 0)", "#0F0"],
        }

        expect(
            makeEditableFixedPresetProfile(
                builtinProfile,
                () => "imported-demo"
            )
        ).toEqual({
            kind: "fixed",
            source: "imported",
            id: "imported-demo",
            name: "SUNSET Custom",
            colors: ["#000000", "#00FF00"],
            applicationSource: "builtin",
            applicationProfileId: "sunset-10",
            applicationColors: ["#000000", "#00FF00"],
        })
    })

    it("keeps imported fixed profile identity when making it editable", () => {
        expect(
            makeEditableFixedPresetProfile(
                {
                    ...profile,
                    colors: ["hsl(0, 100%, 50%)"],
                },
                () => "unused-id"
            )
        ).toEqual({
            ...profile,
            colors: ["#FF0000"],
        })
    })

    it("prepares fixed palette drawing applications without rebuilding pixels", () => {
        const imagePixels = [
            ["auto-1", null],
            ["auto-0", "auto-1"],
        ]
        const overlayPixels = [
            [null, "user-0"],
            [null, null],
        ]
        const autoSwatchesOverride = [
            {
                id: "auto-5",
                color: "#001219",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-9",
                color: "#E9D8A6",
                isTransparent: false,
                isUser: false,
            },
        ]

        const result = prepareFixedPaletteDrawingApplication({
            profile,
            referenceSignature: "reference-1",
            imagePixels,
            overlayPixels,
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-9",
            userSwatches: [{ id: "user-0" }],
            autoSwatchesOverride,
        })

        expect(result).toEqual({
            kind: "applied",
            world: {
                profile,
                referenceSignature: "reference-1",
                autoSwatches: autoSwatchesOverride,
                imagePixels,
                overlayPixels,
                canvasPixels: [
                    ["auto-1", "user-0"],
                    ["auto-0", "auto-1"],
                ],
            },
            selectedSwatch: "auto-9",
            autoSwatches: autoSwatchesOverride,
            imagePixels,
            overlayPixels,
            canvasPixels: [
                ["auto-1", "user-0"],
                ["auto-0", "auto-1"],
            ],
            autoOverrides: {},
        })
        if (result.kind !== "applied") throw new Error("expected application")
        expect(result.world.imagePixels).not.toBe(imagePixels)
        expect(result.world.overlayPixels).not.toBe(overlayPixels)
        expect(result.imagePixels).not.toBe(result.world.imagePixels)
        expect(result.overlayPixels).not.toBe(result.world.overlayPixels)
    })

    it("ignores fixed palette drawing applications with empty swatches", () => {
        expect(
            prepareFixedPaletteDrawingApplication({
                profile,
                imagePixels: [["auto-0"]],
                overlayPixels: [[null]],
                selectedSwatch: "auto-0",
                userSwatches: [],
                autoSwatchesOverride: [],
            })
        ).toEqual({ kind: "ignored" })
    })

    it("prepares fixed palette drawing applications with committed project state", () => {
        const imagePixels = [["auto-1"]]
        const overlayPixels = [[null]]
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF0000",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ]

        const result = prepareFixedPaletteDrawingProjectApplication({
            profile,
            referenceSignature: "reference-2",
            imagePixels,
            overlayPixels,
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-1",
            userSwatches,
            gridSize: 1,
            paletteCount: 2,
            brushSize: 3,
            showImage: false,
            hasOriginalImageData: false,
            referenceSnapshot: null,
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
        })

        expect(result.kind).toBe("applied")
        if (result.kind !== "applied") throw new Error("expected application")

        expect(result.application.selectedSwatch).toBe("auto-1")
        expect(result.projectState).toMatchObject({
            gridSize: 1,
            paletteCount: 2,
            brushSize: 3,
            imagePixels: result.application.imagePixels,
            overlayPixels: result.application.overlayPixels,
            showImage: false,
            hasOriginalImageData: false,
            referenceSnapshot: null,
            autoSwatches: result.application.autoSwatches,
            selectedSwatch: "auto-1",
            quantizationProfile: profile,
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "presets",
            autoOverrides: {},
        })
        expect(result.projectState.userSwatches).toEqual(userSwatches)
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
    })

    it("prepares fixed preset project applications from references", () => {
        const referenceSnapshot = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray(16),
        }
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [makeImportedPalettePreset(profile)]

        const result = prepareFixedPalettePresetProjectApplication({
            profile,
            referenceSnapshot,
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches,
            pixelizeReference: () => [
                ["#001219", "#E9D8A6"],
                ["#001219", "#E9D8A6"],
            ],
            referenceSignature: () => "reference-fixed",
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-0", "auto-1"],
            ],
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-1",
            projectPaletteCount: 8,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets,
            hiddenPresetIds: ["gray"],
            deletedAutoPaletteColors: ["#FFFFFF"],
            autoOverrides: {},
        })

        expect(result.kind).toBe("reference")
        if (result.kind !== "reference") throw new Error("expected reference")

        expect(result.world.referenceSignature).toBe("reference-fixed")
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 8,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            selectedSwatch: "auto-1",
            quantizationProfile: profile,
            hiddenPresetIds: ["gray"],
            deletedAutoPaletteColors: ["#FFFFFF"],
            activePaletteTab: "presets",
            autoOverrides: {},
        })
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets).not.toBe(
            importedPalettePresets
        )
    })

    it("uses the fixed METHOD profile when rebuilding a fixed preset from a reference", () => {
        const referenceSnapshot = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray(16),
        }
        const sourcePixels = [
            ["#001219", "#E9D8A6"],
            ["#BB3E03", "#94D2BD"],
        ]
        const overlayPixels = [
            [null, null],
            [null, null],
        ]
        const fixedMethodProfile = {
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: HSL_COLOR_SPACE_ID,
        }

        const result = prepareFixedPalettePresetProjectApplication({
            profile,
            referenceSnapshot,
            gridSize: 2,
            overlayPixels,
            previousSwatches: [],
            userSwatches: [],
            methodProfilesByPaletteContext: {
                fixed: fixedMethodProfile,
            },
            pixelizeReference: () => sourcePixels,
            referenceSignature: () => "reference-fixed-hsl",
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-0", "auto-1"],
            ],
            selectedSwatch: "auto-0",
            preferredSwatch: null,
            projectPaletteCount: 8,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets: [],
            hiddenPresetIds: [],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })
        const expected = runQuantization({
            sourcePixels,
            overlayPixels,
            previousSwatches: [],
            userSwatches: [],
            paletteCount: profile.colors.length,
            methodProfile: fixedMethodProfile,
            paletteContext: FIXED_PALETTE_CONTEXT_KIND,
            fixedPaletteProfile: profile,
        })

        expect(result.kind).toBe("reference")
        if (result.kind !== "reference") throw new Error("expected reference")
        expect(result.projectState.imagePixels).toEqual(expected.imagePixels)
        expect(result.projectState.autoSwatches).toEqual(expected.autoSwatches)
    })

    it("applies fixed presets without inheriting dirty auto swatch edit artifacts", () => {
        const referenceSnapshot = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray(16),
        }
        const dirtyAutoColor = "#55FF44"
        const dirtyAutoOverrides = {
            "auto-0": { hex: dirtyAutoColor, isTransparent: false },
        }
        const result = prepareFixedPalettePresetProjectApplication({
            profile,
            referenceSnapshot,
            gridSize: 2,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            previousSwatches: [
                {
                    id: "auto-0",
                    color: dirtyAutoColor,
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#222222",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [],
            pixelizeReference: () => [
                ["#001219", "#E9D8A6"],
                ["#E9D8A6", "#001219"],
            ],
            referenceSignature: () => "dirty-auto-reference",
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-1", "auto-0"],
            ],
            selectedSwatch: "auto-0",
            preferredSwatch: null,
            projectPaletteCount: 8,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets: [],
            hiddenPresetIds: [],
            deletedAutoPaletteColors: [],
            autoOverrides: dirtyAutoOverrides,
        })

        expect(result.kind).toBe("reference")
        if (result.kind !== "reference") throw new Error("expected reference")

        const appliedColors = result.projectState.autoSwatches.map(
            (swatch) => swatch.color
        )
        expect(result.projectState.autoOverrides).toEqual({})
        expect(appliedColors).toHaveLength(profile.colors.length)
        expect(appliedColors).toEqual(expect.arrayContaining(profile.colors))
        expect(appliedColors).not.toContain(dirtyAutoColor)
        const appliedIds = new Set(
            result.projectState.autoSwatches.map((swatch) => swatch.id)
        )
        expect(
            result.projectState.imagePixels.flat().every((pixel) =>
                pixel == null ? true : appliedIds.has(pixel)
            )
        ).toBe(true)
        expect(result.projectState.quantizationProfile).toEqual(profile)
    })

    it("prepares fixed preset project applications from drawing state", () => {
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [makeImportedPalettePreset(profile)]

        const result = prepareFixedPalettePresetProjectApplication({
            profile,
            referenceSnapshot: null,
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches,
            pixelizeReference: () => [],
            referenceSignature: () => null,
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-1", "auto-0"],
            ],
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-1",
            projectPaletteCount: 6,
            brushSize: 5,
            showImage: false,
            hasOriginalImageData: false,
            importedPalettePresets,
            hiddenPresetIds: ["sunset"],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result.kind).toBe("drawing")
        if (result.kind !== "drawing") throw new Error("expected drawing")

        expect(result.application.selectedSwatch).toBe("auto-1")
        expect(result.world.referenceSignature).toBeNull()
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 6,
            brushSize: 5,
            showImage: false,
            hasOriginalImageData: false,
            selectedSwatch: "auto-1",
            quantizationProfile: profile,
            hiddenPresetIds: ["sunset"],
            activePaletteTab: "presets",
            autoOverrides: {},
        })
        expect(result.projectState.imagePixels).toEqual(
            result.application.imagePixels
        )
    })

    it("prepares auto palette drawing worlds without reference rebuilds", () => {
        const imagePixels = [
            ["auto-1", null],
            ["auto-0", "auto-1"],
        ]
        const overlayPixels = [
            [null, "user-0"],
            [null, null],
        ]

        const result = prepareAutoPaletteDrawingWorld({
            profile: { kind: "extract" },
            referenceSignature: "reference-3",
            palette: ["#112233", "#445566"],
            imagePixels,
            overlayPixels,
        })

        expect(result).toEqual({
            profile: { kind: "extract" },
            referenceSignature: "reference-3",
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#112233",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#445566",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels,
            overlayPixels,
            canvasPixels: [
                ["auto-1", "user-0"],
                ["auto-0", "auto-1"],
            ],
        })
        expect(result.imagePixels).not.toBe(imagePixels)
        expect(result.overlayPixels).not.toBe(overlayPixels)
    })

    it("prepares auto palette drawing applications with committed project state", () => {
        const imagePixels = [
            ["auto-1", null],
            ["auto-0", "auto-1"],
        ]
        const overlayPixels = [
            [null, "user-0"],
            [null, null],
        ]
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ]
        const autoOverrides = {
            "auto-0": { hex: "#111111", isTransparent: false },
        }

        const result = prepareAutoPaletteDrawingProjectApplication({
            profile: { kind: "extract" },
            referenceSignature: null,
            palette: ["#112233", "#445566"],
            imagePixels,
            overlayPixels,
            selectedSwatch: "auto-1",
            preferredSwatch: null,
            gridSize: 2,
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: false,
            hasOriginalImageData: false,
            referenceSnapshot: null,
            userSwatches,
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#112233"],
            autoOverrides,
        })

        expect(result.world.canvasPixels).toEqual([
            ["auto-1", "user-0"],
            ["auto-0", "auto-1"],
        ])
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 11,
            brushSize: 3,
            imagePixels: result.world.imagePixels,
            overlayPixels: result.world.overlayPixels,
            showImage: false,
            hasOriginalImageData: false,
            referenceSnapshot: null,
            autoSwatches: result.world.autoSwatches,
            selectedSwatch: "auto-1",
            quantizationProfile: { kind: "extract" },
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "size",
            deletedAutoPaletteColors: ["#112233"],
            autoOverrides,
        })
        expect(result.projectState.userSwatches).toEqual(userSwatches)
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.projectState.autoOverrides).not.toBe(autoOverrides)
    })

    it("prepares active preset fallback to auto from the reference", () => {
        const referenceSnapshot = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray(16),
        }
        const importedPalettePresets = [makeImportedPalettePreset(profile)]
        const result = prepareActivePresetFallbackToAuto({
            profile: { kind: "extract" },
            referenceSnapshot,
            gridSize: 2,
            overlayPixels: [
                [null, null],
                [null, "user-0"],
            ],
            previousSwatches: [],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#FF00FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            paletteCountTarget: 2,
            excludedColors: [],
            pixelizeReference: () => [
                ["#000000", "#FFFFFF"],
                ["#000000", "#FFFFFF"],
            ],
            referenceSignature: () => "reference-1",
            fallbackPalette: ["#112233", "#445566"],
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-0", "auto-1"],
            ],
            selectedSwatch: "auto-0",
            projectPaletteCount: 7,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets,
            hiddenPresetIds: ["sunset"],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result.kind).toBe("reference")
        expect(result.hiddenPresetIds).toEqual(["sunset"])
        expect(result.importedPalettePresets).toEqual(importedPalettePresets)
        expect(result.importedPalettePresets).not.toBe(importedPalettePresets)
        expect(result.world.referenceSignature).toBe("reference-1")
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 7,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            activePaletteTab: "size",
            hiddenPresetIds: ["sunset"],
            selectedSwatch: "auto-0",
            quantizationProfile: { kind: "extract" },
        })
    })

    it("prepares active preset fallback to auto from the drawing palette", () => {
        const importedPalettePresets = [makeImportedPalettePreset(profile)]
        const result = prepareActivePresetFallbackToAuto({
            profile: { kind: "extract" },
            referenceSnapshot: null,
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#FF00FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            paletteCountTarget: 2,
            excludedColors: [],
            pixelizeReference: () => [],
            referenceSignature: () => null,
            fallbackPalette: ["#112233", "#445566"],
            imagePixels: [
                ["auto-0", "auto-1"],
                ["auto-0", "auto-1"],
            ],
            selectedSwatch: "auto-1",
            projectPaletteCount: 9,
            brushSize: 5,
            showImage: false,
            hasOriginalImageData: false,
            importedPalettePresets,
            hiddenPresetIds: ["gray"],
            deletedAutoPaletteColors: ["#FFFFFF"],
            autoOverrides: {},
        })

        expect(result.kind).toBe("drawing")
        expect(result.hiddenPresetIds).toEqual(["gray"])
        expect(result.importedPalettePresets).toEqual(importedPalettePresets)
        expect(result.world.referenceSignature).toBeNull()
        expect(result.world.canvasPixels).toEqual([
            ["auto-0", "user-0"],
            ["auto-0", "auto-1"],
        ])
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 9,
            brushSize: 5,
            showImage: false,
            hasOriginalImageData: false,
            activePaletteTab: "size",
            hiddenPresetIds: ["gray"],
            deletedAutoPaletteColors: ["#FFFFFF"],
            selectedSwatch: "auto-1",
            quantizationProfile: { kind: "extract" },
        })
    })

    it("prepares palette worlds with shared overlay remapping", () => {
        const imagePixels = [
            ["auto-0", "auto-1"],
            ["auto-1", "auto-0"],
        ]
        const sharedOverlay = [
            ["auto-0", "user-0"],
            [null, "auto-0"],
        ]
        const world = {
            profile: { kind: "extract" as const },
            referenceSignature: "reference-4",
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#0000FF",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#FF0000",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            canvasPixels: imagePixels,
        }

        const result = prepareSharedOverlayPaletteWorld({
            world,
            sharedOverlay,
            currentAutoSwatches: [
                {
                    id: "auto-0",
                    color: "rgb(250, 0, 0)",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#12AB34",
                    isTransparent: false,
                    isUser: true,
                },
            ],
        })

        expect(result).toEqual({
            ...world,
            imagePixels,
            overlayPixels: [
                ["auto-1", "user-0"],
                [null, "auto-1"],
            ],
            canvasPixels: [
                ["auto-1", "user-0"],
                ["auto-1", "auto-1"],
            ],
        })
        expect(result.imagePixels).not.toBe(imagePixels)
        expect(result.overlayPixels).not.toBe(sharedOverlay)
    })

    it("prepares fixed palette worlds from reference snapshots", () => {
        const referenceProfile = { ...profile, colors: ["#FFFFFF"] }
        const calls: Array<[string, number]> = []

        const result = prepareFixedPaletteWorldFromReference({
            profile: referenceProfile,
            referenceSnapshot: "reference-1",
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [
                {
                    id: "auto-0",
                    color: "#001219",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#FF00FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            pixelizeReference: (snapshot, gridSize) => {
                calls.push([snapshot, gridSize])
                return [
                    ["rgb(240, 240, 240)", "rgb(1, 1, 1)"],
                    [null, "rgb(200, 200, 200)"],
                ]
            },
            referenceSignature: (snapshot) =>
                snapshot ? `sig:${snapshot}` : "null",
        })

        expect(calls).toEqual([["reference-1", 2]])
        expect(result).toEqual({
            profile: referenceProfile,
            referenceSignature: "sig:reference-1",
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#FFFFFF",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels: [
                ["auto-0", "auto-0"],
                [null, "auto-0"],
            ],
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            canvasPixels: [
                ["auto-0", "user-0"],
                [null, "auto-0"],
            ],
        })
    })

    it("ignores fixed palette world preparation without a reference snapshot", () => {
        let pixelized = false

        expect(
            prepareFixedPaletteWorldFromReference({
                profile,
                referenceSnapshot: null as string | null,
                gridSize: 2,
                overlayPixels: [[null]],
                previousSwatches: [],
                userSwatches: [],
                pixelizeReference: () => {
                    pixelized = true
                    return [["#FFFFFF"]]
                },
            })
        ).toBeNull()
        expect(pixelized).toBe(false)
    })

    it("prepares fixed palette reference applications with committed project state", () => {
        const referenceSnapshot = {
            width: 1,
            height: 1,
            data: [0, 0, 0, 255],
        }
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ]
        const autoOverrides = {
            "auto-0": { hex: "#111111", isTransparent: false },
        }

        const result = prepareFixedPaletteReferenceProjectApplication({
            profile,
            referenceSnapshot,
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches,
            pixelizeReference: () => [["#E9D8A6"]],
            referenceSignature: () => "ref-application",
            selectedSwatch: "auto-1",
            preferredSwatch: "auto-0",
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#001219"],
            autoOverrides: {},
        })

        expect(result.kind).toBe("applied")
        if (result.kind !== "applied") return
        expect(result.world.referenceSignature).toBe("ref-application")
        expect(result.projectState).toMatchObject({
            gridSize: 1,
            paletteCount: 11,
            brushSize: 3,
            imagePixels: result.world.imagePixels,
            overlayPixels: result.world.overlayPixels,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot,
            autoSwatches: result.world.autoSwatches,
            selectedSwatch: "auto-0",
            quantizationProfile: profile,
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "presets",
            deletedAutoPaletteColors: ["#001219"],
            autoOverrides: {},
        })
        expect(result.projectState.userSwatches).toEqual(userSwatches)
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.projectState.autoOverrides).not.toBe(autoOverrides)
    })

    it("ignores fixed palette reference application preparation without a reference snapshot", () => {
        let pixelized = false

        const result = prepareFixedPaletteReferenceProjectApplication({
            profile,
            referenceSnapshot: null,
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            pixelizeReference: () => {
                pixelized = true
                return [["#E9D8A6"]]
            },
            selectedSwatch: "auto-0",
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets: [],
            hiddenPresetIds: [],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result).toEqual({
            kind: "ignored",
            reason: "missing-reference",
        })
        expect(pixelized).toBe(false)
    })

    it("prepares auto palette worlds from reference snapshots", () => {
        const calls: Array<[string, number]> = []

        const result = prepareAutoPaletteWorldFromReference({
            profile: { kind: "extract" },
            referenceSnapshot: "reference-2",
            gridSize: 3,
            overlayPixels: [
                [null, null, null],
                [null, "user-0", null],
            ],
            previousSwatches: [
                {
                    id: "auto-0",
                    color: "#333333",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#FF00FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            paletteCountTarget: 2,
            excludedColors: ["#333333"],
            pixelizeReference: (snapshot, gridSize) => {
                calls.push([snapshot, gridSize])
                return [
                    ["#111111", "#222222", "#333333"],
                    ["#444444", "#555555", "#666666"],
                ]
            },
            referenceSignature: (snapshot) =>
                snapshot ? `sig:${snapshot}` : "null",
        })

        expect(calls).toEqual([["reference-2", 3]])
        expect(result?.profile).toEqual({ kind: "extract" })
        expect(result?.referenceSignature).toBe("sig:reference-2")
        expect(result?.autoSwatches).toHaveLength(2)
        expect(
            result?.autoSwatches.map((swatch) => swatch.color.toUpperCase())
        ).not.toContain("#333333")
        expect(result?.overlayPixels[1]?.[1]).toBe("user-0")
        expect(result?.canvasPixels[1]?.[1]).toBe("user-0")
    })

    it("ignores auto palette world preparation without a reference snapshot", () => {
        let pixelized = false

        expect(
            prepareAutoPaletteWorldFromReference({
                profile: { kind: "extract" },
                referenceSnapshot: undefined as string | undefined,
                gridSize: 2,
                overlayPixels: [[null]],
                previousSwatches: [],
                userSwatches: [],
                paletteCountTarget: 2,
                pixelizeReference: () => {
                    pixelized = true
                    return [["#FFFFFF"]]
                },
            })
        ).toBeNull()
        expect(pixelized).toBe(false)
    })

    it("prepares auto palette reference applications with committed project state", () => {
        const referenceSnapshot = {
            width: 1,
            height: 1,
            data: [0, 0, 0, 255],
        }
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ]
        const autoOverrides = {
            "auto-0": { hex: "#111111", isTransparent: false },
        }

        const result = prepareAutoPaletteReferenceProjectApplication({
            profile: { kind: "extract" },
            referenceSnapshot,
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches,
            paletteCountTarget: 2,
            excludedColors: ["#001219"],
            pixelizeReference: () => [
                ["#001219", "#E9D8A6"],
                ["#E9D8A6", "#005F73"],
            ],
            referenceSignature: () => "ref-auto-application",
            selectedSwatch: "auto-0",
            preferredSwatch: "user-0",
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#001219"],
            autoOverrides,
        })

        expect(result.kind).toBe("applied")
        if (result.kind !== "applied") return
        expect(result.world.referenceSignature).toBe("ref-auto-application")
        expect(result.world.autoSwatches).toHaveLength(2)
        expect(
            result.world.autoSwatches.map((swatch) => swatch.color)
        ).not.toContain("#001219")
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 11,
            brushSize: 3,
            imagePixels: result.world.imagePixels,
            overlayPixels: result.world.overlayPixels,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot,
            autoSwatches: result.world.autoSwatches,
            selectedSwatch: "user-0",
            quantizationProfile: { kind: "extract" },
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "size",
            deletedAutoPaletteColors: ["#001219"],
            autoOverrides,
        })
        expect(result.projectState.userSwatches).toEqual(userSwatches)
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.projectState.autoOverrides).not.toBe(autoOverrides)
    })

    it("prepares auto swatch exclusion rebuilds from reference snapshots", () => {
        const referenceSnapshot = {
            width: 1,
            height: 1,
            data: [0, 0, 0, 255],
        }

        const result = prepareAutoSwatchExclusionReferenceApplication({
            profile: { kind: "extract" },
            referenceSnapshot,
            gridSize: 2,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 2,
            sourcePixels: [
                ["#001219", "#E9D8A6"],
                ["#E9D8A6", "#005F73"],
            ],
            referenceSignature: () => "ref-auto-exclusion",
            swatchId: "auto-0",
            swatchColor: "#001219",
            selectedSwatch: "auto-0",
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets: [],
            hiddenPresetIds: [],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result.kind).toBe("applied")
        if (result.kind !== "applied") return
        expect(result.preferredSwatch).toBeNull()
        expect(result.deletedAutoPaletteColors).toContain("#001219")
        expect(
            result.world.autoSwatches.map((swatch) => swatch.color)
        ).not.toContain("#001219")
        expect(result.projectState).toMatchObject({
            activePaletteTab: "size",
            selectedSwatch: result.world.autoSwatches[0]?.id,
            deletedAutoPaletteColors: result.deletedAutoPaletteColors,
            referenceSnapshot,
        })
    })

    it("ignores auto palette reference application preparation without a reference snapshot", () => {
        let pixelized = false

        const result = prepareAutoPaletteReferenceProjectApplication({
            profile: { kind: "extract" },
            referenceSnapshot: null,
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 2,
            pixelizeReference: () => {
                pixelized = true
                return [["#E9D8A6"]]
            },
            selectedSwatch: "auto-0",
            projectPaletteCount: 11,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            importedPalettePresets: [],
            hiddenPresetIds: [],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result).toEqual({
            kind: "ignored",
            reason: "missing-reference",
        })
        expect(pixelized).toBe(false)
    })

    it("prepares size tab reference worlds from extract profiles", () => {
        const calls: Array<[string, number]> = []

        const result = preparePaletteTabReferenceWorld({
            tab: "size",
            currentProfile: profile,
            referenceSnapshot: "reference-size",
            gridSize: 2,
            overlayPixels: [
                [null, "user-0"],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches: [
                {
                    id: "user-0",
                    color: "#FF00FF",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            paletteCountTarget: 2,
            excludedColors: ["#333333"],
            pixelizeReference: (snapshot, gridSize) => {
                calls.push([snapshot, gridSize])
                return [
                    ["#111111", "#222222"],
                    ["#333333", "#444444"],
                ]
            },
            referenceSignature: (snapshot) =>
                snapshot ? `sig:${snapshot}` : "null",
        })

        expect(calls).toEqual([["reference-size", 2]])
        expect(result?.profile).toEqual({ kind: "extract" })
        expect(result?.referenceSignature).toBe("sig:reference-size")
        expect(result?.autoSwatches).toHaveLength(2)
        expect(
            result?.autoSwatches.map((swatch) => swatch.color.toUpperCase())
        ).not.toContain("#333333")
        expect(result?.overlayPixels[0]?.[1]).toBe("user-0")
    })

    it("passes the saved auto METHOD profile into reference-world quantization", () => {
        const sourcePixels = [
            ["#000000", "#101010"],
            ["#F0F0F0", "#FF0000"],
        ]
        const methodProfilesByPaletteContext = {
            auto: {
                methodId: "k-means",
                colorSpaceId: "hsl",
            },
        }

        const result = preparePaletteTabReferenceWorld({
            tab: "size",
            currentProfile: profile,
            referenceSnapshot: "reference-size",
            gridSize: 2,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 3,
            methodProfilesByPaletteContext,
            pixelizeReference: () => sourcePixels,
        })
        const expected = runQuantization({
            sourcePixels,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            previousSwatches: [],
            userSwatches: [],
            paletteCount: 3,
            methodProfile: methodProfilesByPaletteContext.auto,
            paletteContext: "auto",
        })

        expect(result?.autoSwatches).toEqual(expected.autoSwatches)
        expect(result?.imagePixels).toEqual(expected.imagePixels)
    })

    it("prepares presets tab reference worlds from stale fixed profiles first", () => {
        const staleProfile = {
            ...profile,
            id: "stale-fixed",
            colors: ["#FFFFFF"],
        }
        const currentProfile = {
            ...profile,
            id: "current-fixed",
            colors: ["#000000"],
        }

        const result = preparePaletteTabReferenceWorld({
            tab: "presets",
            staleWorld: {
                profile: staleProfile,
                referenceSignature: "stale",
                autoSwatches: [],
                imagePixels: [["auto-0"]],
                overlayPixels: [[null]],
                canvasPixels: [["auto-0"]],
            },
            currentProfile,
            referenceSnapshot: "reference-presets",
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 16,
            pixelizeReference: () => [["#FFFFFF"]],
        })

        expect(result?.profile).toEqual(staleProfile)
        expect(result?.autoSwatches).toEqual([
            {
                id: "auto-0",
                color: "#FFFFFF",
                isTransparent: false,
                isUser: false,
            },
        ])
    })

    it("prepares presets tab reference worlds from current fixed profiles", () => {
        const currentProfile = {
            ...profile,
            id: "current-fixed",
            colors: ["#000000"],
        }

        const result = preparePaletteTabReferenceWorld({
            tab: "presets",
            staleWorld: null,
            currentProfile,
            referenceSnapshot: "reference-presets",
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 16,
            pixelizeReference: () => [["#000000"]],
        })

        expect(result?.profile).toEqual(currentProfile)
        expect(result?.autoSwatches).toEqual([
            {
                id: "auto-0",
                color: "#000000",
                isTransparent: false,
                isUser: false,
            },
        ])
    })

    it("skips presets tab reference worlds without a fixed profile", () => {
        let pixelized = false

        const result = preparePaletteTabReferenceWorld({
            tab: "presets",
            staleWorld: {
                profile: { kind: "extract" },
                referenceSignature: "stale",
                autoSwatches: [],
                imagePixels: [["auto-0"]],
                overlayPixels: [[null]],
                canvasPixels: [["auto-0"]],
            },
            currentProfile: { kind: "extract" },
            referenceSnapshot: "reference-presets",
            gridSize: 1,
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 16,
            pixelizeReference: () => {
                pixelized = true
                return [["#000000"]]
            },
        })

        expect(result).toBeNull()
        expect(pixelized).toBe(false)
    })

    it("appends imported palette preset records to a registry", () => {
        expect(upsertImportedPalettePreset([], profile)).toEqual([
            {
                id: profile.id,
                name: profile.name,
                profile,
            },
        ])
    })

    it("updates existing imported palette preset records in a registry", () => {
        const updatedProfile = {
            ...profile,
            name: "Updated",
            colors: ["#FFFFFF"],
        }

        expect(
            upsertImportedPalettePreset(
                [{ id: profile.id, name: profile.name, profile }],
                updatedProfile
            )
        ).toEqual([
            {
                id: profile.id,
                name: "Updated",
                profile: updatedProfile,
            },
        ])
    })

    it("adds a valid color to an imported palette profile", () => {
        const result = extendFixedPaletteProfile(profile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("can extend an editable copy of a built-in fixed palette profile", () => {
        const builtinProfile = {
            kind: "fixed" as const,
            source: "builtin" as const,
            id: "sunset-10",
            name: "SUNSET",
            colors: ["#001219", "#E9D8A6"],
        }

        const result = extendFixedPaletteProfile(builtinProfile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...builtinProfile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("extends custom fixed palette application colors when adding vocabulary", () => {
        const customProfile = {
            kind: "fixed" as const,
            source: "imported" as const,
            id: "sunset-custom",
            name: "SUNSET Custom",
            colors: ["#001219", "#E9D8A6"],
            applicationSource: "builtin" as const,
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6"],
        }

        const result = extendFixedPaletteProfile(customProfile, "#ffffff")

        expect(result).toEqual({
            profile: {
                ...customProfile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
                applicationColors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            colorIndex: 2,
            added: true,
        })
    })

    it("reuses an existing color instead of adding a duplicate", () => {
        const result = extendFixedPaletteProfile(profile, "#e9d8a6")

        expect(result).toEqual({
            profile,
            colorIndex: 1,
            added: false,
        })
    })

    it("rejects invalid colors", () => {
        expect(extendFixedPaletteProfile(profile, "white")).toBeNull()
    })

    it("finds a color in the application palette order", () => {
        const displayedColors = prepareImportedPaletteColorsForApplication([
            "#FFFFFF",
            "#00FFFD",
            "#001219",
        ])

        expect(findPaletteColorIndexByHex(displayedColors, "#00fffd")).toBe(
            displayedColors.indexOf("#00FFFD")
        )
        expect(findPaletteColorIndexByHex(displayedColors, "cyan")).toBeNull()
    })

    it("removes a color from an imported palette profile", () => {
        const result = removeFixedPaletteProfileColor(profile, 0)

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#E9D8A6"],
            },
            removed: true,
        })
    })

    it("removes custom fixed palette application colors with display colors", () => {
        const customProfile = {
            ...profile,
            applicationSource: "builtin" as const,
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6", "#FFFFFF"],
            colors: ["#001219", "#E9D8A6", "#FFFFFF"],
        }

        const result = removeFixedPaletteProfileColor(customProfile, 2)

        expect(result).toEqual({
            profile: {
                ...customProfile,
                colors: ["#001219", "#E9D8A6"],
                applicationColors: ["#001219", "#E9D8A6"],
            },
            removed: true,
        })
    })

    it("removes the displayed imported swatch color when application order differs from profile order", () => {
        const unsortedProfile = {
            ...profile,
            colors: ["#FFFFFF", "#FF0000", "#00FF00"],
        }
        const displayedColors = prepareImportedPaletteColorsForApplication(
            unsortedProfile.colors
        )

        expect(displayedColors[0]).toBe("#FF0000")

        const result = removeFixedPaletteProfileColorByHex(
            unsortedProfile,
            displayedColors[0]
        )

        expect(result).toEqual({
            profile: {
                ...unsortedProfile,
                colors: ["#FFFFFF", "#00FF00"],
            },
            removed: true,
        })
    })

    it("keeps imported palette profiles with at least one color", () => {
        const result = removeFixedPaletteProfileColor(
            { ...profile, colors: ["#001219"] },
            0
        )

        expect(result).toEqual({
            profile: { ...profile, colors: ["#001219"] },
            removed: false,
        })
    })

    it("ignores invalid color indexes when removing", () => {
        expect(removeFixedPaletteProfileColor(profile, -1)).toEqual({
            profile,
            removed: false,
        })
        expect(removeFixedPaletteProfileColor(profile, 99)).toEqual({
            profile,
            removed: false,
        })
        expect(removeFixedPaletteProfileColorByHex(profile, "white")).toEqual(
            {
                profile,
                removed: false,
            }
        )
    })

    it("prepares fixed palette swatch edits without changing swatch identity", () => {
        const autoSwatches = [
            {
                id: "auto-0",
                color: "#001219",
                isTransparent: false,
            },
            {
                id: "auto-1",
                color: "#E9D8A6",
                isTransparent: false,
            },
        ]

        const result = prepareFixedPaletteSwatchEdit({
            profile,
            swatchId: "auto-1",
            displayedColor: "#E9D8A6",
            nextColor: "#FF0000",
            autoSwatches,
        })

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219", "#FF0000"],
            },
            autoSwatches: [
                autoSwatches[0],
                {
                    id: "auto-1",
                    color: "#FF0000",
                    isTransparent: false,
                },
            ],
            edited: true,
        })
    })

    it("keeps fixed palette swatch edit unchanged for invalid colors", () => {
        const autoSwatches = [{ id: "auto-1", color: "#E9D8A6" }]

        expect(
            prepareFixedPaletteSwatchEdit({
                profile,
                swatchId: "auto-1",
                displayedColor: "#E9D8A6",
                nextColor: "red",
                autoSwatches,
            })
        ).toEqual({
            profile,
            autoSwatches,
            edited: false,
        })
    })

    it("prepares fixed preset swatch edit applications with registry updates", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-1", color: "#E9D8A6", isTransparent: false },
        ]
        const result = prepareFixedPalettePresetSwatchEditApplication({
            profile,
            swatchId: "auto-1",
            displayedColor: "#E9D8A6",
            nextColor: "#FFFFFF",
            autoSwatches,
            importedPalettePresets: [],
        })

        expect(result).toEqual({
            kind: "edited",
            profile: {
                ...profile,
                colors: ["#001219", "#FFFFFF"],
            },
            autoSwatches: [
                autoSwatches[0],
                {
                    id: "auto-1",
                    color: "#FFFFFF",
                    isTransparent: false,
                },
            ],
            importedPalettePresets: [
                {
                    id: profile.id,
                    name: profile.name,
                    profile: {
                        ...profile,
                        colors: ["#001219", "#FFFFFF"],
                    },
                },
            ],
        })
    })

    it("prepares fixed display override edits without changing quantization colors", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-1", color: "#E9D8A6", isTransparent: false },
        ]

        const result =
            prepareFixedPaletteDisplayOverrideSwatchEditApplication({
                profile,
                swatchId: "auto-1",
                nextColor: "#FFFFFF",
                autoSwatches,
                importedPalettePresets: [],
                makeImportedId: () => "unused",
            })

        const expectedProfile = {
            ...profile,
            colors: ["#E9D8A6", "#FFFFFF"],
            applicationSource: "imported" as const,
            applicationProfileId: profile.id,
            applicationColors: ["#E9D8A6", "#001219"],
        }

        expect(result).toEqual({
            kind: "edited",
            profile: expectedProfile,
            autoSwatches: [
                autoSwatches[0],
                {
                    id: "auto-1",
                    color: "#FFFFFF",
                    isTransparent: false,
                },
            ],
            importedPalettePresets: [
                {
                    id: profile.id,
                    name: profile.name,
                    profile: expectedProfile,
                },
            ],
        })
    })

    it("creates custom preset registry entries for builtin fixed display override edits", () => {
        const builtinProfile = {
            ...profile,
            source: "builtin" as const,
            id: "sunset-10",
            name: "SUNSET",
        }
        const autoSwatches = [
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-1", color: "#E9D8A6", isTransparent: false },
        ]

        const result =
            prepareFixedPaletteDisplayOverrideSwatchEditApplication({
                profile: builtinProfile,
                swatchId: "auto-1",
                nextColor: "#00FF1E",
                autoSwatches,
                importedPalettePresets: [],
                makeImportedId: () => "sunset-custom",
            })

        expect(result).toEqual({
            kind: "edited",
            profile: {
                ...builtinProfile,
                source: "imported",
                id: "sunset-custom",
                name: "SUNSET Custom",
                colors: ["#001219", "#00FF1E"],
                applicationSource: "builtin",
                applicationProfileId: "sunset-10",
                applicationColors: builtinProfile.colors,
            },
            autoSwatches: [
                autoSwatches[0],
                {
                    id: "auto-1",
                    color: "#00FF1E",
                    isTransparent: false,
                },
            ],
            importedPalettePresets: [
                {
                    id: "sunset-custom",
                    name: "SUNSET Custom",
                    profile: {
                        ...builtinProfile,
                        source: "imported",
                        id: "sunset-custom",
                        name: "SUNSET Custom",
                        colors: ["#001219", "#00FF1E"],
                        applicationSource: "builtin",
                        applicationProfileId: "sunset-10",
                        applicationColors: builtinProfile.colors,
                    },
                },
            ],
        })
    })

    it("builds fixed custom swatches from display colors after preset switches", () => {
        const customProfile = {
            ...profile,
            source: "imported" as const,
            id: "sunset-custom",
            name: "SUNSET Custom",
            colors: ["#001219", "#00FF1E"],
            applicationSource: "builtin" as const,
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6"],
        }

        expect(makeAutoSwatchesFromFixedProfile(customProfile)).toEqual([
            {
                id: "auto-0",
                color: "#001219",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-1",
                color: "#00FF1E",
                isTransparent: false,
                isUser: false,
            },
        ])
    })

    it("keeps builtin display override edits on builtin application colors after requantize", () => {
        const builtinProfile = {
            ...profile,
            source: "builtin" as const,
            id: "sunset-10",
            name: "SUNSET",
        }
        const edit =
            prepareFixedPaletteDisplayOverrideSwatchEditApplication({
                profile: builtinProfile,
                swatchId: "auto-1",
                nextColor: "#00FF1E",
                autoSwatches: [
                    { id: "auto-0", color: "#001219", isTransparent: false },
                    { id: "auto-1", color: "#E9D8A6", isTransparent: false },
                ],
                importedPalettePresets: [],
                makeImportedId: () => "sunset-custom",
            })

        expect(edit.kind).toBe("edited")
        if (edit.kind !== "edited") throw new Error("expected edited")

        const result = applyFixedPaletteDisplayOverrideSwatches({
            profile: edit.profile,
            previousAutoSwatches: edit.autoSwatches,
            nextAutoSwatches: [
                { id: "auto-0", color: "#001219", isTransparent: false },
                { id: "auto-1", color: "#E9D8A6", isTransparent: false },
            ],
        })

        expect(result).toEqual([
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-1", color: "#00FF1E", isTransparent: false },
        ])
    })

    it("applies fixed display override swatches after requantize", () => {
        const result = applyFixedPaletteDisplayOverrideSwatches({
            profile,
            previousAutoSwatches: [
                { id: "auto-0", color: "#001219", isTransparent: false },
                { id: "auto-1", color: "#FFFFFF", isTransparent: false },
            ],
            nextAutoSwatches: [
                { id: "auto-0", color: "#001219", isTransparent: false },
                { id: "auto-1", color: "#E9D8A6", isTransparent: false },
            ],
        })

        expect(result).toEqual([
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-1", color: "#FFFFFF", isTransparent: false },
        ])
    })

    it("ignores fixed preset swatch edit applications for invalid colors", () => {
        expect(
            prepareFixedPalettePresetSwatchEditApplication({
                profile,
                swatchId: "auto-1",
                displayedColor: "#E9D8A6",
                nextColor: "white",
                autoSwatches: [{ id: "auto-1", color: "#E9D8A6" }],
                importedPalettePresets: [],
            })
        ).toEqual({ kind: "ignored" })
    })

    it("prepares fixed palette extension without changing existing swatch ids", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#001219", isTransparent: false },
            { id: "auto-2", color: "#E9D8A6", isTransparent: false },
        ]

        const result = prepareFixedPaletteSwatchExtension({
            autoSwatches,
            color: "#ff0000",
            makeSwatch: (id, color) => ({
                id,
                color,
                isTransparent: false,
            }),
        })

        expect(result).toEqual({
            autoSwatches: [
                autoSwatches[0],
                autoSwatches[1],
                {
                    id: "auto-3",
                    color: "#FF0000",
                    isTransparent: false,
                },
            ],
            selectedSwatch: "auto-3",
        })
    })

    it("selects an existing fixed palette swatch when extension color already exists", () => {
        const autoSwatches = [{ id: "auto-1", color: "#E9D8A6" }]

        expect(
            prepareFixedPaletteSwatchExtension({
                autoSwatches,
                color: "#e9d8a6",
                makeSwatch: (id, color) => ({
                    id,
                    color,
                }),
            })
        ).toEqual({
            autoSwatches,
            selectedSwatch: "auto-1",
        })
    })

    it("prepares added imported preset swatches with the updated preset registry", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#001219", isTransparent: false },
        ]
        const result = prepareFixedPalettePresetSwatchCreate({
            profile,
            color: "#FFFFFF",
            autoSwatches,
            importedPalettePresets: [],
            makeSwatch: (id, color) => ({
                id,
                color,
                isTransparent: false,
            }),
        })

        expect(result).toEqual({
            kind: "added",
            profile: {
                ...profile,
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            selectedSwatch: "auto-1",
            autoSwatches: [
                autoSwatches[0],
                {
                    id: "auto-1",
                    color: "#FFFFFF",
                    isTransparent: false,
                },
            ],
            importedPalettePresets: [
                {
                    id: profile.id,
                    name: profile.name,
                    profile: {
                        ...profile,
                        colors: ["#001219", "#E9D8A6", "#FFFFFF"],
                    },
                },
            ],
        })
    })

    it("prepares existing imported preset swatch selection by application order", () => {
        const result = prepareFixedPalettePresetSwatchCreate({
            profile: {
                ...profile,
                colors: ["#E9D8A6", "#001219"],
            },
            color: "#001219",
            autoSwatches: [
                { id: "auto-0", color: "#E9D8A6" },
                { id: "auto-1", color: "#001219" },
            ],
            importedPalettePresets: [],
            makeSwatch: (id, color) => ({
                id,
                color,
            }),
        })

        expect(result).toEqual({
            kind: "existing",
            profile: {
                ...profile,
                colors: ["#E9D8A6", "#001219"],
            },
            selectedSwatch: "auto-1",
            importedPalettePresets: [],
        })
    })

    it("selects the current swatch id when adding an existing preset color", () => {
        const result = prepareFixedPalettePresetSwatchCreate({
            profile: {
                ...profile,
                colors: ["#E9D8A6", "#001219"],
            },
            color: "#001219",
            autoSwatches: [
                { id: "auto-5", color: "#001219" },
                { id: "auto-7", color: "#E9D8A6" },
            ],
            importedPalettePresets: [],
            makeSwatch: (id, color) => ({
                id,
                color,
            }),
        })

        expect(result).toMatchObject({
            kind: "existing",
            selectedSwatch: "auto-5",
        })
    })

    it("prepares imported preset swatch create decisions", () => {
        const makeSwatch = (id: string, color: string) => ({
            id,
            color,
            isTransparent: false,
        })

        expect(
            prepareImportedPresetSwatchCreateDecision({
                profile: { kind: "extract" },
                color: "#FFFFFF",
                autoSwatches: [],
                importedPalettePresets: [],
                makeImportedId: () => "ignored",
                makeSwatch,
            })
        ).toEqual({ kind: "ignored" })

        expect(
            prepareImportedPresetSwatchCreateDecision({
                profile,
                color: "#001219",
                autoSwatches: [
                    { id: "auto-5", color: "#001219", isTransparent: false },
                ],
                importedPalettePresets: [],
                makeImportedId: () => "existing",
                makeSwatch,
            })
        ).toMatchObject({
            kind: "existing",
            selectedSwatch: "auto-5",
            importedPalettePresets: [],
        })

        const added = prepareImportedPresetSwatchCreateDecision({
            profile,
            color: "#FFFFFF",
            autoSwatches: [
                { id: "auto-0", color: "#001219", isTransparent: false },
            ],
            importedPalettePresets: [],
            makeImportedId: () => "imported-copy",
            makeSwatch,
        })

        expect(added).toMatchObject({
            kind: "added",
            profile: {
                id: profile.id,
                source: "imported",
                colors: ["#001219", "#E9D8A6", "#FFFFFF"],
            },
            selectedSwatch: "auto-1",
            autoSwatches: [
                { id: "auto-0", color: "#001219", isTransparent: false },
                { id: "auto-1", color: "#FFFFFF", isTransparent: false },
            ],
        })
    })

    it("prepares vocabulary extension worlds without rebuilding pixel assignments", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#001219" },
            { id: "auto-3", color: "#FF0000" },
        ]
        const imagePixels = [
            ["auto-3", "auto-0"],
            [null, "auto-0"],
        ]
        const overlayPixels = [
            [null, "user-0"],
            [null, null],
        ]

        const result = prepareFixedPaletteVocabularyExtensionWorld({
            profile,
            referenceSignature: "ref-1",
            autoSwatches,
            imagePixels,
            overlayPixels,
            selectedSwatch: "auto-4",
        })

        expect(result).toEqual({
            world: {
                profile,
                referenceSignature: "ref-1",
                autoSwatches,
                imagePixels,
                overlayPixels,
                canvasPixels: [
                    ["auto-3", "user-0"],
                    [null, "auto-0"],
                ],
            },
            selectedSwatch: "auto-4",
        })
        expect(result.world.imagePixels).not.toBe(imagePixels)
        expect(result.world.overlayPixels).not.toBe(overlayPixels)
        expect(result.world.autoSwatches).not.toBe(autoSwatches)
    })

    it("lets the newly added fixed swatch claim matching reference cells", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#000000" },
            { id: "auto-3", color: "#E9D8A6" },
            { id: "auto-4", color: "#FFFFFF" },
        ]
        const candidateAutoSwatches = [
            { id: "auto-0", color: "#000000" },
            { id: "auto-1", color: "#E9D8A6" },
            { id: "auto-2", color: "#FFFFFF" },
        ]
        const imagePixels = [
            ["auto-3", "auto-0"],
            ["auto-3", "auto-0"],
        ]

        const result = prepareFixedPaletteVocabularyExtensionWorld({
            profile: {
                ...profile,
                colors: ["#000000", "#E9D8A6", "#FFFFFF"],
            },
            autoSwatches,
            candidateAutoSwatches,
            candidateImagePixels: [
                ["auto-2", "auto-0"],
                ["auto-1", "auto-2"],
            ],
            imagePixels,
            overlayPixels: [
                [null, null],
                [null, null],
            ],
            selectedSwatch: "auto-4",
        })

        expect(result.world.imagePixels).toEqual([
            ["auto-4", "auto-0"],
            ["auto-3", "auto-4"],
        ])
    })

    it("prepares vocabulary extension application grids from the same world", () => {
        const autoSwatches = [
            { id: "auto-0", color: "#000000" },
            { id: "auto-1", color: "#FFFFFF" },
        ]
        const result = prepareFixedPaletteVocabularyExtensionApplication({
            profile: {
                ...profile,
                colors: ["#000000", "#FFFFFF"],
            },
            referenceSignature: "ref-2",
            autoSwatches,
            candidateAutoSwatches: autoSwatches,
            candidateImagePixels: [["auto-1"]],
            imagePixels: [["auto-0"]],
            overlayPixels: [[null]],
            selectedSwatch: "auto-1",
        })

        expect(result.imagePixels).toEqual(result.world.imagePixels)
        expect(result.overlayPixels).toEqual(result.world.overlayPixels)
        expect(result.canvasPixels).toEqual(result.world.canvasPixels)
        expect(result.autoSwatches).toEqual(result.world.autoSwatches)
        expect(result.imagePixels).not.toBe(result.world.imagePixels)
        expect(result.overlayPixels).not.toBe(result.world.overlayPixels)
        expect(result.canvasPixels).not.toBe(result.world.canvasPixels)
        expect(result.autoSwatches).not.toBe(result.world.autoSwatches)
    })

    it("prepares vocabulary extension applications with committed project state", () => {
        const nextProfile = {
            ...profile,
            colors: ["#000000", "#E9D8A6", "#FFFFFF"],
        }
        const autoSwatches = [
            {
                id: "auto-0",
                color: "#000000",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-3",
                color: "#E9D8A6",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-4",
                color: "#FFFFFF",
                isTransparent: false,
                isUser: false,
            },
        ]
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF0000",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: nextProfile.id,
                name: nextProfile.name,
                profile: nextProfile,
            },
        ]
        const autoOverrides = {
            "auto-0": { hex: "#111111", isTransparent: false },
        }

        const result = prepareFixedPaletteVocabularyExtensionProjectApplication({
            profile: nextProfile,
            referenceSignature: "ref-3",
            autoSwatches,
            candidateAutoSwatches: [
                {
                    id: "auto-0",
                    color: "#000000",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#E9D8A6",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-2",
                    color: "#FFFFFF",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            candidateImagePixels: [["auto-2"]],
            imagePixels: [["auto-3"]],
            overlayPixels: [[null]],
            selectedSwatch: "auto-4",
            gridSize: 1,
            paletteCount: 3,
            brushSize: 2,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot: { width: 1, height: 1, data: [0, 0, 0, 255] },
            userSwatches,
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#000000"],
            autoOverrides,
        })

        expect(result.application.imagePixels).toEqual([["auto-4"]])
        expect(result.projectState).toMatchObject({
            gridSize: 1,
            paletteCount: 3,
            brushSize: 2,
            imagePixels: result.application.imagePixels,
            overlayPixels: result.application.overlayPixels,
            showImage: true,
            hasOriginalImageData: true,
            autoSwatches: result.application.autoSwatches,
            selectedSwatch: "auto-4",
            quantizationProfile: nextProfile,
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "presets",
            deletedAutoPaletteColors: ["#000000"],
            autoOverrides,
        })
        expect(result.projectState.userSwatches).toEqual(userSwatches)
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.projectState.autoOverrides).not.toBe(autoOverrides)
    })

    it("prepares vocabulary extension project applications from references", () => {
        const nextProfile = {
            ...profile,
            colors: ["#000000", "#E9D8A6", "#FFFFFF"],
        }
        const referenceSnapshot = {
            width: 2,
            height: 2,
            data: new Uint8ClampedArray(16),
        }
        const autoSwatches = [
            {
                id: "auto-0",
                color: "#000000",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-3",
                color: "#E9D8A6",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-4",
                color: "#FFFFFF",
                isTransparent: false,
                isUser: false,
            },
        ]
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF0000",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [makeImportedPalettePreset(nextProfile)]

        const result =
            prepareFixedPaletteVocabularyExtensionProjectApplicationFromReference(
                {
                    profile: nextProfile,
                    referenceSnapshot,
                    referenceSignature: () => "reference-vocabulary",
                    gridSize: 2,
                    overlayPixels: [
                        [null, null],
                        [null, "user-0"],
                    ],
                    previousSwatches: [],
                    userSwatches,
                    pixelizeReference: () => [
                        ["#FFFFFF", "#000000"],
                        ["#E9D8A6", "#FFFFFF"],
                    ],
                    autoSwatches,
                    imagePixels: [
                        ["auto-3", "auto-0"],
                        ["auto-3", "auto-0"],
                    ],
                    selectedSwatch: "auto-4",
                    projectPaletteCount: 10,
                    brushSize: 4,
                    showImage: true,
                    hasOriginalImageData: true,
                    importedPalettePresets,
                    hiddenPresetIds: ["hidden"],
                    deletedAutoPaletteColors: ["#111111"],
                    autoOverrides: {},
                }
            )

        expect(result.application.imagePixels).toEqual([
            ["auto-4", "auto-0"],
            ["auto-3", "auto-4"],
        ])
        expect(result.application.world.referenceSignature).toBe(
            "reference-vocabulary"
        )
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 10,
            brushSize: 4,
            showImage: true,
            hasOriginalImageData: true,
            selectedSwatch: "auto-4",
            quantizationProfile: nextProfile,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#111111"],
            activePaletteTab: "presets",
            autoOverrides: {},
        })
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
    })

    it("prepares fixed palette swatch deletion with an active fallback selection", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: 1,
            selectedSwatch: "auto-1",
        })

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219"],
            },
            selectedSwatch: "auto-0",
            removed: true,
        })
    })

    it("keeps fixed palette selection when deleting an inactive swatch", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: 1,
            selectedSwatch: "auto-0",
        })

        expect(result).toEqual({
            profile: {
                ...profile,
                colors: ["#001219"],
            },
            selectedSwatch: "auto-0",
            removed: true,
        })
    })

    it("keeps fixed palette delete preparation unchanged for invalid swatch indexes", () => {
        const result = prepareFixedPaletteSwatchDelete({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: null,
            selectedSwatch: "auto-1",
        })

        expect(result).toEqual({
            profile,
            selectedSwatch: "auto-1",
            removed: false,
        })
    })

    it("prepares fixed preset swatch delete applications with registry updates", () => {
        const result = prepareFixedPalettePresetSwatchDeleteApplication({
            profile,
            swatchColor: "#E9D8A6",
            swatchId: "auto-1",
            swatchIndex: 1,
            selectedSwatch: "auto-1",
            importedPalettePresets: [],
        })

        expect(result).toEqual({
            kind: "deleted",
            profile: {
                ...profile,
                colors: ["#001219"],
            },
            selectedSwatch: "auto-0",
            importedPalettePresets: [
                {
                    id: profile.id,
                    name: profile.name,
                    profile: {
                        ...profile,
                        colors: ["#001219"],
                    },
                },
            ],
        })
    })

    it("deletes fixed preset swatches without remapping surviving swatch ids", () => {
        const editedProfile = {
            ...profile,
            colors: ["#000000", "#333333", "#00FF00"],
        }
        const autoSwatches = [
            {
                id: "auto-0",
                color: "#000000",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-5",
                color: "#333333",
                isTransparent: false,
                isUser: false,
            },
            {
                id: "auto-8",
                color: "#00FF00",
                isTransparent: false,
                isUser: false,
            },
        ]
        const userSwatches = [
            {
                id: "user-0",
                color: "#FF00FF",
                isTransparent: false,
                isUser: true,
            },
        ]
        const result = prepareFixedPalettePresetSwatchDeleteProjectApplication({
            profile: editedProfile,
            swatchColor: "#333333",
            swatchId: "auto-5",
            swatchIndex: 5,
            selectedSwatch: "auto-8",
            imagePixels: [
                ["auto-8", "auto-5"],
                ["auto-0", "auto-8"],
            ],
            overlayPixels: [
                [null, "user-0"],
                ["auto-5", null],
            ],
            autoSwatches,
            userSwatches,
            gridSize: 2,
            paletteCount: 3,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot: { width: 1, height: 1, data: [0, 0, 0, 255] },
            referenceSignature: "reference-delete",
            importedPalettePresets: [],
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: [],
            autoOverrides: {},
        })

        expect(result.kind).toBe("deleted")
        if (result.kind !== "deleted") return

        expect(result.profile.colors).toEqual(["#000000", "#00FF00"])
        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
            "auto-8",
        ])
        expect(result.imagePixels).toEqual([
            ["auto-8", "auto-0"],
            ["auto-0", "auto-8"],
        ])
        expect(result.overlayPixels).toEqual([
            [null, "user-0"],
            ["auto-0", null],
        ])
        expect(result.selectedSwatch).toBe("auto-8")
        expect(result.projectState).toMatchObject({
            gridSize: 2,
            paletteCount: 3,
            brushSize: 3,
            imagePixels: result.imagePixels,
            overlayPixels: result.overlayPixels,
            autoSwatches: result.autoSwatches,
            userSwatches,
            selectedSwatch: "auto-8",
            quantizationProfile: {
                ...editedProfile,
                colors: ["#000000", "#00FF00"],
            },
            hiddenPresetIds: ["hidden"],
            activePaletteTab: "presets",
            autoOverrides: {},
        })
        expect(result.projectState.importedPalettePresets).toEqual([
            {
                id: editedProfile.id,
                name: editedProfile.name,
                profile: {
                    ...editedProfile,
                    colors: ["#000000", "#00FF00"],
                },
            },
        ])
    })

    it("ignores fixed preset swatch delete applications for invalid indexes", () => {
        expect(
            prepareFixedPalettePresetSwatchDeleteApplication({
                profile,
                swatchColor: "#E9D8A6",
                swatchId: "auto-1",
                swatchIndex: null,
                selectedSwatch: "auto-1",
                importedPalettePresets: [],
            })
        ).toEqual({ kind: "ignored" })
    })
})
