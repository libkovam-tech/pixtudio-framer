import { expect, test, type Page } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { staticGifBytes } from "../fixtures/staticGifBytes"
import { controlledPng } from "../fixtures/staticRasterBytes"
import { parseStoredZip } from "../fixtures/parseStoredZip"
import { batchTemplateFixture } from "../fixtures/batchTemplateFixture"
import { BATCH_TEMPLATE_FILENAME, MAX_BATCH_TEMPLATE_BYTES, parseBatchTemplate, serializeBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate"
import { PREP_CONFIG } from "../../src/editor/referencePreparation"
import { installStableVisualEnvironment } from "./helpers"
import type * as Proof from "./gate11TemplateHarness"

declare global { interface Window {
    gate11Proof: typeof Proof
    gate11SourceNames: string[]
    gate11SourceBytes: number[]
    gate11Release: (() => void) | null
    gate11CancelNext: boolean
} }
let bundle: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/gate11TemplateHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "gate11Proof" })
    bundle = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await page.addInitScript(bytes => {
        window.gate11SourceNames = ["frame0.gif", "frame1.gif", "frame2.gif"]
        window.gate11SourceBytes = bytes
        window.gate11CancelNext = false
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => {
            if (window.gate11CancelNext) {
                window.gate11CancelNext = false
                throw new DOMException("Cancelled", "AbortError")
            }
            return {
            kind: "directory", name: "GATE11", async *values() {
                for (const name of window.gate11SourceNames) yield { kind: "file", name,
                    async getFile() {
                        if (name === "frame1.gif" && Reflect.get(window, "gate11LoseAccessNext")) {
                            throw new DOMException("Source was moved", "NotFoundError")
                        }
                        return new File([Uint8Array.from(window.gate11SourceBytes)], name, { type: "image/gif" })
                    } }
            },
        } } })
    }, [...staticGifBytes])
    await page.goto("/plugins/batch-pixelation/")
})
async function state(page: Page, kind: string) { await expect(page.getByTestId("batch-workflow-state")).toHaveText(kind) }
async function configure(page: Page, imported = false) {
    await state(page, "entry")
    const reference = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await reference).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await state(page, "authoring")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    if (imported) {
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await page.getByRole("button", { name: /^GRAY\b/ }).click()
        const picker = page.waitForEvent("filechooser")
        await page.getByRole("button", { name: "Load Palette", exact: true }).click()
        await (await picker).setFiles({ name: "palette.png", mimeType: "image/png", buffer: Buffer.from(controlledPng(false)) })
    }
    await state(page, "authoring")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
}
async function save(page: Page) {
    await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    const waiting = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe", exact: true }).click()
    const download = await waiting
    expect(download.suggestedFilename()).toBe(BATCH_TEMPLATE_FILENAME)
    const bytes = await readFile((await download.path())!)
    await download.saveAs(test.info().outputPath(BATCH_TEMPLATE_FILENAME))
    await state(page, "authoring")
    return bytes.toString("utf8")
}
async function open(page: Page, text: string | Buffer, filename = BATCH_TEMPLATE_FILENAME) {
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE", exact: true }).click()
    await state(page, "opening")
    await (await chooser).setFiles({ name: filename, mimeType: "application/json", buffer: Buffer.from(text) })
}
async function source(page: Page) {
    if ((await page.getByTestId("batch-workflow-state").textContent()) === "authoring") {
        await page.getByRole("button", { name: "Choose Source Frames" }).click()
    }
    await state(page, "source")
    await page.getByRole("button", { name: "Choose Source Folder", exact: true }).click()
    await expect(page.getByRole("button", { name: "Start Batch", exact: true })).toBeEnabled()
}
async function run(page: Page) {
    await page.getByRole("button", { name: "Start Batch", exact: true }).click()
    await state(page, "workspace")
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    return (await page.getByTestId("batch-output-run-id").textContent())!
}
async function zip(page: Page) {
    await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    const waiting = page.waitForEvent("download")
    await page.getByRole("button", { name: "Prepare and Download ZIP", exact: true }).click()
    await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
    const download = await waiting
    const entries = parseStoredZip(await readFile((await download.path())!))
    await download.saveAs(test.info().outputPath(download.suggestedFilename()))
    expect(entries.has("batch_report.txt")).toBe(true)
    return entries
}
function fixtureText() {
    const sealed = batchTemplateFixture()
    return serializeBatchTemplate({ ...sealed, referenceInputGeometry: { width: 1, height: 1 } })
}
async function evidence(name: string, value: unknown) {
    const text = JSON.stringify(value, null, 2)
    await writeFile(test.info().outputPath(`${name}.json`), text)
    await test.info().attach(name, { body: Buffer.from(text), contentType: "application/json" })
}

