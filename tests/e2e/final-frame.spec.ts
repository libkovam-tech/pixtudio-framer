import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import path from "node:path"
import { bearImagePath, collectBrowserErrors, installStableVisualEnvironment } from "./helpers"
import { openCanonicalAuthoringCropScreen } from "./canonicalAuthoringFixture"
import { installCropCapture } from "./cropCapture"
import type * as Harness from "./finalFrameHarness"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"

declare global { interface Window { finalFrameProof: typeof Harness } }
let harness: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/finalFrameHarness.ts")], bundle: true,
        write: false, format: "iife", globalName: "finalFrameProof" })
    harness = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installCropCapture(page)
    await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined }))
})

const cases = [
    { name: "auto neutral 9:16", aspect: "9:16", palette: "auto" },
    { name: "auto WB grid 1:1", aspect: "1:1", palette: "auto", wb: true, grid: 16 },
    { name: "auto method HSV de-confetti", aspect: "3:2", palette: "auto", method: true, deConfetti: true },
    { name: "preset WB de-confetti", aspect: "9:16", palette: "preset", wb: true, deConfetti: true },
    { name: "preset HSV", aspect: "3:4", palette: "preset", fixedColorSpace: true },
    { name: "imported palette", aspect: "1:1", palette: "imported" },
    { name: "imported WB grid de-confetti", aspect: "2:3", palette: "imported", wb: true, grid: 32, deConfetti: true },
    { name: "auto transformed crop", aspect: "9:16", palette: "auto", transform: true },
] as const

for (const scenario of cases) {
    test(`canonical Batch full PNG identity: ${scenario.name}`, async ({ page }, testInfo) => {
        test.setTimeout(90_000)
        const errors = collectBrowserErrors(page)
        await openCanonicalAuthoringCropScreen(page)
        await page.getByRole("radio", { name: `Aspect ratio ${scenario.aspect}` }).click()
        if ("transform" in scenario && scenario.transform) {
            const canvas = page.locator('[data-crop-frame-region="true"] canvas')
            const box = (await canvas.boundingBox())!
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            await page.mouse.down()
            await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 - 20, { steps: 5 })
            await page.mouse.up()
            if (testInfo.project.name === "desktop") {
                for (const [selector, dx, dy] of [
                    ['[data-crop-rotate-handle="true"]', -45, 25],
                    ['[data-crop-scale-handle="true"]', 35, 35],
                ] as const) {
                    const handle = (await page.locator(selector).boundingBox())!
                    const x = handle.x + handle.width / 2; const y = handle.y + handle.height / 2
                    await page.mouse.move(x, y); await page.mouse.down()
                    await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up()
                }
            }
        }
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible()
        if ("wb" in scenario && scenario.wb) {
            await page.getByRole("button", { name: "Smart Object", exact: true }).click()
            await page.locator('input[type="range"][max="1"]').fill("0.8")
            await page.getByRole("button", { name: "Apply", exact: true }).click()
        }
        if ("grid" in scenario) {
            await page.locator('input[type="range"][max="128"]').fill(String(scenario.grid))
        }
        if (scenario.palette === "preset") {
            await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
            await page.getByRole("button", { name: /^SUNSET\b/ }).click()
        } else if (scenario.palette === "imported") {
            await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
            const chooser = page.waitForEvent("filechooser")
            await page.getByRole("button", { name: "Load Palette" }).click()
            await (await chooser).setFiles(bearImagePath)
        }
        if ("method" in scenario && scenario.method) {
            await page.getByRole("button", { name: "METHOD", exact: true }).click()
            await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
            await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
            await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        if ("fixedColorSpace" in scenario && scenario.fixedColorSpace) {
            await page.getByRole("button", { name: "METHOD", exact: true }).click()
            await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
            await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        if ("deConfetti" in scenario && scenario.deConfetti) {
            await page.getByRole("button", { name: "METHOD", exact: true }).click()
            await page.locator('input[data-de-confetti-control="enabled"]').check()
            await page.locator('button[data-axis="de-confetti"][data-de-confetti-tie-breaker="2"]').click()
            await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        const save = page.waitForEvent("download")
        await page.getByRole("button", { name: "Save Project", exact: true }).click()
        const snapshot: ProjectSnapshotV2 = JSON.parse(await readFile((await (await save).path())!, "utf8"))
        await page.getByRole("button", { name: "Export", exact: true }).click()
        const download = page.waitForEvent("download")
        await page.getByRole("button", { name: /^PNG$/ }).click()
        const png = [...await readFile((await (await download).path())!)]
        await page.addScriptTag({ content: harness })
        const evidence = await page.evaluate(async ({ snapshot, png }) => {
            const crop = window.cropEvidence.captured
            if (!crop) throw new Error("Missing actual Crop")
            const recipe = window.finalFrameProof.captureFinalFrame(crop, snapshot)
            return { recipe, result: await window.finalFrameProof.compareFinalPng(crop, recipe, png) }
        }, { snapshot, png })
        await testInfo.attach("v2-final-png-identity", { contentType: "application/json",
            body: Buffer.from(JSON.stringify(evidence, null, 2)) })
        expect(evidence.result.width).toBe(evidence.result.expectedWidth)
        expect(evidence.result.height).toBe(evidence.result.expectedHeight)
        expect(evidence.result.bytes).toBe(evidence.result.expectedBytes)
        expect(evidence.result.differentBytes).toBe(0)
        expect(errors.flush()).toEqual([])
    })
}
