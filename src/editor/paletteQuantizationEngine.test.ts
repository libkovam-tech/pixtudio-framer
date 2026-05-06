import { describe, expect, it } from "vitest"

import {
    BLACK_WHITE_2,
    EXTRACT_QUANTIZATION_PROFILE,
    GRAYSCALE_32,
    NEON_COLD_32,
    QUANTIZATION_PROFILES,
    buildDerivedWorld,
    extractPalette,
    quantizeWithFixedProfile,
    quantizeWithFixedPalette,
    remapOverlay,
} from "./paletteQuantizationEngine.ts"
import { extractPaletteOklabTournament } from "./quantizationMethods/autoPaletteOklabTournament.ts"
import { quantizeFixedPaletteOklab } from "./quantizationMethods/fixedPaletteOklab.ts"

describe("palette quantization engine", () => {
    it("extracts a palette with the legacy k-means shape", () => {
        const source = [
            ["rgb(0, 0, 0)", "rgb(255, 255, 255)"],
            ["rgb(0, 0, 0)", "rgb(255, 0, 0)"],
        ]

        const result = extractPalette(source, 2)

        expect(result.palette).toHaveLength(2)
        expect(result.pixels).toHaveLength(2)
        expect(new Set(result.pixels.flat().filter(Boolean))).toEqual(
            new Set(result.palette)
        )
    })

    it("uses OKLAB extraction for the auto-palette world", () => {
        const source = [
            ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 255)"],
            ["rgb(255, 0, 0)", "rgb(30, 80, 160)", "rgb(230, 210, 180)"],
        ]

        expect(extractPalette(source, 3)).toEqual(
            extractPaletteOklabTournament(source, 3)
        )
    })

    it("maps source pixels to the nearest fixed palette color", () => {
        const result = quantizeWithFixedPalette(
            [["rgb(250, 10, 10)", "rgb(8, 12, 250)", null]],
            ["#FF0000", "#0000FF"]
        )

        expect(result).toEqual([["rgb(255, 0, 0)", "rgb(0, 0, 255)", null]])
    })

    it("uses OKLAB mapping for fixed palette worlds", () => {
        const source = [["rgb(0, 5, 0)"]]
        const palette = ["#FF0000", "#00FF00"]

        expect(quantizeWithFixedPalette(source, palette)).toEqual(
            quantizeFixedPaletteOklab(source, palette)
        )
        expect(quantizeWithFixedPalette(source, palette)).toEqual([
            ["rgb(255, 0, 0)"],
        ])
    })

    it("remaps auto swatches but preserves user swatch ids", () => {
        const overlay = [["auto-0", "user-1", null]]
        const result = remapOverlay({
            overlayPixels: overlay,
            swatches: [
                {
                    id: "auto-0",
                    color: "rgb(250, 0, 0)",
                    isTransparent: false,
                    isUser: false,
                },
                {
                    id: "user-1",
                    color: "#12AB34",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            targetAutoSwatches: [
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
        })

        expect(result).toEqual([["auto-1", "user-1", null]])
    })

    it("builds an extract derived world without mutating inputs", () => {
        const source = [["rgb(0, 0, 0)", "rgb(255, 255, 255)"]]
        const overlay = [["auto-0", null]]
        const swatches = [
            {
                id: "auto-0",
                color: "rgb(0, 0, 0)",
                isTransparent: false,
                isUser: false,
            },
        ]

        const world = buildDerivedWorld({
            profile: EXTRACT_QUANTIZATION_PROFILE,
            sourcePixels: source,
            overlayPixels: overlay,
            previousSwatches: swatches,
            userSwatches: [],
            paletteCountTarget: 2,
        })

        expect(world.profile.kind).toBe("extract")
        expect(world.autoSwatches).toHaveLength(2)
        expect(world.canvasPixels[0][0]).toBe("auto-0")
        expect(source).toEqual([["rgb(0, 0, 0)", "rgb(255, 255, 255)"]])
        expect(overlay).toEqual([["auto-0", null]])
    })

    it("builds a fixed derived world from hex profile colors", () => {
        const world = buildDerivedWorld({
            profile: {
                kind: "fixed",
                id: "test",
                name: "Test",
                source: "builtin",
                colors: ["#FF0000", "#0000FF"],
            },
            sourcePixels: [["rgb(250, 0, 0)", "rgb(0, 0, 250)"]],
            overlayPixels: [[null, null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 2,
        })

        expect(world.autoSwatches.map((swatch) => swatch.color)).toEqual([
            "#FF0000",
            "#0000FF",
        ])
        expect(world.imagePixels).toEqual([["auto-0", "auto-1"]])
    })

    it("builds preset derived worlds through the OKLAB fixed mapper", () => {
        const world = buildDerivedWorld({
            profile: {
                kind: "fixed",
                id: "test-oklab",
                name: "Test OKLAB",
                source: "builtin",
                colors: ["#FF0000", "#00FF00"],
            },
            sourcePixels: [["rgb(0, 5, 0)"]],
            overlayPixels: [[null]],
            previousSwatches: [],
            userSwatches: [],
            paletteCountTarget: 2,
        })

        expect(world.imagePixels).toEqual([["auto-0"]])
        expect(world.autoSwatches[0].color).toBe("#FF0000")
    })

    it("registers NEON_COLD_32 as a built-in fixed profile", () => {
        expect(QUANTIZATION_PROFILES.neon.kind).toBe("fixed")
        expect(QUANTIZATION_PROFILES.neon.source).toBe("builtin")
        expect(QUANTIZATION_PROFILES.neon.colors).toEqual(NEON_COLD_32)
        expect(QUANTIZATION_PROFILES.neon.colors).toContain("#F6CAFD")
        expect(QUANTIZATION_PROFILES.neon.colors).not.toContain("#FFF34D")
    })

    it("registers grayscale and black/white as built-in fixed profiles", () => {
        expect(QUANTIZATION_PROFILES.grayscale.kind).toBe("fixed")
        expect(QUANTIZATION_PROFILES.grayscale.colors).toEqual(GRAYSCALE_32)
        expect(QUANTIZATION_PROFILES.bw.kind).toBe("fixed")
        expect(QUANTIZATION_PROFILES.bw.colors).toEqual(BLACK_WHITE_2)
    })

    it("uses the old Crop luminance rules for grayscale and B/W profiles", () => {
        const gray = quantizeWithFixedProfile(
            [["rgb(255, 0, 0)", "rgb(0, 255, 0)"]],
            QUANTIZATION_PROFILES.grayscale
        )
        const bw = quantizeWithFixedProfile(
            [["rgb(255, 0, 0)", "rgb(0, 255, 0)"]],
            QUANTIZATION_PROFILES.bw
        )

        expect(gray[0][0]).not.toBe(gray[0][1])
        expect(bw).toEqual([["#000000", "#FFFFFF"]])
    })

    it("builds a neon fixed world and preserves user swatches in overlay", () => {
        const world = buildDerivedWorld({
            profile: QUANTIZATION_PROFILES.neon,
            sourcePixels: [["rgb(255, 240, 60)", "rgb(12, 10, 28)"]],
            overlayPixels: [["auto-0", "user-1"]],
            previousSwatches: [
                {
                    id: "auto-0",
                    color: "rgb(250, 240, 50)",
                    isTransparent: false,
                    isUser: false,
                },
            ],
            userSwatches: [
                {
                    id: "user-1",
                    color: "#123456",
                    isTransparent: false,
                    isUser: true,
                },
            ],
            paletteCountTarget: 2,
        })

        expect(world.autoSwatches).toHaveLength(NEON_COLD_32.length)
        expect(world.autoSwatches.map((swatch) => swatch.color)).toEqual(
            QUANTIZATION_PROFILES.neon.colors
        )
        expect(world.overlayPixels[0][0]).toMatch(/^auto-/)
        expect(world.overlayPixels[0][1]).toBe("user-1")
    })
})
