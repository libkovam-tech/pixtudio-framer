import { expect, test, type Page } from "@playwright/test"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import {
    bearProjectPath,
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    openBearImageCropScreen,
    openBearProject,
    settle,
} from "./helpers"

const unsupportedFilePath = path.join(fixturesDir, "unsupported-open-file.txt")
const damagedProjectPath = path.join(fixturesDir, "damaged-project.pixtudio")

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
})

test("pixel-art exports download usable files", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const png = await downloadEditorExport(page, /^PNG$/)
    expect(png.suggestedFilename).toBe("pixtudio.png")
    expect(await fileSize(png.path)).toBeGreaterThan(100)
    await expectFileSignature(png.path, [0x89, 0x50, 0x4e, 0x47])

    const svg = await downloadEditorExport(page, /^SVG$/)
    expect(svg.suggestedFilename).toBe("pixtudio-icon.svg")
    expect(await readFile(svg.path, "utf8")).toContain("<svg")

    const xlsx = await downloadEditorExport(page, /^XLSX$/)
    expect(xlsx.suggestedFilename).toBe("pixtudio.xlsx")
    expect(await fileSize(xlsx.path)).toBeGreaterThan(1000)
    await expectFileSignature(xlsx.path, [0x50, 0x4b])

    const zip = await downloadEditorExport(page, /^ZIP/i)
    expect(zip.suggestedFilename).toBe("pixtudio-export.zip")
    const zipBytes = await readFile(zip.path)
    expect(zipBytes.byteLength).toBeGreaterThan(1000)
    expect(readZipStoreEntryNames(zipBytes)).toEqual([
        "pixtudio-export.png",
        "pixtudio-export.svg",
        "pixtudio-export.xlsx",
    ])

    expect(errors.flush()).toEqual([])
})

test("open pipeline rejects unsupported files", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(unsupportedFilePath)

    await expect(page.getByText("IMPORT ERROR")).toBeVisible()
    await expect(
        page.getByText("This file is not supported by PIXTUDIO.")
    ).toBeVisible()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()

    expect(errors.flush()).toEqual([])
})

test("open pipeline rejects damaged pixtudio projects without image fallback", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(damagedProjectPath)

    await expect(page.getByText("IMPORT ERROR")).toBeVisible()
    await expect(
        page.getByText("This PIXTUDIO project file appears to be damaged.")
    ).toBeVisible()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible()

    expect(errors.flush()).toEqual([])
})

test("loading a project resets transient editor tools", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const pipette = page.getByRole("button", { name: "Pipette tool" })
    await pipette.click()
    await expect
        .poll(() => pipette.evaluate((element) => getComputedStyle(element).opacity))
        .toBe("1")

    await openProjectFileFromEditor(page)
    await expect
        .poll(() => pipette.evaluate((element) => getComputedStyle(element).opacity))
        .toBe("0.85")

    const hand = page.getByRole("button", { name: "Hand tool" })
    await hand.click()
    await expect
        .poll(() => hand.evaluate((element) => getComputedStyle(element).opacity))
        .toBe("1")

    await openProjectFileFromEditor(page)
    await expect
        .poll(() => hand.evaluate((element) => getComputedStyle(element).opacity))
        .toBe("0.85")

    expect(errors.flush()).toEqual([])
})

test("deleting an active palette preset saves the auto-palette world", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.locator('button[title="SUNSET"]').click()
    await page.getByLabel("Delete SUNSET preset").click()
    await expect(page.locator('button[title="SUNSET"]')).toHaveCount(0)
    await expect(
        page.getByRole("button", { name: /AUTO PALETTE/i })
    ).toBeVisible()

    const save = await downloadProjectSave(page)
    expect(save.suggestedFilename).toBe("project.pixtudio")
    const snapshot = JSON.parse(await readFile(save.path, "utf8"))
    expect(snapshot.quantizationProfile).toBeUndefined()
    expect(
        snapshot.palette.swatches.map((swatch: { hex: string }) => swatch.hex)
    ).not.toEqual([
        "#001219",
        "#005F73",
        "#0A9396",
        "#94D2BD",
        "#E9D8A6",
        "#EE9B00",
        "#CA6702",
        "#BB3E03",
        "#AE2012",
        "#9B2226",
    ])

    expect(errors.flush()).toEqual([])
})

test("transparent auto swatch project saves reopen without damaged-file error", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const autoSwatch = page.locator('button[title="#7DA8C2"]')
    await autoSwatch.click()
    await page.locator("canvas").first().click({ position: { x: 180, y: 180 } })
    await settle(page)

    await autoSwatch.click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await page.getByLabel("Transparent").check()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText("SWATCH EDIT")).toHaveCount(0)

    const save = await downloadProjectSave(page)
    expect(save.suggestedFilename).toBe("project.pixtudio")

    const snapshot = JSON.parse(await readFile(save.path, "utf8"))
    expect(
        Object.values(snapshot.autoOverrides ?? {}).some(
            (override) =>
                !!override &&
                typeof override === "object" &&
                (override as { isTransparent?: unknown }).isTransparent === true
        )
    ).toBe(true)
    expect(
        snapshot.strokeLayer.cells.some(
            (cell: { swatchIndex: number }) => cell.swatchIndex === -1
        )
    ).toBe(false)
    expect(
        snapshot.strokeLayer.cells.some(
            (cell: { swatchIndex: number }) => cell.swatchIndex === -2
        )
    ).toBe(true)

    await openProjectPathFromEditor(page, save.path, save.suggestedFilename)
    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible()

    const expectedPaletteCountAfterRebuild = await bumpPaletteSize(page)
    const saveAfterRebuild = await downloadProjectSave(page)
    const snapshotAfterRebuild = JSON.parse(
        await readFile(saveAfterRebuild.path, "utf8")
    )
    expect(snapshotAfterRebuild.paletteCount).toBe(
        expectedPaletteCountAfterRebuild
    )
    expect(
        snapshotAfterRebuild.strokeLayer.cells.some(
            (cell: { swatchIndex: number }) => cell.swatchIndex === -2
        )
    ).toBe(true)

    const expectedGridSizeAfterRebuild = await bumpGridSize(page)
    const saveAfterGridRebuild = await downloadProjectSave(page)
    const snapshotAfterGridRebuild = JSON.parse(
        await readFile(saveAfterGridRebuild.path, "utf8")
    )
    expect(snapshotAfterGridRebuild.gridSize).toBe(expectedGridSizeAfterRebuild)
    expect(transparentStrokeCellCount(snapshotAfterGridRebuild)).toBeGreaterThan(
        0
    )

    expect(errors.flush()).toEqual([])
})

