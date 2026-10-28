import type { BatchTerminalResult } from "../runner/BatchRunController.ts"
import type { SourceSetManifest } from "../sourceSet/scanSourceSet.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"

export type ArchiveContext = Readonly<{
    runId: string
    terminal: BatchTerminalResult
    manifest: SourceSetManifest
    sealed: SealedReference
}>

// Metadata contains display names only. Defensively strip any path supplied by
// a malformed caller; JSON quoting prevents filenames forging report sections.
export function displayName(name: string): string {
    return name.split(/[\\/]/).at(-1)!.replace(/^[A-Za-z]:/, "")
}
const quoted = (name: string) => [...JSON.stringify(displayName(name))].map(char => {
    const code = char.charCodeAt(0)
    return (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029
        ? `\\u${code.toString(16).padStart(4, "0")}` : char
}).join("")
export const statusLabel = (status: BatchTerminalResult["status"]) =>
    ({ completed: "Completed", cancelled: "Cancelled", failed: "Failed" })[status]

export function archiveFilename(context: ArchiveContext): string {
    const folder = displayName(context.manifest.folderDisplayName)
        .replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "frames"
    const timestamp = context.terminal.finishedAt.replace(/[^0-9TZ]/g, "")
    return `PIXTUDIO_${folder}_${statusLabel(context.terminal.status)}_${timestamp}.zip`
}

export function batchReport(context: ArchiveContext): string {
    const { terminal: run, manifest: source, sealed } = context
    const p = run.progress
    const geometry = (value: { width: number; height: number } | null) =>
        value ? `${value.width} x ${value.height}` : "Not available"
    const output = run.outcomes.find(row => row.status === "succeeded")?.outputGeometry
    const lines = ["PIXTUDIO Batch Pixelation Report", "", "[Run]",
        `Status: ${statusLabel(run.status)}`, `Started: ${JSON.stringify(run.startedAt)}`,
        `Finished: ${JSON.stringify(run.finishedAt)}`, "", "[Reference / Recipe]",
        `Reference Input Geometry: ${geometry(sealed.referenceInputGeometry)}`,
        `Output Geometry: ${geometry(output ?? null)}`,
        `Recipe version: ${sealed.recipe.version}`, `Render semantics: ${JSON.stringify(sealed.recipe.pipeline)}`,
        "", "[Source Set]", `Folder: ${quoted(source.folderDisplayName)}`,
        `Candidates: ${source.counts.candidates}`, `Processable: ${source.counts.processable}`,
        `Excluded during scan: ${source.counts.skipped}`, `Collisions: ${source.counts.collisions}`,
        `Source Geometry: ${geometry(source.sourceGeometry)}`, "", "[Run Summary]",
        `Total planned: ${p.totalPlanned}`, `Processed: ${p.settled} / ${p.totalPlanned}`,
        `Succeeded: ${p.succeeded}`, `Runtime failed: ${p.failed}`, `Not processed: ${p.notProcessed}`,
        `Status: ${statusLabel(run.status)}`, "", "[Scan Exclusions]",
        ...source.skipped.map(row => `${quoted(row.filename)}: ${JSON.stringify(row.reason)}`),
        "", "[Collisions]", ...source.collisions.map(row =>
            `${quoted(row.outputName)}: winner ${quoted(row.winnerFilename)} (${row.winnerIndex}); loser ${quoted(row.skippedFilename)} (${row.skippedIndex})`),
        "", "[Runtime Failures]", ...run.outcomes.filter(row => row.status === "failed")
            .map(row => `${quoted(row.sourceFilename)}: ${JSON.stringify(row.reason)}`)]
    if (run.status === "cancelled") {
        const next = source.processable[p.settled]
        lines.push("", "[Cancellation]", `Processed: ${p.settled}`, `Not processed: ${p.notProcessed}`)
        if (next) lines.push(`First not-processed index: ${next.orderIndex}`, `First not-processed filename: ${quoted(next.filename)}`)
    }
    if (run.status === "failed") lines.push("", "[Fatal Run Error]",
        "Reason: The batch could not finish safely. Completed outputs are retained.")
    lines.push("", "[Packaging]", `PNG entries: ${p.succeeded}`, `Report-only: ${p.succeeded === 0 ? "yes" : "no"}`, "")
    return lines.join("\n")
}
