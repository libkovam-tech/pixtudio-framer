import { describe, expect, it } from "vitest"

import {
    extendFixedPaletteProfile,
    findPaletteColorIndexByHex,
    makeAutoSwatchesFromFixedProfile,
    makeEditableFixedPresetProfile,
    makeImportedPalettePreset,
    makeImportedPalettePresetName,
    prepareFixedPaletteDrawingApplication,
    prepareFixedPalettePresetSwatchCreate,
    prepareFixedPalettePresetSwatchDeleteApplication,
    prepareFixedPalettePresetSwatchEditApplication,
    prepareFixedPaletteSwatchEdit,
    prepareFixedPaletteSwatchExtension,
    prepareFixedPaletteVocabularyExtensionApplication,
    prepareFixedPaletteVocabularyExtensionWorld,
    prepareFixedPaletteWorldFromReference,
    prepareFixedPaletteSwatchDelete,
    removeFixedPaletteProfileColor,
    removeFixedPaletteProfileColorByHex,
    upsertImportedPalettePreset,
} from "./palettePresetExtension.ts"
import { prepareImportedPaletteColorsForApplication } from "./importedPaletteStrategy.ts"

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
