import { expect, test, type Page } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import { writeFile } from "node:fs/promises"
import { staticGifBytes } from "../fixtures/staticGifBytes"
import { installStableVisualEnvironment } from "./helpers"
import type * as Proof from "./gate9RunnerHarness"

declare global {
    interface Window {
        gate9Release: (() => void) | null
        gate9Encodes: number
        gate9Reads: string[]
        gate9Trace: string[]
        gate9Proof: typeof Proof
    }
}

let bundle: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/gate9RunnerHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "gate9Proof" })
    bundle = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

async function saveEvidence(name: string, evidence: unknown) {
    const body = Buffer.from(JSON.stringify(evidence, null, 2))
    await writeFile(test.info().outputPath(`${name}.json`), body)
    await test.info().attach(name, { contentType: "application/json", body })
}

async function prepare(page: Page, count = 8, aspect?: string) {
    await page.addInitScript(({ bytes, count }) => {
        window.gate9Reads = []
        window.gate9Trace = []
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "GATE9_SMALL_STATIC_GIF", async *values() {
                for (let index = count - 1; index >= 0; index--) {
                    const name = `frame${index}.gif`
                    yield { kind: "file", name, async getFile() {
                        window.gate9Reads.push(name)
                        window.gate9Trace.push(`open:${index}`)
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
    if (aspect) await page.getByRole("radio", { name: `Aspect ratio ${aspect}`, exact: true }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toBeVisible()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    if (count > 0) await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    else await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await expect(page.locator(".batch-reference-stage")).toHaveAttribute("inert", "")
    await page.evaluate(() => { window.gate9Reads = []; window.gate9Trace = [] })
}

async function holdNativeEncode(page: Page, holdAt: number) {
    await page.evaluate(holdAt => {
        window.gate9Encodes = 0
        window.gate9Release = null
        const original = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
            const index = window.gate9Encodes++
            original.call(this, blob => {
                window.gate9Trace.push(`png:${index}`)
                if (index === holdAt) {
                    window.gate9Release = () => { callback(blob) }
                } else callback(blob)
            }, ...args)
        }
        const decode = window.createImageBitmap
        window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
            const bitmap = await decode(...args)
            const close = bitmap.close.bind(bitmap)
            const index = window.gate9Reads.length - 1
            bitmap.close = () => { window.gate9Trace.push(`cleanup:${index}`); close() }
            return bitmap
        }) as typeof createImageBitmap
    }, holdAt)
}

async function stored(page: Page, runId: string) {
    return page.evaluate(async runId => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("pixtudio-batch-outputs-v1", 2)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        try {
            return await new Promise<{ orderIndex: number; pngBytes: number }[]>((resolve, reject) => {
                const request = database.transaction("frames", "readonly").objectStore("frames")
                    .getAll(IDBKeyRange.bound([runId, 0], [runId, Number.MAX_SAFE_INTEGER]))
                request.onsuccess = () => resolve(request.result.map(row => ({
                    orderIndex: row.orderIndex, pngBytes: (row.png as Blob).size,
                })))
                request.onerror = () => reject(request.error)
            })
        } finally { database.close() }
    }, runId)
}

test("Gate 9 production UI retains cancelled output until explicit exit clears it", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", error => errors.push(error.message))
    await prepare(page)
    await holdNativeEncode(page, 2)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const runId = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect.poll(() => page.evaluate(() => Boolean(window.gate9Release))).toBe(true)
    await expect(page.getByText("Processing 2 / 8")).toBeVisible()
    expect(JSON.parse((await page.getByTestId("batch-run-progress").textContent())!).ratio).toBe(0.25)
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Return to Reference", exact: true })).toHaveCount(0)
    const sealedBefore = await page.getByTestId("gate5-sealed-reference").textContent()
    const partialWrites = await stored(page, runId)
    expect(partialWrites.map(row => row.orderIndex)).toEqual([0, 1])
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByText("Cancelling...", { exact: false })).toBeVisible()
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled()
    expect(JSON.parse((await page.getByTestId("batch-run-progress").textContent())!).settled).toBe(2)
    await page.screenshot({ path: test.info().outputPath("cancelling-current-frame.png"), fullPage: true })
    await page.evaluate(() => { window.gate9Trace.push("cancel-requested"); window.gate9Release?.() })
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("workspace")
    await expect(page.getByRole("button", { name: "Prepare and Download ZIP" })).toBeEnabled()
    expect((await stored(page, runId)).map(row => row.orderIndex)).toEqual([0, 1, 2])
    const readsBeforeLateCallback = await page.evaluate(() => [...window.gate9Reads])
    await page.evaluate(() => window.gate9Release?.())
    expect(await page.evaluate(() => window.gate9Reads)).toEqual(readsBeforeLateCallback)
    expect((await stored(page, runId)).map(row => row.orderIndex)).toEqual([0, 1, 2])
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(page.locator(".batch-overlay")).toHaveCount(0)
    await expect(page.locator(".batch-reference-stage")).not.toHaveAttribute("inert", "")
    await expect(page.getByTestId("gate5-sealed-reference")).toHaveText(sealedBefore ?? "")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    expect(await page.evaluate(() => window.gate9Reads)).toEqual(["frame0.gif", "frame1.gif", "frame2.gif"])
    expect(await page.evaluate(() => window.gate9Encodes)).toBe(3)
    expect(await stored(page, runId)).toEqual([])
    expect(await stored(page, runId)).toEqual([])
    const trace = await page.evaluate(() => window.gate9Trace)
    expect(trace.indexOf("cancel-requested")).toBeLessThan(trace.indexOf("cleanup:2"))
    expect(trace).not.toContain("open:3")
    await page.screenshot({ path: test.info().outputPath("authoring-restored-after-discard.png"), fullPage: true })
    await saveEvidence("gate9-cancel-cleanup", { trace, partialWrites, readsBeforeLateCallback })
    expect(errors).toEqual([])
})

test("Gate 9 production UI completes and retains all output writes", async ({ page }) => {
    await prepare(page, 3)
    await holdNativeEncode(page, 1)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect.poll(() => page.evaluate(() => Boolean(window.gate9Release))).toBe(true)
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled()
    await expect(page.getByText("Processing 1 / 3")).toBeVisible()
    await page.evaluate(() => window.gate9Release?.())
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled()
    expect(JSON.parse((await page.getByTestId("batch-run-progress").textContent())!).settled).toBe(3)
    expect(JSON.parse((await page.getByTestId("batch-run-progress").textContent())!).ratio).toBe(1)
    expect((await stored(page, id)).map(row => row.orderIndex)).toEqual([0, 1, 2])
})

test("Gate 9 portrait Reference returns to editing after cancellation", async ({ page }) => {
    await prepare(page, 4, "9:16")
    await holdNativeEncode(page, 1)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const runId = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect.poll(() => page.evaluate(() => Boolean(window.gate9Release))).toBe(true)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.evaluate(() => window.gate9Release?.())
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible()
    expect((await stored(page, runId)).map(row => row.orderIndex)).toEqual([0, 1])
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    expect(await page.evaluate(() => window.gate9Reads)).toEqual(["frame0.gif", "frame1.gif"])
    expect(await stored(page, runId)).toEqual([])
})

test("Gate 14 empty Source Set cannot start a run or open a frame", async ({ page }) => {
    await prepare(page, 0)
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await expect(page.getByRole("alert")).toContainText("No processable frames")
    await expect(page.getByTestId("batch-output-run-id")).toHaveText("")
    await expect(page.getByRole("button", { name: "Prepare and Download ZIP" })).toBeDisabled()
    expect(await page.evaluate(() => window.gate9Reads)).toEqual([])
})

test("Gate 9 cancellation cleans up after an in-flight output storage failure", async ({ page }) => {
    await prepare(page, 4)
    await holdNativeEncode(page, 1)
    await page.getByRole("button", { name: "Start Batch" }).click()
    const id = (await page.getByTestId("batch-output-run-id").textContent())!
    await expect.poll(() => page.evaluate(() => Boolean(window.gate9Release))).toBe(true)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.evaluate(() => {
        IDBObjectStore.prototype.add = () => { throw new DOMException("Sensitive storage error", "QuotaExceededError") }
        window.gate9Release?.()
    })
    await expect(page.getByRole("heading", { name: "Failed", exact: true })).toBeVisible()
    expect((await stored(page, id)).map(row => row.orderIndex)).toEqual([0])
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    await expect(page.locator("body")).not.toContainText("Sensitive storage error")
    expect(await stored(page, id)).toEqual([])
    expect(await page.evaluate(() => window.gate9Reads)).toEqual(["frame0.gif", "frame1.gif"])
})

test("Gate 9 cancelled completed frames equal uninterrupted frames in decoded RGBA", async ({ page }) => {
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles({ name: "reference.gif", mimeType: "image/gif",
        buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Set as Reference" }).click()
    const sealed = JSON.parse((await page.getByTestId("gate5-sealed-reference").textContent())!)
    await page.addScriptTag({ content: bundle })
    const proof = await page.evaluate(({ sealed, bytes }) =>
        window.gate9Proof.compareNormalAndCancelled(sealed, bytes), { sealed, bytes: [...staticGifBytes] })
    expect(proof.normal.status).toBe("completed")
    expect(proof.cancelled.status).toBe("cancelled")
    expect(proof.comparisons).toHaveLength(2)
    for (const row of proof.comparisons) {
        expect(row.width).toBe(row.expectedWidth)
        expect(row.height).toBe(row.expectedHeight)
        expect(row.differentBytes).toBe(0)
    }
    expect(proof.cancelled.resources).toEqual({ decodedOpened: 2, decodedClosed: 2, peakActiveDecoded: 1,
        sinkWriteAttempts: 2, sinkWriteSucceeded: 2 })
    await saveEvidence("gate9-cancel-rgba-identity", proof)
})
