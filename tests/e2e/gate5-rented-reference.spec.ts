import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import path from "node:path"
import { bearImagePath, collectBrowserErrors, installStableVisualEnvironment } from "./helpers"
import { openCanonicalAuthoringCropScreen } from "./canonicalAuthoringFixture"
import { installCropCapture } from "./cropCapture"
import type * as Proof from "./finalFrameHarness"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"

declare global { interface Window { gate5FrameProof: typeof Proof } }

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({
        entryPoints: [path.resolve("tests/e2e/finalFrameHarness.ts")],
        bundle: true,
        write: false,
        format: "iife",
        globalName: "gate5FrameProof",
    })
    proofBundle = built.outputFiles[0].text
})

for (const aspect of ["9:16", "16:9", "1:1"]) {
    test(`Gate 5 initial ${aspect} import seals only rebuilt layers with exact replay`, async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        const rented = await page.context().newPage()
        const errors = collectBrowserErrors(page)
        const rentedErrors = collectBrowserErrors(rented)
        try {
            await installStableVisualEnvironment(page)
            await installStableVisualEnvironment(rented)
            await installCropCapture(page)
            await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", {
                configurable: true, value: undefined,
            }))
            await openCanonicalAuthoringCropScreen(page, { stabilizeStartButton: true })
            await rented.goto("/__batch-gate5")
            await rented.locator("#gate5-reference-file").setInputFiles(bearImagePath)
            for (const editor of [page, rented]) {
                await editor.getByRole("radio", { name: `Aspect ratio ${aspect}`, exact: true }).click()
            }
            await page.evaluate(() => { window.cropEvidence.armed = true })
            await page.getByRole("button", { name: "OK", exact: true }).click()
            await rented.getByRole("button", { name: "OK", exact: true }).click()
            // No authoring action may repair an invalid initial commit before sealing.
            await rented.getByRole("button", { name: "Set as Reference" }).click()
            await expect(rented.getByText("Reference sealed", { exact: true })).toBeVisible()
            const sealed: SealedReference = JSON.parse((await rented.getByTestId("gate5-sealed-reference").textContent())!)
            expect(sealed.recipe.grid).toEqual(aspect === "9:16"
                ? { size: 32, columns: 32, rows: 57 }
                : aspect === "16:9" ? { size: 32, columns: 57, rows: 32 }
                    : { size: 32, columns: 32, rows: 32 })
            const download = page.waitForEvent("download")
            await page.getByRole("button", { name: "Export", exact: true }).click()
            await page.getByRole("button", { name: /^PNG$/ }).click()
            const png = [...await readFile((await (await download).path())!)]
            await page.addScriptTag({ content: proofBundle })
            const result = await page.evaluate(({ recipe, png }) => {
                const crop = window.cropEvidence.captured
                if (!crop) throw new Error("Missing canonical authoring Crop capture")
                return window.gate5FrameProof.compareFinalPng(crop, recipe, png)
            }, { recipe: JSON.parse(JSON.stringify(sealed.recipe)), png })
            expect(result.width).toBe(result.expectedWidth)
            expect(result.height).toBe(result.expectedHeight)
            expect(result.bytes).toBe(result.expectedBytes)
            expect(result.differentBytes).toBe(0)
            await testInfo.attach("initial-import-rgba-identity", {
                contentType: "application/json", body: Buffer.from(JSON.stringify({ aspect, grid: sealed.recipe.grid, ...result }, null, 2)),
            })
            expect(errors.flush()).toEqual([])
            expect(rentedErrors.flush()).toEqual([])
        } finally {
            await rented.close()
        }
    })
}