test("blank canvas command resets a drawn blank-session canvas", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await page.goto("/editor/")
    await page.getByRole("button", { name: "Draw" }).click()
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible()

    await page.locator("canvas").first().click({ position: { x: 180, y: 180 } })
    await settle(page)

    const drawnSave = await downloadProjectSave(page)
    const drawnSnapshot = JSON.parse(await readFile(drawnSave.path, "utf8"))
    expect(drawnSnapshot.strokeLayer.cells.length).toBeGreaterThan(0)

    await page.getByRole("button", { name: "Open" }).click()
    await expect(page.getByRole("button", { name: "Blank canvas" })).toBeVisible()
    await page.getByRole("button", { name: "Blank canvas" }).click()
    await settle(page)

    const blankSave = await downloadProjectSave(page)
    const blankSnapshot = JSON.parse(await readFile(blankSave.path, "utf8"))
    expect(blankSnapshot.strokeLayer.cells).toEqual([])

    expect(errors.flush()).toEqual([])
})

test("swatch edit repaint is visible on the canvas immediately", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const before = await readEditorCanvasPixel(page, 408, 136)
    expect(before.slice(0, 3)).toEqual([125, 168, 194])

    await page.locator('button[title="#7DA8C2"]').click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await page.getByLabel("HEX input").fill("#FF0000")
    await page.getByRole("button", { name: "OK" }).click()

    await expect
        .poll(() => readEditorCanvasPixel(page, 408, 136))
        .toEqual([255, 0, 0, 255])

    expect(errors.flush()).toEqual([])
})

test("added preset swatch preserves edited preset swatch assignments", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.locator('button[title="SUNSET"]').click()
    await settle(page)

    const editedSwatch = page.locator('button[title="#9B2226"]').first()
    await expect(editedSwatch).toBeVisible()
    await editedSwatch.click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await page.getByLabel("HEX input").fill("#FF0000")
    await page.getByRole("button", { name: "OK" }).click()

    const redPoint = await findEditorCanvasPixel(page, [255, 0, 0])
    expect(redPoint).not.toBeNull()

    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill("#FFFFFF")
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)

    await expect
        .poll(() =>
            readEditorCanvasPixel(page, redPoint?.x ?? 0, redPoint?.y ?? 0)
        )
        .toEqual([255, 0, 0, 255])

    expect(errors.flush()).toEqual([])
})

test("clicked palette swatch uses the active lifted selection style", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const swatch = page.locator('button[title^="#"]').first()
    await expect(swatch).toBeVisible()
    await swatch.click()

    await expect
        .poll(async () => {
            const box = await swatch.boundingBox()
            return box?.width ?? 0
        })
        .toBeGreaterThan(28)

    expect(errors.flush()).toEqual([])
})

test("user swatch creation stays separate from palette size undo", async ({
    page,
}, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearImageCropScreen(page)
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await settle(page)

    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill("#FF00FF")
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)

    await setPaletteSizeLikeUser(page, 3, testInfo.project.name, {
        settleAfter: false,
    })
    const reducedPaletteCount = Number(
        await page.locator('input[type="range"][max="32"]').first().inputValue()
    )
    expect(reducedPaletteCount).toBeLessThan(16)

    await page.getByRole("button", { name: "Undo" }).click()
    await settle(page)
    const undoSnapshot = JSON.parse(
        await readFile((await downloadProjectSave(page)).path, "utf8")
    )
    expect(undoSnapshot.paletteCount).not.toBe(reducedPaletteCount)
    expect(hasPaletteSwatch(undoSnapshot, "#FF00FF")).toBe(true)

    await page.getByRole("button", { name: "Redo" }).click()
    await settle(page)
    const redoSnapshot = JSON.parse(
        await readFile((await downloadProjectSave(page)).path, "utf8")
    )
    expect(redoSnapshot.paletteCount).toBe(reducedPaletteCount)
    expect(hasPaletteSwatch(redoSnapshot, "#FF00FF")).toBe(true)

    expect(errors.flush()).toEqual([])
})

test("palette tabs keep independent selected swatches", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const autoSwatchTitle = await getVisibleSwatchTitle(page, 1)
    await clickSwatchByTitle(page, autoSwatchTitle)
    await expectSwatchActive(page, autoSwatchTitle)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.locator('button[title="SUNSET"]').click()
    await settle(page)

    const presetSwatchTitle = await getVisibleSwatchTitle(page, 0)
    expect(presetSwatchTitle).not.toBe(autoSwatchTitle)
    await clickSwatchByTitle(page, presetSwatchTitle)
    await expectSwatchActive(page, presetSwatchTitle)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await expectSwatchActive(page, autoSwatchTitle)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await expectSwatchActive(page, presetSwatchTitle)

    expect(errors.flush()).toEqual([])
})

test("editor route locks native viewport zoom", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await expectEditorViewportZoomLocked(page)

    expect(errors.flush()).toEqual([])
})

