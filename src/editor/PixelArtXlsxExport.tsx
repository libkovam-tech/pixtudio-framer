export type PixelArtXlsxColor = string | null | undefined

export const PIXEL_ART_XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const XLSX_TARGET_SIZE_MM = 200
const SCREEN_PIXELS_PER_MM = 96 / 25.4
const POINTS_PER_SCREEN_PIXEL = 72 / 96
const MIN_STABLE_DISPLAY_CELL_PX = 12

type XlsxFile = {
    name: string
    bytes: Uint8Array
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

    const files: XlsxFile[] = [
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

    return null
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
    const geometry = excelCellGeometry(sizeMm, size)
    const rowHeightPt = geometry.cellSizePx * POINTS_PER_SCREEN_PIXEL
    const colWidth = excelColumnWidthForPixels(geometry.cellSizePx)
    const dimension = size > 0 ? `A1:${cellRef(size - 1, size - 1)}` : "A1"

    const rowsXml = rows
        .map((row, r) => {
            const cells = row
                .map((color, c) => {
                    if (!color) return ""
                    const style = styleByColor.get(color)
                    if (!style) return ""
                    return `<c r="${cellRef(r, c)}" s="${style}"/>`
                })
                .join("")

            return `<row r="${r + 1}" ht="${formatNumber(rowHeightPt)}" customHeight="1">${cells}</row>`
        })
        .join("")

    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
        `<dimension ref="${dimension}"/>` +
        `<sheetViews><sheetView workbookViewId="0" showGridLines="0" showRowColHeaders="0" zoomScale="${geometry.zoomScale}" zoomScaleNormal="${geometry.zoomScale}"/></sheetViews>` +
        `<sheetFormatPr baseColWidth="1" defaultColWidth="${formatNumber(colWidth)}" defaultRowHeight="${formatNumber(rowHeightPt)}"/>` +
        `<cols><col min="1" max="${Math.max(1, size)}" width="${formatNumber(colWidth)}" customWidth="1"/></cols>` +
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
                `<xf numFmtId="0" fontId="0" fillId="${index + 2}" borderId="0" xfId="0" applyFill="1"/>`
        )
        .join("")

    return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
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

function xmlFile(name: string, xml: string): XlsxFile {
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

function excelCellGeometry(sizeMm: number, gridSize: number) {
    if (!Number.isFinite(sizeMm) || sizeMm <= 0 || gridSize <= 0) {
        return { cellSizePx: MIN_STABLE_DISPLAY_CELL_PX, zoomScale: 100 }
    }

    const targetPx = (sizeMm * SCREEN_PIXELS_PER_MM) / gridSize
    if (targetPx >= MIN_STABLE_DISPLAY_CELL_PX) {
        return { cellSizePx: Math.round(targetPx), zoomScale: 100 }
    }

    const targetDisplayPx = Math.max(1, Math.round(targetPx))
    const zoomScale = Math.max(
        10,
        Math.min(
            100,
            Math.round(
                (targetDisplayPx / MIN_STABLE_DISPLAY_CELL_PX) * 100
            )
        )
    )

    return { cellSizePx: MIN_STABLE_DISPLAY_CELL_PX, zoomScale }
}

function excelColumnWidthForPixels(px: number) {
    if (!Number.isFinite(px) || px <= 0) return 0.1

    // Excel column width is character-based, while row height is point-based.
    // Convert from a shared integer screen-pixel target so the opened sheet is
    // square at 100% zoom; page setup still scales the grid to the print width.
    const width = px <= 12 ? px / 12 : (px - 5) / 7
    return Math.max(0.1, Math.min(255, width))
}

function zipStore(files: XlsxFile[]) {
    const localParts: Uint8Array[] = []
    const centralParts: Uint8Array[] = []
    let offset = 0

    for (const file of files) {
        const nameBytes = new TextEncoder().encode(file.name)
        const crc = crc32(file.bytes)
        const local = createLocalHeader(nameBytes, file.bytes, crc)
        localParts.push(local, file.bytes)

        centralParts.push(
            createCentralHeader(nameBytes, file.bytes, crc, offset)
        )

        offset += local.length + file.bytes.length
    }

    const centralOffset = offset
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
    const end = createEndCentralDirectory(files.length, centralSize, centralOffset)

    return concatUint8Arrays([...localParts, ...centralParts, end])
}

function createLocalHeader(
    nameBytes: Uint8Array,
    bytes: Uint8Array,
    crc: number
) {
    const header = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, bytes.length, true)
    view.setUint32(22, bytes.length, true)
    view.setUint16(26, nameBytes.length, true)
    view.setUint16(28, 0, true)
    header.set(nameBytes, 30)
    return header
}

function createCentralHeader(
    nameBytes: Uint8Array,
    bytes: Uint8Array,
    crc: number,
    localOffset: number
) {
    const header = new Uint8Array(46 + nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 20, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint16(12, 0, true)
    view.setUint16(14, 0, true)
    view.setUint32(16, crc, true)
    view.setUint32(20, bytes.length, true)
    view.setUint32(24, bytes.length, true)
    view.setUint16(28, nameBytes.length, true)
    view.setUint16(30, 0, true)
    view.setUint16(32, 0, true)
    view.setUint16(34, 0, true)
    view.setUint16(36, 0, true)
    view.setUint32(38, 0, true)
    view.setUint32(42, localOffset, true)
    header.set(nameBytes, 46)
    return header
}

function createEndCentralDirectory(
    count: number,
    centralSize: number,
    centralOffset: number
) {
    const header = new Uint8Array(22)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, count, true)
    view.setUint16(10, count, true)
    view.setUint32(12, centralSize, true)
    view.setUint32(16, centralOffset, true)
    view.setUint16(20, 0, true)
    return header
}

function concatUint8Arrays(parts: Uint8Array[]) {
    const total = parts.reduce((sum, part) => sum + part.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

const CRC32_TABLE = makeCrc32Table()

function makeCrc32Table() {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
        let c = i
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[i] = c >>> 0
    }
    return table
}

function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff
    for (const byte of bytes) {
        crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}
