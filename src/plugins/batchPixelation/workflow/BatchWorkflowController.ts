import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import { createBatchId } from "../batchId.ts"
import type { SourceSetScan } from "../sourceSet/scanSourceSet.ts"
import { BatchRunController } from "../runner/BatchRunController.ts"
import { cleanupConfirmedLegacyBatchOutputs, cleanupOrphanBatchOutputs, createBatchOutputStore, discardBatchOutputs } from "../runner/batchOutputStore.ts"
import { BatchRunOwnership } from "../runner/batchRunOwnership.ts"
import { PackagingController, downloadArchive } from "../packaging/PackagingController.ts"
import { logBatchSaveFailure, saveWithDesktopPicker } from "../packaging/desktopSavePicker.ts"
import { BATCH_TEMPLATE_FILENAME, BatchTemplateError, readBatchTemplate, serializeBatchTemplate,
    validateSealedReference } from "../template/batchTemplate.ts"

export type BatchWorkspace = Readonly<{
    id: string; sealed: SealedReference; scan: SourceSetScan
    runner: BatchRunController; packager: PackagingController; owner?: BatchRunOwnership
}>
export type BatchWorkflowState =
    | Readonly<{ kind: "entry"; error: string | null; storageNotice?: string | null;
        legacyRunIds?: readonly string[]; legacyCleanup?: "idle" | "review" | "cleaning" }>
    | Readonly<{ kind: "opening"; token: number }>
    | Readonly<{ kind: "authoring"; token: number; error: string | null }>
    | Readonly<{ kind: "template-ready"; sealed: SealedReference; notice: string | null }>
    | Readonly<{ kind: "source"; sealed: SealedReference; scan: SourceSetScan | null; token: number; scanning: boolean }>
    | Readonly<{ kind: "workspace"; workspace: BatchWorkspace; disposition: "idle" | "discarding" | "discard-error" }>

type Dependencies = {
    read: typeof readBatchTemplate
    download: (blob: Blob, filename: string) => void | (() => void)
    discard: typeof discardBatchOutputs
    scanOrphans: typeof cleanupOrphanBatchOutputs
    cleanLegacy: typeof cleanupConfirmedLegacyBatchOutputs
    createWorkspace: (sealed: SealedReference, scan: SourceSetScan) => BatchWorkspace
}
const defaults: Dependencies = {
    read: readBatchTemplate, download: downloadArchive, discard: discardBatchOutputs,
    scanOrphans: cleanupOrphanBatchOutputs, cleanLegacy: cleanupConfirmedLegacyBatchOutputs,
    createWorkspace(sealed, scan) {
        const id = createBatchId()
        const owner = new BatchRunOwnership(id)
        return Object.freeze({ id, sealed, scan,
            runner: new BatchRunController(sealed, scan, async () => {
                await owner.acquire()
                return createBatchOutputStore(id)
            }),
            packager: new PackagingController(), owner })
    },
}

