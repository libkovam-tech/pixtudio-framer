import { describe, expect, it } from "vitest"
import { compareNaturalFilename } from "./naturalFilenameOrder"

describe("Batch Source Set natural filename order", () => {
    it("orders numeric runs by value, not lexicographic digits", () => {
        expect(["frame10.png", "frame2.png", "frame1.png"].sort(compareNaturalFilename))
            .toEqual(["frame1.png", "frame2.png", "frame10.png"])
    })

    it("uses shorter equal-value numeric runs before longer zero-padded runs", () => {
        expect(["frame001.png", "frame01.png", "frame1.png", "frame002.png"].sort(compareNaturalFilename))
            .toEqual(["frame1.png", "frame01.png", "frame001.png", "frame002.png"])
    })

    it("compares successive numeric runs", () => {
        expect(["scene2_frame10.png", "scene10_frame1.png", "scene2_frame2.png"].sort(compareNaturalFilename))
            .toEqual(["scene2_frame2.png", "scene2_frame10.png", "scene10_frame1.png"])
    })

    it("breaks same-stem extension and case ties by exact UTF-16 ordinal order", () => {
        expect(["frame1.png", "frame1.jpg", "frame1.gif", "Frame1.png"].sort(compareNaturalFilename))
            .toEqual(["Frame1.png", "frame1.gif", "frame1.jpg", "frame1.png"])
    })

    it("does not lose precision on numeric runs longer than Number.MAX_SAFE_INTEGER", () => {
        expect(["frame9007199254740993", "frame9007199254740992"].sort(compareNaturalFilename))
            .toEqual(["frame9007199254740992", "frame9007199254740993"])
    })
})
