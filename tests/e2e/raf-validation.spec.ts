import { expect, test, type Page } from "@playwright/test"
import { readFile, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import path from "node:path"
import { staticGifBytes, animatedGifBytes } from "../fixtures/staticGifBytes"
import type { ValidationReport } from "../../src/plugins/batchPixelation/research/rafValidationSession"
import type * as Proof from "./rafValidationHarness"
declare global { interface Window { rafValidationProof: typeof Proof } }
let proofBundle: string
const researchUrl = process.env.BATCH_RAF_RESEARCH_URL ?? "http://127.0.0.1:5176/tests/research/batch-raf/"
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/rafValidationHarness.ts")], bundle: true,
        write: false, format: "iife", globalName: "rafValidationProof" })
    proofBundle = result.outputFiles[0].text
})

async function installFolder(page: Page) {
    await page.evaluate(({ single, animated }) => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "SYNTHETIC_REGRESSION_ONLY", async *values() {
                for (const index of Array.from({ length: 21 }, (_, i) => 21 - i)) {
                    const name = `frame${index}.gif`
                    yield { kind: "file", name, async getFile() {
                        return new File([Uint8Array.from(index === 21 ? animated : single)], name, { type: "image/gif" })
                    } }
                }
            },
        }) })
    }, { single: [...staticGifBytes], animated: [...animatedGifBytes] })
}

test("research stand manual controls, OFF/ON recipe reuse, bounded samples and resources", async ({ page }, info) => {
    test.setTimeout(180_000)
    await page.goto(researchUrl)
    await expect(page.getByRole("button", { name: "Run Validation", exact: true })).toBeDisabled()
    await page.getByRole("button", { name: "Choose Reference Frame", exact: true }).click()
    await page.locator("#gate5-reference-file").setInputFiles({ name: "reference.gif",
        mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("radio", { name: "Aspect ratio 1:1", exact: true }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Set as Reference", exact: true }).click()
    await expect(page.getByTestId("recipe-identity")).toHaveText(/^[a-f0-9]{64}$/)
    const identity = await page.getByTestId("recipe-identity").textContent()
    const referenceDownload = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download sealed Reference", exact: true }).click()
    const referenceFile = await (await referenceDownload).path()
    const referenceBytes = await readFile(referenceFile!)

    for (const mode of ["OFF", "ON"] as const) {
        if (mode === "ON") {
            await page.goto(researchUrl)
            await page.getByLabel("Import sealed Reference", { exact: true }).setInputFiles({ name: "reference.json",
                mimeType: "application/json", buffer: referenceBytes })
            await expect(page.getByTestId("recipe-identity")).toHaveText(identity!)
        }
        await installFolder(page)
        await page.getByRole("button", { name: "Choose Source Folder", exact: true }).click()
        await expect(page.getByText(/20 eligible, 1 skipped/)).toBeVisible()
        await page.getByRole("radio", { name: mode === "ON" ? "ON - one rAF before Batch start" : "OFF - no adapter rAF", exact: true }).check()
        await expect(page.getByRole("button", { name: "Run Validation", exact: true })).toBeEnabled()
        // This automated click verifies mechanics; it is not Owner/manual performance evidence.
        await page.getByRole("button", { name: "Run Validation", exact: true }).click()
        await expect(page.getByRole("button", { name: "Download local JSON report", exact: true })).toBeVisible({ timeout: 120_000 })
        await expect(page.getByRole("button", { name: "Run Validation", exact: true })).toBeDisabled()
        const pending = page.waitForEvent("download")
        await page.getByRole("button", { name: "Download local JSON report", exact: true }).click()
        const filename = await (await pending).path()
        const report = JSON.parse(await readFile(filename!, "utf8")) as ValidationReport
        await writeFile(info.outputPath(`synthetic-${mode}.json`), JSON.stringify(report, null, 2))
        expect(report.mode).toBe(mode)
        expect(report.fatal).toBeNull()
        expect(report.recipeIdentity).toBe(identity)
        expect(report.adapter.explicitRafCount).toBe(mode === "ON" ? 1 : 0)
        expect(report.summary).toMatchObject({ planned: 20, attempted: 20, succeeded: 20, failed: 0, skipped: 1 })
        expect(report.rows.map(row => row.sourceFilename)).toEqual(Array.from({ length: 20 }, (_, i) => `frame${i + 1}.gif`))
        expect(report.rows.every(row => row.pngCallbackMs !== null && row.explicitRafCount === report.adapter.explicitRafCount)).toBe(true)
        expect(report.resources).toEqual({ decodedOpened: 20, decodedClosed: 20, peakActiveDecoded: 1,
            sinkWriteAttempts: 20, sinkWriteSucceeded: 20 })
        expect(report.peakRetainedPngBlobs).toBeLessThanOrEqual(7)
        expect(report.retainedPngBlobs).toBe(0)
        expect(report.exactness).toHaveLength(5)
        expect(report.exactness.every(sample => sample.status === "PASS" && "differentBytes" in sample && sample.differentBytes === 0)).toBe(true)
        expect(report.manifest.skipped[0].reason).toBe("animated-gif")
        expect(report.summary.png.n).toBe(20)
        await info.attach(`synthetic-stand-${mode}`, { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: "application/json" })
    }
    await page.screenshot({ path: info.outputPath("stand-summary.png"), fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(overflow).toBe(false)
    const sealed = JSON.parse(referenceBytes.toString()).sealed
    await page.addScriptTag({ content: proofBundle })
    for (const kind of ["unreadable", "changed", "fatal"] as const) {
        const result = await page.evaluate(({ sealed, bytes, kind }) => window.rafValidationProof.probeFailures(sealed, bytes, kind),
            { sealed, bytes: [...staticGifBytes], kind })
        expect(result.nativeRestored).toBe(true)
        expect(result.report.retainedPngBlobs).toBe(0)
        if (kind === "unreadable") {
            expect(result.report.summary.failed).toBe(1)
            expect(result.report.rows[1]).toMatchObject({ status: "failed", reason: "source-read-failed", pngCallbackMs: null })
        } else if (kind === "changed") {
            expect(result.report.exactness.every(sample => sample.status === "INVALID_SOURCE_CHANGED")).toBe(true)
        } else {
            expect(result.report.fatal).toBe("Controlled observer failure")
            expect(result.report.resources).toBeNull()
            expect(result.report.rows[0].status).toBe("unresolved")
        }
    }
})

test("research stand rejects invalid Reference import without enabling Run", async ({ page }) => {
    await page.goto(researchUrl)
    await page.getByLabel("Import sealed Reference", { exact: true }).setInputFiles({ name: "invalid.json",
        mimeType: "application/json", buffer: Buffer.from('{"version":1}') })
    await expect(page.getByRole("alert")).toHaveText("Invalid research Reference package")
    await expect(page.getByRole("button", { name: "Run Validation", exact: true })).toBeDisabled()
})
