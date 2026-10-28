import { expect, test, type Page } from "@playwright/test"
import { collectBrowserErrors, installStableVisualEnvironment, openBearProject } from "./helpers"
import { build } from "esbuild"
import path from "node:path"
import { readFile } from "node:fs/promises"
import type * as Harness from "./smartReplayHarness"

declare global {
    interface Window {
        smartPreviewRaster?: ImageData
        smartReferenceBase: ImageData
        smartReplayHarness: typeof Harness
    }
}

let harness: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/smartReplayHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "smartReplayHarness" })
    harness = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await page.addInitScript(() => {
        const original = CanvasRenderingContext2D.prototype.putImageData
        CanvasRenderingContext2D.prototype.putImageData = function (data: ImageData, ...args: number[]) {
            window.smartPreviewRaster = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height)
            Reflect.apply(original, this, [data, ...args])
        }
    })
})

test("smart WB original editor RGBA baseline", async ({ page }) => {
    const errors = collectBrowserErrors(page)
    await openBearProject(page)
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible()
    await expect(page.locator('input[type="range"][max="1"]')).toHaveValue("0.5")
    for (const slider of await page.locator('input.soRange').all()) await expect(slider).toHaveValue("0")
    await expect.poll(() => page.evaluate(() => !!window.smartPreviewRaster)).toBe(true)
    await page.evaluate(() => { window.smartReferenceBase = window.smartPreviewRaster! })
    await page.addScriptTag({ content: harness })
    const results = []
    for (const wb of [0, 0.2, 0.5, 0.8, 1]) {
        await page.evaluate(() => { window.smartPreviewRaster = undefined })
        await page.locator('input[type="range"][max="1"]').fill(String(wb))
        await expect.poll(() => page.evaluate(() => !!window.smartPreviewRaster)).toBe(true)
        await page.evaluate(value => window.smartReplayHarness.compareSmartReplay(
            window.smartReferenceBase, value, window.smartPreviewRaster!
        ), wb)
        results.push(await page.evaluate(async () => {
            const raster = window.smartPreviewRaster!
            const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(raster.data))
            return { width: raster.width, height: raster.height,
                sha256: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("") }
        }))
    }
    expect(JSON.stringify(results, null, 2)).toMatchSnapshot("smart-original-rgba.json")
    expect(errors.flush()).toEqual([])
})

test("smart frozen WB preserves Apply, Cancel, history and project reload", async ({ page }) => {
    const errors = collectBrowserErrors(page)
    await page.addInitScript(() => {
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined })
    })
    await openBearProject(page)
    const wb = page.locator('input[type="range"][max="1"]')
    const openSmart = async () => {
        await page.evaluate(() => { window.smartPreviewRaster = undefined })
        await page.getByRole("button", { name: "Smart Object", exact: true }).click()
        await expect(wb).toBeVisible()
        await expect.poll(() => page.evaluate(() => !!window.smartPreviewRaster)).toBe(true)
    }
    await openSmart()
    const neutral = await previewDigest(page)
    await page.evaluate(() => { window.smartPreviewRaster = undefined })
    await wb.fill("0.8")
    await expect.poll(() => page.evaluate(() => !!window.smartPreviewRaster)).toBe(true)
    const committed = await previewDigest(page)
    expect(committed).not.toBe(neutral)
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await openSmart()
    await expect(wb).toHaveValue("0.8")
    expect(await previewDigest(page)).toBe(committed)
    await wb.fill("0.2")
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await openSmart()
    await expect(wb).toHaveValue("0.8")
    expect(await previewDigest(page)).toBe(committed)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await openSmart()
    await expect(wb).toHaveValue("0.5")
    expect(await previewDigest(page)).toBe(neutral)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    await openSmart()
    await expect(wb).toHaveValue("0.8")
    expect(await previewDigest(page)).toBe(committed)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Project", exact: true }).click()
    const download = await downloadPromise
    const saved = await readFile((await download.path())!)
    await page.goto("/editor/")
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File", exact: true }).click()
    await (await chooserPromise).setFiles({ name: "smart-roundtrip.pixtudio", mimeType: "application/json", buffer: saved })
    await openSmart()
    await expect(wb).toHaveValue("0.8")
    expect(await previewDigest(page)).toBe(committed)
    expect(errors.flush()).toEqual([])
})

async function previewDigest(page: Page) {
    return page.evaluate(async () => {
        const data = window.smartPreviewRaster
        if (!data) throw new Error("Missing Smart preview")
        const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(data.data))
        return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("")
    })
}