test("manual screen keeps native viewport zoom locked on mobile", async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "manual pinch guard is mobile-only")
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: "Manual button" }).click()
    await expect(
        page.getByRole("heading", { name: /PIXTUDIO.*User Guide/ })
    ).toBeVisible()
    await expectEditorViewportZoomLocked(page)

    await expect
        .poll(() =>
            page.locator(".manualScrollHidden").evaluate((element) => {
                element.scrollTop = 0
                element.scrollTop = 120
                return element.scrollTop
            })
        )
        .toBeGreaterThan(0)

    expect(errors.flush()).toEqual([])
})

test("iPadOS desktop Safari opens native camera file input", async (
    { browser },
    testInfo
) => {
    test.skip(
        testInfo.project.name !== "desktop",
        "custom iPadOS context covers this scenario once"
    )
    const context = await browser.newContext({
        hasTouch: true,
        isMobile: false,
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        viewport: { width: 834, height: 1194 },
    })
    await context.addInitScript(() => {
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            get: () => 5,
        })
    })
    const page = await context.newPage()
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Camera" }).click()
    const chooser = await fileChooserPromise
    expect(chooser.isMultiple()).toBe(false)
    await chooser.setFiles([])
    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)

    expect(errors.flush()).toEqual([])
    await context.close()
})

test("tablet touch layout supports canvas pinch zoom", async ({
    browser,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== "desktop",
        "custom tablet touch context covers this scenario once"
    )
    const context = await browser.newContext({
        hasTouch: true,
        isMobile: false,
        userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        viewport: { width: 834, height: 1194 },
    })
    await context.addInitScript(() => {
        Object.defineProperty(navigator, "maxTouchPoints", {
            configurable: true,
            get: () => 5,
        })
    })
    const page = await context.newPage()
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
    const errors = collectBrowserErrors(page)

    await openBearProject(page)

    const beforeTransform = await getCanvasContentTransform(page)
    await dispatchCanvasPinch(page, 100, 180)
    await expect
        .poll(() => getCanvasContentTransform(page))
        .not.toBe(beforeTransform)
    await expect.poll(() => getCanvasContentScale(page)).toBeGreaterThan(1)

    expect(errors.flush()).toEqual([])
    await context.close()
})

test("quantization recorder number inputs keep focus during mobile keyboard resize", async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "keyboard resize is mobile-only")
    const errors = collectBrowserErrors(page)

    await installSyntheticVisualViewport(page)
    await page.setViewportSize({ width: 412, height: 915 })
    await openBearProject(page)
    await page.getByRole("button", { name: "Quantization Recorder" }).click()

    const backdrop = page.locator('[data-qr-viewport-backdrop="true"]')
    const fitViewport = page.locator('[data-qr-fit-viewport="true"]')
    const initialBackdropHeight = await backdrop.evaluate((element) =>
        Math.round(element.getBoundingClientRect().height)
    )
    const initialFitHeight = await fitViewport.evaluate((element) =>
        Math.round(element.getBoundingClientRect().height)
    )
    expect(initialBackdropHeight).toBe(915)
    expect(initialFitHeight).toBe(915)

    const gridInput = page.getByLabel("Grid value")
    await expect(gridInput).toBeVisible()
    await gridInput.click()
    await expect(gridInput).toBeFocused()

    await setSyntheticVisualViewport(page, { width: 412, height: 590 })
    await expect(gridInput).toBeFocused()
    await expect
        .poll(() =>
            fitViewport.evaluate((element) =>
                Math.round(element.getBoundingClientRect().height)
            )
        )
        .toBe(915)
    await expect
        .poll(() =>
            backdrop.evaluate((element) =>
                Math.round(element.getBoundingClientRect().height)
            )
        )
        .toBe(915)
    await gridInput.fill("24")
    await expect(gridInput).toHaveValue("24")

    await setSyntheticVisualViewport(page, { width: 412, height: 520 })
    await expect(gridInput).toBeFocused()
    await gridInput.fill("28")
    await expect(gridInput).toHaveValue("28")

    await gridInput.blur()
    await expect
        .poll(() =>
            fitViewport.evaluate((element) =>
                Math.round(element.getBoundingClientRect().height)
            )
        )
        .toBe(915)

    expect(errors.flush()).toEqual([])
})

test("palette tab world switches are undoable when they change the canvas", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const autoCanvas = await readEditorCanvasSignature(page)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)
    const presetCanvas = await readEditorCanvasSignature(page)
    expect(presetCanvas).not.toBe(autoCanvas)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)
    await expect
        .poll(() => readEditorCanvasSignature(page))
        .toBe(autoCanvas)

    await page.getByRole("button", { name: "Undo" }).click()
    await settle(page)
    await expect
        .poll(() => readEditorCanvasSignature(page))
        .toBe(presetCanvas)
    await expect(page.getByRole("button", { name: "Load Palette" })).toBeVisible()

    await page.getByRole("button", { name: "Redo" }).click()
    await settle(page)
    await expect
        .poll(() => readEditorCanvasSignature(page))
        .toBe(autoCanvas)

    expect(errors.flush()).toEqual([])
})

