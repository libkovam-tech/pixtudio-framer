import { describe, expect, it } from "vitest"

import { EXTRACT_QUANTIZATION_PROFILE } from "./paletteQuantizationEngine.ts"
import {
    areEditorCommittedStatesEqual,
    clonePixelsGrid,
    cloneImportedPalettePresetsForHistory,
    cloneQuantizationProfileForHistory,
    cloneSwatches,
    type EditorCommittedState,
    imageDataSampleSignature,
} from "./editorHistoryState.ts"

type TestPixel = string | null

const swatch = (id: string, color: string, isUser = false) => ({
    id,
    color,
    isTransparent: false,
    isUser,
})

function committedState(
    overrides: Partial<EditorCommittedState<TestPixel>> = {}
): EditorCommittedState<TestPixel> {
    return {
        gridSize: 2,
        paletteCount: 4,
        brushSize: 3,
        imagePixels: [
            ["auto-0", "auto-1"],
            [null, "user-0"],
        ],
        overlayPixels: [
            [null, "transparent"],
            ["user-0", null],
        ],
        showImage: true,
        hasOriginalImageData: true,
        referenceSnapshot: null,
        autoSwatches: [
            swatch("auto-0", "#000000"),
            swatch("auto-1", "#FFFFFF"),
        ],
        userSwatches: [swatch("user-0", "#FF0000", true)],
        selectedSwatch: "user-0",
        quantizationProfile: EXTRACT_QUANTIZATION_PROFILE,
        importedPalettePresets: [],
        hiddenPresetIds: [],
        activePaletteTab: "size",
        deletedAutoPaletteColors: [],
        autoOverrides: {},
        ...overrides,
    }
}

describe("editor history state", () => {
    it("compares equivalent committed editor states", () => {
        const a = committedState({
            hiddenPresetIds: ["b", "a"],
            deletedAutoPaletteColors: ["#222222", "#111111"],
        })
        const b = committedState({
            hiddenPresetIds: ["a", "b"],
            deletedAutoPaletteColors: ["#111111", "#222222"],
        })

        expect(areEditorCommittedStatesEqual(a, b)).toBe(true)
        expect(areEditorCommittedStatesEqual(a, null)).toBe(false)
        expect(areEditorCommittedStatesEqual(null, null)).toBe(true)
    })

    it("detects committed editor state changes that must create history entries", () => {
        const base = committedState()

        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({ brushSize: 5 })
            )
        ).toBe(false)
        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({
                    overlayPixels: [
                        [null, null],
                        ["user-0", null],
                    ],
                })
            )
        ).toBe(false)
        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({
                    autoSwatches: [
                        swatch("auto-0", "#111111"),
                        swatch("auto-1", "#FFFFFF"),
                    ],
                })
            )
        ).toBe(false)
        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({
                    autoOverrides: {
                        "auto-1": {
                            hex: "#00FF00",
                            isTransparent: true,
                        },
                    },
                })
            )
        ).toBe(false)
    })

    it("compares committed quantization profile and imported preset state", () => {
        const profile = {
            kind: "fixed" as const,
            id: "imported-a",
            name: "Imported A",
            source: "imported" as const,
            colors: ["#000000", "#AA0000"],
        }
        const base = committedState({
            quantizationProfile: profile,
            importedPalettePresets: [
                {
                    id: "preset-a",
                    name: "Preset A",
                    profile,
                },
            ],
        })

        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({
                    quantizationProfile: {
                        ...profile,
                        colors: ["#000000", "#BB0000"],
                    },
                    importedPalettePresets: [
                        {
                            id: "preset-a",
                            name: "Preset A",
                            profile,
                        },
                    ],
                })
            )
        ).toBe(false)

        expect(
            areEditorCommittedStatesEqual(
                base,
                committedState({
                    quantizationProfile: profile,
                    importedPalettePresets: [
                        {
                            id: "preset-a",
                            name: "Preset A",
                            profile: {
                                ...profile,
                                colors: ["#000000", "#BB0000"],
                            },
                        },
                    ],
                })
            )
        ).toBe(false)
    })

    it("clones pixel grids without sharing row references", () => {
        const pixels = [
            ["auto-0", null],
            ["user-0", "transparent"],
        ]

        const cloned = clonePixelsGrid(pixels)

        expect(cloned).toEqual(pixels)
        expect(cloned).not.toBe(pixels)
        expect(cloned[0]).not.toBe(pixels[0])
        expect(cloned[1]).not.toBe(pixels[1])
    })

    it("clones swatch objects without sharing swatch references", () => {
        const swatches = [
            {
                id: "auto-0",
                color: "#112233",
                isTransparent: false,
                isUser: false,
            },
        ]

        const cloned = cloneSwatches(swatches)

        expect(cloned).toEqual(swatches)
        expect(cloned).not.toBe(swatches)
        expect(cloned[0]).not.toBe(swatches[0])
    })

    it("keeps the extract profile canonical for history", () => {
        expect(cloneQuantizationProfileForHistory({ kind: "extract" })).toBe(
            EXTRACT_QUANTIZATION_PROFILE
        )
    })

    it("clones fixed profile color arrays", () => {
        const profile = {
            kind: "fixed" as const,
            id: "imported-a",
            name: "Imported A",
            source: "imported" as const,
            colors: ["#000000", "#FFFFFF"],
            applicationSource: "builtin" as const,
            applicationProfileId: "sunset-10",
            applicationColors: ["#001219", "#E9D8A6"],
        }

        const cloned = cloneQuantizationProfileForHistory(profile)

        expect(cloned).toEqual(profile)
        expect(cloned).not.toBe(profile)
        expect(cloned.kind).toBe("fixed")
        if (cloned.kind !== "fixed") throw new Error("expected fixed profile")
        expect(cloned.colors).toEqual(profile.colors)
        expect(cloned.colors).not.toBe(profile.colors)
        expect(cloned.applicationColors).toEqual(profile.applicationColors)
        expect(cloned.applicationColors).not.toBe(profile.applicationColors)
    })

    it("clones imported preset profiles without sharing profile color arrays", () => {
        const presets = [
            {
                id: "preset-a",
                name: "Preset A",
                profile: {
                    kind: "fixed" as const,
                    id: "profile-a",
                    name: "Profile A",
                    source: "imported" as const,
                    colors: ["#123456", "#654321"],
                },
            },
        ]

        const cloned = cloneImportedPalettePresetsForHistory(presets)

        expect(cloned).toEqual(presets)
        expect(cloned).not.toBe(presets)
        expect(cloned[0]).not.toBe(presets[0])
        expect(cloned[0]?.profile).not.toBe(presets[0]?.profile)
        expect(cloned[0]?.profile.colors).not.toBe(presets[0]?.profile.colors)
    })

    it("creates stable image data sample signatures", () => {
        const image = {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([
                10, 20, 30, 255,
                40, 50, 60, 255,
            ]),
        }
        const sameImage = {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([
                10, 20, 30, 255,
                40, 50, 60, 255,
            ]),
        }
        const changedImage = {
            width: 2,
            height: 1,
            data: new Uint8ClampedArray([
                10, 20, 30, 255,
                40, 50, 61, 255,
            ]),
        }

        expect(imageDataSampleSignature(null)).toBe("null")
        expect(imageDataSampleSignature(image)).toBe(
            imageDataSampleSignature(sameImage)
        )
        expect(imageDataSampleSignature(image)).not.toBe(
            imageDataSampleSignature(changedImage)
        )
    })
})
