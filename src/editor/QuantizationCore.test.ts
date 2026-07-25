import { describe, expect, it } from "vitest"

import {
    DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT,
    DEFAULT_METHOD_PROFILE,
    FIXED_PALETTE_MAPPING_METHOD_ID,
    OKLAB_COLOR_SPACE_ID,
    PIXTUDIO_METHOD_ID,
    doesPaletteContextAllowMethodPreview,
    getCompatibilityBridgeProfileForPaletteContext,
    getEnabledColorSpaceIdsForMethod,
    getEnabledMethodIdsForColorSpace,
    getDefaultMethodProfileForPaletteContext,
    getPaletteContextDefinition,
    getQuantizationCompatibilityPairs,
    getRegisteredPaletteContexts,
    getRegisteredColorSpaces,
    getRegisteredQuantizationMethods,
    isMethodColorSpaceCompatible,
    isQuantizationCompatibilityGraphConnectedFromBridge,
    resolveMethodProfile,
    resolveMethodProfilesByPaletteContext,
    runDefaultPaletteQuantization,
    runFixedPaletteQuantization,
    runQuantization,
    validateQuantizationCoreRegistries,
} from "./QuantizationCore.ts"
import {
    EXTRACT_QUANTIZATION_PROFILE,
    buildDerivedWorld,
    quantizeWithFixedPalette,
} from "./paletteQuantizationEngine.ts"

const SAMPLE_SOURCE_PIXELS = [
    ["#000000", "#101010", "#F0F0F0"],
    ["#FF0000", "#EE1100", "#0000FF"],
]

const SAMPLE_OVERLAY_PIXELS = [
    [null, null, null],
    [null, null, null],
]

const SAMPLE_FIXED_PALETTE_PROFILE = {
    kind: "fixed" as const,
    id: "black-white-2",
    name: "B/W",
    source: "builtin" as const,
    colors: ["#000000", "#FFFFFF"],
}

