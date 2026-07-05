import { describe, expect, it } from "vitest"

import {
    classifySwatchColor,
    sortSwatchesForUI,
    type PaletteSortableSwatch,
} from "./paletteSwatchSorting.ts"

describe("palette swatch sorting", () => {
    it("sorts swatches by color group and keeps stable ids inside equal keys", () => {
        const swatches: PaletteSortableSwatch[] = [
            { id: "blue-b", color: "#0000FF" },
            { id: "gray", color: "#808080" },
            { id: "green", color: "#00FF00" },
            { id: "red", color: "#FF0000" },
            { id: "blue-a", color: "#0000FF" },
        ]

        expect(sortSwatchesForUI(swatches).map((swatch) => swatch.id)).toEqual([
            "red",
            "green",
            "blue-a",
            "blue-b",
            "gray",
        ])
    })

    it("does not mutate the source array", () => {
        const swatches: PaletteSortableSwatch[] = [
            { id: "blue", color: "#0000FF" },
            { id: "red", color: "#FF0000" },
        ]

        const sorted = sortSwatchesForUI(swatches)

        expect(sorted).not.toBe(swatches)
        expect(swatches.map((swatch) => swatch.id)).toEqual(["blue", "red"])
        expect(sorted.map((swatch) => swatch.id)).toEqual(["red", "blue"])
    })

    it("places transparent swatches after visible gray swatches", () => {
        const swatches: PaletteSortableSwatch[] = [
            { id: "transparent", color: "#FFFFFF", isTransparent: true },
            { id: "white", color: "#FFFFFF" },
            { id: "black", color: "#000000" },
        ]

        expect(sortSwatchesForUI(swatches).map((swatch) => swatch.id)).toEqual([
            "black",
            "white",
            "transparent",
        ])
    })

    it("classifies supported css color formats consistently", () => {
        expect(classifySwatchColor({ id: "short", color: "#0F0" }).group).toBe(
            "green"
        )
        expect(
            classifySwatchColor({ id: "rgb", color: "rgb(0, 0, 255)" }).group
        ).toBe("blue")
        expect(
            classifySwatchColor({ id: "hsl", color: "hsl(0, 100%, 50%)" })
                .group
        ).toBe("red")
    })
})
