import { archiveFilename, type ArchiveContext } from "./batchReport.ts"
import { packageBatch, type PackagingProgress } from "./packageBatch.ts"
import { discardBatchOutputs } from "../runner/batchOutputStore.ts"
import { logBatchSaveFailure, saveWithDesktopPicker } from "./desktopSavePicker.ts"

export function downloadArchive(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    let anchor: HTMLAnchorElement | undefined
    try {
        anchor = document.createElement("a")
        anchor.href = url
        anchor.download = filename
        document.body.append(anchor)
        anchor.click()
    } catch (error) {
        URL.revokeObjectURL(url)
        throw error
    } finally {
        anchor?.remove()
    }
    // The browser exposes no completion event for an anchor download. Keep the
    // URL alive until document unload so Firefox can finish reading large ZIPs.
}

export class PackagingController {
    private listeners = new Set<() => void>()
    private state: PackagingProgress = Object.freeze({ status: "idle", stage: "Preparing report", packaged: 0, total: 0 })
    private archive: Blob | null = null
    private filename: string | null = null
    private saving = false
    getSnapshot = () => this.state
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
    private readonly build: typeof packageBatch
    private readonly download: typeof downloadArchive
    private readonly cleanup: typeof discardBatchOutputs
    constructor(build = packageBatch, download = downloadArchive, cleanup = discardBatchOutputs) {
        this.build = build
        this.download = download
        this.cleanup = cleanup
    }
    private publish(state: PackagingProgress) {
        this.state = Object.freeze(state)
        for (const listener of this.listeners) listener()
    }
    async start(context: ArchiveContext): Promise<boolean> {
        if (this.state.status !== "idle" && this.state.status !== "packaging-error") return false
        const total = context.terminal.progress.succeeded
        this.publish({ status: "packaging", stage: "Preparing report", packaged: 0, total })
        try {
            const archive = await this.build(context, (stage, packaged) => {
                if (packaged < this.state.packaged || packaged > total) throw new Error("Invalid packaging progress")
                this.publish({ status: "packaging", stage, packaged, total })
            })
            this.archive = archive
            this.filename = archiveFilename(context)
            this.publish({ ...this.state, status: "archive-ready-pending-cleanup" })
        } catch {
            this.publish({ ...this.state, status: "packaging-error" })
            return false
        }
        return this.clean(context.runId)
    }
    private async clean(runId: string): Promise<boolean> {
        if (!this.archive) return false
        this.publish({ ...this.state, status: "cleaning", stage: "Cleaning temporary files" })
        try {
            await this.cleanup(runId)
            this.publish({ ...this.state, status: "ready", stage: "Ready" })
            return true
        } catch {
            this.publish({ ...this.state, status: "cleanup-error" })
            return false
        }
    }
    retryCleanup(runId: string): Promise<boolean> {
        if (this.state.status !== "cleanup-error") return Promise.resolve(false)
        return this.clean(runId)
    }
    async downloadPrepared(): Promise<"saved" | "cancelled" | "failed"> {
        if ((this.state.status !== "ready" && this.state.status !== "download-triggered") ||
            !this.archive || !this.filename || this.saving) return "failed"
        const archive = this.archive
        const filename = this.filename
        this.saving = true
        let stage = "saving ZIP"
        try {
            const result = await saveWithDesktopPicker(archive, filename)
            if (this.archive !== archive) return "failed"
            if (result === "cancelled") return "cancelled"
            stage = "starting browser download"
            if (result === "unsupported") this.download(archive, filename)
            this.publish({ ...this.state, status: "download-triggered" })
            return "saved"
        } catch (error) {
            if (stage !== "saving ZIP") logBatchSaveFailure("ZIP", stage, error)
            return "failed"
        }
        finally { this.saving = false }
    }
    release(): void {
        this.archive = null
        this.filename = null
    }
}