test("palette strokes survive preset-to-auto round-trips as user swatches", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const strokeHex = await getFirstNonMonochromeSwatchTitle(page)
    await clickSwatchByTitle(page, strokeHex)
    await page.locator("canvas").first().click({ position: { x: 40, y: 40 } })
    await settle(page)

    const autoStrokeSave = await downloadProjectSave(page)
    const autoStrokeSnapshot = JSON.parse(
        await readFile(autoStrokeSave.path, "utf8")
    )
    const originalAutoStrokeSwatches = autoStrokeSnapshot.palette.swatches.filter(
        (swatch: { hex: string; index: number; isUser?: boolean }) =>
            !swatch.isUser && swatch.hex.toUpperCase() === strokeHex
    )
    const originalAutoStrokeIndexes = new Set(
        originalAutoStrokeSwatches.map(
            (swatch: { index: number }) => swatch.index
        )
    )
    expect(originalAutoStrokeSwatches.length).toBeGreaterThan(0)
    expect(
        autoStrokeSnapshot.strokeLayer.cells.some(
            (cell: { swatchIndex: number }) =>
                originalAutoStrokeIndexes.has(cell.swatchIndex)
        )
    ).toBe(true)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)
    const presetStrokeHex = (await getVisibleSwatchTitle(page, 1)).toUpperCase()
    await clickSwatchByTitle(page, presetStrokeHex)
    await page.locator("canvas").first().click({ position: { x: 180, y: 80 } })
    await settle(page)

    const presetSave = await downloadProjectSave(page)
    const presetSnapshot = JSON.parse(await readFile(presetSave.path, "utf8"))
    const presetDrawnSwatch = getNearbyStrokeCellSwatch(
        presetSnapshot,
        canvasPointToGridCell(180, 80, presetSnapshot.gridSize),
        presetStrokeHex
    )
    expect(presetDrawnSwatch?.hex.toUpperCase()).toBe(presetStrokeHex)
    expect(presetDrawnSwatch?.isUser).not.toBe(true)
    expect(
        presetSnapshot.palette.swatches.some(
            (swatch: { hex: string; isUser?: boolean }) =>
                !!swatch.isUser &&
                swatch.hex.toUpperCase() === presetStrokeHex
        )
    ).toBe(false)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)

    const save = await downloadProjectSave(page)
    const snapshot = JSON.parse(await readFile(save.path, "utf8"))
    const restoredAutoStrokeSwatch = getNearbyStrokeCellSwatch(
        snapshot,
        canvasPointToGridCell(40, 40, snapshot.gridSize),
        strokeHex
    )
    const carriedPresetStrokeSwatch = getNearbyStrokeCellSwatch(
        snapshot,
        canvasPointToGridCell(180, 80, snapshot.gridSize),
        presetStrokeHex
    )

    expect(restoredAutoStrokeSwatch?.hex.toUpperCase()).toBe(strokeHex)
    expect(restoredAutoStrokeSwatch?.isUser).not.toBe(true)
    expect(carriedPresetStrokeSwatch?.hex.toUpperCase()).toBe(presetStrokeHex)
    expect(carriedPresetStrokeSwatch?.isUser).toBe(true)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await settle(page)

    const roundTripPresetSave = await downloadProjectSave(page)
    const roundTripPresetSnapshot = JSON.parse(
        await readFile(roundTripPresetSave.path, "utf8")
    )
    const roundTripPresetStrokeSwatch = getNearbyStrokeCellSwatch(
        roundTripPresetSnapshot,
        canvasPointToGridCell(180, 80, roundTripPresetSnapshot.gridSize),
        presetStrokeHex
    )
    expect(roundTripPresetStrokeSwatch?.hex.toUpperCase()).toBe(presetStrokeHex)
    expect(roundTripPresetStrokeSwatch?.isUser).not.toBe(true)
    await expect(page.locator(`button[title="${presetStrokeHex}"]`)).toHaveCount(
        1
    )
    expect(errors.flush()).toEqual([])
})

test("auto user swatch strokes survive immediate fixed preset application", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const strokeHex = "#6DFF4A"
    const strokePoint = { x: 260, y: 140 }
    const autoBeforeSave = await downloadProjectSave(page)
    const autoBeforeSnapshot = JSON.parse(
        await readFile(autoBeforeSave.path, "utf8")
    )
    const strokeCell = canvasPointToGridCell(
        strokePoint.x,
        strokePoint.y,
        autoBeforeSnapshot.gridSize
    )

    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill(strokeHex)
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)

    await clickSwatchByTitle(page, strokeHex)
    await page.locator("canvas").first().click({ position: strokePoint })
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)

    const presetSave = await downloadProjectSave(page)
    const presetSnapshot = JSON.parse(await readFile(presetSave.path, "utf8"))
    const presetStrokeSwatch = getNearbyStrokeCellSwatch(
        presetSnapshot,
        strokeCell,
        strokeHex
    )
    expect(presetStrokeSwatch?.hex.toUpperCase()).toBe(strokeHex)
    expect(presetStrokeSwatch?.isUser).toBe(true)

    expect(errors.flush()).toEqual([])
})

test("auto strokes survive switching through an existing preset to another preset", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)

    const autoStrokeHex = await getFirstNonMonochromeSwatchTitle(page)
    const autoStrokePoint = { x: 40, y: 40 }
    await clickSwatchByTitle(page, autoStrokeHex)
    await page.locator("canvas").first().click({ position: autoStrokePoint })
    await settle(page)

    const userStrokeHex = "#6DFF4A"
    const userStrokePoint = { x: 260, y: 140 }
    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill(userStrokeHex)
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)

    await clickSwatchByTitle(page, userStrokeHex)
    await page.locator("canvas").first().click({ position: userStrokePoint })
    await settle(page)

    const autoSave = await downloadProjectSave(page)
    const autoSnapshot = JSON.parse(await readFile(autoSave.path, "utf8"))
    const autoStrokeCell = canvasPointToGridCell(
        autoStrokePoint.x,
        autoStrokePoint.y,
        autoSnapshot.gridSize
    )
    const userStrokeCell = canvasPointToGridCell(
        userStrokePoint.x,
        userStrokePoint.y,
        autoSnapshot.gridSize
    )
    expect(
        getNearbyStrokeCellSwatch(autoSnapshot, autoStrokeCell, autoStrokeHex)
            ?.hex
    ).toBe(autoStrokeHex)
    expect(
        getNearbyStrokeCellSwatch(autoSnapshot, userStrokeCell, userStrokeHex)
            ?.hex
    ).toBe(userStrokeHex)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    const enteredPresetSave = await downloadProjectSave(page)
    const enteredPresetSnapshot = JSON.parse(
        await readFile(enteredPresetSave.path, "utf8")
    )
    expect(
        getNearbyAnyStrokeCellSwatch(enteredPresetSnapshot, autoStrokeCell)
    ).not.toBeNull()
    expect(
        getNearbyStrokeCellSwatch(
            enteredPresetSnapshot,
            userStrokeCell,
            userStrokeHex
        )?.hex
    ).toBe(userStrokeHex)

    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await settle(page)

    const presetSave = await downloadProjectSave(page)
    const presetSnapshot = JSON.parse(await readFile(presetSave.path, "utf8"))
    const presetAutoStrokeSwatch = getNearbyAnyStrokeCellSwatch(
        presetSnapshot,
        autoStrokeCell
    )
    const presetUserStrokeSwatch = getNearbyStrokeCellSwatch(
        presetSnapshot,
        userStrokeCell,
        userStrokeHex
    )
    expect(presetAutoStrokeSwatch).not.toBeNull()
    expect(presetUserStrokeSwatch?.hex.toUpperCase()).toBe(userStrokeHex)
    expect(presetUserStrokeSwatch?.isUser).toBe(true)

    expect(errors.flush()).toEqual([])
})

