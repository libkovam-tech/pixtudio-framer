import { describe, expect, it } from "vitest"

import { zipStore } from "./zipStore.ts"

const ZIP_UTF8_FILE_NAMES_FLAG = 0x0800

describe("zipStore", () => {
    it("marks non-ascii entry names as UTF-8 for Windows ZIP readers", () => {
        const bytes = zipStore([
            { name: "Пример.png", bytes: new Uint8Array([1, 2, 3]) },
        ])

        expect(readUint32LE(bytes, 0)).toBe(0x04034b50)
        expect(readUint16LE(bytes, 6) & ZIP_UTF8_FILE_NAMES_FLAG).toBe(
            ZIP_UTF8_FILE_NAMES_FLAG
        )
        expect(readLocalEntryName(bytes, 0)).toBe("Пример.png")

        const centralOffset = findSignature(bytes, 0x02014b50)
        expect(centralOffset).toBeGreaterThan(0)
        expect(
            readUint16LE(bytes, centralOffset + 8) & ZIP_UTF8_FILE_NAMES_FLAG
        ).toBe(ZIP_UTF8_FILE_NAMES_FLAG)
    })
})

function readLocalEntryName(bytes: Uint8Array, offset: number) {
    const fileNameLength = readUint16LE(bytes, offset + 26)
    const nameStart = offset + 30
    const nameEnd = nameStart + fileNameLength
    return new TextDecoder().decode(bytes.subarray(nameStart, nameEnd))
}

function findSignature(bytes: Uint8Array, signature: number) {
    for (let offset = 0; offset <= bytes.length - 4; offset++) {
        if (readUint32LE(bytes, offset) === signature) return offset
    }
    return -1
}

function readUint16LE(bytes: Uint8Array, offset: number) {
    return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32LE(bytes: Uint8Array, offset: number) {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    )
}
