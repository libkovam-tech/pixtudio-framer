import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { staticGifBytes } from "../fixtures/staticGifBytes"
import { parseStoredZip } from "../fixtures/parseStoredZip"
import { installStableVisualEnvironment } from "./helpers"

test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

async function prepare(page: Page, count = 5, names?: string[]) {
    await page.addInitScript(({ bytes, count, names }) => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "GATE10", async *values() {
                for (const name of names ?? Array.from({ length: count }, (_, i) => `frame${i}.gif`)) {
                    yield { kind: "file", name, async getFile() {
                        return new File([Uint8Array.from(name === "bad.txt" ? [1, 2, 3] : bytes)], name, { type: "image/gif" })
                    } }
                }
            },
        }) })
    }, { bytes: [...staticGifBytes], count, names })
    await page.goto("/plugins/batch-pixelation/")
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    if (count > 0 || names?.some(name => name !== "bad.txt")) {
        await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    } else await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
}

async function stored(page: Page, id: string) {
    return page.evaluate(async id => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
        })
        try {
            const read = db.transaction("frames", "readonly").objectStore("frames")
                .getAll(IDBKeyRange.bound([id], [id, []], false, true))
            const rows = await new Promise<{ orderIndex: number; outputName: string; png: Blob }[]>((resolve, reject) => {
                read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error)
            })
            return await Promise.all(rows.map(async row => ({ orderIndex: row.orderIndex, name: row.outputName,
                bytes: [...new Uint8Array(await row.png.arrayBuffer())] })))
        } finally { db.close() }
    }, id)
}

async function download(page: Page, action = "Download ZIP") {
    await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    if (action === "Download ZIP" || action === "Retry") {
        await page.getByRole("button", { name: action === "Retry" ? "Retry Packaging" : "Prepare and Download ZIP", exact: true }).click()
        await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
        action = "DOWNLOAD"
    }
    if (action === "prepared") action = "DOWNLOAD"
    const waiting = page.waitForEvent("download")
    await page.getByRole("button", { name: action, exact: true }).click()
    const artifact = await waiting
    expect(await artifact.failure()).toBeNull()
    const file = (await artifact.path())!
    const bytes = await readFile(file)
    const entries = parseStoredZip(bytes)
    await artifact.saveAs(test.info().outputPath(artifact.suggestedFilename()))
    await expect(page.getByText("Download started")).toBeVisible()
    return entries
}

async function start(page: Page, status = "Completed") {
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: status, exact: true })).toBeVisible()
}

test("Gate 10 Completed ZIP preserves bytes/case, repeated download and scoped discard", async ({ page }) => {
    const analyticsEvents: string[] = []
    await page.route("**/api/analytics", async route => {
        analyticsEvents.push(route.request().postDataJSON().event)
        await route.fulfill({ status: 204 })
    })
    await prepare(page, 5, ["Frame1.gif", "frame1.gif", "frame2.gif", "frame3.gif", "frame4.gif"])
    await start(page)
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    const before = await page.getByTestId("batch-run-result").textContent()
    const rows = await stored(page, id)
    expect(analyticsEvents).not.toContain("batch_pixelation_download_click")
    const zip = await download(page)
    await expect.poll(() => analyticsEvents.filter(event => event === "batch_pixelation_download_click").length).toBe(1)
    await page.screenshot({ path: test.info().outputPath("completed-download.png"), fullPage: true })
    expect([...zip.keys()]).toEqual(["batch_report.txt", ...rows.map(row => row.name)])
    expect(zip.has("Frame1.png")).toBe(true); expect(zip.has("frame1.png")).toBe(true)
    for (const row of rows) expect([...zip.get(row.name)!]).toEqual(row.bytes)
    expect(new TextDecoder().decode(zip.get("batch_report.txt"))).toContain("Status: Completed")
    expect(await stored(page, id)).toEqual([])
    expect(await download(page, "Download again")).toEqual(zip)
    expect(analyticsEvents.filter(event => event === "batch_pixelation_download_click")).toHaveLength(1)
    expect(await page.getByTestId("batch-run-result").textContent()).toBe(before)
    await page.evaluate(async rows => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction("frames", "readwrite")
        const store = tx.objectStore("frames")
        store.add({ ...rows[0], runId: "OTHER_RUN", sourceFilename: "foreign.gif", outputName: "foreign.png",
            width: 1, height: 1, png: new Blob([1], { type: "image/png" }) })
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() }); db.close()
    }, rows)
    await page.getByRole("button", { name: "START OVER" }).click()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
    expect(await stored(page, id)).toEqual([])
    expect(await stored(page, "OTHER_RUN")).toHaveLength(1)
})

