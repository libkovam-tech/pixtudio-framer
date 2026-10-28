import * as React from "react"
import type { BatchRunController } from "./runner/BatchRunController.ts"

export function BatchRunPanel({ controller, onStart }: { controller: BatchRunController; onStart?: () => void }) {
    const progress = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    React.useEffect(() => () => { controller.requestCancel() }, [controller])
    const labels = { idle: "Ready", running: "Running", cancelling: "Cancelling...",
        completed: "Completed", cancelled: "Cancelled", failed: "Failed" }
    const terminal = controller.getResult()
    return <section aria-label="Batch run" style={{ width: "min(420px, 100%)" }}>
        <h2 style={{ fontSize: 20 }}>{labels[progress.status]}</h2>
        <progress aria-label="Batch progress" max={1} value={progress.ratio}
            style={{ width: "100%", height: 20 }} />
        <p aria-live="polite">Processed: {progress.settled} / {progress.totalPlanned}</p>
        <p>Succeeded: {progress.succeeded} | Skipped: {progress.skipped} | Failed: {progress.failed}</p>
        {progress.sourceSetExcluded > 0 && <p>Excluded during scan: {progress.sourceSetExcluded}</p>}
        {progress.current && <p style={{ overflowWrap: "anywhere" }}>Current: {progress.current.filename}</p>}
        {terminal && <p>Not processed: {progress.notProcessed}</p>}
        {terminal?.fatalReason && <p role="alert">{terminal.fatalReason}</p>}
        {progress.status === "idle" && <button type="button" onClick={() => { if (onStart) onStart(); else void controller.start() }}>
            Start Batch
        </button>}
        {(progress.status === "running" || progress.status === "cancelling") &&
            <button type="button" disabled={!progress.canCancel} onClick={controller.requestCancel}>
                {progress.cancellationRequested ? "Cancelling..." : "Cancel"}
            </button>}
        <output data-testid="batch-run-progress" hidden>{JSON.stringify(progress)}</output>
        <output data-testid="batch-run-result" hidden>{terminal ? JSON.stringify(terminal) : ""}</output>
    </section>
}
