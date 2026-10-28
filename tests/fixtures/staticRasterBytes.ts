const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function pngChunk(type: string, data: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(12 + data.length)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, data.length)
    for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i)
    bytes.set(data, 8)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(4, 8 + data.length)) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0)
    return bytes
}

export function insertPngMarkerPayload(bytes: Uint8Array): Uint8Array {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 33 || !PNG_SIGNATURE.every((value, i) => bytes[i] === value) ||
        view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") {
        throw new Error("Expected PNG with an IHDR first chunk")
    }
    const marker = pngChunk("tEXt", new TextEncoder().encode("Comment\0acTL fcTL fdAT"))
    return Uint8Array.from([...bytes.subarray(0, 33), ...marker, ...bytes.subarray(33)])
}

export function controlledPng(animated: boolean): Uint8Array {
    const header = new Uint8Array(13)
    const view = new DataView(header.buffer)
    view.setUint32(0, 1)
    view.setUint32(4, 1)
    header[8] = 8
    header[9] = 6
    const image = pngChunk("IDAT", Uint8Array.from([120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255]))
    const chunks = [pngChunk("IHDR", header)]
    if (animated) {
        const control = new Uint8Array(8)
        new DataView(control.buffer).setUint32(0, 2)
        chunks.push(pngChunk("acTL", control))
        const firstFrame = new Uint8Array(26)
        const firstView = new DataView(firstFrame.buffer)
        firstView.setUint32(4, 1)
        firstView.setUint32(8, 1)
        chunks.push(pngChunk("fcTL", firstFrame))
    }
    chunks.push(image)
    if (animated) {
        const secondFrame = new Uint8Array(26)
        const secondView = new DataView(secondFrame.buffer)
        secondView.setUint32(0, 1)
        secondView.setUint32(4, 1)
        secondFrame[24] = 0
        secondFrame[25] = 0
        chunks.push(pngChunk("fcTL", secondFrame))
        const compressed = Uint8Array.from([120, 156, 99, 96, 96, 248, 255, 31, 0, 3, 2, 1, 255])
        const frameData = new Uint8Array(4 + compressed.length)
        new DataView(frameData.buffer).setUint32(0, 2)
        frameData.set(compressed, 4)
        chunks.push(pngChunk("fdAT", frameData))
    }
    chunks.push(pngChunk("IEND", new Uint8Array()))
    return Uint8Array.from([...PNG_SIGNATURE, ...chunks.flatMap(chunk => [...chunk])])
}