test("Gate 10 Cancelled 3/8 ZIP excludes untouched tail and keeps truthful report", async ({ page }) => {
    await prepare(page, 8)
    await page.evaluate(() => {
        let count = 0
        const native = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
            native.call(this, blob => {
                if (++count === 3) {
                    (window as unknown as { release: () => void }).release = () => callback(blob)
                } else callback(blob)
            }, ...args)
        }
    })
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { release: unknown }).release))).toBe(true)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.evaluate(() => (window as unknown as { release: () => void }).release())
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible()
    let zip: ReturnType<typeof parseStoredZip>
    if (test.info().project.name === "desktop") {
        await page.evaluate(() => {
            let savedBytes: number[] | null = null
            Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async () => ({
                createWritable: async () => ({
                    write: async (blob: Blob) => { savedBytes = [...new Uint8Array(await blob.arrayBuffer())] },
                    close: async () => { Reflect.set(window, "gate10SavedZip", savedBytes) },
                    abort: async () => {},
                }),
            }) })
        })
        await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
        await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
        await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
        await expect(page.getByText("Download started")).toBeVisible()
        const bytes = await page.evaluate(() => Reflect.get(window, "gate10SavedZip") as number[] | null)
        expect(bytes).not.toBeNull()
        zip = parseStoredZip(Buffer.from(bytes!))
    } else zip = await download(page)
    await page.screenshot({ path: test.info().outputPath("cancelled-download.png"), fullPage: true })
    expect([...zip.keys()]).toEqual(["batch_report.txt", "frame0.png", "frame1.png", "frame2.png"])
    const report = new TextDecoder().decode(zip.get("batch_report.txt"))
    expect(report).toContain("Status: Cancelled"); expect(report).toContain("Processed: 3 / 8")
    expect(report).toContain("Not processed: 5"); expect(report).toContain('First not-processed filename: "frame3.gif"')
    expect(await stored(page, id)).toEqual([])
})

test("Gate 14 zero-work source cannot create a report-only ZIP", async ({ page }) => {
    await prepare(page, 0, ["bad.txt"])
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Prepare and Download ZIP" })).toBeDisabled()
    await expect(page.getByTestId("batch-output-run-id")).toHaveText("")
})

test("Gate 10 Failed partial and failed zero-success ZIP remain downloadable", async ({ page }) => {
    for (const failAt of [2, 0]) {
        await prepare(page, 5)
        await page.evaluate(failAt => {
            let count = 0
            const add = IDBObjectStore.prototype.add
            IDBObjectStore.prototype.add = function(...args) {
                if (this.name === "frames" && count++ === failAt) throw new DOMException("Injected storage failure", "QuotaExceededError")
                return add.apply(this, args)
            }
        }, failAt)
        await start(page, "Failed")
        const id = (await page.getByTestId("batch-output-run-id").textContent())!
        const rows = await stored(page, id)
        expect(rows).toHaveLength(failAt)
        const zip = await download(page)
        expect(zip.size).toBe(failAt + 1)
        expect(new TextDecoder().decode(zip.get("batch_report.txt"))).toContain("Status: Failed")
        expect(await stored(page, id)).toEqual([])
    }
})

