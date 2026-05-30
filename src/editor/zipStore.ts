export type ZipStoreFile = {
    name: string
    bytes: Uint8Array
}

// Store-only ZIP writer for browser-generated exports; XLSX already uses
// zipped XML, so keeping this local avoids another runtime dependency.
export function zipStore(files: ZipStoreFile[]) {
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