async function author(page: Page, alternate: boolean) {
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await page.locator('input[type="range"][max="1"]').fill("0.76")
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
    if (alternate) {
        await page.locator('input[type="range"][max="128"]').fill("24")
    }
    await page.locator('input[type="range"][max="128"]').fill("16")
    if (alternate) {
        await page.getByRole("button", { name: "METHOD", exact: true }).click()
        await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
        await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
        await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        await page.getByRole("button", { name: "METHOD", exact: true }).click()
        await page.locator('button[data-axis="method"][data-method-id="pixtudio"]').click()
        await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
    }
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    if (alternate) {
        await page.getByRole("button", { name: /^GRAY\b/ }).click()
    }
    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await page.locator('input[type="range"][max="1"]').fill("0.84")
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await page.getByRole("button", { name: "METHOD", exact: true }).click()
    await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
    await page.locator('input[data-de-confetti-control="enabled"]').check()
    await page.locator('button[data-axis="de-confetti"][data-de-confetti-tie-breaker="2"]').click()
    await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
}

for (const alternate of [false, true]) {
    test(`Gate 5 rented editor seal and exact Reference replay ${alternate ? "recommits" : "baseline"}`, async ({ page }, testInfo) => {
        test.setTimeout(150_000)
        const errors = collectBrowserErrors(page)
        const rented = await page.context().newPage()
        const rentedErrors = collectBrowserErrors(rented)
        page.setDefaultTimeout(15_000)
        rented.setDefaultTimeout(15_000)
        try {
            await installStableVisualEnvironment(page)
            await installStableVisualEnvironment(rented)
            await installCropCapture(page)
            await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }))
            await openCanonicalAuthoringCropScreen(page, { stabilizeStartButton: true })
            await rented.goto("/__batch-gate5")
            await rented.locator('#gate5-reference-file').setInputFiles(bearImagePath)
            await expect(rented.getByRole("button", { name: "OK", exact: true })).toBeVisible()
            await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
            await rented.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
            await page.evaluate(() => { window.cropEvidence.armed = true })
            await page.getByRole("button", { name: "OK", exact: true }).click()
            await rented.getByRole("button", { name: "OK", exact: true }).click()
            await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible()
            await expect(rented.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
            for (const forbidden of ["Export", "Save Project", "Import", "Brush tool", "Pipette tool", "Quantization Recorder"]) {
                await expect(rented.getByRole("button", { name: forbidden, exact: true })).toHaveCount(0)
            }
            await expect(rented.getByRole("button", { name: "Undo", exact: true })).toBeVisible()
            await expect(rented.getByRole("button", { name: "Redo", exact: true })).toBeVisible()
            await author(page, false)
            await author(rented, alternate)
            await rented.getByRole("button", { name: "Set as Reference" }).click()
            await expect(rented.getByText("Reference sealed")).toBeVisible()
            const sealed: SealedReference = JSON.parse(await rented.getByTestId("gate5-sealed-reference").textContent() ?? "")
            const save = page.waitForEvent("download")
            await page.getByRole("button", { name: "Export", exact: true }).click()
            await page.getByRole("button", { name: /^PNG$/ }).click()
            const png = [...await readFile((await (await save).path())!)]
            await page.addScriptTag({ content: proofBundle })
            const result = await page.evaluate(async ({ recipe, png }) => {
                const crop = window.cropEvidence.captured
                if (!crop) throw new Error("Missing ordinary Crop capture")
                return window.gate5FrameProof.compareFinalPng(crop, recipe, png)
            }, { recipe: JSON.parse(JSON.stringify(sealed.recipe)), png })
            expect(result.width).toBe(result.expectedWidth)
            expect(result.height).toBe(result.expectedHeight)
            expect(result.bytes).toBe(result.expectedBytes)
            expect(result.differentBytes).toBe(0)
            if (process.env.GATE5_EVIDENCE === "1") {
                console.log("GATE5_EVIDENCE", JSON.stringify({
                    project: testInfo.project.name,
                    scenario: alternate ? "recommits" : "baseline",
                    ...result,
                }))
            }
            await testInfo.attach("gate5-pixel-identity", {
                contentType: "application/json",
                body: Buffer.from(JSON.stringify({
                    scenario: alternate ? "recommits" : "baseline",
                    referenceInputGeometry: sealed.referenceInputGeometry,
                    ...result,
                }, null, 2)),
            })
            expect(errors.flush()).toEqual([])
            expect(rentedErrors.flush()).toEqual([])
        } finally {
            await rented.close()
        }
    })
}

