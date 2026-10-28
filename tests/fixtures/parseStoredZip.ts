// Independent test-side ZIP32 reader; bitwise CRC, no writer imports/table.
function crc32(bytes: Uint8Array): number {
    let value = 0xffffffff
    for (const byte of bytes) {
        value ^= byte
        for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
    }
    return (value ^ 0xffffffff) >>> 0
}
export function parseStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const end = bytes.length - 22
    if (end < 0 || view.getUint32(end, true) !== 0x06054b50 ||
        view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0 ||
        view.getUint16(end + 20, true) !== 0) throw new Error("Invalid ZIP end record")
    const count = view.getUint16(end + 10, true)
    if (view.getUint16(end + 8, true) !== count) throw new Error("Invalid ZIP count")
    let central = view.getUint32(end + 16, true)
    if (central + view.getUint32(end + 12, true) !== end) throw new Error("Invalid directory size")
    const entries = new Map<string, Uint8Array>()
    let expectedLocal = 0
    for (let index = 0; index < count; index++) {
        if (view.getUint32(central, true) !== 0x02014b50 || view.getUint16(central + 10, true) !== 0 ||
            view.getUint16(central + 8, true) !== 0x0800) throw new Error("Invalid central entry")
        const size = view.getUint32(central + 24, true)
        const nameLength = view.getUint16(central + 28, true)
        const nameBytes = bytes.subarray(central + 46, central + 46 + nameLength)
        const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes)
        const local = view.getUint32(central + 42, true)
        if (local !== expectedLocal || view.getUint32(local, true) !== 0x04034b50 ||
            view.getUint16(local + 8, true) !== 0 || view.getUint16(local + 6, true) !== 0x0800 ||
            view.getUint32(local + 18, true) !== size || view.getUint32(local + 22, true) !== size ||
            view.getUint32(central + 20, true) !== size || view.getUint16(local + 26, true) !== nameLength ||
            nameBytes.some((byte, index) => byte !== bytes[local + 30 + index])) {
            throw new Error("ZIP local/central mismatch")
        }
        const start = local + 30 + nameLength + view.getUint16(local + 28, true)
        const payload = bytes.slice(start, start + size)
        if (payload.length !== size || crc32(payload) !== view.getUint32(central + 16, true) ||
            crc32(payload) !== view.getUint32(local + 14, true) || entries.has(name)) throw new Error("ZIP CRC or identity mismatch")
        entries.set(name, payload)
        expectedLocal = start + size
        central += 46 + nameLength + view.getUint16(central + 30, true) + view.getUint16(central + 32, true)
    }
    if (central !== end || expectedLocal !== view.getUint32(end + 16, true)) throw new Error("ZIP layout mismatch")
    return entries
}
