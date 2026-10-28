import type { BatchWorkflowState } from "./workflow/BatchWorkflowController.ts"
import type { BatchProgress } from "./runner/BatchRunController.ts"
import type { PackagingProgress } from "./packaging/packageBatch.ts"

export type BatchActionState = Readonly<{
    choose: boolean
    cancel: boolean
    start: boolean
    prepare: boolean
    startOver: boolean
    prepareLabel: string
}>

export function batchActionState(
    state: BatchWorkflowState,
    progress: BatchProgress | null,
    packaging: PackagingProgress | null,
    released: boolean,
): BatchActionState {
    const base = { choose: false, cancel: false, start: false, prepare: false,
        startOver: true, prepareLabel: "Prepare and Download ZIP" }
    if (state.kind === "source") {
        return { ...base, choose: !state.scanning, cancel: true,
            start: !state.scanning && state.scan?.manifest.overallStatus === "ready" &&
                state.scan.manifest.counts.processable > 0 }
    }
    if (state.kind === "template-ready") return { ...base, cancel: true }
    if (state.kind !== "workspace" || !progress || !packaging) return base
    const busy = ["packaging", "archive-ready-pending-cleanup", "cleaning"].includes(packaging.status)
    if (state.disposition !== "idle") return { ...base, cancel: state.disposition === "discard-error",
        startOver: state.disposition === "discard-error" }
    if (progress.status === "running" || progress.status === "cancelling") {
        return { ...base, cancel: progress.canCancel, startOver: true }
    }
    if (progress.status === "idle") return { ...base, cancel: true, start: true, startOver: true }
    if (busy) return { ...base, cancel: true, startOver: false }
    if (packaging.status === "packaging-error") {
        return { ...base, cancel: true, prepare: true, prepareLabel: "Retry Packaging" }
    }
    if (packaging.status === "cleanup-error") {
        return { ...base, cancel: true, prepare: true, prepareLabel: "Retry Cleanup" }
    }
    if (packaging.status === "ready" || packaging.status === "download-triggered") {
        return { ...base, cancel: true, prepare: true, prepareLabel: released ? "Download again" : "Prepare and Download ZIP" }
    }
    return { ...base, cancel: true, prepare: true }
}
