import { describe, expect, it, vi } from "vitest"
import {
    buildReferenceSnapshot,
    ZERO_SMART_REFERENCE_ADJUSTMENTS,
    type SmartObjectWhiteBalanceDomainState,
} from "./SmartReferenceEditor.tsx"

class TestImageData {
    readonly colorSpace = "srgb"
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(
        data: Uint8ClampedArray,
        width: number,
        height: number
    ) {
        this.data = data
        this.width = width
        this.height = height
    }
}
vi.stubGlobal("ImageData", TestImageData)

async function digest(bytes: Uint8Array<ArrayBuffer> | Uint8ClampedArray<ArrayBuffer>) {
    const hash = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("")
}

// Golden RGBA digests recorded from the original SmartReferenceEditor before
// extraction. Keep these independent of resolve/apply round-trip assertions.
describe("Smart pre-extraction RGBA baseline", () => {
    it("preserves all scalar stages, WB trajectories, bypass thresholds and alpha", async () => {
        const pixels = new Uint8ClampedArray(17 * 13 * 4)
        for (let i = 0; i < pixels.length; i += 4) {
            pixels.set([(i * 17) % 256, (i * 31 + 127) % 256,
                (i * 43 + 255) % 256, [0, 1, 128, 255][(i / 4) % 4]], i)
        }
        const base = new ImageData(pixels, 17, 13)
        const originalBytes = pixels.slice()
        const results = []
        for (const kelvin of [null, 2500, 6500, 12000]) {
            for (const confidence of [0, 0.5, 1]) {
                const domain: SmartObjectWhiteBalanceDomainState = {
                    sourceWhitePoint: [0.2, 0.3, 0.5], sourceKelvin: kelvin,
                    whiteBalanceConfidence: confidence, targetKelvin: 6500,
                }
                for (const wb of [0, 0.2, 0.5, 0.5000003, 0.5000008, 0.500002, 0.8, 1]) {
                    for (const scalars of [
                        {}, { exposure: 100 }, { contrast: -100 }, { saturation: 100 },
                        { shadows: 100, midtones: -50, highlights: -100 },
                        { exposure: -27, contrast: 45, saturation: -33,
                            shadows: 21, midtones: 39, highlights: -61 },
                    ]) {
                        const adjustments = { ...ZERO_SMART_REFERENCE_ADJUSTMENTS,
                            ...scalars, whiteBalance: wb }
                        const output = buildReferenceSnapshot(base, adjustments, domain)!
                        results.push(await digest(output.data))
                    }
                }
            }
        }
        expect(results).toHaveLength(576)
        expect(await digest(new TextEncoder().encode(JSON.stringify(results))))
            .toMatchSnapshot()
        expect(base.data).toEqual(originalBytes)
    })
})
