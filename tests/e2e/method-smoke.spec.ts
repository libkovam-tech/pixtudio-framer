import { expect, test, type Locator, type Page } from "@playwright/test"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    settle,
} from "./helpers"

const methodSmokePortraitPath = path.join(
    fixturesDir,
    "method-smoke-portrait.png"
)

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
})

test("METHOD happy path survives import, smart object, apply, history, save/load, and export", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openSmokePortrait(page)
    const importedCanvas = await readEditorCanvasSignature(page)

    await applySmartObjectAdjustment(page)
    const smartObjectCanvas = await readEditorCanvasSignature(page)
    expect(smartObjectCanvas).not.toBe(importedCanvas)

    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByText("METHOD")).toBeVisible()
    await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
    await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
    await settle(page)

    const methodPreviewCanvas = await readEditorCanvasSignature(page)
    expect(methodPreviewCanvas).not.toBe(smartObjectCanvas)

    await page.getByRole("button", { name: "Apply METHOD" }).click()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeVisible()
    await settle(page)
    await expectEditorCanvasSignature(page, methodPreviewCanvas)

    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, smartObjectCanvas)
    await page.getByRole("button", { name: "Redo" }).click()
    await expectEditorCanvasSignature(page, methodPreviewCanvas)

    const save = await downloadProjectSave(page)
    expect(save.suggestedFilename).toBe("project.pixtudio")
    const snapshot = JSON.parse(await readFile(save.path, "utf8"))
    expect(snapshot.methodProfilesByPaletteContext.auto).toEqual({
        methodId: "k-means",
        colorSpaceId: "hsv",
    })

    await openProjectPathFromEditor(page, save.path, save.suggestedFilename)
    await expectEditorCanvasSignature(page, methodPreviewCanvas)

    const reopenedSave = await downloadProjectSave(page)
    const reopenedSnapshot = JSON.parse(await readFile(reopenedSave.path, "utf8"))
    expect(reopenedSnapshot.methodProfilesByPaletteContext.auto).toEqual({
        methodId: "k-means",
        colorSpaceId: "hsv",
    })

    const png = await downloadEditorExport(page, /^PNG$/)
    expect(png.suggestedFilename).toBe("pixtudio.png")
    expect(await fileSize(png.path)).toBeGreaterThan(100)
    await expectFileSignature(png.path, [0x89, 0x50, 0x4e, 0x47])

    expect(errors.flush()).toEqual([])
})

async function openSmokePortrait(page: Page) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(methodSmokePortraitPath)

    await expect(page.getByRole("button", { name: "OK" })).toBeVisible({
        timeout: 20_000,
    })
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })
    await settle(page)
}

async function applySmartObjectAdjustment(page: Page) {
    await page.getByRole("button", { name: "Smart Object" }).click()
    await expect(page.getByText("EXPOSURE:")).toBeVisible()
    await setRangeValue(page.locator("input.soRange").nth(0), 18)
    await setRangeValue(page.locator("input.soRange").nth(2), -24)
    await setRangeValue(page.locator("input.soRange").nth(3), -70)
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(page.getByRole("button", { name: "Smart Object" })).toBeVisible()
    await settle(page)
}

async function openProjectPathFromEditor(
    page: Page,
    projectPath: string,
    filename: string
) {
    await page.getByRole("button", { name: "Open" }).click()
    await expect(page.getByRole("button", { name: "Open file" })).toBeVisible()

    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open file" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
        name: filename,
        mimeType: "application/json",
        buffer: await readFile(projectPath),
    })

    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await settle(page)
}

async function downloadEditorExport(page: Page, label: RegExp) {
    await page.getByRole("button", { name: "Export" }).click()
    await expect(page.getByRole("button", { name: label })).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: label }).click()
    const download = await downloadPromise
    await settle(page)

    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    return {
        path: downloadPath as string,
        suggestedFilename: download.suggestedFilename(),
    }
}

async function downloadProjectSave(page: Page) {
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save" }).click()
    const download = await downloadPromise
    await settle(page)

    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    return {
        path: downloadPath as string,
        suggestedFilename: download.suggestedFilename(),
    }
}

async function readEditorCanvasSignature(page: Page) {
    return page.locator("canvas").first().evaluate((canvas) => {
        const context = canvas.getContext("2d")
        if (!context) return ""

        const data = context.getImageData(0, 0, canvas.width, canvas.height).data
        let hash = 2166136261
        for (let i = 0; i < data.length; i += 1) {
            hash = Math.imul(hash ^ data[i], 16777619) >>> 0
        }
        return hash.toString(16)
    })
}

async function expectEditorCanvasSignature(page: Page, signature: string) {
    await settle(page)
    await expect.poll(() => readEditorCanvasSignature(page)).toBe(signature)
}

async function setRangeValue(slider: Locator, value: number) {
    await slider.evaluate(
        (element, nextValue) => {
            const input = element as HTMLInputElement
            const valueSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )?.set
            valueSetter?.call(input, String(nextValue))
            input.dispatchEvent(new Event("input", { bubbles: true }))
            input.dispatchEvent(new Event("change", { bubbles: true }))
        },
        value
    )
}

async function installDownloadFallbackEnvironment(page: Page) {
    await page.addInitScript(() => {
        try {
            Object.defineProperty(window, "showSaveFilePicker", {
                configurable: true,
                value: undefined,
            })
        } catch {
            // Best-effort test stabilization.
        }

        try {
            Object.defineProperty(navigator, "share", {
                configurable: true,
                value: undefined,
            })
            Object.defineProperty(navigator, "canShare", {
                configurable: true,
                value: undefined,
            })
        } catch {
            // Best-effort test stabilization.
        }
    })
}

async function fileSize(filePath: string) {
    return (await stat(filePath)).size
}

async function expectFileSignature(filePath: string, signature: number[]) {
    const bytes = await readFile(filePath)
    expect(Array.from(bytes.subarray(0, signature.length))).toEqual(signature)
}
