import { BatchRunController } from "../../src/plugins/batchPixelation/runner/BatchRunController.ts"
import type { BatchFrameOutput } from "../../src/plugins/batchPixelation/runner/runBatchFrames.ts"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope.ts"
import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet.ts"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory.ts"

async function pixels(frame: BatchFrameOutput) {
    const bitmap = await createImageBitmap(frame.png)
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    try {
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Missing PNG decode context")
        context.drawImage(bitmap, 0, 0)
        return { index: frame.orderIndex, width: bitmap.width, height: bitmap.height,
            rgba: [...context.getImageData(0, 0, bitmap.width, bitmap.height).data] }
    } finally {
        canvas.width = 0; canvas.height = 0; bitmap.close()
    }
}

export async function compareNormalAndCancelled(sealed: SealedReference, bytes: number[], count = 4) {
    const directory: SourceDirectoryHandle = { kind: "directory", name: "EXACTNESS", async *values() {
        for (let index = 0; index < count; index++) {
            const name = `frame${index}.gif`
            yield { kind: "file", name, async getFile() {
                return new File([Uint8Array.from(bytes)], name, { type: "image/gif" })
            } }
        }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    const execute = async (cancel: boolean) => {
        const written: Awaited<ReturnType<typeof pixels>>[] = []
        const controller = new BatchRunController(sealed, scan, async () => ({
            sink: { async writeFrame(frame) { written.push(await pixels(frame)) } }, close() {},
        }))
        if (cancel) controller.subscribe(() => {
            if (controller.getSnapshot().settled === 2) controller.requestCancel()
        })
        const result = await controller.start()
        return { result, written }
    }
    const normal = await execute(false)
    const cancelled = await execute(true)
    return { normal: normal.result, cancelled: cancelled.result,
        comparisons: cancelled.written.map(actual => {
            const expected = normal.written.find(row => row.index === actual.index)
            if (!expected) throw new Error("Completed frame absent in normal run")
            return { index: actual.index, width: actual.width, height: actual.height,
                expectedWidth: expected.width, expectedHeight: expected.height,
                rgbaLength: actual.rgba.length,
                differentBytes: actual.rgba.length !== expected.rgba.length ?
                    Math.max(actual.rgba.length, expected.rgba.length) :
                    actual.rgba.filter((byte, index) => byte !== expected.rgba[index]).length }
        }) }
}