test("Gate 11 Entry and fresh remount have no authoring/template/run state", async ({ page }) => {
    await state(page, "entry")
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toHaveCount(0)
    await open(page, fixtureText()); await state(page, "source")
    // Exercise actual component unmount/remount without a document reload.
    await page.evaluate(() => { history.pushState({}, "", "/faq/"); window.dispatchEvent(new PopStateEvent("popstate")) })
    await expect(page.getByTestId("batch-workflow-state")).toHaveCount(0)
    await page.evaluate(() => { history.pushState({}, "", "/plugins/batch-pixelation/"); window.dispatchEvent(new PopStateEvent("popstate")) })
    await state(page, "entry")
})

for (const imported of [false, true]) {
    test(`Gate 11 complete native ${imported ? "Imported" : "Auto"} Save/Open/run/ZIP/Discard chain preserves RGBA and portability`, async ({ page }) => {
        await configure(page, imported)
        const text = await save(page)
        const original = parseBatchTemplate(text)
        expect(original.recipe.palette.source).toBe(imported ? "imported" : "auto")
        expect(await save(page)).toBe(text)
        await page.screenshot({ path: test.info().outputPath("template-ready.png"), fullPage: true })
        await source(page); const firstId = await run(page); const first = await zip(page)
        await page.getByRole("button", { name: "START OVER" }).click(); await state(page, "entry")
        // No Reference or original Imported Palette is supplied to the new session.
        await open(page, text); await state(page, "source")
        await expect(page.locator(".batch-reference-stage")).toHaveCount(0)
        await expect(page.getByTestId("gate5-revision")).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toHaveCount(0)
        await source(page); const secondId = await run(page); expect(secondId).not.toBe(firstId)
        const second = await zip(page)
        await page.addScriptTag({ content: bundle })
        const comparisons = []
        for (const name of ["frame0.png", "frame1.png", "frame2.png"]) {
            const comparison = await page.evaluate(({ a, b }) => window.gate11Proof.comparePngs(a, b), {
                a: [...first.get(name)!], b: [...second.get(name)!] })
            expect(comparison.width).toBe(comparison.expectedWidth); expect(comparison.height).toBe(comparison.expectedHeight)
            expect(comparison.differentBytes).toBe(0); comparisons.push({ name, ...comparison })
        }
        await evidence("native-roundtrip", { source: original.recipe.palette.source, firstId, secondId,
            templateBytes: Buffer.byteLength(text), identityEqual: JSON.stringify(parseBatchTemplate(text)) === JSON.stringify(original), comparisons,
            keys: Object.keys(JSON.parse(text)), sealedKeys: Object.keys(original), recipeKeys: Object.keys(original.recipe),
            originalReferenceProvidedOnOpen: false, originalPaletteFileProvidedOnOpen: false })
        await state(page, "workspace")
        await page.getByRole("button", { name: "START OVER" }).click(); await state(page, "entry")
    })
}

test("Gate 11 opens an Android-renamed downloaded Recipe", async ({ page }) => {
    await open(page, fixtureText(), "PIXTUDIO_Batch_Template.pixtudio-batch (2).json")
    await state(page, "source")
    await expect(page.getByRole("alertdialog", { name: "IMPORT ERROR" })).toHaveCount(0)
})

