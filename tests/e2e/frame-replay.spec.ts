import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import path from "node:path"
import { installStableVisualEnvironment, openBearImageCropScreen, collectBrowserErrors } from "./helpers"
import { installCropCapture } from "./cropCapture"
import type * as Harness from "./frameReplayHarness"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"

declare global { interface Window { frameProof: typeof Harness } }
let harness: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/frameReplayHarness.ts")], bundle: true,
        write: false, format: "iife", globalName: "frameProof" })
    harness = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installCropCapture(page)
    await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }))
})

for (const scenario of ["neutral", "WB", "refinement", "WB-refinement"] as const) {
    test(`full frame replay PNG identity: ${scenario}`, async ({ page }, testInfo) => {
        const errors = collectBrowserErrors(page)
        await openBearImageCropScreen(page)
        await page.getByRole("radio", { name: "Aspect ratio 9:16" }).click()
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible()
        if (scenario.includes("WB")) {
            await page.getByRole("button", { name: "Smart Object", exact: true }).click()
            await page.locator('input[type="range"][max="1"]').fill("0.8")
            await page.getByRole("button", { name: "Apply", exact: true }).click()
        }
        if (scenario.includes("refinement")) {
            await page.getByRole("button", { name: "METHOD", exact: true }).click()
            await page.locator('input[data-de-confetti-control="enabled"]').check()
            await page.locator('button[data-axis="de-confetti"][data-de-confetti-tie-breaker="2"]').click()
            await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        const save = page.waitForEvent("download")
        await page.getByRole("button", { name: "Save Project", exact: true }).click()
        const snapshot: ProjectSnapshotV2 = JSON.parse(await readFile((await (await save).path())!, "utf8"))
        expect(snapshot.strokeLayer.cells).toHaveLength(0)
        if (scenario.includes("refinement")) expect(snapshot.deConfettiByPaletteContext?.auto.enabled).toBe(true)
        await page.getByRole("button", { name: "Export", exact: true }).click()
        const download = page.waitForEvent("download")
        await page.getByRole("button", { name: /^PNG$/ }).click()
        const png = [...await readFile((await (await download).path())!)]
        await page.addScriptTag({ content: harness })
        const evidence = await page.evaluate(async ({ snapshot, png }) => {
            const crop = window.cropEvidence.captured
            if (!crop) throw new Error("Missing actual Crop")
            const recipe = window.frameProof.captureFrame(crop, snapshot)
            return { recipe, result: await window.frameProof.comparePng(crop, recipe, png) }
        }, { snapshot, png })
        await testInfo.attach("full-frame-png-evidence", { contentType: "application/json", body: Buffer.from(JSON.stringify(evidence, null, 2)) })
        expect(evidence.result.width).toBe(evidence.result.expectedWidth)
        expect(evidence.result.height).toBe(evidence.result.expectedHeight)
        expect(evidence.result.bytes).toBe(evidence.result.expectedBytes)
        expect(evidence.result.differentBytes).toBe(0)
        expect(JSON.stringify(evidence.result, null, 2)).toMatchSnapshot(`original-export-${scenario}.json`)
        expect(errors.flush()).toEqual([])
    })
}

test("full frame replay PNG identity: transparent swatch at unchanged grid", async ({ page }) => {
    const errors = collectBrowserErrors(page)
    await openBearImageCropScreen(page)
    await page.evaluate(() => { window.cropEvidence.armed = true })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible()
    const firstSave = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Project", exact: true }).click()
    const initial: ProjectSnapshotV2 = JSON.parse(await readFile((await (await firstSave).path())!, "utf8"))
    const title = await page.locator('button[title^="#"], button[title^="rgb("]').nth(7).getAttribute("title")
    if (!title) throw new Error("Missing Auto swatch")
    await page.getByTitle(title, { exact: true }).click({ button: "right" })
    await page.getByLabel("Transparent", { exact: true }).check()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByText("SWATCH EDIT", { exact: true })).toHaveCount(0)
    const secondSave = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Project", exact: true }).click()
    const edited: ProjectSnapshotV2 = JSON.parse(await readFile((await (await secondSave).path())!, "utf8"))
    const editedId = Object.keys(edited.autoOverrides ?? {}).find(id => edited.autoOverrides?.[id]?.isTransparent)
    if (!editedId) throw new Error("Missing transparent swatch identity")
    await page.getByRole("button", { name: "Export", exact: true }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: /^PNG$/ }).click()
    const png = [...await readFile((await (await download).path())!)]
    await page.addScriptTag({ content: harness })
    const result = await page.evaluate(async ({ initial, editedId, png }) => {
        const crop = window.cropEvidence.captured
        if (!crop) throw new Error("Missing actual Crop")
        const initialRecipe = window.frameProof.captureFrame(crop, initial)
        const swatch = initialRecipe.palette.outputs.find(value => value.id === editedId)
        if (!swatch) throw new Error("Missing original matching swatch")
        const palette = window.frameProof.applyAutoPaletteReplayEdit(initialRecipe.palette,
            { kind: "edit", id: editedId, color: swatch.color, transparent: true })
        const recipe = window.frameProof.freezeFrameReplayRecipe({ ...initialRecipe, palette })
        return window.frameProof.comparePng(crop, recipe, png)
    }, { initial, editedId, png })
    expect(result.differentBytes).toBe(0)
    expect(result.width).toBe(result.expectedWidth)
    expect(result.height).toBe(result.expectedHeight)
    expect(errors.flush()).toEqual([])
})
