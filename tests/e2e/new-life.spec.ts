import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
    bearImagePath,
    bearProjectPath,
    fixturesDir,
    installStableVisualEnvironment,
    openBearImageCropScreen,
    openBearProject,
    settle,
} from "./helpers"

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await page.addInitScript(() => {
        Object.defineProperty(window, "showSaveFilePicker", {
            configurable: true,
            value: undefined,
        })
    })
})

async function openImage(page: Page) {
    await openBearImageCropScreen(page)
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Quantization Recorder" })).toBeVisible()
    await settle(page)
}

async function openFromEditor(page: Page, file: string, filename?: string) {
    await page.getByRole("button", { name: "Import", exact: true }).click()
    const choosing = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open file", exact: true }).click()
    await (await choosing).setFiles(filename ? {
        name: filename,
        mimeType: "application/json",
        buffer: await readFile(file),
    } : file)
}

async function setRecorderPreferences(page: Page) {
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await page.getByLabel("Duration seconds", { exact: true }).fill("7")
    await page.getByLabel("Duration seconds", { exact: true }).press("Tab")
    await page.getByRole("radio", { name: "One Way", exact: true }).check()
    await page.getByRole("button", { name: "Apply settings" }).click()
}

async function expectRecorder(page: Page, defaultSettings: boolean) {
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await expect(page.getByLabel("Duration seconds", { exact: true })).toHaveValue(defaultSettings ? "20" : "7")
    await expect(page.getByRole("radio", { name: defaultSettings ? "Both Ways" : "One Way", exact: true })).toBeChecked()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
}

async function setExportPreferences(page: Page) {
    await page.getByRole("button", { name: "Export", exact: true }).click()
    await page.getByRole("checkbox", { name: "Image layer", exact: true }).uncheck()
    await page.keyboard.press("Escape")
}

async function expectExport(page: Page, defaultSettings: boolean) {
    await page.getByRole("button", { name: "Export", exact: true }).click()
    await expect(page.getByRole("checkbox", { name: "Stroke layer", exact: true })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: "Image layer", exact: true })).toBeChecked({ checked: defaultSettings })
    await page.keyboard.press("Escape")
}

async function saveProject(page: Page) {
    const downloading = page.waitForEvent("download")
    await page.getByRole("button", { name: /^Save(?: Project)?$/i }).click()
    const savedPath = await (await downloading).path()
    if (!savedPath) throw new Error("Project download has no local path")
    return { path: savedPath, snapshot: JSON.parse(await readFile(savedPath, "utf8")) as Record<string, unknown> }
}

for (const boundary of ["image", "blank", "load", "fresh-session", "camera"] as const) {
    test(`new life resets session preferences: ${boundary}`, async ({ page }, testInfo) => {
        if (boundary === "camera" && testInfo.project.name === "desktop") {
            // Exercise the real capture pipeline with a synthetic camera stream.
            await page.addInitScript(() => {
                navigator.mediaDevices.getUserMedia = async () => {
                    const canvas = document.createElement("canvas")
                    canvas.width = 320
                    canvas.height = 240
                    const ctx = canvas.getContext("2d")!
                    ctx.fillStyle = "#ff0000"
                    ctx.fillRect(0, 0, 160, 240)
                    ctx.fillStyle = "#0000ff"
                    ctx.fillRect(160, 0, 160, 240)
                    return canvas.captureStream(1)
                }
            })
        }
        await openImage(page)
        await setRecorderPreferences(page)
        await setExportPreferences(page)
        await expectRecorder(page, false)
        await expectExport(page, false)

        if (boundary === "image") {
            await openFromEditor(page, bearImagePath)
            await page.getByRole("button", { name: "OK", exact: true }).click()
        } else if (boundary === "blank") {
            await page.getByRole("button", { name: "Import", exact: true }).click()
            await page.getByRole("button", { name: "Blank canvas", exact: true }).click()
            await page.getByRole("button", { name: "Create Blank Canvas" }).click()
        } else if (boundary === "load") {
            await openFromEditor(page, bearProjectPath)
        } else if (boundary === "camera") {
            await page.getByRole("button", { name: "Import", exact: true }).click()
            if (testInfo.project.name === "mobile") {
                const choosing = page.waitForEvent("filechooser")
                await page.getByRole("button", { name: "Camera", exact: true }).click()
                await (await choosing).setFiles(bearImagePath)
            } else {
                await page.getByRole("button", { name: "Camera", exact: true }).click()
                await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0)
                await page.getByRole("button", { name: "Capture", exact: true }).click()
            }
            await page.getByRole("button", { name: "OK", exact: true }).click()
        } else {
            await openImage(page)
        }
        await settle(page)
        if (boundary === "blank") {
            // Recorder requires an imported reference, so it is unavailable on blank canvases.
            await expect(page.getByRole("button", { name: "Quantization Recorder" })).toBeDisabled()
        } else {
            await expectRecorder(page, true)
        }
        await expectExport(page, true)
    })
}

test("rejected import and cancelled crop preserve the current session", async ({ page }) => {
    await openImage(page)
    await setRecorderPreferences(page)
    await setExportPreferences(page)
    await openFromEditor(page, path.join(fixturesDir, "unsupported-open-file.txt"))
    await expect(page.getByText("IMPORT ERROR")).toBeVisible()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expectRecorder(page, false)
    await expectExport(page, false)
    await openFromEditor(page, bearImagePath)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expectRecorder(page, false)
    await expectExport(page, false)
})

