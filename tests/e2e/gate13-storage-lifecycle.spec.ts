import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { staticGifBytes } from "../fixtures/staticGifBytes"
import { parseStoredZip } from "../fixtures/parseStoredZip"
import { installStableVisualEnvironment } from "./helpers"

test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

async function prepare(page: Page, count = 3) {
    await page.addInitScript(({ bytes, count }) => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "GATE13", async *values() {
                for (let index = 0; index < count; index++) {
                    const name = `frame${index}.gif`
                    yield { kind: "file", name, async getFile() {
                        return new File([Uint8Array.from(bytes)], name, { type: "image/gif" })
                    } }
                }
            },
        }) })
    }, { bytes: [...staticGifBytes], count })
    await page.goto("/plugins/batch-pixelation/")
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
}

async function staging(page: Page, runId: string) {
    return page.evaluate(async runId => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        try {
            return await new Promise<{ count: number; bytes: number; meta: { stagedFrameCount: number; stagedBytes: number } | null }>((resolve, reject) => {
                const tx = db.transaction(["frames", "runs"], "readonly")
                const rows = tx.objectStore("frames").getAll(IDBKeyRange.bound([runId], [`${runId}\0`], false, true))
                const meta = tx.objectStore("runs").get(runId)
                tx.oncomplete = () => resolve({ count: rows.result.length,
                    bytes: rows.result.reduce((sum, row) => sum + (row.png as Blob).size, 0), meta: meta.result ?? null })
                tx.onabort = () => reject(tx.error)
            })
        } finally { db.close() }
    }, runId)
}

async function download(page: Page, name = "DOWNLOAD") {
    await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    const waiting = page.waitForEvent("download")
    await page.getByRole("button", { name, exact: true }).click()
    const artifact = await waiting
    expect(await artifact.failure()).toBeNull()
    return readFile((await artifact.path())!)
}

test("Gate 13 prepare commits cleanup before download; repeat uses in-memory archive", async ({ page }) => {
    await prepare(page)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    const before = await staging(page, id)
    expect(before.count).toBe(3)
    expect(before.meta).toMatchObject({ stagedFrameCount: 3, stagedBytes: before.bytes })
    await expect(page.getByRole("button", { name: "Prepare and Download ZIP" })).toBeEnabled()
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
    const first = await download(page)
    const second = await download(page, "Download again")
    expect(first.equals(second)).toBe(true)
    expect(parseStoredZip(first).size).toBe(4)
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
})

test("Gate 13 cleanup abort keeps download locked; retry reuses prepared archive", async ({ page }) => {
    await prepare(page)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await page.evaluate(() => {
        const native = IDBObjectStore.prototype.delete
        let first = true
        IDBObjectStore.prototype.delete = function(...args) {
            if (this.name === "frames" && first) { first = false; this.transaction.abort() }
            return native.apply(this, args)
        }
    })
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Temporary files could not be cleared" })).toBeVisible()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toHaveCount(0)
    expect((await staging(page, id)).count).toBe(3)
    await page.getByRole("button", { name: "Retry Cleanup" }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
    expect(parseStoredZip(await download(page)).size).toBe(4)
})

test("Gate 13 Start Over without download clears only this run and can reopen a recipe", async ({ page }) => {
    await prepare(page)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "START OVER" }).click()
    const resetDialog = page.getByRole("dialog", { name: "Start over?" })
    const resetButtons = resetDialog.getByRole("button")
    await expect(resetButtons).toHaveCount(2)
    await expect(resetDialog.getByRole("button", { name: "Cancel" })).toHaveCount(0)
    expect(await resetButtons.evaluateAll(buttons => buttons.every(button => {
        const style = getComputedStyle(button)
        return style.paddingLeft === style.paddingRight && button.scrollWidth <= button.clientWidth + 1 &&
            button.scrollHeight <= button.clientHeight + 1
    }))).toBe(true)
    await page.screenshot({ path: test.info().outputPath("start-over-dialog.png") })
    await page.getByRole("button", { name: "Discard and start over" }).click()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await page.getByRole("button", { name: "Start Batch" }).click()
    const second = (await page.getByTestId("batch-output-run-id").textContent())!
    expect(second).not.toBe(id)
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
})

test("Gate 13 quota failure keeps prior commits and permits a partial archive", async ({ page }) => {
    await prepare(page, 4)
    await page.evaluate(() => {
        const native = IDBObjectStore.prototype.add
        let written = 0
        IDBObjectStore.prototype.add = function(...args) {
            if (this.name === "frames" && written++ === 2) throw new DOMException("Injected", "QuotaExceededError")
            return native.apply(this, args)
        }
    })
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Failed", exact: true })).toBeVisible()
    await expect(page.getByRole("alert").filter({ hasText: "Browser temporary storage is full" })).toBeVisible()
    const before = await staging(page, id)
    expect(before.meta).toMatchObject({ stagedFrameCount: 2, stagedBytes: before.bytes })
    expect(before.count).toBe(2)
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
    const zip = parseStoredZip(await download(page))
    expect([...zip.keys()]).toEqual(["batch_report.txt", "frame0.png", "frame1.png"])
})

