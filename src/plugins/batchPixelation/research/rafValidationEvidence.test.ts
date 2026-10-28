import { describe, expect, it } from "vitest"
import { canonicalJson, classifyPng, parseReferencePackage, samplePositions, statistics } from "./rafValidationEvidence.ts"
import { startWithAdapter } from "./rafValidationSession.ts"

describe("research validation evidence", () => {
    it("preserves descriptive timing boundaries", () => {
        expect([0, 99, 100, 899, 900, 1199, 1200].map(classifyPng))
            .toEqual(["FAST", "FAST", "OTHER", "OTHER", "SLOW-PLATEAU", "SLOW-PLATEAU", "OTHER"])
    })
    it("reports empty metrics honestly and correct percentiles", () => {
        expect(statistics([]).mean).toBeNull()
        expect(statistics([4, 1, 3, 2])).toEqual({ n: 4, mean: 2.5, median: 2.5, p95: 4, max: 4 })
    })
    it("bounds and deduplicates selected positions", () => {
        expect(samplePositions(0)).toEqual([])
        expect(samplePositions(1)).toEqual([0])
        expect(samplePositions(1000)).toEqual([0, 99, 499, 749, 999])
    })
    it("normalizes key order but preserves computational array order", () => {
        expect(canonicalJson({ b: [2, 1], a: 1 })).toBe(canonicalJson({ a: 1, b: [2, 1] }))
        expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
    })
    it("rejects malformed and oversized research imports", () => {
        expect(() => parseReferencePackage("{}")).toThrow()
        expect(() => parseReferencePackage(" ".repeat(2_000_001))).toThrow(/limit/)
    })
    it("OFF never invokes frame scheduling", async () => {
        const state = { count: 0, waitMs: 0 }
        let ran = false
        await startWithAdapter("OFF", state, async () => { ran = true }, () => { throw new Error("Unexpected rAF") })
        expect(ran).toBe(true)
        expect(state).toEqual({ count: 0, waitMs: 0 })
    })
    it("ON waits for exactly one callback before starting", async () => {
        const state = { count: 0, waitMs: 0 }
        let ran = false
        let callback: FrameRequestCallback | undefined
        const pending = startWithAdapter("ON", state, async () => { ran = true }, cb => { callback = cb; return 1 })
        expect(ran).toBe(false)
        expect(state.count).toBe(1)
        callback!(0)
        await pending
        expect(ran).toBe(true)
        expect(state.count).toBe(1)
    })
})