test("Smart Apply and history are not new-life boundaries", async ({ page }) => {
    await openImage(page)
    await setRecorderPreferences(page)
    await setExportPreferences(page)
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    const exposure = page.locator("input.soRange").first()
    await exposure.fill("20")
    await exposure.dispatchEvent("input")
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await settle(page)
    await expectRecorder(page, false)
    await expectExport(page, false)
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await settle(page)
    await expectRecorder(page, false)
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    await settle(page)
    await expectRecorder(page, false)
})

test("load restores saved project settings, not the previous image settings", async ({ page }) => {
    await openBearProject(page)
    const original = (await saveProject(page)).snapshot
    await openImage(page)
    await setRecorderPreferences(page)
    await openFromEditor(page, bearProjectPath)
    await settle(page)
    await expectRecorder(page, true)
    const restored = (await saveProject(page)).snapshot
    for (const key of ["gridSize", "aspectRatioId", "palette", "methodProfilesByPaletteContext", "deConfettiByPaletteContext", "smartObjectState", "strokeLayer", "importLayer"]) {
        expect(restored[key], key).toEqual(original[key])
    }
})

test("new import resets committed modules; loading restores their saved values", async ({ page }) => {
    await openImage(page)
    const defaults = (await saveProject(page)).snapshot
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await page.locator("input.soRange").first().fill("20")
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await settle(page)
    await page.getByRole("slider").nth(0).fill("6")
    await page.getByRole("slider").nth(1).fill("16")
    await page.getByRole("slider").nth(2).fill("8")
    await settle(page)
    await page.getByRole("button", { name: "METHOD", exact: true }).click()
    await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
    await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
    await page.getByRole("button", { name: "Apply METHOD" }).click()
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.locator('button[title="SUNSET"]').click()
    await settle(page)
    const edited = await saveProject(page)
    expect(edited.snapshot.gridSize).toBe(16)
    expect(edited.snapshot.methodProfilesByPaletteContext).not.toEqual(defaults.methodProfilesByPaletteContext)
    expect(edited.snapshot.smartObjectState).not.toEqual(defaults.smartObjectState)
    expect(edited.snapshot.palette).not.toEqual(defaults.palette)

    await openFromEditor(page, bearImagePath)
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await settle(page)
    await expect(page.getByRole("slider").nth(0)).toHaveValue("3")
    const fresh = (await saveProject(page)).snapshot
    const keys = ["gridSize", "paletteCount", "palette", "quantizationProfile", "methodProfilesByPaletteContext", "deConfettiByPaletteContext", "smartObjectState", "strokeLayer", "importLayer"]
    for (const key of keys) expect(fresh[key], `new import: ${key}`).toEqual(defaults[key])
    await openFromEditor(page, edited.path, "project.pixtudio")
    await settle(page)
    const restored = (await saveProject(page)).snapshot
    for (const key of keys) expect(restored[key], `load: ${key}`).toEqual(edited.snapshot[key])
    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await settle(page)
    // The previous project's Auto world had Grid 32; the loaded project has Grid 16.
    const loadedAuto = (await saveProject(page)).snapshot
    expect(loadedAuto.gridSize).toBe(16)
})

test("new import discards recorder ranges, fixed values and audio selection", async ({ page }) => {
    await openImage(page)
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await page.getByRole("checkbox", { name: "Grid Size", exact: true }).uncheck()
    // Recorder requires at least one animated range; Palette remains enabled.
    await page.getByLabel("Grid value", { exact: true }).fill("6")
    await page.getByLabel("Grid value", { exact: true }).press("Tab")
    await page.getByLabel("Palette value", { exact: true }).fill("4")
    await page.getByLabel("Palette value", { exact: true }).press("Tab")
    await page.getByLabel("Palette end value", { exact: true }).fill("12")
    await page.getByLabel("Palette end value", { exact: true }).press("Tab")
    const wav = Buffer.alloc(46)
    wav.write("RIFF", 0)
    wav.writeUInt32LE(38, 4)
    wav.write("WAVEfmt ", 8)
    wav.writeUInt32LE(16, 16)
    wav.writeUInt16LE(1, 20)
    wav.writeUInt16LE(1, 22)
    wav.writeUInt32LE(8000, 24)
    wav.writeUInt32LE(16000, 28)
    wav.writeUInt16LE(2, 32)
    wav.writeUInt16LE(16, 34)
    wav.write("data", 36)
    wav.writeUInt32LE(2, 40)
    const choosing = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File...", exact: true }).click()
    await (await choosing).setFiles({ name: "session.wav", mimeType: "audio/wav", buffer: wav })
    await expect(page.getByText("session.wav", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Apply settings" }).click()
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await expect(page.getByLabel("Grid value", { exact: true })).toHaveValue("6")
    await expect(page.getByLabel("Palette value", { exact: true })).toHaveValue("4")
    await expect(page.getByLabel("Palette end value", { exact: true })).toHaveValue("12")
    await expect(page.getByText("session.wav", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await openFromEditor(page, bearImagePath)
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await expect(page.getByRole("checkbox", { name: "Grid Size", exact: true })).toBeChecked()
    await expect(page.getByRole("checkbox", { name: "Palette Size", exact: true })).toBeChecked()
    for (const [label, value] of [["Grid value", "2"], ["Grid end value", "128"], ["Palette value", "2"], ["Palette end value", "32"]]) {
        await expect(page.getByLabel(label, { exact: true })).toHaveValue(value)
    }
    await expect(page.getByText("no file selected", { exact: true })).toBeVisible()
    await expect(page.getByText("session.wav", { exact: true })).toHaveCount(0)
})
