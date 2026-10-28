import { describe, expect, it } from "vitest"
import { batchActionState } from "./batchUiState.ts"
import type { BatchWorkflowState, BatchWorkspace } from "./workflow/BatchWorkflowController.ts"
import type { BatchProgress } from "./runner/BatchRunController.ts"
import type { PackagingProgress } from "./packaging/packageBatch.ts"
import { batchTemplateFixture } from "../../../tests/fixtures/batchTemplateFixture.ts"

const sealed = batchTemplateFixture()
const sourceBase = { kind: "source", sealed, token: 1, scanning: false } as const
const scanBase = { manifest: { overallStatus: "ready", counts: { processable: 3 } } }
const idlePackage: PackagingProgress = { status: "idle", stage: "Preparing report", packaged: 0, total: 0 }
const progress = { status: "completed", canCancel: false } as BatchProgress
const workspace = { kind: "workspace", disposition: "idle", workspace: {} as BatchWorkspace } as const

describe("Gate 14 action matrix", () => {
    it("requires a scanned, nonempty valid source", () => {
        expect(batchActionState({ ...sourceBase, scan: null }, null, null, false).start).toBe(false)
        expect(batchActionState({ ...sourceBase, scan: null }, null, null, false).cancel).toBe(true)
        expect(batchActionState({ ...sourceBase, scanning: true, scan: scanBase } as unknown as BatchWorkflowState,
            null, null, false).start).toBe(false)
        expect(batchActionState({ ...sourceBase, scanning: true, scan: scanBase } as unknown as BatchWorkflowState,
            null, null, false).cancel).toBe(true)
        expect(batchActionState({ ...sourceBase, scan: { manifest: { ...scanBase.manifest,
            counts: { processable: 0 } } } } as unknown as BatchWorkflowState, null, null, false).start).toBe(false)
        expect(batchActionState({ ...sourceBase, scan: scanBase } as unknown as BatchWorkflowState,
            null, null, false).start).toBe(true)
    })
    it("locks download through packaging and cleanup, then retains one released result", () => {
        expect(batchActionState({ kind: "template-ready", sealed, notice: null }, null, null, false).cancel).toBe(true)
        expect(batchActionState(workspace, progress, idlePackage, false).prepare).toBe(true)
        expect(batchActionState(workspace, progress, { ...idlePackage, status: "cleaning" }, false).prepare).toBe(false)
        expect(batchActionState(workspace, progress, { ...idlePackage, status: "cleaning" }, false).cancel).toBe(true)
        expect(batchActionState({ ...workspace, disposition: "discarding" }, progress, idlePackage, false).cancel).toBe(false)
        expect(batchActionState({ ...workspace, disposition: "discard-error" }, progress, idlePackage, false).cancel).toBe(true)
        expect(batchActionState(workspace, progress, { ...idlePackage, status: "cleanup-error" }, false)
            .prepareLabel).toBe("Retry Cleanup")
        expect(batchActionState(workspace, progress, { ...idlePackage, status: "ready" }, false)
            .prepareLabel).toBe("Prepare and Download ZIP")
        expect(batchActionState(workspace, progress, { ...idlePackage, status: "download-triggered" }, true)
            .prepareLabel).toBe("Download again")
    })
    it("offers run cancellation only while the runner can stop, then offers packaging", () => {
        expect(batchActionState(workspace, { ...progress, status: "running", canCancel: true }, idlePackage, false)
            .cancel).toBe(true)
        expect(batchActionState(workspace, { ...progress, status: "running", canCancel: false }, idlePackage, false)
            .cancel).toBe(false)
        expect(batchActionState(workspace, { ...progress, status: "cancelling" }, idlePackage, false)
            .cancel).toBe(false)
        const cancelled = batchActionState(workspace, { ...progress, status: "cancelled" }, idlePackage, false)
        expect(cancelled.cancel).toBe(true)
        expect(cancelled.prepare).toBe(true)
    })
})
