import { describe, expect, it } from "vitest"
import { animatedGifBytes, staticGifBytes } from "../../../../tests/fixtures/staticGifBytes"
import { controlledPng, insertPngMarkerPayload } from "../../../../tests/fixtures/staticRasterBytes"
import { assertStaticBatchRasterFile, decodeStaticBatchRaster, inspectStaticRaster } from "../staticRasterPolicy"

describe("Batch static raster research preflight", () => {
    it("classifies one GIF frame as static and two as animated", () => {
        expect(inspectStaticRaster(staticGifBytes)).toEqual({ kind: "static", format: "gif" })
        expect(inspectStaticRaster(animatedGifBytes)).toEqual({ kind: "animated", format: "gif" })
    })

    it("rejects truncated or malformed GIFs rather than treating them as static", () => {
        for (const bytes of [staticGifBytes.subarray(0, -1), staticGifBytes.subarray(0, -4),
            Uint8Array.from([...staticGifBytes.slice(0, -1), 0x21, 0xf9, 0xff])]) {
            expect(inspectStaticRaster(bytes)).not.toEqual({ kind: "static", format: "gif" })
        }
    })

    it("does not mistake extension payload bytes for a second GIF frame", () => {
        const comment = [0x21, 0xfe, 0x02, 0x2c, 0x3b, 0x00]
        const withComment = Uint8Array.from([
            ...staticGifBytes.subarray(0, 19), ...comment, ...staticGifBytes.subarray(19),
        ])
        expect(inspectStaticRaster(withComment)).toEqual({ kind: "static", format: "gif" })
    })

    it("rejects GIF plain-text graphic extensions conservatively", () => {
        const plainText = [0x21, 0x01, 0x01, 0x00, 0x00]
        const withText = Uint8Array.from([
            ...staticGifBytes.subarray(0, 19), ...plainText, ...staticGifBytes.subarray(19),
        ])
        expect(inspectStaticRaster(withText)).toEqual({ kind: "unsupported" })
    })

    it("accepts static PNG and rejects APNG by container chunk, not payload substring", () => {
        expect(inspectStaticRaster(controlledPng(false))).toEqual({ kind: "static", format: "png" })
        expect(inspectStaticRaster(controlledPng(true))).toEqual({ kind: "animated", format: "png" })
        expect(inspectStaticRaster(controlledPng(false).subarray(0, -5))).toEqual({ kind: "invalid" })
        expect(inspectStaticRaster(insertPngMarkerPayload(controlledPng(false))))
            .toEqual({ kind: "static", format: "png" })
    })

    it("rejects animated GIF and APNG before any browser decode", async () => {
        for (const [bytes, name, type, code] of [
            [animatedGifBytes, "animated.gif", "image/gif", "animated-gif"],
            [controlledPng(true), "animated.png", "image/png", "animated-png"],
        ] as const) {
            await expect(decodeStaticBatchRaster(new File([Uint8Array.from(bytes)], name, { type })))
                .rejects.toMatchObject({ code })
        }
    })

    it("does not silently treat unsupported formats as static", () => {
        expect(inspectStaticRaster(Uint8Array.from([0x52, 0x49, 0x46, 0x46]))).toEqual({ kind: "unsupported" })
    })

    it("uses the Batch format error for unsupported candidates and containers", async () => {
        for (const [name, type, bytes] of [
            ["table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"],
            ["document.pdf", "application/pdf", "%PDF-1.7"],
            ["photo.webp", "image/webp", "RIFF....WEBP"],
        ]) {
            await expect(assertStaticBatchRasterFile(new File([bytes], name, { type })))
                .rejects.toMatchObject({ code: "unsupported", message: "This image format is not supported by Batch." })
        }
    })
})
