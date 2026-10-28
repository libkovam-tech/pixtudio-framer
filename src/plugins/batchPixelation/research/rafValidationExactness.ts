import { decodeAndValidateRasterImageFile } from "../../../editor/fileIntakeSecurity.ts"
import { assertStaticBatchRasterFile } from "../staticRasterPolicy.ts"
import type { SourceFileHandle } from "../sourceSet/sourceDirectory.ts"
import { renderFinalFrame } from "../render/finalFrame.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import { sha256 } from "./rafValidationEvidence.ts"

export type ExactnessSample = {
    orderIndex: number; source: File; handle: SourceFileHandle; png: Blob
}

export async function verifyExactnessSample(sample: ExactnessSample, sealed: SealedReference) {
    let sourceBitmap: ImageBitmap | null = null
    let outputBitmap: ImageBitmap | null = null
    let direct: HTMLCanvasElement | null = null
    let output: HTMLCanvasElement | null = null
    try {
        const originalHash = await sha256(await sample.source.arrayBuffer())
        const current = await sample.handle.getFile()
        const currentHash = await sha256(await current.arrayBuffer())
        if (current.name !== sample.source.name || currentHash !== originalHash) {
            return { orderIndex: sample.orderIndex, status: "INVALID_SOURCE_CHANGED", sourceSha256: originalHash }
        }
        await assertStaticBatchRasterFile(sample.source)
        sourceBitmap = await decodeAndValidateRasterImageFile(sample.source)
        direct = renderFinalFrame(sourceBitmap, sealed.recipe)
        // Release the decoded source before decoding the sampled output.
        sourceBitmap.close()
        sourceBitmap = null
        outputBitmap = await createImageBitmap(sample.png)
        output = document.createElement("canvas")
        output.width = outputBitmap.width
        output.height = outputBitmap.height
        const context = output.getContext("2d")
        const directContext = direct.getContext("2d")
        if (!context || !directContext) throw new Error("Exactness canvas unavailable")
        context.drawImage(outputBitmap, 0, 0)
        const actual = context.getImageData(0, 0, output.width, output.height).data
        const expected = directContext.getImageData(0, 0, direct.width, direct.height).data
        const dimensionsMatch = output.width === direct.width && output.height === direct.height
        let differentBytes = Math.abs(actual.length - expected.length)
        for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
            if (actual[i] !== expected[i]) differentBytes++
        }
        return { orderIndex: sample.orderIndex, status: dimensionsMatch && differentBytes === 0 ? "PASS" : "FAIL",
            sourceSha256: originalHash, width: output.width, height: output.height,
            directWidth: direct.width, directHeight: direct.height,
            rgbaLength: actual.length, directRgbaLength: expected.length, differentBytes }
    } catch (error) {
        return { orderIndex: sample.orderIndex, status: "NOT_VERIFIED",
            reason: error instanceof Error ? error.message : "Sample verification failed" }
    } finally {
        sourceBitmap?.close()
        outputBitmap?.close()
        for (const canvas of [direct, output]) if (canvas) { canvas.width = 0; canvas.height = 0 }
    }
}