test("deleting a preset stroke guest in auto removes the preset stroke only", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)

    const presetStrokeHex = (await getVisibleSwatchTitle(page, 1)).toUpperCase()
    await clickSwatchByTitle(page, presetStrokeHex)
    await page.locator("canvas").first().click({ position: { x: 180, y: 80 } })
    await settle(page)

    const presetSave = await downloadProjectSave(page)
    const presetSnapshot = JSON.parse(await readFile(presetSave.path, "utf8"))
    const presetStrokeCell = canvasPointToGridCell(
        180,
        80,
        presetSnapshot.gridSize
    )
    const presetStrokeSwatch = getNearbyStrokeCellSwatch(
        presetSnapshot,
        presetStrokeCell,
        presetStrokeHex
    )
    expect(presetStrokeSwatch?.hex.toUpperCase()).toBe(presetStrokeHex)
    expect(presetStrokeSwatch?.isUser).not.toBe(true)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)

    const autoGuestSwatch = page
        .locator(`button[title="${presetStrokeHex}"]`)
        .last()
    await expect(autoGuestSwatch).toBeVisible()
    await autoGuestSwatch.click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await page.getByLabel("Delete swatch").check()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText("SWATCH EDIT")).toHaveCount(0)
    await settle(page)

    const autoAfterDeleteSave = await downloadProjectSave(page)
    const autoAfterDeleteSnapshot = JSON.parse(
        await readFile(autoAfterDeleteSave.path, "utf8")
    )
    expect(
        getNearbyStrokeCellSwatch(
            autoAfterDeleteSnapshot,
            presetStrokeCell,
            presetStrokeHex
        )
    ).toBeNull()

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await settle(page)

    await expect(page.getByRole("button", { name: /^SUNSET\b/ })).toBeVisible()
    await expect(page.locator('button[title="#9B2226"]').first()).toBeVisible()
    await expect(page.locator(`button[title="${presetStrokeHex}"]`)).toHaveCount(
        1
    )

    const presetAfterDeleteSave = await downloadProjectSave(page)
    const presetAfterDeleteSnapshot = JSON.parse(
        await readFile(presetAfterDeleteSave.path, "utf8")
    )
    expect(
        getNearbyStrokeCellSwatch(
            presetAfterDeleteSnapshot,
            presetStrokeCell,
            presetStrokeHex
        )
    ).toBeNull()

    expect(errors.flush()).toEqual([])
})

test("deleting an auto user stroke from presets does not leave an auto hole", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const strokeHex = "#F72B55"
    const strokePoint = { x: 260, y: 140 }
    const autoBeforeSave = await downloadProjectSave(page)
    const autoBeforeSnapshot = JSON.parse(
        await readFile(autoBeforeSave.path, "utf8")
    )
    const strokeCell = canvasPointToGridCell(
        strokePoint.x,
        strokePoint.y,
        autoBeforeSnapshot.gridSize
    )
    const baseImportCell = getImportLayerCell(autoBeforeSnapshot, strokeCell)

    await page.locator('button[title="Add swatch"]').first().click()
    await page.getByLabel("HEX input").fill(strokeHex)
    await page.getByRole("button", { name: "OK" }).click()
    await settle(page)

    await clickSwatchByTitle(page, strokeHex)
    await page.locator("canvas").first().click({ position: strokePoint })
    await settle(page)

    const autoStrokeSave = await downloadProjectSave(page)
    const autoStrokeSnapshot = JSON.parse(
        await readFile(autoStrokeSave.path, "utf8")
    )
    expect(
        getNearbyStrokeCellSwatch(autoStrokeSnapshot, strokeCell, strokeHex)
            ?.hex
    ).toBe(strokeHex)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)

    const presetUserSwatch = page.locator(`button[title="${strokeHex}"]`).last()
    await expect(presetUserSwatch).toBeVisible()
    await presetUserSwatch.click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await page.getByLabel("Delete swatch").check()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText("SWATCH EDIT")).toHaveCount(0)
    await settle(page)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)

    await expect(page.locator(`button[title="${strokeHex}"]`)).toHaveCount(0)

    const autoAfterDeleteSave = await downloadProjectSave(page)
    const autoAfterDeleteSnapshot = JSON.parse(
        await readFile(autoAfterDeleteSave.path, "utf8")
    )
    expect(
        getNearbyStrokeCellSwatch(
            autoAfterDeleteSnapshot,
            canvasPointToGridCell(
                strokePoint.x,
                strokePoint.y,
                autoAfterDeleteSnapshot.gridSize
            ),
            strokeHex
        )
    ).toBeNull()
    expect(getImportLayerCell(autoAfterDeleteSnapshot, strokeCell)).toBe(
        baseImportCell
    )

    expect(errors.flush()).toEqual([])
})

