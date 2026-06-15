import { afterEach, describe, expect, it, vi } from "vitest"

import {
    FILE_INTAKE_LIMITS,
    assertDecodedImageDimensions,
    assertProjectSaveFileSize,
    assertRasterImageFileCandidate,
    decodeAndValidateRasterImageFile,
    isLikelyRasterImageFile,
} from "./fileIntakeSecurity.ts"

describe("file intake security", () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("rejects oversized project saves before text parsing", () => {
        expect(() =>
            assertProjectSaveFileSize({
                name: "large.pixtudio",
                type: "application/json",
                size: FILE_INTAKE_LIMITS.MAX_PROJECT_SAVE_BYTES + 1,
            })
        ).toThrow("too large")
    })

    it("allows only known raster image candidates", () => {
        expect(isLikelyRasterImageFile({ name: "photo.jpg", type: "" })).toBe(
            true
        )
        expect(
            isLikelyRasterImageFile({
                name: "vector.svg",
                type: "image/svg+xml",
            })
        ).toBe(false)
        expect(
            isLikelyRasterImageFile({
                name: "palette-source.png",
                type: "application/json",
            })
        ).toBe(false)
    })

    it("rejects oversized image files before decode", () => {
        expect(() =>
            assertRasterImageFileCandidate({
                name: "huge.png",
                type: "image/png",
                size: FILE_INTAKE_LIMITS.MAX_IMAGE_BYTES + 1,
            })
        ).toThrow("too large")
    })

    it("rejects decoded images that exceed dimension limits", () => {
        expect(() =>
            assertDecodedImageDimensions({
                width: FILE_INTAKE_LIMITS.MAX_IMAGE_WIDTH + 1,
                height: 100,
            })
        ).toThrow("too large")

        expect(() =>
            assertDecodedImageDimensions({
                width: 7000,
                height: 5000,
            })
        ).toThrow("too large")
    })

    it("closes decoded bitmaps that fail the dimension gate", async () => {
        const close = vi.fn()
        const bitmap = {
            width: FILE_INTAKE_LIMITS.MAX_IMAGE_WIDTH + 1,
            height: 100,
            close,
        } as unknown as ImageBitmap
        vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap))

        await expect(
            decodeAndValidateRasterImageFile({
                name: "huge.png",
                type: "image/png",
                size: 128,
            } as File)
        ).rejects.toThrow("too large")
        expect(close).toHaveBeenCalledOnce()
    })
})
