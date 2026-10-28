import { BatchOutputSinkFatalError, type BatchFrameOutput } from "./runBatchFrames.ts"
import type { BatchSinkLease } from "./BatchRunController.ts"
import { withAvailableRunOwnership } from "./batchRunOwnership.ts"

const DATABASE = "pixtudio-batch-outputs-v1"
const STORE = "frames"
const RUNS = "runs"

export type BatchStagingAccounting = Readonly<{ runId: string; stagedFrameCount: number; stagedBytes: number }>
type RunRecord = BatchStagingAccounting & Readonly<{ createdAt: string; updatedAt: string }>

function runRange(runId: string): IDBKeyRange {
    // Advance the first key component by its smallest string suffix. This
    // includes every second-component type (including corrupt array indices),
    // but never includes a different run ID.
    return IDBKeyRange.bound([runId], [`${runId}\0`], false, true)
}

export type BatchOutputReader = Readonly<{
    keys(): Promise<IDBValidKey[]>
    read(orderIndex: number): Promise<BatchFrameOutput & { runId: string } | undefined>
    close(): void
}>

export async function openBatchOutputReader(runId: string): Promise<BatchOutputReader> {
    const database = await openDatabase()
    database.onversionchange = () => database.close()
    function request<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            try {
                const transaction = database.transaction(STORE, "readonly")
                const read = operation(transaction.objectStore(STORE))
                transaction.oncomplete = () => resolve(read.result)
                transaction.onabort = () => reject(new Error("Stored outputs could not be read"))
                transaction.onerror = () => { /* terminal outcome is onabort */ }
            } catch { reject(new Error("Stored outputs could not be read")) }
        })
    }
    return {
        keys: () => request(store => store.getAllKeys(runRange(runId))),
        read: orderIndex => request(store => store.get([runId, orderIndex])),
        close: () => database.close(),
    }
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 2)
        let blocked = false
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE))
                request.result.createObjectStore(STORE, { keyPath: ["runId", "orderIndex"] })
            if (!request.result.objectStoreNames.contains(RUNS))
                request.result.createObjectStore(RUNS, { keyPath: "runId" })
        }
        request.onsuccess = () => {
            if (blocked) request.result.close()
            else resolve(request.result)
        }
        request.onerror = () => reject(new BatchOutputSinkFatalError("Output storage is unavailable"))
        request.onblocked = () => {
            blocked = true
            reject(new BatchOutputSinkFatalError("Output storage is blocked"))
        }
    })
}

// Success means the PNG was committed to browser storage, not retained by JS.
export async function createBatchOutputStore(runId: string): Promise<BatchSinkLease> {
    const database = await openDatabase()
    database.onversionchange = () => database.close()
    try {
        await new Promise<void>((resolve, reject) => {
            try {
                const tx = database.transaction(RUNS, "readwrite")
                const now = new Date().toISOString()
                const add = tx.objectStore(RUNS).add({ runId, createdAt: now, updatedAt: now,
                    stagedFrameCount: 0, stagedBytes: 0 })
                let requestError: DOMException | null = null
                add.onerror = () => { requestError = add.error }
                tx.oncomplete = () => resolve()
                tx.onabort = () => reject(new BatchOutputSinkFatalError("Output storage is unavailable",
                    requestError?.name === "QuotaExceededError" || tx.error?.name === "QuotaExceededError"
                        ? "quota" : "unavailable"))
            } catch (error) {
                reject(new BatchOutputSinkFatalError("Output storage is unavailable",
                    error instanceof DOMException && error.name === "QuotaExceededError" ? "quota" : "unavailable"))
            }
        })
    } catch (error) { database.close(); throw error }
    return {
        sink: { writeFrame(frame: BatchFrameOutput) {
            return new Promise<void>((resolve, reject) => {
                try {
                    const transaction = database.transaction([STORE, RUNS], "readwrite")
                    let requestError: DOMException | null = null
                    const write = transaction.objectStore(STORE).add({ runId, ...frame })
                    write.onerror = () => { requestError = write.error }
                    const run = transaction.objectStore(RUNS).get(runId)
                    run.onsuccess = () => {
                        const current = run.result as RunRecord | undefined
                        if (!current) { transaction.abort(); return }
                        const update = transaction.objectStore(RUNS).put({ ...current,
                            updatedAt: new Date().toISOString(), stagedFrameCount: current.stagedFrameCount + 1,
                            stagedBytes: current.stagedBytes + frame.png.size })
                        update.onerror = () => { requestError = update.error }
                    }
                    transaction.oncomplete = () => resolve()
                    transaction.onabort = () => reject(new BatchOutputSinkFatalError("Output could not be committed",
                        requestError?.name === "QuotaExceededError" || transaction.error?.name === "QuotaExceededError"
                            ? "quota" : "unavailable"))
                    transaction.onerror = () => { /* onabort is the terminal write outcome */ }
                } catch (error) {
                    reject(new BatchOutputSinkFatalError("Output storage is unavailable",
                        error instanceof DOMException && error.name === "QuotaExceededError" ? "quota" : "unavailable"))
                }
            })
        } },
        close() { database.close() },
    }
}