test("new preset choices coalesce restored palette tab worlds in undo history", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const autoCanvas = await readEditorCanvasSignature(page)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^SUNSET\b/ }).click()
    await settle(page)
    const sunsetCanvas = await readEditorCanvasSignature(page)
    expect(sunsetCanvas).not.toBe(autoCanvas)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await expectEditorCanvasSignature(page, autoCanvas)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await settle(page)
    const grayCanvas = await readEditorCanvasSignature(page)
    expect(grayCanvas).not.toBe(autoCanvas)
    expect(grayCanvas).not.toBe(sunsetCanvas)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await expectEditorCanvasSignature(page, autoCanvas)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^BLACK\/WHITE\b/ }).click()
    await settle(page)
    const blackWhiteCanvas = await readEditorCanvasSignature(page)
    expect(blackWhiteCanvas).not.toBe(autoCanvas)
    expect(blackWhiteCanvas).not.toBe(grayCanvas)
    expect(blackWhiteCanvas).not.toBe(sunsetCanvas)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await expectEditorCanvasSignature(page, autoCanvas)

    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, blackWhiteCanvas)
    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, autoCanvas)
    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, grayCanvas)
    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, autoCanvas)
    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, sunsetCanvas)
    await page.getByRole("button", { name: "Undo" }).click()
    await expectEditorCanvasSignature(page, autoCanvas)
    await expect(page.locator('input[type="range"][max="32"]').first()).toBeVisible()

    expect(errors.flush()).toEqual([])
})

test("promo navigation links reach their primary destinations", async ({ page }) => {
    const errors = collectBrowserErrors(page)

    await page.goto("/")
    await expect(page.locator('a[href="/faq/"]').first()).toHaveAttribute(
        "href",
        "/faq/"
    )
    await expect(
        page.locator('a[href="/how-it-works/"]').first()
    ).toHaveAttribute("href", "/how-it-works/")
    await expect(page.locator('a[href="/gallery/"]').first()).toHaveAttribute(
        "href",
        "/gallery/"
    )

    await page.getByRole("link", { name: "Try PIXTUDIO Now" }).first().click()
    await expect(page).toHaveURL(/\/editor\/?$/)
    await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()

    expect(errors.flush()).toEqual([])
})

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

async function expectEditorViewportZoomLocked(page: Page) {
    const viewportContent = await page
        .locator('meta[name="viewport"]')
        .getAttribute("content")
    expect(viewportContent).toContain("maximum-scale=1")
    expect(viewportContent).toContain("minimum-scale=1")
    expect(viewportContent).toContain("user-scalable=no")

    await expect
        .poll(() =>
            page.evaluate(() => ({
                body: document.body.classList.contains(
                    "pixtudio-editor-viewport-lock"
                ),
                html: document.documentElement.classList.contains(
                    "pixtudio-editor-viewport-lock"
                ),
            }))
        )
        .toEqual({ body: true, html: true })

    const prevented = await page.evaluate(() => {
        const touchMove = new Event("touchmove", {
            bubbles: true,
            cancelable: true,
        })
        Object.defineProperty(touchMove, "touches", { value: [{}, {}] })
        document.dispatchEvent(touchMove)

        const gestureStart = new Event("gesturestart", {
            bubbles: true,
            cancelable: true,
        })
        window.dispatchEvent(gestureStart)

        const documentGestureChange = new Event("gesturechange", {
            bubbles: true,
            cancelable: true,
        })
        document.dispatchEvent(documentGestureChange)

        const wheelZoom = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
        })
        window.dispatchEvent(wheelZoom)

        return {
            documentGestureChange: documentGestureChange.defaultPrevented,
            gestureStart: gestureStart.defaultPrevented,
            touchMove: touchMove.defaultPrevented,
            wheelZoom: wheelZoom.defaultPrevented,
        }
    })
    expect(prevented).toEqual({
        documentGestureChange: true,
        gestureStart: true,
        touchMove: true,
        wheelZoom: true,
    })
}

async function installSyntheticVisualViewport(page: Page) {
    await page.addInitScript(() => {
        const viewport = new EventTarget() as EventTarget & {
            width: number
            height: number
            offsetLeft: number
            offsetTop: number
            pageLeft: number
            pageTop: number
            scale: number
        }
        viewport.width = 412
        viewport.height = 915
        viewport.offsetLeft = 0
        viewport.offsetTop = 0
        viewport.pageLeft = 0
        viewport.pageTop = 0
        viewport.scale = 1

        Object.defineProperty(window, "visualViewport", {
            configurable: true,
            value: viewport,
        })

        ;(window as Window & {
            __setPixtudioSyntheticVisualViewport?: (
                size: { width: number; height: number }
            ) => void
        }).__setPixtudioSyntheticVisualViewport = (size) => {
            viewport.width = size.width
            viewport.height = size.height
            viewport.dispatchEvent(new Event("resize"))
        }
    })
}

async function setSyntheticVisualViewport(
    page: Page,
    size: { width: number; height: number }
) {
    await page.evaluate((nextSize) => {
        const testWindow = window as Window & {
            __setPixtudioSyntheticVisualViewport?: (
                size: { width: number; height: number }
            ) => void
        }
        testWindow.__setPixtudioSyntheticVisualViewport?.(nextSize)
    }, size)
}

async function openProjectFileFromEditor(page: Page) {
    await openProjectPathFromEditor(page, bearProjectPath)
}