test("Gate 10 staging mismatch fails, retry succeeds without running frames again", async ({ page }) => {
    await prepare(page, 3)
    await start(page)
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    const before = await page.getByTestId("batch-run-result").textContent()
    await page.evaluate(async id => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction("frames", "readwrite")
        const store = tx.objectStore("frames")
        const row = store.get([id, 0])
        row.onsuccess = () => store.add({ ...row.result, orderIndex: -1 })
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() }); db.close()
    }, id)
    let downloads = 0
    page.on("download", () => { downloads++ })
    await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Could not prepare ZIP" })).toBeVisible()
    expect(downloads).toBe(0)
    expect(await page.getByTestId("batch-run-result").textContent()).toBe(before)
    await page.evaluate(async id => {
        const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
        const tx = db.transaction("frames", "readwrite"); tx.objectStore("frames").delete([id, -1])
        await new Promise<void>(resolve => { tx.oncomplete = () => resolve() }); db.close()
    }, id)
    const zip = await download(page, "Retry")
    expect(zip.size).toBe(4); expect(await stored(page, id)).toEqual([])
})

test("Gate 10 ZIP remains readable after staging cleanup and download URL stays alive", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    await prepare(page, 3)
    await start(page)
    await page.evaluate(() => {
        const native = Blob.prototype.arrayBuffer
        const state = window as unknown as { packagingRelease: () => void; revoked: number }
        state.revoked = 0
        Blob.prototype.arrayBuffer = async function() {
            if (this.type === "image/png") await new Promise<void>(resolve => { state.packagingRelease = resolve })
            return native.call(this)
        }
        const revoke = URL.revokeObjectURL
        URL.revokeObjectURL = function(url) { state.revoked++; revoke.call(this, url) }
    })
    await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
    for (let count = 0; count < 3; count++) {
        await expect(page.getByText(`Preparing ZIP...${count} / 3`)).toBeVisible()
        await expect(page.getByRole("button", { name: "Prepare and Download ZIP", exact: true })).toBeDisabled()
        await expect(page.getByRole("button", { name: "START OVER" })).toBeDisabled()
        if (count === 0) await page.screenshot({ path: test.info().outputPath("packaging.png"), fullPage: true })
        await expect.poll(() => page.evaluate(() => typeof (window as unknown as { packagingRelease: unknown }).packagingRelease)).toBe("function")
        await page.evaluate(() => {
            const state = window as unknown as { packagingRelease: (() => void) | null }
            const release = state.packagingRelease!; state.packagingRelease = null; release()
        })
    }
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    const downloadEvent = page.waitForEvent("download")
    await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
    const artifact = await downloadEvent
    expect(parseStoredZip(await readFile((await artifact.path())!)).size).toBe(4)
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => (window as unknown as { revoked: number }).revoked)).toBe(0)
    await expect(page.getByRole("button", { name: "Download again" })).toBeEnabled()
})

test("Gate 10 download URL creation failure permits Retry and preserves outputs", async ({ page }) => {
    await prepare(page, 3)
    await start(page)
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    const before = await page.getByTestId("batch-run-result").textContent()
    await page.evaluate(() => {
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined })
        const native = URL.createObjectURL
        let fail = true
        URL.createObjectURL = function(blob) {
            if (fail) { fail = false; throw new Error("Injected URL failure") }
            return native.call(this, blob)
        }
    })
    await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
    expect(await page.getByTestId("batch-run-result").textContent()).toBe(before)
    expect(await stored(page, id)).toEqual([])
    expect((await download(page, "prepared")).size).toBe(4)
})

test("Gate 10 collision/exclusion report preserves canonical winners without double counting", async ({ page }) => {
    await prepare(page, 0, ["frame1.gif", "frame1.png", "frame2.gif", "bad.txt"])
    await start(page)
    const zip = await download(page)
    expect([...zip.keys()]).toEqual(["batch_report.txt", "frame1.png", "frame2.png"])
    const report = new TextDecoder().decode(zip.get("batch_report.txt"))
    expect(report).toContain("Candidates: 4"); expect(report).toContain("Processable: 2")
    expect(report).toContain("Excluded during scan: 2"); expect(report).toContain("Collisions: 1")
    expect(report).toContain('"frame1.png": "output-name-collision"')
    expect(report).toContain('winner "frame1.gif"'); expect(report).toContain('loser "frame1.png"')
})

