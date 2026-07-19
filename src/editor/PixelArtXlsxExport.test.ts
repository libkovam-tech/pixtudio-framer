import { describe, expect, it } from "vitest"

import {
    PIXEL_ART_XLSX_MIME,
    buildPixelArtXlsxBlob,
    composePixelArtXlsxExportColors,
    normalizeXlsxHexColor,
} from "./PixelArtXlsxExport.tsx"

async function blobAsText(blob: Blob) {
    return new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()))
}

describe("pixel art xlsx export", () => {
    it("builds an xlsx workbook with only the pixel-art square", async () => {
        const blob = buildPixelArtXlsxBlob({
            colors: [
                ["#ff0000", null],
                ["rgb(0, 255, 0)", "#0000ff"],
            ],
            sizeMm: 200,
        })

        expect(blob.type).toBe(PIXEL_ART_XLSX_MIME)

        const text = await blobAsText(blob)
        expect(text).toContain("xl/worksheets/sheet1.xml")
        expect(text).toContain("xl/styles.xml")
        expect(text).toContain('<dimension ref="A1:B2"/>')
        expect(text).toContain('<cols><col min="1" max="2"')
        expect(text).toContain('<row r="1" spans="1:2">')
        expect(text).toContain('fitToPage="1"')
        expect(text).toContain('showRowColHeaders="0"')
        expect(text).toContain('paperSize="9"')
        expect(text).toContain('rgb="FFFF0000"')
        expect(text).toContain('rgb="FF00FF00"')
        expect(text).toContain('rgb="FF0000FF"')
        expect(text).toContain('formatCode=";;;"')
        expect(text).toContain('applyNumberFormat="1"')
        expect(text).toContain('<c r="A1" s="1"><v>0</v></c>')
        expect(text).not.toContain('<c r="B1"')
    })

    it("normalizes editor color strings for Excel fills", () => {
        expect(normalizeXlsxHexColor("#abc")).toBe("AABBCC")
        expect(normalizeXlsxHexColor("rgba(10, 20, 30, 0)")).toBeNull()
        expect(normalizeXlsxHexColor("rgb(10, 20, 30)")).toBe("0A141E")
        expect(normalizeXlsxHexColor("hsl(0, 80%, 55%)")).toBe("E83030")
        expect(normalizeXlsxHexColor("hsla(120, 80%, 55%, 0)")).toBeNull()
    })

    it("composes the stroke layer over the image layer", () => {
        const colors = composePixelArtXlsxExportColors({
            gridSize: 2,
            imagePixels: [
                ["image", null],
                [null, null],
            ],
            overlayPixels: [
                ["stroke", null],
                [null, "image"],
            ],
            resolveColor: (value) =>
                value === "stroke"
                    ? "#ff0000"
                    : value === "image"
                      ? "#00ff00"
                      : null,
            isTransparent: (value) => value === "transparent",
        })

        expect(colors).toEqual([
            ["#ff0000", null],
            [null, "#00ff00"],
        ])
    })

    it("exports only the selected layer when layer toggles are used", () => {
        const colors = composePixelArtXlsxExportColors({
            gridSize: 2,
            imagePixels: [
                ["image", null],
                [null, null],
            ],
            overlayPixels: [
                ["stroke", null],
                [null, null],
            ],
            includeStroke: true,
            includeImage: false,
            resolveColor: (value) =>
                value === "stroke"
                    ? "#ff0000"
                    : value === "image"
                      ? "#00ff00"
                      : null,
            isTransparent: (value) => value === "transparent",
        })

        expect(colors).toEqual([
            ["#ff0000", null],
            [null, null],
        ])
    })

    it("keeps transparent stroke cells empty instead of falling through to image", () => {
        const colors = composePixelArtXlsxExportColors({
            gridSize: 1,
            imagePixels: [["image"]],
            overlayPixels: [["transparent"]],
            includeStroke: true,
            includeImage: true,
            resolveColor: (value) => (value === "image" ? "#00ff00" : null),
            isTransparent: (value) => value === "transparent",
        })

        expect(colors).toEqual([[null]])
    })

    it("keeps narrow 128px exports square in Excel units", async () => {
        const colors = Array.from({ length: 128 }, () =>
            Array.from({ length: 128 }, () => "#123456")
        )
        const text = await blobAsText(
            buildPixelArtXlsxBlob({ colors, sizeMm: 200 })
        )

        expect(text).toContain('zoomScale="100"')
        expect(text).toContain('<dimension ref="A1:DX128"/>')
        expect(text).toContain('<cols><col min="1" max="128"')
        expect(text).toContain('<row r="1" spans="1:128">')
        expect(text).toContain('<c r="AA1" s="1"><v>0</v></c>')
        expect(text).toContain(
            'defaultColWidth="1.7143" defaultRowHeight="9" customHeight="1"'
        )
        expect(text).not.toContain(' ht="')
    })
})
