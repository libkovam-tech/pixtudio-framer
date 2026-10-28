import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"
import { runRafValidation } from "../../src/plugins/batchPixelation/research/rafValidationSession"

export async function probeFailures(sealed: SealedReference, bytes: number[], kind: "unreadable" | "changed" | "fatal") {
    let scanned = false
    const directory: SourceDirectoryHandle = { kind: "directory", name: "SYNTHETIC_FAILURES", async *values() {
        for (let index = 0; index < 3; index++) {
            const name = `frame${index}.gif`
            let reads = 0
            yield { kind: "file", name, async getFile() {
                reads++
                if (scanned && index === 1 && kind === "unreadable") throw new DOMException("Controlled read failure", "NotReadableError")
                const contents = [...bytes]
                if (scanned && kind === "changed" && reads >= 3) contents[contents.length - 1] ^= 1
                return new File([Uint8Array.from(contents)], name, { type: "image/gif" })
            } }
        }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    scanned = true
    const native = HTMLCanvasElement.prototype.toBlob
    const report = await runRafValidation(sealed, scan, "OFF", () => {
        if (kind === "fatal") throw new Error("Controlled observer failure")
    })
    return { report, nativeRestored: HTMLCanvasElement.prototype.toBlob === native }
}
