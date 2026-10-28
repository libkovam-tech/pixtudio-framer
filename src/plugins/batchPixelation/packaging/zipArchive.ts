const MAX32 = 0xffffffff
const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let crc = index
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    return crc >>> 0
})

export function assertArchiveName(name: string): void {
    const encoded = encoder.encode(name)
    if (!name || name === "." || name === ".." || /[\\/:]/.test(name) ||
        [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
        encoded.length > 65535 || new TextDecoder("utf-8", { fatal: true }).decode(encoded) !== name) {
        throw new Error("Unsafe archive entry name")
    }
}

// Blob parts are archive storage, not retained PNG ArrayBuffers. ZIP32 limits
// fail explicitly rather than emitting a truncated archive; ZIP64 is not used.
export class ZipArchive {
    private parts: Blob[] = []
    private directory: Uint8Array<ArrayBuffer>[] = []
    private names = new Set<string>()
    private offset = 0

    async append(name: string, payload: Blob): Promise<void> {
        assertArchiveName(name)
        const encoded = encoder.encode(name)
        if (this.names.has(name) || this.names.size >= 65535 || payload.size > MAX32 ||
            this.offset + 30 + encoded.length + payload.size > MAX32) {
            throw new Error("Archive entry or size limit is invalid")
        }
        const bytes = new Uint8Array(await payload.arrayBuffer())
        let crc = 0xffffffff
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
        crc = (crc ^ 0xffffffff) >>> 0
        const local = new Uint8Array(30 + encoded.length)
        const lv = new DataView(local.buffer)
        lv.setUint32(0, 0x04034b50, true)
        lv.setUint16(4, 20, true)
        lv.setUint16(6, 0x0800, true)
        lv.setUint16(12, 33, true) // Valid fixed DOS date: 1980-01-01.
        lv.setUint32(14, crc, true)
        lv.setUint32(18, bytes.length, true)
        lv.setUint32(22, bytes.length, true)
        lv.setUint16(26, encoded.length, true)
        local.set(encoded, 30)
        const central = new Uint8Array(46 + encoded.length)
        const cv = new DataView(central.buffer)
        cv.setUint32(0, 0x02014b50, true)
        cv.setUint16(4, 20, true)
        cv.setUint16(6, 20, true)
        cv.setUint16(8, 0x0800, true)
        cv.setUint16(14, 33, true)
        cv.setUint32(16, crc, true)
        cv.setUint32(20, bytes.length, true)
        cv.setUint32(24, bytes.length, true)
        cv.setUint16(28, encoded.length, true)
        cv.setUint32(42, this.offset, true)
        central.set(encoded, 46)
        // Copy the payload into the archive before its IndexedDB record is removed.
        // Firefox may otherwise lose the backing file while downloading the ZIP.
        this.parts.push(new Blob([local]), new Blob([bytes]))
        this.directory.push(central)
        this.names.add(name)
        this.offset += local.length + bytes.length
    }

    finish(): Blob {
        const size = this.directory.reduce((sum, entry) => sum + entry.length, 0)
        if (this.offset + size + 22 > MAX32) throw new Error("Archive exceeds ZIP32 limits")
        const end = new Uint8Array(22)
        const view = new DataView(end.buffer)
        view.setUint32(0, 0x06054b50, true)
        view.setUint16(8, this.names.size, true)
        view.setUint16(10, this.names.size, true)
        view.setUint32(12, size, true)
        view.setUint32(16, this.offset, true)
        const archive = new Blob([...this.parts, ...this.directory, end], { type: "application/zip" })
        this.release()
        return archive
    }

    release(): void {
        this.parts = []
        this.directory = []
        this.names.clear()
        this.offset = 0
    }
}
