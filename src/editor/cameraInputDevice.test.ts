import { describe, expect, it } from "vitest"

import { isLikelyMobileCameraInputDevice } from "./PixelEditorFramer.tsx"

describe("camera input device detection", () => {
    it("uses native capture input for iPadOS desktop-class Safari user agents", () => {
        expect(
            isLikelyMobileCameraInputDevice(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
                5
            )
        ).toBe(true)
    })

    it("does not classify regular desktop Safari as a mobile capture device", () => {
        expect(
            isLikelyMobileCameraInputDevice(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
                0
            )
        ).toBe(false)
    })
})
