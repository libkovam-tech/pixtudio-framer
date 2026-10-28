import { afterEach, describe, expect, it, vi } from "vitest"
import {
    getCropSourceDimensions,
    renderResolvedCrop,
    resolveCropDrawGeometry,
    type CropDrawGeometry,
    type CropResolveInput,
} from "./cropRender.ts"

const input: CropResolveInput = {
    input: { width: 1080, height: 1920 },
    output: { width: 512, height: 910 },
    viewport: { width: 400, height: 700 },
    scale: 1.25,
    offset: { x: 25, y: -12.5 },
    rotationRadians: 0.17,
}

afterEach(() => vi.unstubAllGlobals())

describe("resolved Crop", () => {
    it("captures the existing arithmetic without preview state or mutable inputs", () => {
        const geometry = resolveCropDrawGeometry(input)
        expect(geometry).toEqual({
            outputWidth: 512, outputHeight: 910,
            cx: 288, cy: 439,
            drawWidth: 640,
            drawHeight: 1920 * (400 / 1080) * 1.25 * (512 / 400),
            rotationRadians: 0.17,
        })
        expect(Object.isFrozen(geometry)).toBe(true)
        expect(JSON.parse(JSON.stringify(geometry))).toEqual(geometry)
        expect(Object.keys(geometry).sort()).toEqual([
            "cx", "cy", "drawHeight", "drawWidth", "outputHeight", "outputWidth", "rotationRadians",
        ])
    })

    it("preserves negative/outside offsets rather than refitting the source", () => {
        const geometry = resolveCropDrawGeometry({ ...input, offset: { x: -9999, y: 9999 } })
        expect(geometry.cx).toBe(256 - 9999 * 1.28)
        expect(geometry.cy).toBe(455 + 9999 * 1.28)
    })

    it.each([0, -1, NaN, Infinity])("rejects invalid scale %s", (scale) => {
        expect(() => resolveCropDrawGeometry({ ...input, scale })).toThrow("Invalid Crop")
    })

    it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid source dimensions %s", (width) => {
        expect(() => resolveCropDrawGeometry({ ...input, input: { width, height: 100 } })).toThrow()
    })

    it("reads intrinsic source dimensions, not presentation dimensions", () => {
        const source = { naturalWidth: 1080, naturalHeight: 1920, width: 200, height: 300 }
        expect(getCropSourceDimensions(source as HTMLImageElement)).toEqual({ width: 1080, height: 1920 })
        expect(getCropSourceDimensions({ width: 80, height: 90 } as ImageBitmap)).toEqual({ width: 80, height: 90 })
        expect(getCropSourceDimensions({ width: 0, height: 90 } as ImageBitmap)).toBeNull()
    })

    it.each([undefined, { rasterPolicy: "default" as const }, { rasterPolicy: "canonical-software" as const }])(
        "renders using the unchanged draw-call sequence after JSON round trip with %j", (options) => {
        const geometry: CropDrawGeometry = JSON.parse(JSON.stringify(resolveCropDrawGeometry(input)))
        const calls: unknown[][] = []
        const raster = { width: 512, height: 910 } as ImageData
        const context = Object.fromEntries(["clearRect", "save", "translate", "rotate", "drawImage", "restore", "getImageData"].map(
            (name) => [name, (...args: unknown[]) => { calls.push([name, ...args]); return raster }]
        ))
        const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) }
        vi.stubGlobal("document", { createElement: vi.fn(() => canvas) })
        const source = { width: 1080, height: 1920 } as ImageBitmap
        expect(renderResolvedCrop(source, geometry, options)).toBe(raster)
        if (options?.rasterPolicy === "canonical-software") {
            expect(canvas.getContext).toHaveBeenCalledExactlyOnceWith("2d", { willReadFrequently: true })
        } else {
            expect(canvas.getContext).toHaveBeenCalledExactlyOnceWith("2d")
        }
        expect(canvas.width).toBe(512)
        expect(canvas.height).toBe(910)
        expect(calls).toEqual([
            ["clearRect", 0, 0, 512, 910], ["save"],
            ["translate", geometry.cx, geometry.cy], ["rotate", 0.17],
            ["drawImage", source, -geometry.drawWidth / 2, -geometry.drawHeight / 2, geometry.drawWidth, geometry.drawHeight],
            ["restore"], ["getImageData", 0, 0, 512, 910],
        ])
    })

    it.each(["default", "canonical-software"] as const)("returns null without fallback for unavailable %s context", rasterPolicy => {
        const getContext = vi.fn(() => null)
        vi.stubGlobal("document", { createElement: () => ({ getContext }) })
        expect(renderResolvedCrop({} as ImageBitmap, resolveCropDrawGeometry(input), { rasterPolicy })).toBeNull()
        expect(getContext).toHaveBeenCalledTimes(1)
    })

    it("rejects unknown runtime policies before canvas allocation", () => {
        const createElement = vi.fn()
        vi.stubGlobal("document", { createElement })
        expect(() => Reflect.apply(renderResolvedCrop, null, [{}, resolveCropDrawGeometry(input),
            { rasterPolicy: "unknown" }])).toThrow("Unsupported Crop raster policy")
        expect(createElement).not.toHaveBeenCalled()
    })

    it.each([
        { outputWidth: 1.5 }, { outputHeight: 0 }, { cx: NaN },
        { cy: Infinity }, { drawWidth: -1 }, { drawHeight: 0 }, { rotationRadians: NaN },
    ])("rejects invalid replay geometry before canvas allocation: %o", (patch) => {
        const createElement = vi.fn()
        vi.stubGlobal("document", { createElement })
        expect(() => renderResolvedCrop({} as ImageBitmap, {
            ...resolveCropDrawGeometry(input), ...patch,
        })).toThrow("Invalid Crop")
        expect(createElement).not.toHaveBeenCalled()
    })
})
