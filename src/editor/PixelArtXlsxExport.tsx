import { zipStore, type ZipStoreFile } from "./zipStore.ts"

export type PixelArtXlsxColor = string | null | undefined

export function composePixelArtXlsxExportColors<T>(params: {
    gridSize: number
    imagePixels: (T | null)[][]
    overlayPixels: (T | null)[][]
    includeStroke?: boolean
    includeImage?: boolean
    resolveColor: (value: T) => string | null
    isTransparent: (value: T) => boolean
}): (string | null)[][] {
    const includeStroke = params.includeStroke ?? true
    const includeImage = params.includeImage ?? true
    const out: (string | null)[][] = []

    for (let r = 0; r < params.gridSize; r++) {
        const imageRow = params.imagePixels[r]
        const overlayRow = params.overlayPixels[r]
        const row: (string | null)[] = []

        for (let c = 0; c < params.gridSize; c++) {
            let value: T | null = null

            if (includeStroke) {
                const overlayValue = overlayRow?.[c] ?? null
                if (overlayValue != null) value = overlayValue
            }

            if (value == null && includeImage) value = imageRow?.[c] ?? null

            row.push(resolveExportColor(value, params))
        }

        out.push(row)
    }

    return out
}

export const PIXEL_ART_XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const XLSX_TARGET_SIZE_MM = 200
const SCREEN_PIXELS_PER_MM = 96 / 25.4
const POINTS_PER_SCREEN_PIXEL = 72 / 96
const CALIBRI_11_MAX_DIGIT_WIDTH_PX = 7
const MIN_STABLE_DISPLAY_CELL_PX = 12

function resolveExportColor<T>(
    value: T | null,
    params: {
        resolveColor: (value: T) => string | null
        isTransparent: (value: T) => boolean
    }
): string | null {
    if (value == null || params.isTransparent(value)) return null
    return params.resolveColor(value)
}

export function buildPixelArtXlsxBlob(params: {
    colors: PixelArtXlsxColor[][]
    sizeMm?: number
}): Blob {
    const size = params.colors.length
    const normalizedRows = params.colors.map((row) =>
        row.map((color) => normalizeXlsxHexColor(color))
    )
    const uniqueColors = collectUniqueColors(normalizedRows)
    const styleByColor = new Map<string, number>()
    uniqueColors.forEach((color, index) => styleByColor.set(color, index + 1))

    const files: ZipStoreFile[] = [
        xmlFile("[Content_Types].xml", contentTypesXml()),
        xmlFile("_rels/.rels", rootRelsXml()),
        xmlFile("docProps/app.xml", appXml()),
        xmlFile("docProps/core.xml", coreXml()),
        xmlFile("xl/workbook.xml", workbookXml()),
        xmlFile("xl/_rels/workbook.xml.rels", workbookRelsXml()),
        xmlFile("xl/styles.xml", stylesXml(uniqueColors)),
        xmlFile(
            "xl/worksheets/sheet1.xml",
            worksheetXml({
                rows: normalizedRows,
                size,
                sizeMm: params.sizeMm ?? XLSX_TARGET_SIZE_MM,
                styleByColor,
            })
        ),
    ]

    return new Blob([zipStore(files)], { type: PIXEL_ART_XLSX_MIME })
}