for (const corruption of ["missing", "metadata", "array-index", "read-error", "writer-error"] as const) {
    test(`Gate 10 ${corruption} fails without download or terminal mutation`, async ({ page }) => {
        await prepare(page, 3)
        await start(page)
        const id = (await page.getByTestId("batch-output-run-id").textContent())!
        const before = await page.getByTestId("batch-run-result").textContent()
        await page.evaluate(async ({ id, corruption }) => {
            if (corruption === "read-error") {
                const get = IDBObjectStore.prototype.get
                IDBObjectStore.prototype.get = function(...args) {
                    if (this.name === "frames") throw new Error("Injected read failure")
                    return get.apply(this, args)
                }
            } else if (corruption === "writer-error") {
                const read = Blob.prototype.arrayBuffer
                Blob.prototype.arrayBuffer = function() {
                    if (this.type === "image/png") return Promise.reject(new Error("Injected payload read failure"))
                    return read.call(this)
                }
            } else {
                const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
                const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result) })
                const tx = db.transaction("frames", "readwrite")
                const store = tx.objectStore("frames")
                if (corruption === "missing") store.delete([id, 0])
                else {
                    const get = store.get([id, 0])
                    get.onsuccess = () => store.put(corruption === "array-index"
                        ? { ...get.result, orderIndex: [] }
                        : { ...get.result, sourceFilename: "WRONG.gif" })
                }
                await new Promise<void>(resolve => { tx.oncomplete = () => resolve() }); db.close()
            }
        }, { id, corruption })
        let downloads = 0
        page.on("download", () => { downloads++ })
        await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
        await expect(page.getByRole("button", { name: "Retry Packaging", exact: true })).toBeVisible()
        expect(downloads).toBe(0)
        expect(await page.getByTestId("batch-run-result").textContent()).toBe(before)
        expect(JSON.parse((await page.getByTestId("batch-run-progress").textContent())!).status).toBe("completed")
    })
}

test("Gate 10 Cancel before first frame creates a Cancelled report-only ZIP", async ({ page }) => {
    await prepare(page, 5)
    await page.evaluate(() => {
        const native = indexedDB.open.bind(indexedDB)
        let first = true
        indexedDB.open = function(...args) {
            const request = native(...args)
            if (first && args[0] === "pixtudio-batch-outputs-v1") {
                first = false
                request.addEventListener("success", event => {
                    event.stopImmediatePropagation()
                    const callback = request.onsuccess
                    ;(window as unknown as { openRelease: () => void }).openRelease = () => callback?.call(request, event)
                })
            }
            return request
        }
    })
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { openRelease: unknown }).openRelease))).toBe(true)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.evaluate(() => (window as unknown as { openRelease: () => void }).openRelease())
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible()
    const zip = await download(page)
    expect([...zip.keys()]).toEqual(["batch_report.txt"])
    const report = new TextDecoder().decode(zip.get("batch_report.txt"))
    expect(report).toContain("Status: Cancelled"); expect(report).toContain("Processed: 0 / 5")
    expect(report).toContain("Not processed: 5"); expect(report).toContain("Report-only: yes")
})

test("Gate 10 discard failure is explicit and preserves download capability", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await prepare(page, 3)
    await start(page)
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await page.evaluate(() => {
        const native = IDBObjectStore.prototype.delete
        let first = true
        IDBObjectStore.prototype.delete = function(...args) {
            if (this.name === "frames" && first) { first = false; this.transaction.abort() }
            return native.apply(this, args)
        }
    })
    await page.getByRole("button", { name: "START OVER" }).click()
    await page.getByRole("button", { name: "Discard and start over" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Temporary files could not be cleared" })).toBeVisible()
    expect(await stored(page, id)).toHaveLength(3)
    await page.getByRole("button", { name: "START OVER" }).click()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
    expect(await stored(page, id)).toEqual([])
    expect(errors).toEqual([])
})