async function openProjectPathFromEditor(
    page: Page,
    projectPath: string,
    filename?: string
) {
    await page.getByRole("button", { name: "Open" }).click()
    await expect(page.getByRole("button", { name: "Open file" })).toBeVisible()

    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open file" }).click()
    const fileChooser = await fileChooserPromise
    if (filename) {
        await fileChooser.setFiles({
            name: filename,
            mimeType: "application/json",
            buffer: await readFile(projectPath),
        })
    } else {
        await fileChooser.setFiles(projectPath)
    }

    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await settle(page)
}

async function getCanvasContentTransform(page: Page) {
    return page.locator("canvas").first().evaluate((canvas) => {
        const contentLayer = canvas.parentElement?.parentElement
        return contentLayer instanceof HTMLElement
            ? contentLayer.style.transform
            : ""
    })
}

async function getCanvasContentScale(page: Page) {
    return page.locator("canvas").first().evaluate((canvas) => {
        const contentLayer = canvas.parentElement?.parentElement
        if (!(contentLayer instanceof HTMLElement)) return 0
        const match = contentLayer.style.transform.match(/scale\(([^)]+)\)/)
        return match ? Number(match[1]) : 0
    })
}

async function dispatchCanvasPinch(
    page: Page,
    startDistance: number,
    currentDistance: number
) {
    await page.locator("canvas").first().evaluate(
        (canvas, distances) => {
            const rect = canvas.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2

            const send = (
                type: string,
                pointerId: number,
                clientX: number,
                clientY: number
            ) => {
                canvas.dispatchEvent(
                    new PointerEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        pointerId,
                        pointerType: "touch",
                        clientX,
                        clientY,
                        button: 0,
                        buttons: type === "pointerup" ? 0 : 1,
                    })
                )
            }

            send(
                "pointerdown",
                1,
                centerX - distances.startDistance / 2,
                centerY
            )
            send(
                "pointerdown",
                2,
                centerX + distances.startDistance / 2,
                centerY
            )
            send(
                "pointermove",
                1,
                centerX - distances.currentDistance / 2,
                centerY
            )
            send(
                "pointermove",
                2,
                centerX + distances.currentDistance / 2,
                centerY
            )
            send("pointerup", 1, centerX - distances.currentDistance / 2, centerY)
            send("pointerup", 2, centerX + distances.currentDistance / 2, centerY)
        },
        { startDistance, currentDistance }
    )
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

async function setPaletteSizeLikeUser(
    page: Page,
    value: number,
    projectName: string,
    options: { settleAfter?: boolean } = {}
) {
    const paletteSlider = page.locator('input[type="range"][max="32"]').first()
    await expect(paletteSlider).toBeVisible()

    if (projectName !== "mobile") {
        const box = await paletteSlider.boundingBox()
        expect(box).not.toBeNull()
        const y = (box?.y ?? 0) + (box?.height ?? 0) / 2
        await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, y)
        await page.mouse.down()
        await page.mouse.move((box?.x ?? 0) + 1, y, { steps: 10 })
        await page.mouse.up()
        if (options.settleAfter ?? true) {
            await settle(page)
        }
        return
    }

    await paletteSlider.dispatchEvent("pointerdown")
    await paletteSlider.dispatchEvent("touchstart")
    await paletteSlider.evaluate((element, nextValue) => {
        const input = element as HTMLInputElement
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set
        valueSetter?.call(input, String(nextValue))
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
    }, value)
    await settle(page)
    await paletteSlider.dispatchEvent("pointerup")
    await paletteSlider.dispatchEvent("touchend")
    if (options.settleAfter ?? true) {
        await settle(page)
    }
}

async function bumpPaletteSize(page: Page) {
    const paletteSlider = page.locator('input[type="range"][max="32"]').first()
    await expect(paletteSlider).toBeVisible()
    const nextValue = await paletteSlider.evaluate((element) => {
        const input = element as HTMLInputElement
        const max = Number(input.max)
        const min = Number(input.min)
        const current = Number(input.value)

        const next = current < max ? current + 1 : Math.max(min, current - 1)
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set
        valueSetter?.call(input, String(next))
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
        return next
    })
    await settle(page)
    return nextValue
}

function hasPaletteSwatch(snapshot: { palette?: { swatches?: unknown[] } }, hex: string) {
    return (snapshot.palette?.swatches ?? []).some(
        (swatch) =>
            typeof swatch === "object" &&
            swatch != null &&
            "hex" in swatch &&
            String(swatch.hex).toUpperCase() === hex
    )
}

async function bumpGridSize(page: Page) {
    const gridSlider = page.locator('input[type="range"][max="128"]').first()
    await expect(gridSlider).toBeVisible()
    const nextValue = await gridSlider.evaluate((element) => {
        const input = element as HTMLInputElement
        const max = Number(input.max)
        const min = Number(input.min)
        const current = Number(input.value)

        const next = current > min ? current - 1 : Math.min(max, current + 1)
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set
        valueSetter?.call(input, String(next))
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.dispatchEvent(new Event("change", { bubbles: true }))
        return next
    })
    await settle(page)
    return nextValue
}

function transparentStrokeCellCount(snapshot: {
    strokeLayer?: { cells?: Array<{ swatchIndex: number }> }
}) {
    return (snapshot.strokeLayer?.cells ?? []).filter(
        (cell) => cell.swatchIndex === -2
    ).length
}

async function fileSize(filePath: string) {
    return (await stat(filePath)).size
}

async function expectFileSignature(filePath: string, signature: number[]) {
    const bytes = await readFile(filePath)
    expect(Array.from(bytes.subarray(0, signature.length))).toEqual(signature)
}