export function normalizeXlsxHexColor(
    color: PixelArtXlsxColor
): string | null {
    if (!color) return null

    const raw = String(color).trim()
    if (!raw) return null

    const shortHex = /^#?([0-9a-f]{3})$/i.exec(raw)
    if (shortHex) {
        const [r, g, b] = shortHex[1].split("")
        return `${r}${r}${g}${g}${b}${b}`.toUpperCase()
    }

    const longHex = /^#?([0-9a-f]{6})$/i.exec(raw)
    if (longHex) return longHex[1].toUpperCase()

    const rgb =
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i.exec(
            raw
        )
    if (rgb) {
        const alpha = rgb[4] == null ? 1 : Number(rgb[4])
        if (!Number.isFinite(alpha) || alpha <= 0) return null

        return [rgb[1], rgb[2], rgb[3]]
            .map((part) => {
                const n = Math.max(0, Math.min(255, Math.round(Number(part))))
                return n.toString(16).padStart(2, "0")
            })
            .join("")
            .toUpperCase()
    }

    const hsl =
        /^hsla?\(\s*([-+]?\d+(?:\.\d+)?)(?:deg)?\s*,\s*([-+]?\d+(?:\.\d+)?)%\s*,\s*([-+]?\d+(?:\.\d+)?)%(?:\s*,\s*([-+]?\d+(?:\.\d+)?%?)\s*)?\)$/i.exec(
            raw
        )
    if (hsl) {
        const alpha = parseCssAlpha(hsl[4])
        if (alpha != null && (!Number.isFinite(alpha) || alpha <= 0))
            return null

        const rgbFromHsl = hslToRgb(
            Number(hsl[1]),
            Number(hsl[2]) / 100,
            Number(hsl[3]) / 100
        )

        return [rgbFromHsl.r, rgbFromHsl.g, rgbFromHsl.b]
            .map((part) => part.toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
    }

    return null
}

function parseCssAlpha(raw: string | undefined): number | null {
    if (raw == null) return null
    const value = raw.trim()
    if (!value) return null
    if (value.endsWith("%")) return Number(value.slice(0, -1)) / 100
    return Number(value)
}

function hslToRgb(hueDegrees: number, saturation: number, lightness: number) {
    const h = (((hueDegrees % 360) + 360) % 360) / 60
    const s = clamp01(saturation)
    const l = clamp01(lightness)
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs((h % 2) - 1))
    const m = l - c / 2
    let r1 = 0
    let g1 = 0
    let b1 = 0

    if (h < 1) {
        r1 = c
        g1 = x
    } else if (h < 2) {
        r1 = x
        g1 = c
    } else if (h < 3) {
        g1 = c
        b1 = x
    } else if (h < 4) {
        g1 = x
        b1 = c
    } else if (h < 5) {
        r1 = x
        b1 = c
    } else {
        r1 = c
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function collectUniqueColors(rows: (string | null)[][]): string[] {
    const seen = new Set<string>()
    const colors: string[] = []

    for (const row of rows) {
        for (const color of row) {
            if (!color || seen.has(color)) continue
            seen.add(color)
            colors.push(color)
        }
    }

    return colors
}

function worksheetXml(params: {
    rows: (string | null)[][]
    size: number
    sizeMm: number
    styleByColor: Map<string, number>
}) {
    const { rows, size, sizeMm, styleByColor } = params
    const cellSizePx = excelDefaultCellSizePx(sizeMm, size)
    const rowHeightPt = cellSizePx * POINTS_PER_SCREEN_PIXEL
    const colWidth = excelColumnWidthForPixels(cellSizePx)
    const dimension = size > 0 ? `A1:${cellRef(size - 1, size - 1)}` : "A1"
    const colsXml =
        size > 0
            ? `<cols><col min="1" max="${size}" width="${formatNumber(colWidth)}" customWidth="1"/></cols>`
            : ""
    const rowSpans = size > 0 ? ` spans="1:${size}"` : ""

    const rowsXml = rows
        .map((row, r) => {
            const cells = row
                .map((color, c) => {
                    if (!color) return ""
                    const style = styleByColor.get(color)
                    if (!style) return ""
                    return `<c r="${cellRef(r, c)}" s="${style}"><v>0</v></c>`
                })
                .join("")

            return `<row r="${r + 1}"${rowSpans}>${cells}</row>`
        })
        .join("")

    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
        `<dimension ref="${dimension}"/>` +
        `<sheetViews><sheetView workbookViewId="0" showGridLines="0" showRowColHeaders="0" zoomScale="100" zoomScaleNormal="100"/></sheetViews>` +
        `<sheetFormatPr baseColWidth="1" defaultColWidth="${formatNumber(colWidth)}" defaultRowHeight="${formatNumber(rowHeightPt)}" customHeight="1"/>` +
        colsXml +
        `<sheetData>${rowsXml}</sheetData>` +
        `<pageMargins left="0.19685" right="0.19685" top="0.19685" bottom="0.19685" header="0" footer="0"/>` +
        `<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="1"/>` +
        `</worksheet>`
    )
}

function stylesXml(colors: string[]) {
    const fills = colors
        .map(
            (color) =>
                `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`
        )
        .join("")
    const xfs = colors
        .map(
            (_, index) =>
                `<xf numFmtId="164" fontId="0" fillId="${index + 2}" borderId="0" xfId="0" applyFill="1" applyNumberFormat="1"/>`
        )
        .join("")

    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<numFmts count="1"><numFmt numFmtId="164" formatCode=";;;"/></numFmts>` +
        `<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>` +
        `<fills count="${colors.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}</fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="${colors.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xfs}</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>` +
        `</styleSheet>`
    )
}

function contentTypesXml() {
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
        `</Types>`
    )
}

function rootRelsXml() {
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
        `</Relationships>`
    )
}

function workbookXml() {
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Pixel Art" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`
    )
}

function workbookRelsXml() {
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    )
}

function appXml() {
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
        `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
        `<Application>PIXTUDIO</Application></Properties>`
    )
}

function coreXml() {
    const now = new Date().toISOString()
    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
        `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
        `xmlns:dcterms="http://purl.org/dc/terms/" ` +
        `xmlns:dcmitype="http://purl.org/dc/dcmitype/" ` +
        `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:creator>PIXTUDIO</dc:creator>` +
        `<cp:lastModifiedBy>PIXTUDIO</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
        `</cp:coreProperties>`
    )
}

function xmlFile(name: string, xml: string): ZipStoreFile {
    return { name, bytes: new TextEncoder().encode(xml) }
}

function cellRef(row: number, col: number) {
    return `${columnName(col)}${row + 1}`
}

function columnName(col: number) {
    let n = col + 1
    let name = ""
    while (n > 0) {
        const rem = (n - 1) % 26
        name = String.fromCharCode(65 + rem) + name
        n = Math.floor((n - 1) / 26)
    }
    return name
}

function formatNumber(value: number) {
    return Number.isFinite(value) ? value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : "0"
}

function excelDefaultCellSizePx(sizeMm: number, gridSize: number) {
    if (!Number.isFinite(sizeMm) || sizeMm <= 0 || gridSize <= 0)
        return MIN_STABLE_DISPLAY_CELL_PX

    const targetPx = (sizeMm * SCREEN_PIXELS_PER_MM) / gridSize
    return Math.max(MIN_STABLE_DISPLAY_CELL_PX, Math.round(targetPx))
}

function excelColumnWidthForPixels(px: number) {
    if (!Number.isFinite(px) || px <= 0) return 0.1

    // Excel column width is based on the workbook's max digit width. Calibri 11
    // is the default font declared in stylesXml(), and OOXML uses 7px for it.
    const width = px / CALIBRI_11_MAX_DIGIT_WIDTH_PX
    return Math.max(0.1, Math.min(255, width))
}