test("Gate 11 representative semantic fixtures preserve decoded PNG RGBA with frozen WB and DeConfetti", async ({ page }) => {
    await page.addScriptTag({ content: bundle })
    const result = await page.evaluate(() => window.gate11Proof.semanticReplayProof())
    for (const row of result) {
        expect(row.identityEqual).toBe(true); expect(row.deepEqual).toBe(true); expect(row.paletteOrderEqual).toBe(true)
        expect(row.whiteBalance).toBe("matrix")
        expect(row.width).toBe(row.expectedWidth); expect(row.height).toBe(row.expectedHeight); expect(row.differentBytes).toBe(0)
    }
    await evidence("semantic-roundtrip", result)
})

test("Gate 11 opened template cancels safely and downloads only committed partial PNGs", async ({ page }) => {
    await open(page, fixtureText()); await state(page, "source"); await source(page)
    await page.evaluate(() => {
        window.gate11Release = null
        const native = HTMLCanvasElement.prototype.toBlob
        let count = 0
        HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
            native.call(this, blob => {
                if (++count === 2) window.gate11Release = () => callback(blob)
                else callback(blob)
            }, ...args)
        }
    })
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect.poll(() => page.evaluate(() => typeof window.gate11Release)).toBe("function")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toHaveCount(0)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByText("Cancelling...")).toBeVisible()
    await page.evaluate(() => window.gate11Release!())
    await expect(page.getByRole("heading", { name: "Cancelled", exact: true })).toBeVisible()
    const entries = await zip(page)
    expect([...entries.keys()]).toEqual(["batch_report.txt", "frame0.png", "frame1.png"])
    expect(new TextDecoder().decode(entries.get("batch_report.txt"))).toContain("Not processed: 1")
    const terminal = await page.getByTestId("batch-run-result").textContent()
    await page.evaluate(() => window.gate11Release!())
    expect(await page.getByTestId("batch-run-result").textContent()).toBe(terminal)
    await page.getByRole("button", { name: "START OVER" }).click()
    await state(page, "entry")
    await open(page, fixtureText()); await state(page, "source")
})

test("Gate 11 Cancel clears source, Replace Source uses a new scan and keeps the recipe", async ({ page }) => {
    const text = fixtureText(); await open(page, text); await state(page, "source")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.evaluate(() => { window.gate11SourceNames = ["replacement.gif"] })
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByTestId("gate7-source-manifest")).toContainText("replacement.gif")
    expect(await page.getByTestId("gate7-source-manifest").textContent()).not.toContain("frame0.gif")
    await page.getByRole("button", { name: "Cancel", exact: true }).click(); await state(page, "entry")
    await open(page, text); await state(page, "source")
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.getByRole("button", { name: "START OVER" }).click(); await state(page, "entry")
    await open(page, text); await state(page, "source")
})

test("Gate 11 dismissing replacement picker keeps the selected Source Set runnable", async ({ page }) => {
    await open(page, fixtureText()); await state(page, "source")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    const before = await page.getByTestId("gate7-source-manifest").textContent()
    await page.evaluate(() => { window.gate11CancelNext = true })
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByText("Folder selection was cancelled. Source Set unchanged."))
        .toBeVisible()
    await expect(page.getByTestId("gate7-source-manifest")).toHaveText(before ?? "")
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await run(page)
})

test("Gate 11 lost folder access during replacement scan clears ready state", async ({ page }) => {
    await open(page, fixtureText()); await state(page, "source")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.evaluate(() => Reflect.set(window, "gate11LoseAccessNext", true))
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("alert")).toContainText(
        "Source folder or files became unavailable during scan. Choose the folder again.")
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
})

