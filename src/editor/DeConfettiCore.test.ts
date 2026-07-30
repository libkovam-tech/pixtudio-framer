import { describe, expect, it } from "vitest"

import {
    DE_CONFETTI_MAX_ITERATIONS,
    DE_CONFETTI_NEIGHBOR_OFFSETS,
    applyDeConfetti,
} from "./DeConfettiCore.ts"

describe("DeConfettiCore", () => {
    it("replaces an isolated single cell with the dominant neighboring index", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels: [
                ["a", "a", "a"],
                ["a", "b", "a"],
                ["a", "a", "a"],
            ],
        })

        expect(result.pixels).toEqual([
            ["a", "a", "a"],
            ["a", "a", "a"],
            ["a", "a", "a"],
        ])
        expect(result.changed).toBe(true)
        expect(result.iterations).toBe(1)
    })

    it("keeps a cell with at least one same-index neighbor unchanged", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels: [
                ["a", "a", "a"],
                ["a", "b", "b"],
                ["a", "a", "a"],
            ],
        })

        expect(result.pixels[1][1]).toBe("b")
        expect(result.pixels[1][2]).toBe("b")
    })

    it("preserves checkerboard dithering through 8-connectivity", () => {
        const pixels = [
            ["a", "b", "a"],
            ["b", "a", "b"],
            ["a", "b", "a"],
        ]
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels,
        })

        expect(result.pixels).toEqual(pixels)
        expect(DE_CONFETTI_NEIGHBOR_OFFSETS).toHaveLength(8)
    })

    it("preserves transparent cells and excludes them from candidates", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            swatches: [{ index: "transparent", isTransparent: true }],
            pixels: [
                ["transparent", null, "a", "a"],
                [null, "b", "a", "a"],
                ["a", null, "transparent", null],
                ["a", "a", null, null],
            ],
        })

        expect(result.pixels[0][0]).toBe("transparent")
        expect(result.pixels[2][2]).toBe("transparent")
        expect(result.pixels[1][1]).toBe("a")
    })

    it("handles edge and corner cells using only actual neighbors", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels: [
                ["b", "a", "a"],
                ["a", "a", "a"],
                ["a", "a", "c"],
            ],
        })

        expect(result.pixels[0][0]).toBe("a")
        expect(result.pixels[2][2]).toBe("a")
    })

    it("resolves tie-breaker A by global area and then smaller index", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels: [
                ["c", null, null, null, null],
                [null, null, "b", null, null],
                [null, "c", "x", "c", null],
                [null, null, "b", null, null],
                [null, null, null, null, null],
            ],
        })

        expect(result.pixels[2][2]).toBe("c")
    })

    it("resolves tie-breaker B by palette index order", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 1 },
            maxIterations: 1,
            pixels: [
                [null, null, null],
                ["c", "x", "b"],
                [null, null, null],
            ],
        })

        expect(result.pixels[1][1]).toBe("b")
    })

    it("resolves tie-breakers C and D by directional neighbor order", () => {
        const pixels = [
            ["b", null, "c"],
            [null, "x", null],
            [null, null, null],
        ]

        const clockwise = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 2 },
            maxIterations: 1,
            pixels,
        })
        const counterClockwise = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 3 },
            maxIterations: 1,
            pixels,
        })

        expect(clockwise.pixels[1][1]).toBe("c")
        expect(counterClockwise.pixels[1][1]).toBe("b")
    })

    it("does not exceed the iteration limit", () => {
        const result = applyDeConfetti({
            settings: { enabled: true, tieBreaker: 0 },
            pixels: [["a", "b"]],
        })

        expect(result.iterations).toBe(DE_CONFETTI_MAX_ITERATIONS)
        expect(result.changed).toBe(true)
    })

    it("returns a cloned unchanged grid when disabled", () => {
        const pixels = [["a", "b"]]
        const result = applyDeConfetti({
            settings: { enabled: false, tieBreaker: 0 },
            pixels,
        })

        expect(result.pixels).toEqual(pixels)
        expect(result.pixels).not.toBe(pixels)
        expect(result.iterations).toBe(0)
    })
})