async function readEditorCanvasPixel(page: Page, x: number, y: number) {
    return page.locator("canvas").first().evaluate(
        (canvas, point) => {
            const context = canvas.getContext("2d")
            if (!context) return []
            return Array.from(
                context.getImageData(point.x, point.y, 1, 1).data
            )
        },
        { x, y }
    )
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

async function findEditorCanvasPixel(
    page: Page,
    rgb: [number, number, number]
): Promise<{ x: number; y: number } | null> {
    return page.locator("canvas").first().evaluate((canvas, target) => {
        const context = canvas.getContext("2d")
        if (!context) return null

        const { width, height } = canvas
        const data = context.getImageData(0, 0, width, height).data
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4
                if (
                    data[index] === target[0] &&
                    data[index + 1] === target[1] &&
                    data[index + 2] === target[2] &&
                    data[index + 3] === 255
                ) {
                    return { x, y }
                }
            }
        }
        return null
    }, rgb)
}

async function getVisibleSwatchTitle(page: Page, index: number) {
    const swatch = page.locator('button[title^="#"]').nth(index)
    await expect(swatch).toBeVisible()
    const title = await swatch.getAttribute("title")
    expect(title).toMatch(/^#[0-9A-F]{6}$/i)
    return title ?? ""
}

function canvasPointToGridCell(x: number, y: number, gridSize: number) {
    const size = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 128
    return {
        row: Math.floor((y / 512) * size),
        column: Math.floor((x / 512) * size),
    }
}

function getStrokeCellSwatch(
    snapshot: {
        gridSize: number
        palette: {
            swatches: Array<{
                index: number
                hex: string
                isUser?: boolean
            }>
        }
        strokeLayer: {
            cells: Array<{
                cellIndex: number
                swatchIndex: number
            }>
        }
    },
    cell: { row: number; column: number }
) {
    const cellIndex = cell.row * snapshot.gridSize + cell.column
    const strokeCell = snapshot.strokeLayer.cells.find(
        (item) => item.cellIndex === cellIndex
    )
    if (!strokeCell) return null

    return (
        snapshot.palette.swatches.find(
            (swatch) => swatch.index === strokeCell.swatchIndex
        ) ?? null
    )
}

function getImportLayerCell(
    snapshot: {
        gridSize: number
        importLayer: {
            cells: number[]
        }
    },
    cell: { row: number; column: number }
) {
    return snapshot.importLayer.cells[cell.row * snapshot.gridSize + cell.column]
}

function getNearbyStrokeCellSwatch(
    snapshot: Parameters<typeof getStrokeCellSwatch>[0],
    cell: { row: number; column: number },
    expectedHex: string,
    radius = 8
) {
    for (let row = cell.row - radius; row <= cell.row + radius; row += 1) {
        for (
            let column = cell.column - radius;
            column <= cell.column + radius;
            column += 1
        ) {
            if (
                row < 0 ||
                column < 0 ||
                row >= snapshot.gridSize ||
                column >= snapshot.gridSize
            ) {
                continue
            }
            const swatch = getStrokeCellSwatch(snapshot, { row, column })
            if (swatch?.hex.toUpperCase() === expectedHex) return swatch
        }
    }

    return null
}

function getNearbyAnyStrokeCellSwatch(
    snapshot: Parameters<typeof getStrokeCellSwatch>[0],
    cell: { row: number; column: number },
    radius = 8
) {
    for (let row = cell.row - radius; row <= cell.row + radius; row += 1) {
        for (
            let column = cell.column - radius;
            column <= cell.column + radius;
            column += 1
        ) {
            if (
                row < 0 ||
                column < 0 ||
                row >= snapshot.gridSize ||
                column >= snapshot.gridSize
            ) {
                continue
            }
            const swatch = getStrokeCellSwatch(snapshot, { row, column })
            if (swatch) return swatch
        }
    }

    return null
}

async function getFirstNonMonochromeSwatchTitle(page: Page) {
    await expect(page.locator('button[title^="#"]').first()).toBeVisible()
    const title = await page.locator('button[title^="#"]').evaluateAll(
        (buttons) =>
            buttons
                .map((button) =>
                    (button as HTMLButtonElement).getAttribute("title")
                )
                .find((value) => {
                    const hex = value?.toUpperCase()
                    return (
                        /^#[0-9A-F]{6}$/.test(hex ?? "") &&
                        hex !== "#000000" &&
                        hex !== "#FFFFFF"
                    )
                }) ?? null
    )
    expect(title).toMatch(/^#[0-9A-F]{6}$/i)
    return title?.toUpperCase() ?? ""
}

async function clickSwatchByTitle(page: Page, title: string) {
    const swatch = page.locator(`button[title="${title}"]`).first()
    await expect(swatch).toBeVisible()
    await swatch.click()
}

async function expectSwatchActive(page: Page, title: string) {
    const swatch = page.locator(`button[title="${title}"]`).first()
    await expect(swatch).toBeVisible()
    await expect
        .poll(async () => {
            const box = await swatch.boundingBox()
            return box?.width ?? 0
        })
        .toBeGreaterThan(28)
}

function readZipStoreEntryNames(bytes: Uint8Array) {
    const names: string[] = []
    const decoder = new TextDecoder()
    let offset = 0

    while (offset + 30 <= bytes.length) {
        const signature =
            bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)
        if (signature !== 0x04034b50) break

        const compressedSize = readUint32LE(bytes, offset + 18)
        const fileNameLength = readUint16LE(bytes, offset + 26)
        const extraLength = readUint16LE(bytes, offset + 28)
        const nameStart = offset + 30
        const nameEnd = nameStart + fileNameLength
        names.push(decoder.decode(bytes.subarray(nameStart, nameEnd)))

        offset = nameEnd + extraLength + compressedSize
    }

    return names
}

function readUint16LE(bytes: Uint8Array, offset: number) {
    return bytes[offset] | (bytes[offset + 1] << 8)
}

function readUint32LE(bytes: Uint8Array, offset: number) {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    )
}