test("Gate 11 same immutable template accepts a second independent Source Folder/run", async ({ page }) => {
    const text = fixtureText(); await open(page, text); await state(page, "source")
    await source(page); const firstId = await run(page); await zip(page)
    await page.getByRole("button", { name: "START OVER" }).click(); await state(page, "entry")
    await page.evaluate(() => {
        window.gate11SourceNames = ["next0.gif", "next1.gif"]
        Object.defineProperty(window, "showDirectoryPicker", { value: async () => ({ kind: "directory", name: "SECOND_FOLDER",
            async *values() { for (const name of window.gate11SourceNames) yield { kind: "file", name,
                async getFile() { return new File([Uint8Array.from(window.gate11SourceBytes)], name, { type: "image/gif" }) } } },
        }) })
    })
    await open(page, text); await source(page)
    const secondId = await run(page)
    expect(secondId).not.toBe(firstId)
    const entries = await zip(page)
    expect([...entries.keys()]).toEqual(["batch_report.txt", "next0.png", "next1.png"])
    const report = new TextDecoder().decode(entries.get("batch_report.txt"))
    expect(report).toContain("SECOND_FOLDER"); expect(report).toContain("Processed: 2 / 2")
    await page.getByRole("button", { name: "START OVER" }).click(); await state(page, "entry")
    await open(page, text); await state(page, "source")
    await evidence("second-independent-source", { firstId, secondId, outputs: [...entries.keys()], templateUnchanged: true })
})

test("Gate 11 Source Ready can clear selection or Start Over without starting a run", async ({ page }) => {
    const text = fixtureText(); await open(page, text); await state(page, "source")
    await source(page)
    await page.getByRole("button", { name: "Cancel", exact: true }).click(); await state(page, "entry")
    await open(page, text); await state(page, "source")
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await source(page)
    await page.getByRole("button", { name: "START OVER", exact: true }).click(); await state(page, "entry")
    await expect(page.getByTestId("batch-output-run-id")).toHaveCount(0)
    await open(page, text); await state(page, "source")
})

test("Gate 11 mismatch displays both geometries, blocks Run and permits replacement", async ({ page }) => {
    await open(page, serializeBatchTemplate(batchTemplateFixture())); await state(page, "source")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("alert")).toContainText("Expected 4×2 · found 1×1")
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await page.evaluate(async () => {
        const canvas = document.createElement("canvas"); canvas.width = 4; canvas.height = 2
        canvas.getContext("2d")!.fillRect(0, 0, 4, 2)
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
        window.gate11SourceBytes = [...new Uint8Array(await blob!.arrayBuffer())]
        window.gate11SourceNames = ["compatible.png"]
    })
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch", exact: true })).toBeEnabled()
    await expect(page.getByRole("alert")).toHaveCount(0)
})

test("Gate 11 picker cancellation and detectable Save failure retain the correct state", async ({ page }) => {
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click(); await state(page, "opening")
    await (await chooser).setFiles([])
    await page.getByLabel("Batch Recipe file").dispatchEvent("cancel"); await state(page, "entry")
    await expect(page.getByRole("alert")).toHaveCount(0)
    await configure(page)
    await page.evaluate(() => Object.defineProperty(window, "showSaveFilePicker", {
        configurable: true, value: undefined,
    }))
    await page.evaluate(() => { URL.createObjectURL = () => { throw new Error("private path detail") } })
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const saveError = page.getByRole("alertdialog", { name: "SAVE ERROR" })
    await expect(saveError).toContainText("Could not save Recipe")
    await saveError.getByRole("button", { name: "OK" }).click()
    await state(page, "authoring")
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toBeEnabled()
})

test("Gate 11 late template read cannot revive a cancelled opening", async ({ page }) => {
    await page.evaluate(() => {
        const native = File.prototype.arrayBuffer
        File.prototype.arrayBuffer = async function() {
            await new Promise<void>(resolve => { window.gate11Release = resolve })
            return native.call(this)
        }
    })
    await open(page, fixtureText())
    await expect.poll(() => page.evaluate(() => typeof window.gate11Release)).toBe("function")
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeDisabled()
    await page.getByLabel("Batch Recipe file").dispatchEvent("cancel"); await state(page, "entry")
    await page.evaluate(() => window.gate11Release!())
    await state(page, "entry")
    await expect(page.getByRole("heading", { name: "Template ready" })).toHaveCount(0)
})

