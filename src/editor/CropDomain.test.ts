import { describe, expect, it } from "vitest"

import {
    calculateCropScreenRegionLayout,
    calculateCropViewportGeometry,
    CROP_LAYOUT_REGION_FRACTIONS,
    getAspectRatioCssValue,
    selectDefaultCropAspectRatio,
} from "./CropDomain.tsx"

describe("crop domain", () => {
    it("selects the closest default aspect ratio from source dimensions", () => {
        expect(selectDefaultCropAspectRatio({ width: 1920, height: 1080 })).toBe(
            "16:9"
        )
        expect(selectDefaultCropAspectRatio({ width: 1536, height: 1024 })).toBe(
            "3:2"
        )
        expect(selectDefaultCropAspectRatio({ width: 900, height: 1200 })).toBe(
            "3:4"
        )
        expect(selectDefaultCropAspectRatio({ width: 1024, height: 1024 })).toBe(
            "1:1"
        )
    })

    it("exposes CSS aspect ratio values for the seven templates", () => {
        expect(getAspectRatioCssValue("16:9")).toBe("16 / 9")
        expect(getAspectRatioCssValue("3:2")).toBe("3 / 2")
        expect(getAspectRatioCssValue("4:3")).toBe("4 / 3")
        expect(getAspectRatioCssValue("1:1")).toBe("1 / 1")
        expect(getAspectRatioCssValue("3:4")).toBe("3 / 4")
        expect(getAspectRatioCssValue("2:3")).toBe("2 / 3")
        expect(getAspectRatioCssValue("9:16")).toBe("9 / 16")
    })

    it("calculates centered crop viewport geometry from the rendered canvas", () => {
        expect(
            calculateCropViewportGeometry({
                canvasWidth: 910,
                canvasHeight: 512,
                insetFraction: 0.1,
            })
        ).toEqual({
            canvasWidth: 910,
            canvasHeight: 512,
            inset: 51,
            viewportWidth: 729,
            viewportHeight: 410,
            viewportX: 90.5,
            viewportY: 51,
            viewportCenterX: 455,
            viewportCenterY: 256,
        })
    })

    it("keeps crop screen regions tied to viewport height", () => {
        expect(CROP_LAYOUT_REGION_FRACTIONS).toEqual({
            top: 5 / 24,
            middle: 14 / 24,
            bottom: 5 / 24,
        })
        expect(
            calculateCropScreenRegionLayout({
                viewportWidth: 1600,
                viewportHeight: 1000,
            })
        ).toEqual({
            topHeight: 1000 * (5 / 24),
            middleHeight: 1000 * (14 / 24),
            bottomHeight: 1000 * (5 / 24),
            stageWidth: 1000 * (14 / 24),
        })
        expect(
            calculateCropScreenRegionLayout({
                viewportWidth: 400,
                viewportHeight: 1000,
            }).stageWidth
        ).toBe(1000 * (14 / 24))
    })
})