test("Gate 13 quota during initial metadata commit is an actionable failed run", async ({ page }) => {
    await prepare(page, 2)
    await page.evaluate(() => {
        const native = IDBObjectStore.prototype.add
        IDBObjectStore.prototype.add = function(...args) {
            if (this.name === "runs") throw new DOMException("Injected", "QuotaExceededError")
            return native.apply(this, args)
        }
    })
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Failed", exact: true })).toBeVisible()
    await expect(page.getByRole("alert").filter({ hasText: "Browser temporary storage is full" })).toBeVisible()
    expect(await staging(page, id)).toEqual({ count: 0, bytes: 0, meta: null })
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    expect([...parseStoredZip(await download(page)).keys()]).toEqual(["batch_report.txt"])
})

test("Gate 13 other tab is protected, then hard-close orphan is cleaned", async ({ page, context }) => {
    await prepare(page)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    const other = await context.newPage()
    await other.goto("/plugins/batch-pixelation/")
    expect((await staging(other, id)).count).toBe(3)
    await page.close()
    await expect.poll(() => other.evaluate(async id => navigator.locks.request(`pixtudio-batch-run:${id}`,
        { ifAvailable: true }, lock => Boolean(lock)), id)).toBe(true)
    await other.reload()
    await expect.poll(async () => (await staging(other, id)).count).toBe(0)
    await expect(other.getByRole("button", { name: "Start Batch" })).toHaveCount(0)
})

test("Gate 13 legacy rows remain uncertain rather than being silently deleted", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(async () => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 1)
        request.onupgradeneeded = () => request.result.createObjectStore("frames", { keyPath: ["runId", "orderIndex"] })
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction("frames", "readwrite")
        tx.objectStore("frames").add({ runId: "legacy-run", orderIndex: 0, png: new Blob([1], { type: "image/png" }) })
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() })
        db.close()
    })
    await page.goto("/plugins/batch-pixelation/")
    await expect(page.getByRole("status").filter({ hasText: "could not be safely classified" })).toBeVisible()
    expect((await staging(page, "legacy-run")).count).toBe(1)
    await page.getByRole("button", { name: "Clear old temporary files" }).click()
    await expect(page.getByRole("button", { name: "Clear old temporary files" })).toBeDisabled()
    await page.getByRole("button", { name: "Cancel" }).click()
    expect((await staging(page, "legacy-run")).count).toBe(1)
    await page.getByRole("button", { name: "Clear old temporary files" }).click()
    await page.getByRole("checkbox", { name: /I closed older Batch tabs/ }).check()
    await page.getByRole("button", { name: "Clear old temporary files" }).click()
    await expect(page.getByRole("status").filter({ hasText: "Cleared 1 old temporary runs" })).toBeVisible()
    expect((await staging(page, "legacy-run")).count).toBe(0)
})

test("Gate 13 manual legacy cleanup retains a run that gains v2 metadata after scan", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(async () => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        request.onupgradeneeded = () => {
            request.result.createObjectStore("frames", { keyPath: ["runId", "orderIndex"] })
            request.result.createObjectStore("runs", { keyPath: "runId" })
        }
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction("frames", "readwrite")
        tx.objectStore("frames").add({ runId: "became-modern", orderIndex: 0, png: new Blob([1], { type: "image/png" }) })
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() })
        db.close()
    })
    await page.goto("/plugins/batch-pixelation/")
    await expect(page.getByRole("button", { name: "Clear old temporary files" })).toBeVisible()
    await page.evaluate(async () => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction(["runs", "frames"], "readwrite")
        tx.objectStore("runs").add({ runId: "became-modern", createdAt: "2026-09-30T00:00:00Z",
            updatedAt: "2026-09-30T00:00:00Z", stagedFrameCount: 1, stagedBytes: 1 })
        tx.objectStore("frames").add({ runId: "late-legacy", orderIndex: 0, png: new Blob([2], { type: "image/png" }) })
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() })
        db.close()
    })
    await page.getByRole("button", { name: "Clear old temporary files" }).click()
    await page.getByRole("checkbox", { name: /I closed older Batch tabs/ }).check()
    await page.getByRole("button", { name: "Clear old temporary files" }).click()
    await expect(page.getByRole("status").filter({ hasText: "1 were not confirmed cleared" })).toBeVisible()
    expect((await staging(page, "became-modern")).count).toBe(1)
    expect((await staging(page, "late-legacy")).count).toBe(1)
})
