const PREFIX = "pixtudio-batch-run:"

export type RunOwnership = Readonly<{ release(): void }>

export class BatchRunOwnership {
    private lease: RunOwnership | null = null
    private pending: Promise<RunOwnership> | null = null
    private readonly runId: string
    constructor(runId: string) { this.runId = runId }
    async acquire(): Promise<void> {
        if (this.lease) return
        this.pending ??= acquireRunOwnership(this.runId)
        this.lease = await this.pending
    }
    release(): void {
        this.lease?.release()
        this.lease = null
        this.pending = null
    }
}

function locks(): LockManager {
    if (!navigator.locks) throw new Error("Cross-tab Batch ownership is unavailable")
    return navigator.locks
}

export async function acquireRunOwnership(runId: string): Promise<RunOwnership> {
    let enter!: (value: RunOwnership | null) => void
    let leave!: () => void
    const entered = new Promise<RunOwnership | null>(resolve => { enter = resolve })
    const held = new Promise<void>(resolve => { leave = resolve })
    const task = locks().request(`${PREFIX}${runId}`, { mode: "exclusive", ifAvailable: true }, async lock => {
        if (!lock) { enter(null); return }
        enter({ release: leave })
        await held
    })
    void task.catch(() => enter(null))
    const owner = await entered
    if (!owner) throw new Error("Batch run ownership could not be established")
    return owner
}

export async function withAvailableRunOwnership<T>(runId: string, visit: () => Promise<T>): Promise<
    Readonly<{ kind: "available"; value: T }> | Readonly<{ kind: "held" }>> {
    return locks().request(`${PREFIX}${runId}`, { mode: "exclusive", ifAvailable: true }, async lock =>
        lock ? { kind: "available", value: await visit() } : { kind: "held" })
}