for (const palette of ["auto", "imported"] as const) {
    test(`Gate 5 ${palette} palette committed envelope`, async ({ page }, testInfo) => {
        test.setTimeout(120_000)
        page.setDefaultTimeout(15_000)
        const rented = await page.context().newPage()
        rented.setDefaultTimeout(15_000)
        try {
            await installStableVisualEnvironment(page)
            await installStableVisualEnvironment(rented)
            await installCropCapture(page)
            await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }))
            await openCanonicalAuthoringCropScreen(page, { stabilizeStartButton: true })
            await rented.goto("/__batch-gate5")
            await rented.locator('#gate5-reference-file').setInputFiles(bearImagePath)
            await expect(rented.getByRole("button", { name: "OK", exact: true })).toBeVisible()
            await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
            await rented.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
            await page.evaluate(() => { window.cropEvidence.armed = true })
            await page.getByRole("button", { name: "OK", exact: true }).click()
            await rented.getByRole("button", { name: "OK", exact: true }).click()
            await expect(rented.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
            await expect(rented.getByRole("button", { name: "Add swatch" })).toHaveCount(0)
            await expect(rented.getByRole("button", { name: "Transparent" })).toHaveCount(0)
            if (palette === "imported") {
                for (const editor of [page, rented]) {
                    await editor.getByRole("button", { name: /PALETTE PRESETS/i }).click()
                    await editor.getByRole("button", { name: /^GRAY\b/ }).click()
                    const chooser = editor.waitForEvent("filechooser")
                    await editor.getByRole("button", { name: "Load Palette" }).click()
                    await (await chooser).setFiles(bearImagePath)
                }
            }
            await rented.getByRole("button", { name: "METHOD", exact: true }).click()
            await rented.getByRole("button", { name: "Set as Reference" }).click()
            const recipeError = rented.getByRole("alertdialog", { name: "RECIPE ERROR" })
            await expect(recipeError).toContainText("Editor session is not settled")
            await expect(rented.getByTestId("gate5-sealed-reference")).toBeEmpty()
            await recipeError.getByRole("button", { name: "OK" }).click()
            await rented.getByRole("button", { name: "Cancel METHOD" }).click()
            await rented.getByRole("button", { name: "Set as Reference" }).click()
            await expect(rented.getByText("Reference sealed")).toBeVisible()
            const sealed: SealedReference = JSON.parse(await rented.getByTestId("gate5-sealed-reference").textContent() ?? "")
            expect(sealed.recipe.palette.source).toBe(palette)
            const save = page.waitForEvent("download")
            await page.getByRole("button", { name: "Export", exact: true }).click()
            await page.getByRole("button", { name: /^PNG$/ }).click()
            const png = [...await readFile((await (await save).path())!)]
            await page.addScriptTag({ content: proofBundle })
            const result = await page.evaluate(async ({ recipe, png }) => {
                const crop = window.cropEvidence.captured
                if (!crop) throw new Error("Missing ordinary Crop capture")
                return window.gate5FrameProof.compareFinalPng(crop, recipe, png)
            }, { recipe: JSON.parse(JSON.stringify(sealed.recipe)), png })
            expect(result.width).toBe(result.expectedWidth)
            expect(result.height).toBe(result.expectedHeight)
            expect(result.bytes).toBe(result.expectedBytes)
            expect(result.differentBytes).toBe(0)
            if (process.env.GATE5_EVIDENCE === "1") {
                console.log("GATE5_EVIDENCE", JSON.stringify({
                    project: testInfo.project.name,
                    scenario: palette,
                    ...result,
                }))
            }
            await testInfo.attach("gate5-pixel-identity", {
                contentType: "application/json",
                body: Buffer.from(JSON.stringify({ palette, ...result }, null, 2)),
            })
        } finally {
            await rented.close()
        }
    })
}