describe("QuantizationCore", () => {
    it("registers auto and fixed palette context strategies", () => {
        expect(getRegisteredPaletteContexts()).toEqual([
            {
                kind: "auto",
                label: "Auto Palette",
                allowsMethodPreview: true,
                defaultMethodProfile: DEFAULT_METHOD_PROFILE,
            },
            {
                kind: "fixed",
                label: "Palette Presets",
                allowsMethodPreview: true,
                defaultMethodProfile: {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
            },
        ])
        expect(getPaletteContextDefinition("auto")).toEqual({
            kind: "auto",
            label: "Auto Palette",
            allowsMethodPreview: true,
            defaultMethodProfile: DEFAULT_METHOD_PROFILE,
        })
        expect(getPaletteContextDefinition("fixed")).toEqual({
            kind: "fixed",
            label: "Palette Presets",
            allowsMethodPreview: true,
            defaultMethodProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })
        expect(doesPaletteContextAllowMethodPreview("auto")).toBe(true)
        expect(doesPaletteContextAllowMethodPreview("fixed")).toBe(true)
        expect(getRegisteredQuantizationMethods()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "default",
                    label: "Default",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: ["default"],
                    defaultColorSpace: "default",
                }),
                expect.objectContaining({
                    id: "k-means",
                    label: "K-Means",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: expect.arrayContaining([
                        "default",
                        "oklab",
                        "hsl",
                    ]),
                    defaultColorSpace: "oklab",
                }),
                expect.objectContaining({
                    id: PIXTUDIO_METHOD_ID,
                    label: "PIXTUDIO",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: expect.arrayContaining([
                        "oklab",
                        "hsl",
                    ]),
                    defaultColorSpace: "oklab",
                }),
                expect.objectContaining({
                    id: "k-medoids",
                    label: "K-Medoids",
                }),
                expect.objectContaining({
                    id: "octree",
                    label: "Octree",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: ["default"],
                    defaultColorSpace: "default",
                }),
                expect.objectContaining({
                    id: "median-cut",
                    label: "Median Cut",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: ["default"],
                    defaultColorSpace: "default",
                }),
                expect.objectContaining({
                    id: "fuzzy-c-means",
                    label: "Fuzzy C-Means",
                }),
                expect.objectContaining({
                    id: "wu-color-quantizer",
                    label: "Wu's Color Quantizer",
                    supportedPaletteContexts: ["auto"],
                    supportedColorSpaces: ["default"],
                    defaultColorSpace: "default",
                }),
                expect.objectContaining({
                    id: "fixed-palette-mapping",
                    label: "Fixed Palette Mapping",
                    supportedPaletteContexts: ["fixed"],
                    supportedColorSpaces: expect.arrayContaining([
                        "oklab",
                        "hsl",
                    ]),
                    defaultColorSpace: "oklab",
                }),
            ])
        )
        expect(getRegisteredColorSpaces()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "default",
                    label: "Default",
                    supportedPaletteContexts: ["auto"],
                    supportedMethods: expect.arrayContaining([
                        "default",
                        "k-means",
                        "octree",
                        "median-cut",
                        "wu-color-quantizer",
                    ]),
                    defaultMethod: "default",
                }),
                expect.objectContaining({
                    id: "oklab",
                    label: "OKLAB",
                    supportedPaletteContexts: ["auto", "fixed"],
                    supportedMethods: expect.arrayContaining([
                        "k-means",
                        PIXTUDIO_METHOD_ID,
                        "fixed-palette-mapping",
                    ]),
                    defaultMethod: "fixed-palette-mapping",
                }),
                expect.objectContaining({
                    id: "cielab",
                    label: "CIELAB (Lab)",
                }),
                expect.objectContaining({
                    id: "din99",
                    label: "DIN99",
                }),
                expect.objectContaining({
                    id: "cam16-ucs",
                    label: "CAM16-UCS",
                }),
                expect.objectContaining({
                    id: "ycbcr",
                    label: "YCbCr",
                }),
                expect.objectContaining({
                    id: "yuv",
                    label: "YUV",
                }),
                expect.objectContaining({
                    id: "yiq",
                    label: "YIQ",
                }),
                expect.objectContaining({
                    id: "hsv",
                    label: "HSV",
                }),
                expect.objectContaining({
                    id: "hsl",
                    label: "HSL",
                }),
                expect.objectContaining({
                    id: "hsi",
                    label: "HSI",
                }),
            ])
        )
        expect(validateQuantizationCoreRegistries()).toEqual([])
    })

    it("keeps palette context defaults separate", () => {
        expect(DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT.auto).toEqual(
            DEFAULT_METHOD_PROFILE
        )
        expect(DEFAULT_METHOD_PROFILES_BY_PALETTE_CONTEXT.fixed).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(getDefaultMethodProfileForPaletteContext("auto")).toEqual(
            DEFAULT_METHOD_PROFILE
        )
        expect(getDefaultMethodProfileForPaletteContext("fixed")).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(getCompatibilityBridgeProfileForPaletteContext("auto")).toEqual(
            DEFAULT_METHOD_PROFILE
        )
        expect(getCompatibilityBridgeProfileForPaletteContext("fixed")).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
    })

    it("treats each context default as the MVP compatibility bridge", () => {
        expect(
            isQuantizationCompatibilityGraphConnectedFromBridge("auto")
        ).toBe(true)
        expect(
            isQuantizationCompatibilityGraphConnectedFromBridge("fixed")
        ).toBe(true)
        expect(
            isQuantizationCompatibilityGraphConnectedFromBridge("auto", [
                {
                    methodId: "default",
                    colorSpaceId: "default",
                    paletteContextKind: "auto",
                },
                {
                    methodId: "island-method",
                    colorSpaceId: "island-space",
                    paletteContextKind: "auto",
                },
            ])
        ).toBe(false)
        expect(
            isQuantizationCompatibilityGraphConnectedFromBridge(
                "auto",
                [
                    {
                        methodId: "other",
                        colorSpaceId: "default",
                        paletteContextKind: "auto",
                    },
                ],
                DEFAULT_METHOD_PROFILE
            )
        ).toBe(false)
    })

    it("keeps the legacy default method profile as auto/default", () => {
        expect(getRegisteredQuantizationMethods()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "default",
                    label: "Default",
                    supportedColorSpaces: expect.arrayContaining(["default"]),
                    defaultColorSpace: "default",
                }),
            ])
        )
        expect(getRegisteredColorSpaces()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "default",
                    label: "Default",
                    supportedMethods: expect.arrayContaining([
                        "default",
                        "k-means",
                    ]),
                    defaultMethod: "default",
                }),
            ])
        )
        expect(DEFAULT_METHOD_PROFILE).toEqual({
            methodId: "default",
            colorSpaceId: "default",
        })
    })

    it("exposes compatibility data for disabled-button UI logic", () => {
        expect(isMethodColorSpaceCompatible("default", "default")).toBe(true)
        expect(isMethodColorSpaceCompatible("default", "default", "auto")).toBe(
            true
        )
        expect(
            isMethodColorSpaceCompatible("default", "default", "fixed")
        ).toBe(false)
        expect(isMethodColorSpaceCompatible("default", "oklab")).toBe(false)
        expect(
            isMethodColorSpaceCompatible(PIXTUDIO_METHOD_ID, "default", "auto")
        ).toBe(false)
        expect(
            isMethodColorSpaceCompatible(PIXTUDIO_METHOD_ID, "oklab", "auto")
        ).toBe(true)
        expect(
            isMethodColorSpaceCompatible(PIXTUDIO_METHOD_ID, "hsl", "auto")
        ).toBe(true)
        expect(
            isMethodColorSpaceCompatible(PIXTUDIO_METHOD_ID, "oklab", "fixed")
        ).toBe(false)
        expect(
            isMethodColorSpaceCompatible(
                "fixed-palette-mapping",
                "oklab",
                "fixed"
            )
        ).toBe(true)
        expect(
            isMethodColorSpaceCompatible(
                "fixed-palette-mapping",
                "oklab",
                "auto"
            )
        ).toBe(false)
        expect(isMethodColorSpaceCompatible("k-means", "default")).toBe(true)
        expect(
            isMethodColorSpaceCompatible("k-means", "oklab", "auto")
        ).toBe(true)
        expect(
            isMethodColorSpaceCompatible("k-means", "oklab", "fixed")
        ).toBe(false)
        expect(
            isMethodColorSpaceCompatible("octree", "oklab", "auto")
        ).toBe(false)
        expect(
            isMethodColorSpaceCompatible("median-cut", "hsl", "auto")
        ).toBe(false)
        expect(
            isMethodColorSpaceCompatible(
                "wu-color-quantizer",
                "cielab",
                "auto"
            )
        ).toBe(false)
        expect(getQuantizationCompatibilityPairs()).toEqual(
            expect.arrayContaining([
                {
                    methodId: "default",
                    colorSpaceId: "default",
                    paletteContextKind: "auto",
                },
                {
                    methodId: PIXTUDIO_METHOD_ID,
                    colorSpaceId: "hsl",
                    paletteContextKind: "auto",
                },
                {
                    methodId: "k-means",
                    colorSpaceId: "hsl",
                    paletteContextKind: "auto",
                },
                {
                    methodId: "fixed-palette-mapping",
                    colorSpaceId: "oklab",
                    paletteContextKind: "fixed",
                },
            ])
        )
        expect(getQuantizationCompatibilityPairs("auto")).toEqual(
            expect.arrayContaining([
                {
                    methodId: "default",
                    colorSpaceId: "default",
                    paletteContextKind: "auto",
                },
                {
                    methodId: "k-means",
                    colorSpaceId: "hsl",
                    paletteContextKind: "auto",
                },
            ])
        )
        expect(getQuantizationCompatibilityPairs("auto")).not.toEqual(
            expect.arrayContaining([
                {
                    methodId: "octree",
                    colorSpaceId: "hsl",
                    paletteContextKind: "auto",
                },
            ])
        )
        expect(getQuantizationCompatibilityPairs("fixed")).toEqual(
            expect.arrayContaining([
                {
                    methodId: "fixed-palette-mapping",
                    colorSpaceId: "oklab",
                    paletteContextKind: "fixed",
                },
                {
                    methodId: "fixed-palette-mapping",
                    colorSpaceId: "hsl",
                    paletteContextKind: "fixed",
                },
            ])
        )
        expect(getEnabledColorSpaceIdsForMethod("default")).toEqual(["default"])
        expect(getEnabledColorSpaceIdsForMethod(PIXTUDIO_METHOD_ID)).toEqual(
            expect.arrayContaining(["oklab", "hsl"])
        )
        expect(getEnabledColorSpaceIdsForMethod(PIXTUDIO_METHOD_ID)).not.toEqual(
            expect.arrayContaining(["default"])
        )
        expect(getEnabledColorSpaceIdsForMethod("octree", "auto")).toEqual([
            "default",
        ])
        expect(getEnabledColorSpaceIdsForMethod("default", "fixed")).toEqual([])
        expect(
            getEnabledColorSpaceIdsForMethod("fixed-palette-mapping", "fixed")
        ).toEqual(expect.arrayContaining(["oklab", "hsl"]))
        expect(getEnabledMethodIdsForColorSpace("default")).toEqual(
            expect.arrayContaining([
                "default",
                "k-means",
                "octree",
                "median-cut",
                "wu-color-quantizer",
            ])
        )
        expect(getEnabledMethodIdsForColorSpace("oklab", "fixed")).toEqual([
            "fixed-palette-mapping",
        ])
        expect(getEnabledMethodIdsForColorSpace("oklab", "auto")).toEqual(
            expect.arrayContaining([
                PIXTUDIO_METHOD_ID,
                "k-means",
                "k-medoids",
                "fuzzy-c-means",
            ])
        )
        expect(getEnabledMethodIdsForColorSpace("oklab", "auto")).not.toEqual(
            expect.arrayContaining(["default", "octree"])
        )
    })

    it("resolves missing, unknown, and incompatible method profiles fail-soft", () => {
        expect(resolveMethodProfile()).toEqual(DEFAULT_METHOD_PROFILE)
        expect(resolveMethodProfile(null)).toEqual(DEFAULT_METHOD_PROFILE)
        expect(resolveMethodProfile({ methodId: "unknown" })).toEqual(
            DEFAULT_METHOD_PROFILE
        )
        expect(
            resolveMethodProfile({
                methodId: "default",
                colorSpaceId: "not-registered",
            })
        ).toEqual(DEFAULT_METHOD_PROFILE)
        expect(resolveMethodProfile(null, "fixed")).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(
            resolveMethodProfile(
                {
                    methodId: "default",
                    colorSpaceId: "default",
                },
                "fixed"
            )
        ).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
    })

    it("canonicalizes method profiles by palette context", () => {
        expect(resolveMethodProfilesByPaletteContext()).toEqual({
            auto: DEFAULT_METHOD_PROFILE,
            fixed: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })
        expect(
            resolveMethodProfilesByPaletteContext({
                auto: {
                    methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                    colorSpaceId: OKLAB_COLOR_SPACE_ID,
                },
                fixed: {
                    methodId: "unknown",
                    colorSpaceId: "unknown",
                },
            })
        ).toEqual({
            auto: DEFAULT_METHOD_PROFILE,
            fixed: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })
    })

    it("runs the registered default pipeline through the existing derived-world math", () => {
        const sourcePixels = [
            ["rgb(0, 0, 0)", "rgb(255, 255, 255)"],
            ["rgb(255, 0, 0)", null],
        ]
        const overlayPixels = [
            ["auto-0", null],
            [null, "user-0"],
        ]
        const previousSwatches = [
            {
                id: "auto-0",
                color: "rgb(0, 0, 0)",
                isTransparent: false,
                isUser: false,
            },
        ]
        const userSwatches = [
            {
                id: "user-0",
                color: "#123456",
                isTransparent: false,
                isUser: true,
            },
        ]

        const result = runQuantization({
            sourcePixels,
            overlayPixels,
            previousSwatches,
            userSwatches,
            paletteCount: 2,
            requestId: 7,
        })
        const expected = buildDerivedWorld({
            profile: EXTRACT_QUANTIZATION_PROFILE,
            sourcePixels,
            overlayPixels,
            previousSwatches,
            userSwatches,
            paletteCountTarget: 2,
        })

        expect(result.methodProfile).toEqual(DEFAULT_METHOD_PROFILE)
        expect(result.requestId).toBe(7)
        expect(result.autoSwatches).toEqual(expected.autoSwatches)
        expect(result.imagePixels).toEqual(expected.imagePixels)
        expect(result.overlayPixels).toEqual(expected.overlayPixels)
        expect(result.canvasPixels).toEqual(expected.canvasPixels)
    })

    it("runs registered auto method and color-space strategies", () => {
        const result = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            methodProfile: {
                methodId: "k-means",
                colorSpaceId: "oklab",
            },
        })

        expect(result.methodProfile).toEqual({
            methodId: "k-means",
            colorSpaceId: "oklab",
        })
        expect(result.autoSwatches.length).toBeLessThanOrEqual(3)
        expect(result.imagePixels.flat().filter(Boolean)).toEqual(
            expect.arrayContaining(["auto-0"])
        )
    })

    it("runs the registered PIXTUDIO method with real color spaces", () => {
        const result = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            methodProfile: {
                methodId: PIXTUDIO_METHOD_ID,
                colorSpaceId: "hsl",
            },
        })

        expect(result.methodProfile).toEqual({
            methodId: PIXTUDIO_METHOD_ID,
            colorSpaceId: "hsl",
        })
        expect(result.autoSwatches.length).toBeLessThanOrEqual(3)
        expect(result.imagePixels.flat().filter(Boolean)).toEqual(
            expect.arrayContaining(["auto-0"])
        )
    })

    it("runs every compatible registered METHOD pair through runQuantization", () => {
        for (const pair of getQuantizationCompatibilityPairs()) {
            const result = runQuantization({
                sourcePixels: SAMPLE_SOURCE_PIXELS,
                overlayPixels: SAMPLE_OVERLAY_PIXELS,
                paletteCount: 3,
                paletteContext: pair.paletteContextKind,
                fixedPaletteProfile:
                    pair.paletteContextKind === "fixed"
                        ? SAMPLE_FIXED_PALETTE_PROFILE
                        : undefined,
                methodProfile: {
                    methodId: pair.methodId,
                    colorSpaceId: pair.colorSpaceId,
                },
            })

            expect(result.methodProfile).toEqual({
                methodId: pair.methodId,
                colorSpaceId: pair.colorSpaceId,
            })
            expect(result.imagePixels).toHaveLength(SAMPLE_SOURCE_PIXELS.length)
            expect(result.autoSwatches.length).toBeLessThanOrEqual(3)
        }
    })

    it("keeps deterministic METHOD runs stable across A to B to A previews", () => {
        const first = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            methodProfile: {
                methodId: PIXTUDIO_METHOD_ID,
                colorSpaceId: "oklab",
            },
        })
        runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            methodProfile: {
                methodId: "k-means",
                colorSpaceId: "hsl",
            },
        })
        const second = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            methodProfile: {
                methodId: PIXTUDIO_METHOD_ID,
                colorSpaceId: "oklab",
            },
        })

        expect(second.autoSwatches).toEqual(first.autoSwatches)
        expect(second.imagePixels).toEqual(first.imagePixels)
        expect(second.canvasPixels).toEqual(first.canvasPixels)
    })

    it("generates palettes in auto context and maps into fixed palettes in fixed context", () => {
        const autoResult = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            paletteContext: "auto",
            methodProfile: {
                methodId: PIXTUDIO_METHOD_ID,
                colorSpaceId: "oklab",
            },
        })
        const fixedResult = runQuantization({
            sourcePixels: SAMPLE_SOURCE_PIXELS,
            overlayPixels: SAMPLE_OVERLAY_PIXELS,
            paletteCount: 3,
            paletteContext: "fixed",
            fixedPaletteProfile: SAMPLE_FIXED_PALETTE_PROFILE,
            methodProfile: {
                methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
                colorSpaceId: OKLAB_COLOR_SPACE_ID,
            },
        })

        expect(autoResult.autoSwatches.length).toBeGreaterThan(0)
        expect(autoResult.autoSwatches.length).toBeLessThanOrEqual(3)
        expect(autoResult.autoSwatches.map((swatch) => swatch.color)).not.toEqual(
            SAMPLE_FIXED_PALETTE_PROFILE.colors
        )
        expect(fixedResult.autoSwatches.map((swatch) => swatch.color)).toEqual(
            SAMPLE_FIXED_PALETTE_PROFILE.colors
        )
    })

    it("routes raw default palette quantization through QuantizationCore", () => {
        const source = [
            ["rgb(0, 0, 0)", "rgb(255, 255, 255)"],
            ["rgb(255, 0, 0)", null],
        ]
        const result = runDefaultPaletteQuantization({
            pixels: source,
            targetColors: 2,
        })

        expect(result.palette).toHaveLength(2)
        expect(result.pixels).toHaveLength(2)
        expect(new Set(result.pixels.flat().filter(Boolean))).toEqual(
            new Set(result.palette)
        )
    })

    it("routes raw fixed palette quantization through QuantizationCore", () => {
        const source = [
            ["rgb(2, 2, 2)", "rgb(250, 250, 250)"],
            ["rgb(100, 100, 100)", null],
        ]
        const profile = {
            kind: "fixed" as const,
            id: "black-white-2",
            name: "B/W",
            source: "builtin" as const,
            colors: ["#000000", "#FFFFFF"],
        }
        const result = runFixedPaletteQuantization({
            pixels: source,
            profile,
        })
        const expectedPixels = quantizeWithFixedPalette(source, profile.colors)

        expect(result.palette).toEqual(["#000000", "#FFFFFF"])
        expect(result.displayPalette).toEqual(["#000000", "#FFFFFF"])
        expect(result.pixels).toEqual(expectedPixels)
    })

    it("runs fixed palette mapping when the fixed palette context provides a profile", () => {
        const sourcePixels = [
            ["rgb(2, 2, 2)", "rgb(250, 250, 250)"],
            ["rgb(100, 100, 100)", null],
        ]
        const overlayPixels = [
            [null, null],
            [null, null],
        ]
        const fixedPaletteProfile = {
            kind: "fixed" as const,
            id: "black-white-2",
            name: "B/W",
            source: "builtin" as const,
            colors: ["#000000", "#FFFFFF"],
        }

        const result = runQuantization({
            sourcePixels,
            overlayPixels,
            paletteCount: 2,
            paletteContext: "fixed",
            fixedPaletteProfile,
        })

        expect(result.methodProfile).toEqual({
            methodId: FIXED_PALETTE_MAPPING_METHOD_ID,
            colorSpaceId: OKLAB_COLOR_SPACE_ID,
        })
        expect(result.autoSwatches.map((swatch) => swatch.color)).toEqual([
            "#000000",
            "#FFFFFF",
        ])
        expect(result.imagePixels).toEqual([
            ["auto-0", "auto-1"],
            ["auto-1", null],
        ])
    })

    it("runs fixed palette mapping with registered non-default color spaces", () => {
        const fixedPaletteProfile = {
            kind: "fixed" as const,
            id: "black-white-2",
            name: "B/W",
            source: "builtin" as const,
            colors: ["#000000", "#FFFFFF"],
        }

        const result = runQuantization({
            sourcePixels: [["#101010", "#F0F0F0"]],
            overlayPixels: [[null, null]],
            paletteCount: 2,
            paletteContext: "fixed",
            fixedPaletteProfile,
            methodProfile: {
                methodId: "fixed-palette-mapping",
                colorSpaceId: "hsl",
            },
        })

        expect(result.methodProfile).toEqual({
            methodId: "fixed-palette-mapping",
            colorSpaceId: "hsl",
        })
        expect(result.autoSwatches.map((swatch) => swatch.color)).toEqual([
            "#000000",
            "#FFFFFF",
        ])
        expect(result.imagePixels).toEqual([["auto-0", "auto-1"]])
    })

    it("keeps deleted auto-palette colors out of the default run", () => {
        const result = runQuantization({
            sourcePixels: [
                ["#111111", "#222222", "#333333"],
                ["#444444", "#555555", "#666666"],
            ],
            overlayPixels: [
                [null, null, null],
                [null, null, null],
            ],
            paletteCount: 5,
            excludedColors: ["#333333"],
        })

        expect(
            result.autoSwatches.map((swatch) => swatch.color.toUpperCase())
        ).not.toContain("#333333")
    })
})
