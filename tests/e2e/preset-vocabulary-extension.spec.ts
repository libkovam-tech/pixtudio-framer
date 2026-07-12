import { expect, test, type Locator, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    settle,
} from "./helpers"

const generatedPortraitPath = path.join(
    fixturesDir,
    "generated-portrait-white-swatch.png"
)

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
})

test("added preset swatch can claim adjusted image cells regardless of action order", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openGeneratedPortrait(page)
    await setGridSize(page, 128)
    await applySunsetPreset(page)
    await applySmartObjectHighlights(page)
    await addPresetSwatch(page, "#FFFFFF")

    const smartObjectFirstSummary = await summarizeCurrentState(page)

    await openGeneratedPortrait(page)
    await setGridSize(page, 128)
    await applySunsetPreset(page)
    await addPresetSwatch(page, "#FFFFFF")
    await applySmartObjectHighlights(page)

    const addSwatchFirstSummary = await summarizeCurrentState(page)

    expect(smartObjectFirstSummary.whiteImportCells).toBeGreaterThan(0)
    expect(smartObjectFirstSummary.canvasWhiteCount).toBeGreaterThan(0)
    expect(smartObjectFirstSummary.whiteImportCells).toBe(
        addSwatchFirstSummary.whiteImportCells
    )
    expect(smartObjectFirstSummary.canvasWhiteCount).toBe(
        addSwatchFirstSummary.canvasWhiteCount
    )
    expect(errors.flush()).toEqual([])
})

test("added preset swatch keeps restored preset tab world as its own redo step", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openGeneratedPortrait(page)
    const initialAutoSummary = await summarizeCurrentState(page)

    await applySunsetPreset(page)
    const appliedPresetSummary = await summarizeCurrentState(page)
    expect(appliedPresetSummary.canvasSignature).not.toBe(
        initialAutoSummary.canvasSignature
    )

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)
    const autoSummary = await summarizeCurrentState(page)
    expect(autoSummary).toMatchObject(initialAutoSummary)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await settle(page)
    const restoredPresetSummary = await summarizeCurrentState(page)
    expect(restoredPresetSummary).toMatchObject(appliedPresetSummary)

    await addPresetSwatch(page, "#FFFFFF")
    const addedSummary = await summarizeCurrentState(page)
    expect(addedSummary.whiteSwatchExists).toBe(true)

    await page.getByRole("button", { name: "Undo" }).click()
    await settle(page)
    await expect
        .poll(() => summarizeCurrentState(page))
        .toMatchObject(restoredPresetSummary)

    await page.getByRole("button", { name: "Undo" }).click()
    await settle(page)
    await expect
        .poll(() => summarizeCurrentState(page))
        .toMatchObject(autoSummary)

    await page.getByRole("button", { name: "Redo" }).click()
    await settle(page)
    await expect
        .poll(() => summarizeCurrentState(page))
        .toMatchObject(restoredPresetSummary)

    await page.getByRole("button", { name: "Redo" }).click()
    await settle(page)
    await expect
        .poll(() => summarizeCurrentState(page))
        .toMatchObject(addedSummary)

    expect(errors.flush()).toEqual([])
})

async function openGeneratedPortrait(page: Page) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(generatedPortraitPath)

    await expect(page.getByRole("button", { name: "OK" })).toBeVisible({
        timeout: 20_000,
    })
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await settle(page)
}

async function applySunsetPreset(page: Page) {
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.locator('button[title="SUNSET"]').click()
    await settle(page)
}

async function setGridSize(page: Page, value: number) {
    await clickSliderEnd(page.getByRole("slider").nth(1), page)
    await expect(page.getByText(new RegExp(`GRID SIZE:\\s*${value}`))).toBeVisible()
    await settle(page)
}

async function applySmartObjectHighlights(page: Page) {
    await page.getByRole("button", { name: "Smart Object" }).click()
    await expect(page.getByText("HIGHLIGHTS:")).toBeVisible()
    await setRangeValue(page.locator("input.soRange").nth(1), 100)
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(page.getByRole("button", { name: "Smart Object" })).toBeVisible()
    await settle(page)
}

async function addPresetSwatch(page: Page, hex: string) {
    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill(hex)
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)
}

async function summarizeCurrentState(page: Page) {
    const canvasSignature = await readEditorCanvasSignature(page)
    const canvasWhiteCount = await countEditorCanvasRgb(page, [255, 255, 255])
    const snapshot = await downloadProjectSnapshot(page)
    const whiteSwatch = snapshot.palette.swatches.find(
        (swatch: { hex: string }) => swatch.hex.toUpperCase() === "#FFFFFF"
    )
    const importLayerCells = snapshot.importLayer.cells as number[]
    const whiteImportCells =
        whiteSwatch == null
            ? 0
            : importLayerCells.filter((cell) => cell === whiteSwatch.index)
                  .length

    return {
        canvasSignature,
        paletteColorCount: snapshot.palette.swatches.length,
        whiteSwatchExists: whiteSwatch != null,
        whiteImportCells,
        canvasWhiteCount,
    }
}

async function readEditorCanvasSignature(page: Page): Promise<string> {
    return page.locator("canvas").first().evaluate((canvas) => {
        return (canvas as HTMLCanvasElement).toDataURL("image/png")
    })
}

async function downloadProjectSnapshot(page: Page) {
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save" }).click()
    const download = await downloadPromise
    await settle(page)
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()
    return JSON.parse(await readFile(downloadPath as string, "utf8"))
}

async function clickSliderEnd(slider: Locator, page: Page) {
    const box = await slider.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(
        (box?.x ?? 0) + (box?.width ?? 0) - 2,
        (box?.y ?? 0) + (box?.height ?? 0) / 2
    )
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

async function countEditorCanvasRgb(
    page: Page,
    rgb: [number, number, number]
): Promise<number> {
    return page.locator("canvas").first().evaluate((canvas, target) => {
        const context = canvas.getContext("2d")
        if (!context) return 0

        const { width, height } = canvas
        const data = context.getImageData(0, 0, width, height).data
        let count = 0
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4
                if (
                    data[index] === target[0] &&
                    data[index + 1] === target[1] &&
                    data[index + 2] === target[2] &&
                    data[index + 3] === 255
                ) {
                    count += 1
                }
            }
        }
        return count
    }, rgb)
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
    })
}