/** Workflow owns navigation; Gate 9/10 controllers remain the run/package truth. */
export class BatchWorkflowController {
    private state: BatchWorkflowState = Object.freeze({ kind: "entry", error: null })
    private generation = 0
    private listeners = new Set<() => void>()
    private readingToken: number | null = null
    private running: Promise<unknown> | null = null
    private pendingStorage: Promise<unknown> | null = null
    private hasAuthoringSession = false
    private dependencies: Dependencies
    constructor(dependencies: Partial<Dependencies> = {}) { this.dependencies = { ...defaults, ...dependencies } }
    getSnapshot = () => this.state
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
    private publish(state: BatchWorkflowState) {
        this.state = Object.freeze(state)
        for (const listener of this.listeners) listener()
    }
    scanOrphans = async (): Promise<void> => {
        const generation = this.generation
        try {
            const result = await this.dependencies.scanOrphans()
            if (this.state.kind !== "entry" || this.generation !== generation || this.state.legacyCleanup === "cleaning") return
            const notice = result.legacy.length || result.uncertain.length
                ? "Some older temporary Batch files could not be safely classified and were retained."
                : result.cleaned.length ? "Abandoned temporary Batch files were cleared." : null
            this.publish({ ...this.state, storageNotice: notice, legacyRunIds: result.legacy,
                legacyCleanup: "idle" })
        } catch {
            if (this.state.kind === "entry" && this.generation === generation) this.publish({ ...this.state,
                storageNotice: "Temporary Batch files could not be checked. Existing files were not removed." })
        }
    }
    beginLegacyCleanup = (): boolean => {
        if (this.state.kind !== "entry" || this.state.legacyCleanup !== "idle" || !this.state.legacyRunIds?.length) return false
        this.publish({ ...this.state, legacyCleanup: "review" })
        return true
    }
    cancelLegacyCleanup = (): boolean => {
        if (this.state.kind !== "entry" || this.state.legacyCleanup !== "review") return false
        this.publish({ ...this.state, legacyCleanup: "idle" })
        return true
    }
    confirmLegacyCleanup = async (confirmed: boolean): Promise<boolean> => {
        if (!confirmed || this.state.kind !== "entry" || this.state.legacyCleanup !== "review" ||
            !this.state.legacyRunIds?.length) return false
        const runIds = [...this.state.legacyRunIds]
        const generation = this.generation
        this.publish({ ...this.state, legacyCleanup: "cleaning" })
        try {
            const result = await this.dependencies.cleanLegacy(runIds)
            const current = this.getSnapshot()
            if (current.kind !== "entry" || current.legacyCleanup !== "cleaning" || this.generation !== generation) return false
            const notConfirmed = result.notConfirmed
            this.publish({ ...current, legacyCleanup: "idle", legacyRunIds: notConfirmed,
                storageNotice: notConfirmed.length
                    ? `Cleared ${result.cleaned.length} old temporary runs; ${notConfirmed.length} were not confirmed cleared. Reload to recheck.`
                    : `Cleared ${result.cleaned.length} old temporary runs.` })
            return notConfirmed.length === 0
        } catch {
            const current = this.getSnapshot()
            if (current.kind === "entry" && current.legacyCleanup === "cleaning" && this.generation === generation) this.publish({ ...current,
                legacyCleanup: "idle", storageNotice: "Old temporary files could not be cleared. They were retained; please retry." })
            return false
        }
    }
    configure = (): boolean => {
        if (this.state.kind !== "entry" || (this.state.legacyCleanup && this.state.legacyCleanup !== "idle")) return false
        this.hasAuthoringSession = true
        this.publish({ kind: "authoring", token: ++this.generation, error: null })
        return true
    }
    rejectReference = (message: string): boolean => {
        if (this.state.kind !== "authoring") return false
        this.hasAuthoringSession = false
        ++this.generation
        this.publish({ kind: "entry", error: message })
        return true
    }
    seal = (sealed: SealedReference, token: number): boolean => {
        if (this.state.kind !== "authoring" || this.state.token !== token) return false
        try {
            this.publish({ kind: "template-ready", sealed: validateSealedReference(sealed), notice: null })
            return true
        } catch {
            this.publish({ ...this.state, error: "Template contains invalid recipe settings" })
            return false
        }
    }
    beginOpen = (): number | null => {
        if (this.state.kind !== "entry" || (this.state.legacyCleanup && this.state.legacyCleanup !== "idle")) return null
        this.hasAuthoringSession = false
        const token = ++this.generation
        this.publish({ kind: "opening", token })
        return token
    }
    cancelOpen = (token: number) => {
        if (this.state.kind === "opening" && this.state.token === token) this.publish({ kind: "entry", error: null })
    }
    dismissEntryError = () => {
        if (this.state.kind === "entry" && this.state.error) this.publish({ ...this.state, error: null })
    }
    async open(file: File, token: number): Promise<boolean> {
        if (this.state.kind !== "opening" || this.state.token !== token || this.readingToken === token) return false
        this.readingToken = token
        try {
            const sealed = await this.dependencies.read(file)
            if (this.state.kind !== "opening" || this.state.token !== token) return false
            this.publish({ kind: "template-ready", sealed: validateSealedReference(sealed), notice: null })
            return true
        } catch (error) {
            if (this.state.kind === "opening" && this.state.token === token) {
                this.publish({ kind: "entry", error: error instanceof BatchTemplateError ? error.message :
                    "Template is incomplete or corrupted" })
            }
            return false
        }
    }
    save = async (): Promise<boolean> => {
        if (this.state.kind !== "template-ready") return false
        const state = this.state
        let stage = "preparing recipe"
        try {
            const blob = new Blob([serializeBatchTemplate(state.sealed)], { type: "application/json" })
            stage = "saving recipe"
            const result = await saveWithDesktopPicker(blob, BATCH_TEMPLATE_FILENAME)
            if (result === "unsupported") {
                stage = "starting browser download"
                this.dependencies.download(blob, BATCH_TEMPLATE_FILENAME)
            }
            if (this.state !== state) return false
            this.publish({ ...state, notice: result === "cancelled" ? null : "Template save started" })
            if (result === "cancelled") return false
            return true
        } catch (error) {
            if (stage !== "saving recipe") logBatchSaveFailure("recipe", stage, error)
            if (this.state === state) this.publish({ ...state, notice: "Could not save Template. Template is retained." })
            return false
        }
    }
    saveAuthoringRecipe = async (sealed: SealedReference, token: number): Promise<"saved" | "cancelled" | "failed"> => {
        if (this.state.kind !== "authoring" || this.state.token !== token) return "failed"
        let stage = "validating recipe"
        try {
            const validated = validateSealedReference(sealed)
            stage = "serializing recipe"
            const blob = new Blob([serializeBatchTemplate(validated)], { type: "application/json" })
            stage = "saving recipe"
            const result = await saveWithDesktopPicker(blob, BATCH_TEMPLATE_FILENAME)
            if (this.state.kind !== "authoring" || this.state.token !== token) return "failed"
            if (result === "unsupported") {
                stage = "starting browser download"
                this.dependencies.download(blob, BATCH_TEMPLATE_FILENAME)
            }
            return result === "cancelled" ? "cancelled" : "saved"
        } catch (error) {
            if (stage !== "saving recipe") logBatchSaveFailure("recipe", stage, error)
            return "failed"
        }
    }
    chooseSource = (): boolean => {
        if (this.state.kind !== "template-ready") return false
        this.publish({ kind: "source", sealed: this.state.sealed, scan: null, scanning: false, token: ++this.generation })
        return true
    }
    beginScan = (token: number): boolean => {
        if (this.state.kind !== "source" || this.state.token !== token || this.state.scanning) return false
        this.publish({ ...this.state, scanning: true })
        return true
    }
    acceptScan = (scan: SourceSetScan | null, token: number): boolean => {
        if (this.state.kind !== "source" || this.state.token !== token || !this.state.scanning) return false
        this.publish({ ...this.state, scan })
        return true
    }
    endScan = (token: number) => {
        if (this.state.kind === "source" && this.state.token === token) this.publish({ ...this.state, scanning: false })
    }
    back = (): boolean => {
        if (this.state.kind === "workspace" && this.state.workspace.runner.getSnapshot().status === "idle" && this.state.disposition === "idle") {
            // No output lease is opened until Start Batch.
            ++this.generation
            this.publish({ kind: "template-ready", sealed: this.state.workspace.sealed, notice: null })
            return true
        }
        if (this.state.kind !== "source") return false
        ++this.generation
        this.publish({ kind: "template-ready", sealed: this.state.sealed, notice: null })
        return true
    }
    cancelToAuthoringSafely = async (): Promise<boolean> => {
        const current = this.state
        if (current.kind !== "template-ready" && current.kind !== "source" && current.kind !== "workspace") return false
        if (current.kind === "workspace") {
            if (current.disposition === "discarding") return false
            const w = current.workspace
            this.publish({ ...current, disposition: "discarding" })
            w.runner.requestCancel()
            // A running frame or ZIP build must settle before its output can be removed.
            await Promise.allSettled([this.running, this.pendingStorage].filter((task): task is Promise<unknown> => task !== null))
            if (this.state.kind !== "workspace" || this.state.workspace !== w) return false
            const packageStatus = w.packager.getSnapshot().status
            const needsDiscard = w.runner.getSnapshot().status !== "idle" &&
                packageStatus !== "ready" && packageStatus !== "download-triggered"
            if (needsDiscard) {
                const task = Promise.resolve().then(() => this.dependencies.discard(w.id))
                this.pendingStorage = task
                try {
                    await task
                } catch {
                    if (this.state.kind === "workspace" && this.state.workspace === w)
                        this.publish({ ...this.state, disposition: "discard-error" })
                    return false
                } finally {
                    if (this.pendingStorage === task) this.pendingStorage = null
                }
            }
            if (this.state.kind !== "workspace" || this.state.workspace !== w) return false
            w.owner?.release()
            w.packager.release()
            this.running = null
        }
        ++this.generation
        this.publish(this.hasAuthoringSession
            ? { kind: "authoring", token: this.generation, error: null }
            : { kind: "entry", error: null })
        return true
    }
    continueSource = (): boolean => {
        if (this.state.kind !== "source" || this.state.scanning || !this.state.scan ||
            this.state.scan.manifest.overallStatus === "blocked-reference-geometry") return false
        const workspace = this.dependencies.createWorkspace(this.state.sealed, this.state.scan)
        this.publish({ kind: "workspace", workspace, disposition: "idle" })
        return true
    }
    startRun = (): boolean => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "idle" || this.state.workspace.runner.getSnapshot().status !== "idle") return false
        this.running = this.state.workspace.runner.start()
        return true
    }
    cancelRun = (): boolean => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "idle") return false
        return this.state.workspace.runner.requestCancel()
    }
    startSelectedRun = (): boolean => {
        if (this.state.kind !== "source" || this.state.scanning || this.state.scan?.manifest.overallStatus !== "ready" ||
            this.state.scan.manifest.counts.processable === 0) return false
        if (!this.continueSource()) return false
        return this.startRun()
    }
    package = async (): Promise<boolean> => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "idle") return false
        const { workspace: w } = this.state
        if (!["idle", "packaging-error"].includes(w.packager.getSnapshot().status)) return false
        const terminal = w.runner.getResult()
        if (!terminal) return false
        const task = w.packager.start({ runId: w.id, terminal, manifest: w.scan.manifest, sealed: w.sealed })
        this.pendingStorage = task
        const done = await task
        if (this.pendingStorage === task) this.pendingStorage = null
        if (done) w.owner?.release()
        return done
    }
    retryCleanup = async (): Promise<boolean> => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "idle") return false
        const w = this.state.workspace
        if (w.packager.getSnapshot().status !== "cleanup-error") return false
        const task = w.packager.retryCleanup(w.id)
        this.pendingStorage = task
        const done = await task
        if (this.pendingStorage === task) this.pendingStorage = null
        if (done) w.owner?.release()
        return done
    }
    downloadPrepared = async (): Promise<"saved" | "cancelled" | "failed"> =>
        this.state.kind === "workspace" && this.state.disposition === "idle"
            ? this.state.workspace.packager.downloadPrepared() : "failed"
    discard = async (): Promise<boolean> => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "idle") return false
        const w = this.state.workspace
        if (["running", "cancelling"].includes(w.runner.getSnapshot().status) ||
            ["packaging", "archive-ready-pending-cleanup", "cleaning"].includes(w.packager.getSnapshot().status)) return false
        this.publish({ ...this.state, disposition: "discarding" })
        const task = this.dependencies.discard(w.id)
        this.pendingStorage = task
        try {
            await task
            if (this.pendingStorage === task) this.pendingStorage = null
            if (this.state.kind !== "workspace" || this.state.workspace !== w) return false
            w.owner?.release()
            w.packager.release()
            this.publish({ kind: "template-ready", sealed: w.sealed, notice: null })
            return true
        } catch {
            if (this.pendingStorage === task) this.pendingStorage = null
            if (this.state.kind === "workspace" && this.state.workspace === w) this.publish({ ...this.state, disposition: "discard-error" })
            return false
        }
    }
    retryDiscard = async (): Promise<boolean> => {
        if (this.state.kind !== "workspace" || this.state.disposition !== "discard-error") return false
        this.publish({ ...this.state, disposition: "idle" })
        return this.discard()
    }
    startOver = (): boolean => {
        if (this.state.kind === "entry" && this.state.legacyCleanup === "cleaning") return false
        if (this.state.kind === "workspace" && (this.state.disposition !== "idle" || this.state.workspace.runner.getSnapshot().status !== "idle")) {
            return false // Discard stored outputs explicitly after a started run.
        }
        ++this.generation
        this.hasAuthoringSession = false
        this.publish({ kind: "entry", error: null })
        return true
    }
    startOverSafely = async (): Promise<boolean> => {
        if (this.state.kind !== "workspace") return this.startOver()
        const current = this.state
        const w = current.workspace
        const packageStatus = w.packager.getSnapshot().status
        if ((current.disposition !== "idle" && current.disposition !== "discard-error") ||
            ["packaging", "archive-ready-pending-cleanup", "cleaning"].includes(packageStatus)) return false
        this.publish({ ...current, disposition: "discarding" })
        if (["running", "cancelling"].includes(w.runner.getSnapshot().status)) {
            w.runner.requestCancel()
            try { await this.running } catch {
                this.publish({ ...current, disposition: "discard-error" })
                return false
            }
        }
        const task = this.dependencies.discard(w.id)
        this.pendingStorage = task
        try {
            await task
            if (this.state.kind !== "workspace" || this.state.workspace !== w) return false
            w.owner?.release()
            w.packager.release()
            ++this.generation
            this.hasAuthoringSession = false
            this.publish({ kind: "entry", error: null })
            return true
        } catch {
            if (this.state.kind === "workspace" && this.state.workspace === w) {
                this.publish({ ...this.state, disposition: "discard-error" })
            }
            return false
        } finally {
            if (this.pendingStorage === task) this.pendingStorage = null
        }
    }
    dispose = () => {
        if (this.state.kind === "workspace") {
            const w = this.state.workspace
            w.runner.requestCancel()
            const pending = [this.running, this.pendingStorage].filter((task): task is Promise<unknown> => task !== null)
            void Promise.allSettled(pending).then(() => { w.owner?.release(); w.packager.release() })
        }
        ++this.generation
        this.hasAuthoringSession = false
        this.state = Object.freeze({ kind: "entry", error: null })
        this.listeners.clear()
    }
}
