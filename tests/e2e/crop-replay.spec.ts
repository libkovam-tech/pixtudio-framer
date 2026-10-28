import { expect, test } from "@playwright/test"
import { installStableVisualEnvironment, openBearImageCropScreen, collectBrowserErrors } from "./helpers"
import { captureCropDigest, installCropCapture } from "./cropCapture"
import { build } from "esbuild"
import path from "node:path"
import type * as Harness from "./cropReplayHarness"

declare global {
    interface Window { cropReplayHarness: typeof Harness }
}

let harness: string
test.beforeAll(async () => {
    const bundle = await build({
        entryPoints: [path.resolve("tests/e2e/cropReplayHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "cropReplayHarness",
    })
    harness = bundle.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installCropCapture(page)
})

// Recorded before extracting applyGeometry from HEAD a156b5f. These are raw
// Crop RGBA hashes, not screenshots or a comparison of two new render paths.
test("crop baseline preserves the original editor raster for every aspect", async ({ page }) => {
    test.setTimeout(90_000)
    const errors = collectBrowserErrors(page)
    const results = []
    for (const aspect of ["16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"]) {
        await openBearImageCropScreen(page)
        await page.getByRole("radio", { name: `Aspect ratio ${aspect}` }).click()
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
        results.push({ aspect, ...await captureCropDigest(page) })
        await page.addScriptTag({ content: harness })
        await page.evaluate(() => {
            const capture = window.cropEvidence.captured
            if (!capture) throw new Error("Missing actual editor capture")
            window.cropReplayHarness.replayCapturedCrop(capture)
        })
        await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible()
    }
    expect(JSON.stringify(results, null, 2)).toMatchSnapshot("crop-original-rgba.json")
    expect(errors.flush()).toEqual([])
})

test("crop replay matches the pre-extraction oracle across transformed RGBA fixtures", async ({ page }) => {
    await page.goto("/editor/")
    await page.addScriptTag({ content: harness })
    const result = await page.evaluate(() => window.cropReplayHarness.runCropMatrix())
    expect(result.cases).toBe(84)
    expect(result.transparentBytes).toBeGreaterThan(0)
})

test("crop replay is independent of the viewport after authoring", async ({ page }, testInfo) => {
    await openBearImageCropScreen(page)
    await page.getByRole("radio", { name: "Aspect ratio 9:16" }).click()
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
            const x = handle.x + handle.width / 2
            const y = handle.y + handle.height / 2
            await page.mouse.move(x, y)
            await page.mouse.down()
            await page.mouse.move(x + dx, y + dy, { steps: 6 })
            await page.mouse.up()
        }
    }
    await page.evaluate(() => { window.cropEvidence.armed = true })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
    if (testInfo.project.name === "desktop") {
        expect(await page.evaluate(() => window.cropEvidence.captured!.geometry.rotationRadians)).not.toBe(0)
    }
    await page.addScriptTag({ content: harness })
    await page.setViewportSize({ width: 900, height: 650 })
    const result = await page.evaluate(() => {
        if (!window.cropEvidence.captured) throw new Error("Missing Crop")
        return window.cropReplayHarness.replayCapturedCrop(window.cropEvidence.captured)
    })
    expect(result).toEqual({ width: 512, height: 910 })
})

test("crop final state is independent of aspect-selection history", async ({ page }) => {
    const errors = collectBrowserErrors(page)
    const results = []
    for (const detour of [false, true]) {
        await openBearImageCropScreen(page)
        if (detour) {
            await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
        }
        await page.getByRole("radio", { name: "Aspect ratio 9:16" }).click()
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
        const result = await page.evaluate(() => ({
            geometry: window.cropEvidence.captured!.geometry,
        }))
        results.push({ ...result, raster: await captureCropDigest(page) })
        await page.addScriptTag({ content: harness })
        await page.evaluate(() => {
            const capture = window.cropEvidence.captured
            if (!capture) throw new Error("Missing actual editor capture")
            window.cropReplayHarness.replayCapturedCrop(capture)
        })
    }
    expect(results[1]).toEqual(results[0])
    expect(errors.flush()).toEqual([])
})
