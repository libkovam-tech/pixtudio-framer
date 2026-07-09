import { describe, expect, it } from "vitest"

import {
    appendDeletedAutoPaletteColor,
    collapseDuplicateSwatchesAndRemapPixels,
    collapseDuplicateSwatchesByScope,
    computePaletteCountFromSwatches,
    isPaletteWorldCompatibleWithReferenceGrid,
    prepareAutoOverridesForSwatchEdit,
    prepareCurrentPaletteWorldSnapshot,
    preparePaletteSwatchEditApplication,
    preparePaletteWorldSnapshotApplication,
    preparePaletteWorldSnapshotProjectApplication,
    preparePaletteTabSwitch,
    prepareProjectStateFromPaletteWorld,
    prepareStrokePaintSwatch,
    prepareSwatchesForEdit,
    prepareSwatchDelete,
    removePalettePixelValueFromGrid,
    resolvePaletteWorldSelection,
    resolveSelectedSwatchAfterAutoChange,
} from "./paletteState.ts"

describe("palette state", () => {
    it("appends deleted auto palette colors without source pixels", () => {
        expect(
            appendDeletedAutoPaletteColor({
                color: "rgb(18, 52, 86)",
                currentDeletedColors: ["#000000"],
            })
        ).toEqual(["#000000", "#123456"])
    })

    it("keeps deleted auto palette colors unique without source pixels", () => {
        expect(
            appendDeletedAutoPaletteColor({
                color: "#123456",
                currentDeletedColors: ["#123456"],
            })
        ).toEqual(["#123456"])
    })

    it("expands deleted auto palette colors to nearby source colors", () => {
        expect(
            appendDeletedAutoPaletteColor({
                color: "#FF0000",
                currentDeletedColors: ["#000000"],
                sourcePixels: [
                    ["#FF0000", "#FE0000", "#00FF00"],
                    [null, "rgb(255, 1, 1)", "#0000FF"],
                ],
            })
        ).toEqual(["#000000", "#FF0000", "#FE0000", "#FF0101"])
    })

    it("counts auto and user swatches that paint visible colors", () => {
        const autoSwatches = [
            { id: "auto-0" },
            { id: "auto-1", isTransparent: false },
        ]
        const userSwatches = [{ id: "user-0" }]

        expect(
            computePaletteCountFromSwatches(autoSwatches, userSwatches, {
                min: 2,
                max: 32,
            })
        ).toBe(3)
    })

    it("excludes transparent tool and transparent swatches from the palette count", () => {
        const autoSwatches = [
            { id: "auto-0" },
            { id: "transparent" },
            { id: "auto-1", isTransparent: true },
        ]
        const userSwatches = [
            { id: "user-0", isTransparent: true },
            { id: "user-1" },
        ]

        expect(
            computePaletteCountFromSwatches(autoSwatches, userSwatches, {
                min: 2,
                max: 32,
            })
        ).toBe(2)
    })

    it("clamps the count to the project palette bounds", () => {
        expect(
            computePaletteCountFromSwatches([], [], {
                min: 2,
                max: 32,
            })
        ).toBe(2)

        expect(
            computePaletteCountFromSwatches(
                Array.from({ length: 40 }, (_, index) => ({
                    id: `auto-${index}`,
                })),
                [],
                { min: 2, max: 32 }
            )
        ).toBe(32)
    })

    it("ignores nullish swatches defensively", () => {
        expect(
            computePaletteCountFromSwatches(
                [null, undefined, { id: "auto-0" }],
                null,
                { min: 2, max: 32 }
            )
        ).toBe(2)
    })

    it("keeps the transparent tool selected after auto swatches change", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "transparent",
            })
        ).toBe("transparent")
    })

    it("keeps the selected user swatch when auto swatches are rebuilt", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "user-0",
            })
        ).toBe("user-0")
    })

    it("uses a valid preferred swatch before the current selection", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }, { id: "auto-1" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-0",
                preferredSwatch: "auto-1",
            })
        ).toBe("auto-1")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-0",
                preferredSwatch: "user-0",
            })
        ).toBe("user-0")
    })

    it("falls back to the first available swatch when the selected auto swatch disappears", () => {
        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-9",
            })
        ).toBe("auto-0")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [],
                userSwatches: [{ id: "user-0" }],
                selectedSwatch: "auto-9",
            })
        ).toBe("user-0")

        expect(
            resolveSelectedSwatchAfterAutoChange({
                nextAutoSwatches: [],
                userSwatches: [],
                selectedSwatch: "auto-9",
            })
        ).toBe("transparent")
    })

    it("restores a valid palette-world selection from a tab-local preference", () => {
        expect(
            resolvePaletteWorldSelection({
                autoSwatches: [{ id: "auto-0" }, { id: "auto-2" }],
                userSwatches: [{ id: "user-0" }],
                preferredSwatch: "auto-2",
            })
        ).toBe("auto-2")

        expect(
            resolvePaletteWorldSelection({
                autoSwatches: [{ id: "auto-0" }],
                userSwatches: [{ id: "user-0" }],
                preferredSwatch: "user-0",
            })
        ).toBe("user-0")
    })

    it("falls back inside the target palette world without using another tab selection", () => {
        expect(
            resolvePaletteWorldSelection({
                autoSwatches: [{ id: "auto-0" }, { id: "auto-1" }],
                userSwatches: [],
                preferredSwatch: "auto-9",
            })
        ).toBe("auto-0")
    })

    it("stores the current world before switching palette tabs", () => {
        const result = preparePaletteTabSwitch({
            state: {
                activeTab: "size",
                sizeWorld: "old-size",
                presetsWorld: "preset",
            },
            currentWorld: "current-size",
            nextTab: "presets",
            isTargetWorldCompatible: () => true,
        })

        expect(result.savedState).toEqual({
            activeTab: "size",
            sizeWorld: "current-size",
            presetsWorld: "preset",
        })
        expect(result.nextState).toEqual({
            activeTab: "presets",
            sizeWorld: "current-size",
            presetsWorld: "preset",
        })
        expect(result.targetWorld).toBe("preset")
        expect(result.targetWorldIsCompatible).toBe(true)
    })

    it("clears an incompatible target world while keeping it available for lazy rebuild", () => {
        const result = preparePaletteTabSwitch({
            state: {
                activeTab: "presets",
                sizeWorld: "stale-size",
                presetsWorld: "current-preset",
            },
            currentWorld: "current-preset",
            nextTab: "size",
            isTargetWorldCompatible: () => false,
        })

        expect(result.targetWorld).toBe("stale-size")
        expect(result.targetWorldIsCompatible).toBe(false)
        expect(result.nextState).toEqual({
            activeTab: "size",
            sizeWorld: null,
            presetsWorld: "current-preset",
        })
    })

    it("prepares the current palette world snapshot without sharing mutable grids", () => {
        const profile = { kind: "extract" as const }
        const autoSwatches = [
            {
                id: "auto-0",
                color: "#111111",
                isTransparent: false,
                isUser: false,
            },
        ]
        const imagePixels = [["auto-0"]]
        const overlayPixels = [[null]]
        const canvasPixels = [["auto-0"]]

        const result = prepareCurrentPaletteWorldSnapshot({
            profile,
            referenceSignature: "ref-1",
            autoSwatches,
            imagePixels,
            overlayPixels,
            canvasPixels,
        })

        expect(result).toEqual({
            profile,
            referenceSignature: "ref-1",
            autoSwatches,
            imagePixels,
            overlayPixels,
            canvasPixels,
        })
        expect(result.profile).toBe(profile)
        expect(result.autoSwatches).not.toBe(autoSwatches)
        expect(result.autoSwatches[0]).not.toBe(autoSwatches[0])
        expect(result.imagePixels).not.toBe(imagePixels)
        expect(result.imagePixels[0]).not.toBe(imagePixels[0])
        expect(result.overlayPixels).not.toBe(overlayPixels)
        expect(result.canvasPixels).not.toBe(canvasPixels)
    })

    it("checks palette world compatibility against reference signature and grid size", () => {
        const compatibleWorld = {
            referenceSignature: "ref-1",
            imagePixels: [
                ["auto-0", null],
                [null, "auto-1"],
            ],
            overlayPixels: [
                [null, null],
                ["auto-0", null],
            ],
            canvasPixels: [
                ["auto-0", null],
                ["auto-0", "auto-1"],
            ],
        }

        expect(
            isPaletteWorldCompatibleWithReferenceGrid({
                world: compatibleWorld,
                currentReferenceSignature: "ref-1",
                gridSize: 2,
            })
        ).toBe(true)

        expect(
            isPaletteWorldCompatibleWithReferenceGrid({
                world: compatibleWorld,
                currentReferenceSignature: "ref-2",
                gridSize: 2,
            })
        ).toBe(false)

        expect(
            isPaletteWorldCompatibleWithReferenceGrid({
                world: {
                    ...compatibleWorld,
                    overlayPixels: [[null]],
                },
                currentReferenceSignature: "ref-1",
                gridSize: 2,
            })
        ).toBe(false)
    })

    it("keeps auto palette strokes bound to quantization swatches", () => {
        const result = prepareStrokePaintSwatch({
            activeTab: "size",
            selectedSwatch: "auto-0",
            autoSwatches: [{ id: "auto-0", color: "#112233" }],
            userSwatches: [],
            makeUserSwatch: (source) => ({
                ...source,
                id: "user-copy",
                isUser: true,
            }),
        })

        expect(result.paintSwatch).toBe("auto-0")
        expect(result.userSwatches).toEqual([])
        expect(result.createdUserSwatch).toBeNull()
    })

    it("promotes preset palette strokes into a separate user paint swatch", () => {
        const result = prepareStrokePaintSwatch({
            activeTab: "presets",
            selectedSwatch: "auto-2",
            autoSwatches: [{ id: "auto-2", color: "#AABBCC" }],
            userSwatches: [],
            makeUserSwatch: (source) => ({
                ...source,
                id: "user-copy",
                isUser: true,
            }),
        })

        expect(result.paintSwatch).toBe("user-copy")
        expect(result.createdUserSwatch).toEqual({
            id: "user-copy",
            color: "#AABBCC",
            isUser: true,
        })
        expect(result.userSwatches).toEqual([result.createdUserSwatch])
    })

    it("creates a separate preset user paint swatch even when the color already exists", () => {
        const result = prepareStrokePaintSwatch({
            activeTab: "presets",
            selectedSwatch: "auto-2",
            autoSwatches: [{ id: "auto-2", color: "#aabbcc" }],
            userSwatches: [{ id: "user-existing", color: "#AABBCC" }],
            makeUserSwatch: (source) => ({
                ...source,
                id: "user-copy",
                isUser: true,
            }),
        })

        expect(result.paintSwatch).toBe("user-copy")
        expect(result.userSwatches).toEqual([
            { id: "user-existing", color: "#AABBCC" },
            { id: "user-copy", color: "#aabbcc", isUser: true },
        ])
        expect(result.createdUserSwatch).toEqual({
            id: "user-copy",
            color: "#aabbcc",
            isUser: true,
        })
    })

    it("does not promote the transparent tool into a user paint swatch", () => {
        const result = prepareStrokePaintSwatch({
            activeTab: "presets",
            selectedSwatch: "transparent",
            autoSwatches: [{ id: "auto-0", color: "#FFFFFF" }],
            userSwatches: [],
            makeUserSwatch: (source) => ({
                ...source,
                id: "user-copy",
                isUser: true,
            }),
        })

        expect(result.paintSwatch).toBe("transparent")
        expect(result.userSwatches).toEqual([])
        expect(result.createdUserSwatch).toBeNull()
    })

    it("prepares edited swatches without mutating unrelated entries", () => {
        const autoSwatch = { id: "auto-0", color: "#112233" }
        const userSwatch = { id: "user-0", color: "#445566", isUser: true }

        const result = prepareSwatchesForEdit({
            swatchId: "user-0",
            newColorUpper: "#AABBCC",
            makeTransparent: true,
            autoSwatches: [autoSwatch],
            userSwatches: [userSwatch],
        })

        expect(result.nextAuto[0]).toBe(autoSwatch)
        expect(result.nextUser).toEqual([
            {
                id: "user-0",
                color: "#AABBCC",
                isTransparent: true,
                isUser: true,
            },
        ])
        expect(userSwatch).toEqual({
            id: "user-0",
            color: "#445566",
            isUser: true,
        })
    })

    it("prepares auto swatch overrides for color edits", () => {
        expect(
            prepareAutoOverridesForSwatchEdit({
                swatchId: "auto-0",
                newColorUpper: "#AABBCC",
                makeTransparent: false,
                autoSwatches: [
                    {
                        id: "auto-0",
                        color: "#112233",
                        isTransparent: false,
                    },
                ],
                currentOverrides: {},
            })
        ).toEqual({
            "auto-0": { hex: "#AABBCC", isTransparent: false },
        })
    })

    it("prepares auto swatch overrides for transparent edits", () => {
        expect(
            prepareAutoOverridesForSwatchEdit({
                swatchId: "auto-0",
                newColorUpper: "#AABBCC",
                makeTransparent: true,
                autoSwatches: [
                    {
                        id: "auto-0",
                        color: "#112233",
                        isTransparent: false,
                    },
                ],
                currentOverrides: {},
            })
        ).toEqual({
            "auto-0": { isTransparent: true },
        })
    })

    it("leaves overrides untouched for user swatch edits", () => {
        expect(
            prepareAutoOverridesForSwatchEdit({
                swatchId: "user-0",
                newColorUpper: "#AABBCC",
                makeTransparent: false,
                autoSwatches: [{ id: "auto-0", color: "#112233" }],
                currentOverrides: {
                    "auto-0": { hex: "#445566", isTransparent: false },
                },
            })
        ).toEqual({
            "auto-0": { hex: "#445566", isTransparent: false },
        })
    })

    it("clears a new auto override when the edit matches the source swatch", () => {
        expect(
            prepareAutoOverridesForSwatchEdit({
                swatchId: "auto-0",
                newColorUpper: "#112233",
                makeTransparent: false,
                autoSwatches: [
                    {
                        id: "auto-0",
                        color: "#112233",
                        isTransparent: false,
                    },
                ],
                currentOverrides: {},
            })
        ).toEqual({})
    })

    it("preserves duplicate user swatches while collapsing duplicate auto swatches", () => {
        const result = collapseDuplicateSwatchesByScope({
            autoSwatches: [
                { id: "auto-0", color: "#FF0000" },
                { id: "auto-1", color: "#ff0000" },
            ],
            userSwatches: [
                { id: "user-0", color: "#FF0000", isUser: true },
                { id: "user-1", color: "#ff0000", isUser: true },
            ],
        })

        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
        ])
        expect(result.userSwatches.map((swatch) => swatch.id)).toEqual([
            "user-0",
            "user-1",
        ])
        expect(result.remap).toEqual({
            "auto-0": "auto-0",
            "auto-1": "auto-0",
            "user-0": "user-0",
            "user-1": "user-1",
        })
    })

    it("collapses visually identical generated hsl and pasted hex auto swatches", () => {
        const result = collapseDuplicateSwatchesByScope({
            autoSwatches: [
                { id: "auto-14", color: "hsl(315, 80%, 55%)" },
                { id: "auto-15", color: "#E830BA" },
            ],
            userSwatches: [],
        })

        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-14",
        ])
        expect(result.remap).toEqual({
            "auto-14": "auto-14",
            "auto-15": "auto-14",
        })
    })

    it("does not create an auto override when pasted hex matches the generated hsl source color", () => {
        expect(
            prepareAutoOverridesForSwatchEdit({
                swatchId: "auto-15",
                newColorUpper: "#E83074",
                makeTransparent: false,
                autoSwatches: [
                    {
                        id: "auto-15",
                        color: "hsl(338, 80%, 55%)",
                        isTransparent: false,
                    },
                ],
                currentOverrides: {},
            })
        ).toEqual({})
    })

    it("remaps pixels, selection, and auto overrides when duplicate auto swatches collapse", () => {
        const result = collapseDuplicateSwatchesAndRemapPixels({
            imagePixels: [
                ["auto-1", "auto-2"],
                ["user-0", null],
            ],
            overlayPixels: [["auto-1", "user-1"]],
            nextAuto: [
                { id: "auto-0", color: "#00FF00" },
                { id: "auto-1", color: "#ff0000" },
                { id: "auto-2", color: "#FF0000" },
            ],
            nextUser: [
                { id: "user-0", color: "#FF0000", isUser: true },
                { id: "user-1", color: "#ff0000", isUser: true },
            ],
            nextAutoOverrides: {
                "auto-2": { hex: "#FF0000" },
                "auto-9": { hex: "#999999" },
            },
            selectedSwatch: "auto-2",
            pruneAutoOverrides: (autoSwatches, overrides) => {
                const keep = new Set(autoSwatches.map((swatch) => swatch.id))
                return Object.fromEntries(
                    Object.entries(overrides).filter(([id]) => keep.has(id))
                )
            },
        })

        expect(result.imagePixels).toEqual([
            ["auto-1", "auto-1"],
            ["user-0", null],
        ])
        expect(result.overlayPixels).toEqual([["auto-1", "user-1"]])
        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
            "auto-1",
        ])
        expect(result.userSwatches.map((swatch) => swatch.id)).toEqual([
            "user-0",
            "user-1",
        ])
        expect(result.autoOverrides).toEqual({
            "auto-1": { hex: "#FF0000" },
        })
        expect(result.selectedSwatch).toBe("auto-1")
    })

    it("prepares swatch edit applications with updated swatches and overrides", () => {
        const result = preparePaletteSwatchEditApplication({
            swatchId: "auto-0",
            newColorUpper: "#AABBCC",
            makeTransparent: false,
            imagePixels: [["auto-0"]],
            overlayPixels: [[null]],
            autoSwatches: [{ id: "auto-0", color: "#112233" }],
            userSwatches: [{ id: "user-0", color: "#445566" }],
            selectedSwatch: "auto-0",
            autoOverrides: {},
        })

        expect(result).toEqual({
            imagePixels: [["auto-0"]],
            overlayPixels: [[null]],
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#AABBCC",
                    isTransparent: false,
                },
            ],
            userSwatches: [{ id: "user-0", color: "#445566" }],
            selectedSwatch: "auto-0",
            autoOverrides: {
                "auto-0": { hex: "#AABBCC", isTransparent: false },
            },
        })
    })

    it("selects the swatch that was edited", () => {
        const result = preparePaletteSwatchEditApplication({
            swatchId: "auto-1",
            newColorUpper: "#AABBCC",
            makeTransparent: false,
            imagePixels: [["auto-0", "auto-1"]],
            overlayPixels: [[null, null]],
            autoSwatches: [
                { id: "auto-0", color: "#112233" },
                { id: "auto-1", color: "#445566" },
            ],
            userSwatches: [],
            selectedSwatch: "auto-0",
            autoOverrides: {},
        })

        expect(result.selectedSwatch).toBe("auto-1")
    })

    it("prepares swatch edit applications with duplicate collapse remaps", () => {
        const result = preparePaletteSwatchEditApplication({
            swatchId: "auto-2",
            newColorUpper: "#FF0000",
            makeTransparent: false,
            imagePixels: [["auto-2"]],
            overlayPixels: [["auto-2"]],
            autoSwatches: [
                { id: "auto-1", color: "#FF0000" },
                { id: "auto-2", color: "#00FF00" },
            ],
            userSwatches: [{ id: "user-0", color: "#FF0000" }],
            selectedSwatch: "auto-2",
            autoOverrides: {
                "auto-2": { hex: "#00FF00", isTransparent: false },
            },
            pruneAutoOverrides: (autoSwatches, overrides) => {
                const keep = new Set(autoSwatches.map((swatch) => swatch.id))
                return Object.fromEntries(
                    Object.entries(overrides).filter(([id]) => keep.has(id))
                )
            },
        })

        expect(result.imagePixels).toEqual([["auto-1"]])
        expect(result.overlayPixels).toEqual([["auto-1"]])
        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-1",
        ])
        expect(result.userSwatches.map((swatch) => swatch.id)).toEqual([
            "user-0",
        ])
        expect(result.selectedSwatch).toBe("auto-1")
        expect(result.autoOverrides).toEqual({
            "auto-1": { hex: "#FF0000", isTransparent: false },
        })
    })

    it("prepares fixed palette world snapshot applications for presets", () => {
        const world = {
            profile: {
                kind: "fixed" as const,
                id: "sunset-custom",
            },
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#111111",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#FFFFFF",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels: [["auto-1"]],
            overlayPixels: [[null]],
            canvasPixels: [["auto-1"]],
        }

        const result = preparePaletteWorldSnapshotApplication({
            world,
            userSwatches: [],
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-1",
            activeTab: "size",
        })

        expect(result).toEqual({
            autoSwatches: world.autoSwatches,
            imagePixels: [["auto-1"]],
            overlayPixels: [[null]],
            canvasPixels: [["auto-1"]],
            selectedSwatch: "auto-1",
            activePresetButton: "sunset-custom",
            activePaletteTab: "presets",
        })
        expect(result.autoSwatches).not.toBe(world.autoSwatches)
        expect(result.imagePixels).not.toBe(world.imagePixels)
        expect(result.overlayPixels).not.toBe(world.overlayPixels)
        expect(result.canvasPixels).not.toBe(world.canvasPixels)
    })

    it("prepares extract palette world snapshot applications without changing tabs", () => {
        const result = preparePaletteWorldSnapshotApplication({
            world: {
                profile: { kind: "extract" },
                autoSwatches: [{ id: "auto-0" }],
                imagePixels: [["auto-0"]],
                overlayPixels: [[null]],
                canvasPixels: [["auto-0"]],
            },
            userSwatches: [{ id: "user-0" }],
            selectedSwatch: "auto-missing",
            activeTab: "size",
        })

        expect(result.selectedSwatch).toBe("auto-0")
        expect(result.activePresetButton).toBeNull()
        expect(result.activePaletteTab).toBe("size")
    })

    it("prepares palette world application and committed project state together", () => {
        const fixedProfile = {
            kind: "fixed" as const,
            id: "sunset-custom",
            name: "Sunset Custom",
            source: "imported" as const,
            colors: ["#111111", "#FFFFFF"],
        }
        const userSwatches = [
            {
                id: "user-0",
                color: "#222222",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: "preset-sunset-custom",
                name: "Sunset Custom",
                profile: fixedProfile,
            },
        ]
        const autoOverrides = {
            "auto-1": { hex: "#EEEEEE", isTransparent: false },
        }

        const result = preparePaletteWorldSnapshotProjectApplication({
            world: {
                profile: fixedProfile,
                autoSwatches: [
                    {
                        id: "auto-0",
                        color: "#111111",
                        isTransparent: false,
                        isUser: false,
                    },
                    {
                        id: "auto-1",
                        color: "#FFFFFF",
                        isTransparent: false,
                        isUser: false,
                    },
                ],
                imagePixels: [["auto-1"]],
                overlayPixels: [[null]],
                canvasPixels: [["auto-1"]],
            },
            userSwatches,
            selectedSwatch: "auto-0",
            preferredSwatch: "auto-1",
            activeTab: "size",
            gridSize: 1,
            paletteCount: 2,
            brushSize: 4,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot: { width: 1, height: 1, data: [0, 0, 0, 255] },
            importedPalettePresets,
            hiddenPresetIds: ["hidden-preset"],
            deletedAutoPaletteColors: ["#000000"],
            autoOverrides,
        })

        expect(result.application).toEqual({
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#111111",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "auto-1",
                    color: "#FFFFFF",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels: [["auto-1"]],
            overlayPixels: [[null]],
            canvasPixels: [["auto-1"]],
            selectedSwatch: "auto-1",
            activePresetButton: "sunset-custom",
            activePaletteTab: "presets",
        })
        expect(result.projectState.selectedSwatch).toBe("auto-1")
        expect(result.projectState.activePaletteTab).toBe("presets")
        expect(result.projectState.quantizationProfile).toEqual(fixedProfile)
        expect(result.projectState.importedPalettePresets).toEqual(
            importedPalettePresets
        )
        expect(result.projectState.hiddenPresetIds).toEqual(["hidden-preset"])
        expect(result.projectState.deletedAutoPaletteColors).toEqual([
            "#000000",
        ])
        expect(result.projectState.autoOverrides).toEqual(autoOverrides)
        expect(result.projectState.autoSwatches).toBe(
            result.application.autoSwatches
        )
        expect(result.projectState.imagePixels).toBe(
            result.application.imagePixels
        )
        expect(result.projectState.overlayPixels).toBe(
            result.application.overlayPixels
        )
        expect(result.projectState.userSwatches).not.toBe(userSwatches)
        expect(result.projectState.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.projectState.autoOverrides).not.toBe(autoOverrides)
    })

    it("prepares committed project state from a palette world", () => {
        const fixedProfile = {
            kind: "fixed" as const,
            id: "custom",
            name: "Custom",
            source: "imported" as const,
            colors: ["#111111", "#222222"],
        }
        const world = {
            profile: fixedProfile,
            autoSwatches: [
                {
                    id: "auto-0",
                    color: "#111111",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            imagePixels: [["auto-0"]],
            overlayPixels: [[null]],
        }
        const userSwatches = [
            {
                id: "user-0",
                color: "#333333",
                isTransparent: false,
                isUser: true,
            },
        ]
        const importedPalettePresets = [
            {
                id: "preset-custom",
                name: "Custom preset",
                profile: fixedProfile,
            },
        ]
        const autoOverrides = {
            "auto-0": { hex: "#AAAAAA", isTransparent: false },
        }

        const result = prepareProjectStateFromPaletteWorld({
            world,
            activePaletteTab: "presets",
            gridSize: 1,
            paletteCount: 2,
            brushSize: 3,
            showImage: true,
            hasOriginalImageData: true,
            referenceSnapshot: { width: 1, height: 1, data: [0, 0, 0, 255] },
            userSwatches,
            selectedSwatch: "missing",
            preferredSwatch: "user-0",
            importedPalettePresets,
            hiddenPresetIds: ["hidden"],
            deletedAutoPaletteColors: ["#000000"],
            autoOverrides,
        })

        expect(result.selectedSwatch).toBe("user-0")
        expect(result.activePaletteTab).toBe("presets")
        expect(result.imagePixels).toEqual([["auto-0"]])
        expect(result.overlayPixels).toEqual([[null]])
        expect(result.autoOverrides).toEqual(autoOverrides)
        expect(result.quantizationProfile).toEqual(fixedProfile)
        expect(result.importedPalettePresets).toEqual(importedPalettePresets)
        expect(result.autoSwatches).not.toBe(world.autoSwatches)
        expect(result.userSwatches).not.toBe(userSwatches)
        expect(result.imagePixels).not.toBe(world.imagePixels)
        expect(result.overlayPixels).not.toBe(world.overlayPixels)
        expect(result.quantizationProfile).not.toBe(fixedProfile)
        expect(result.importedPalettePresets?.[0]).not.toBe(
            importedPalettePresets[0]
        )
        expect(result.autoOverrides).not.toBe(autoOverrides)
    })

    it("removes only pixels owned by a deleted paint swatch", () => {
        const grid = [
            ["user-0", "user-1"],
            ["auto-0", null],
        ]

        expect(removePalettePixelValueFromGrid(grid, "user-0")).toEqual([
            [null, "user-1"],
            ["auto-0", null],
        ])
    })

    it("prepares active user swatch deletion without remapping its pixels", () => {
        const result = prepareSwatchDelete({
            swatchId: "user-0",
            imagePixels: [["auto-0", "user-0"]],
            overlayPixels: [["user-0", "user-1"]],
            autoSwatches: [{ id: "auto-0" }, { id: "auto-1" }],
            userSwatches: [{ id: "user-0" }, { id: "user-1" }],
            selectedSwatch: "user-0",
            autoOverrides: {},
        })

        expect(result.removed).toBe(true)
        expect(result.imagePixels).toEqual([["auto-0", null]])
        expect(result.overlayPixels).toEqual([[null, "user-1"]])
        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
            "auto-1",
        ])
        expect(result.userSwatches.map((swatch) => swatch.id)).toEqual([
            "user-1",
        ])
        expect(result.selectedSwatch).toBe("auto-0")
    })

    it("prepares auto swatch deletion and prunes its override", () => {
        const result = prepareSwatchDelete({
            swatchId: "auto-1",
            imagePixels: [["auto-1", "auto-0"]],
            overlayPixels: [["auto-1", null]],
            autoSwatches: [{ id: "auto-0" }, { id: "auto-1" }],
            userSwatches: [{ id: "user-0" }],
            selectedSwatch: "auto-1",
            autoOverrides: {
                "auto-0": { hex: "#000000" },
                "auto-1": { hex: "#FFFFFF" },
            },
            pruneAutoOverrides: (autoSwatches, overrides) => {
                const keep = new Set(autoSwatches.map((swatch) => swatch.id))
                return Object.fromEntries(
                    Object.entries(overrides).filter(([id]) => keep.has(id))
                )
            },
        })

        expect(result.removed).toBe(true)
        expect(result.imagePixels).toEqual([[null, "auto-0"]])
        expect(result.overlayPixels).toEqual([[null, null]])
        expect(result.autoSwatches.map((swatch) => swatch.id)).toEqual([
            "auto-0",
        ])
        expect(result.selectedSwatch).toBe("auto-0")
        expect(result.autoOverrides).toEqual({
            "auto-0": { hex: "#000000" },
        })
    })

    it("keeps delete preparation unchanged when swatch id is absent", () => {
        const imagePixels = [["auto-0"]]
        const overlayPixels = [["user-0"]]
        const autoOverrides = { "auto-0": { hex: "#000000" } }

        const result = prepareSwatchDelete({
            swatchId: "missing",
            imagePixels,
            overlayPixels,
            autoSwatches: [{ id: "auto-0" }],
            userSwatches: [{ id: "user-0" }],
            selectedSwatch: "user-0",
            autoOverrides,
        })

        expect(result.removed).toBe(false)
        expect(result.imagePixels).toBe(imagePixels)
        expect(result.overlayPixels).toBe(overlayPixels)
        expect(result.selectedSwatch).toBe("user-0")
        expect(result.autoOverrides).toBe(autoOverrides)
    })
})