test("Gate 11 late source scan cannot revive Source after Cancel", async ({ page }) => {
    await open(page, fixtureText()); await state(page, "source")
    await page.evaluate(() => {
        Object.defineProperty(window, "showDirectoryPicker", { value: async () => ({ kind: "directory", name: "HELD",
            async *values() { yield { kind: "file", name: "held.gif", async getFile() {
                await new Promise<void>(resolve => { window.gate11Release = resolve })
                return new File([Uint8Array.from(window.gate11SourceBytes)], "held.gif", { type: "image/gif" })
            } } } }) })
    })
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect.poll(() => page.evaluate(() => typeof window.gate11Release)).toBe("function")
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toBeDisabled()
    await page.getByRole("button", { name: "Cancel", exact: true }).click(); await state(page, "entry")
    await page.evaluate(() => window.gate11Release!())
    await open(page, fixtureText()); await state(page, "source")
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
})

const invalidCases = ["ordinary-project", "image", "random-json", "truncated", "discriminator", "version", "missing",
    "numeric", "enum", "compatibility", "palette", "crop", "WB", "semantics", "legacy-semantics", "oversize"] as const
for (const invalidCase of invalidCases) {
    test(`Gate 11 rejects ${invalidCase} atomically without Base Editor mount`, async ({ page }) => {
        const value = JSON.parse(fixtureText())
        let text: string | Buffer = fixtureText(); let filename = BATCH_TEMPLATE_FILENAME
        switch (invalidCase) {
            case "ordinary-project": filename = "ordinary.pixtudio"; break
            case "image": text = Buffer.from(staticGifBytes); break
            case "random-json": text = "{}"; break
            case "truncated": text = text.slice(0, -3); break
            case "discriminator": value.kind = "wrong"; text = JSON.stringify(value); break
            case "version": value.schemaVersion = 2; text = JSON.stringify(value); break
            case "missing": delete value.sealed.recipe.grid; text = JSON.stringify(value); break
            case "numeric": value.sealed.recipe.smart.adjustments.exposure = 101; text = JSON.stringify(value); break
            case "enum": value.sealed.recipe.palette.colorSpace = "invalid"; text = JSON.stringify(value); break
            case "compatibility": value.sealed.recipe.palette.colorSpace = "hsv"; text = JSON.stringify(value); break
            case "palette": value.sealed.recipe.palette.outputs = []; text = JSON.stringify(value); break
            case "crop": value.sealed.recipe.crop.drawWidth = -1; text = JSON.stringify(value); break
            case "WB": value.sealed.recipe.smart.whiteBalance = { kind: "matrix", matrix: [], anchorReference: [] }; text = JSON.stringify(value); break
            case "semantics": value.renderSemantics += "new"; text = JSON.stringify(value); break
            case "legacy-semantics": value.renderSemantics = "canonical-static-decode-crop-smart-final-palette-png-v1:" + JSON.stringify(PREP_CONFIG); text = JSON.stringify(value); break
            case "oversize": text = " ".repeat(MAX_BATCH_TEMPLATE_BYTES + 1); break
        }
        await open(page, text, filename); await state(page, "entry")
        const errorDialog = page.getByRole("alertdialog", { name: "IMPORT ERROR" })
        await expect(errorDialog).toBeVisible()
        if (invalidCase === "legacy-semantics") {
            await expect(errorDialog).toContainText("Template uses unsupported render semantics")
        }
        await expect(page.locator(".batch-reference-stage")).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Choose Source Folder" })).toHaveCount(0)
        await errorDialog.getByRole("button", { name: "OK" }).click()
        await expect(errorDialog).toHaveCount(0)
        await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeEnabled()
    })
}
