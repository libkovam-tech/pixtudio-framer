import { openBatchOutputReader, type BatchOutputReader } from "../runner/batchOutputStore.ts"
import { batchReport, type ArchiveContext } from "./batchReport.ts"
import { assertArchiveName, ZipArchive } from "./zipArchive.ts"

export type PackagingProgress = Readonly<{
    status: "idle" | "packaging" | "packaging-error" | "archive-ready-pending-cleanup" |
        "cleaning" | "cleanup-error" | "ready" | "download-triggered"
    stage: "Preparing report" | "Packaging" | "Building archive" | "Cleaning temporary files" | "Ready"
    packaged: number
    total: number
}>

export async function packageBatch(context: ArchiveContext,
    notify: (stage: PackagingProgress["stage"], packaged: number) => void,
    open: (id: string) => Promise<BatchOutputReader> = openBatchOutputReader,
    writer = new ZipArchive()): Promise<Blob> {
    const { terminal: run, manifest, runId } = context
    const successes = run.outcomes.filter(row => row.status === "succeeded")
    const p = run.progress
    if (p.totalPlanned !== manifest.processable.length || p.settled !== run.outcomes.length ||
        p.succeeded !== successes.length || p.failed !== run.outcomes.length - successes.length ||
        p.notProcessed !== p.totalPlanned - p.settled || p.skipped !== 0 ||
        run.status !== p.status || (run.status === "completed" && p.notProcessed !== 0)) {
        throw new Error("Inconsistent terminal result")
    }
    for (const [index, outcome] of run.outcomes.entries()) {
        const plan = manifest.processable[index]
        if (!plan || plan.orderIndex !== outcome.orderIndex || plan.filename !== outcome.sourceFilename ||
            plan.outputName !== outcome.outputName) throw new Error("Outcome does not match run plan")
        assertArchiveName(outcome.outputName)
        if (!outcome.outputName.endsWith(".png")) throw new Error("Invalid PNG output name")
    }
    let reader: BatchOutputReader | undefined
    try {
        notify("Preparing report", 0)
        reader = await open(runId)
        const keys = await reader.keys()
        if (keys.length !== successes.length || keys.some((key, index) =>
            !Array.isArray(key) || key.length !== 2 || key[0] !== runId || key[1] !== successes[index].orderIndex)) {
            throw new Error("Staged outputs do not match successful outcomes")
        }
        await writer.append("batch_report.txt", new Blob([batchReport(context)], { type: "text/plain;charset=utf-8" }))
        notify("Packaging", 0)
        for (const [index, outcome] of successes.entries()) {
            const row = await reader.read(outcome.orderIndex)
            if (!row || row.runId !== runId || row.orderIndex !== outcome.orderIndex ||
                row.sourceFilename !== outcome.sourceFilename || row.outputName !== outcome.outputName ||
                row.width !== outcome.outputGeometry?.width || row.height !== outcome.outputGeometry?.height ||
                !(row.png instanceof Blob) || row.png.type !== "image/png" || row.png.size !== outcome.pngBytes ||
                row.png.size === 0) throw new Error("Staged output metadata is inconsistent")
            await writer.append(row.outputName, row.png)
            notify("Packaging", index + 1)
        }
        // Detect insertions/deletions during packaging as well as initial corruption.
        const finalKeys = await reader.keys()
        if (JSON.stringify(finalKeys) !== JSON.stringify(keys)) throw new Error("Staged outputs changed")
        notify("Building archive", successes.length)
        return writer.finish()
    } finally { reader?.close(); writer.release() }
}