export async function discardBatchOutputs(runId: string): Promise<void> {
    const database = await openDatabase()
    try {
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction([STORE, RUNS], "readwrite")
            const request = transaction.objectStore(STORE).openKeyCursor(
                runRange(runId))
            request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) { transaction.objectStore(RUNS).delete(runId); return }
                try {
                    transaction.objectStore(STORE).delete(cursor.primaryKey)
                    cursor.continue()
                } catch {
                    // Abort the entire discard, including earlier deletions.
                    try { transaction.abort() }
                    catch { reject(new Error("Stored outputs could not be removed")) }
                }
            }
            transaction.oncomplete = () => resolve()
            transaction.onabort = () => reject(new Error("Stored outputs could not be removed"))
            transaction.onerror = () => { /* wait for transaction abort */ }
        })
        const remaining = await inspectBatchStaging(runId)
        if (remaining.stagedFrameCount !== 0 || remaining.stagedBytes !== 0)
            throw new Error("Stored outputs could not be verified as removed")
    } finally { database.close() }
}

export async function inspectBatchStaging(runId: string): Promise<BatchStagingAccounting> {
    const database = await openDatabase()
    try {
        return await new Promise((resolve, reject) => {
            const tx = database.transaction(STORE, "readonly")
            let count = 0
            let bytes = 0
            const cursor = tx.objectStore(STORE).openCursor(runRange(runId))
            cursor.onsuccess = () => {
                if (!cursor.result) return
                count++
                bytes += (cursor.result.value as BatchFrameOutput).png.size
                cursor.result.continue()
            }
            tx.oncomplete = () => resolve({ runId, stagedFrameCount: count, stagedBytes: bytes })
            tx.onabort = () => reject(new Error("Stored outputs could not be inspected"))
        })
    } finally { database.close() }
}

export type OrphanScan = Readonly<{ cleaned: string[]; live: string[]; uncertain: string[]; legacy: string[] }>

export type LegacyCleanupResult = Readonly<{ cleaned: string[]; notConfirmed: string[] }>

// The caller must have obtained explicit confirmation that pre-ownership tabs are closed.
// A run gaining metadata after the scan is retained by checking within the delete transaction.
export async function cleanupConfirmedLegacyBatchOutputs(runIds: readonly string[]): Promise<LegacyCleanupResult> {
    const cleaned: string[] = []
    const notConfirmed: string[] = []
    for (const runId of new Set(runIds)) {
        if (!runId) { notConfirmed.push(runId); continue }
        try {
            const ownership = await withAvailableRunOwnership(runId, async () => {
                const database = await openDatabase()
                try {
                    return await new Promise<boolean>((resolve, reject) => {
                        const tx = database.transaction([STORE, RUNS], "readwrite")
                        let removed = false
                        const metadata = tx.objectStore(RUNS).get(runId)
                        metadata.onsuccess = () => {
                            if (metadata.result) return
                            const cursor = tx.objectStore(STORE).openKeyCursor(runRange(runId))
                            cursor.onsuccess = () => {
                                if (!cursor.result) return
                                tx.objectStore(STORE).delete(cursor.result.primaryKey)
                                removed = true
                                cursor.result.continue()
                            }
                        }
                        tx.oncomplete = () => resolve(removed)
                        tx.onabort = () => reject(new Error("Old temporary Batch files could not be removed"))
                    })
                } finally { database.close() }
            })
            if (ownership.kind === "held" || !ownership.value) { notConfirmed.push(runId); continue }
            const remaining = await inspectBatchStaging(runId)
            if (remaining.stagedFrameCount === 0) cleaned.push(runId)
            else notConfirmed.push(runId)
        } catch { notConfirmed.push(runId) }
    }
    return { cleaned, notConfirmed }
}

export async function cleanupOrphanBatchOutputs(): Promise<OrphanScan> {
    const database = await openDatabase()
    let records: RunRecord[] = []
    const keys: IDBValidKey[] = []
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = database.transaction([STORE, RUNS], "readonly")
            const runs = tx.objectStore(RUNS).getAll()
            const frames = tx.objectStore(STORE).openKeyCursor()
            runs.onsuccess = () => { records = runs.result as RunRecord[] }
            frames.onsuccess = () => {
                if (!frames.result) return
                keys.push(frames.result.primaryKey)
                frames.result.continue()
            }
            tx.oncomplete = () => resolve()
            tx.onabort = () => reject(new Error("Batch staging could not be inspected"))
        })
    } finally { database.close() }
    const known = new Set(records.map(row => row.runId))
    const legacy = [...new Set(keys.filter((key): key is IDBValidKey[] => Array.isArray(key))
        .map(key => key[0]).filter((id): id is string => typeof id === "string" && !known.has(id)))].sort()
    const cleaned: string[] = []
    const live: string[] = []
    const uncertain: string[] = []
    for (const record of records) {
        try {
            const result = await withAvailableRunOwnership(record.runId, async () => {
                await discardBatchOutputs(record.runId)
            })
            if (result.kind === "held") live.push(record.runId)
            else cleaned.push(record.runId)
        } catch { uncertain.push(record.runId) }
    }
    // Pre-Gate-13 tabs had no ownership protocol. Their rows cannot be proved orphaned.
    return { cleaned, live, uncertain: [...uncertain, ...legacy], legacy }
}
