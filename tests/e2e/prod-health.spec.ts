import { expect, test, type Locator, type Page } from "@playwright/test"
import { readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { fixturesDir } from "./helpers"

const prodSmokeFixturePath = path.join(fixturesDir, "prod-smoke-v1.png")
const editorHealthSmokePath = "/editor/?pixtudio-health-smoke=1"

const fatalConsolePatterns = [
    /Content Security Policy/i,
    /Refused to (connect|load|create|frame)/i,
    /\bblob:/i,
    /\bworker-src\b/i,
    /\bchild-src\b/i,
    /\bmedia-src\b/i,
    /\bconnect-src\b/i,
    /\bscript-src\b/i,
    /\bwasm\b/i,
    /WebAssembly/i,
    /SharedArrayBuffer/i,
    /ffmpeg/i,
    /Failed to fetch/i,
    /NetworkError/i,
    /NotAllowedError/i,
    /SecurityError/i,
    /QuotaExceededError/i,
]

test.describe.configure({ mode: "serial" })

test("prod_public_routes open in a real browser context", async ({ page }) => {
    const errors = collectFatalBrowserErrors(page)

    await expectBrowserRouteHealthy(
        page,
        "/",
        page.getByRole("link", { name: "Try PIXTUDIO Now" }).first()
    )
    await expectBrowserRouteHealthy(
        page,
        "/editor/",
        page.getByRole("button", { name: "Open File" })
    )
    await expectBrowserRouteHealthy(
        page,
        "/pixel-art-from-photos/",
        page.getByRole("heading", { name: "Pixel Art from Photos" })
    )
    await expectBrowserRouteHealthy(
        page,
        "/how-it-works/",
        page.getByRole("button", { name: "Start with a Photo" })
    )

    const ping = await page.evaluate(async () => {
        const response = await fetch("/api/ping", { cache: "no-store" })
        return {
            status: response.status,
            text: (await response.text()).trim(),
        }
    })
    expect(ping.status).toBe(200)
    expect(ping.text).toBe("ok")
    expect(errors.flush()).toEqual([])
})

test("prod_boot opens the public app and editor without fatal browser errors", async ({
    page,
}) => {
    const errors = collectFatalBrowserErrors(page)

    await page.goto("/")
    await expect(page.locator("body")).toBeVisible()
    await prodSettle(page)
    expect(errors.flush()).toEqual([])

    await page.goto(editorHealthSmokePath)
    await expect(page.getByRole("button", { name: "Open File" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.getByRole("button", { name: "Camera" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Draw" })).toBeVisible()
    await prodSettle(page)
    expect(errors.flush()).toEqual([])
})

test("prod_import_export_png can import and download a valid PNG", async ({
    page,
}) => {
    const errors = collectFatalBrowserErrors(page)

    await openProdSmokeImage(page)
    await expectReadableEditorCanvas(page)

    const png = await downloadEditorExport(page, /^PNG$/)
    try {
        expect(png.suggestedFilename).toBe("pixtudio.png")
        expect(await fileSize(png.path)).toBeGreaterThan(100)
        await expectFileSignature(png.path, [0x89, 0x50, 0x4e, 0x47])
        expect(errors.flush()).toEqual([])
    } finally {
        await cleanupDownload(png.path)
    }
})

test("prod_smart_object_open_apply keeps the editor alive", async ({ page }) => {
    const errors = collectFatalBrowserErrors(page)

    await openProdSmokeImage(page)
    await page.getByRole("button", { name: "Smart Object" }).click()
    await expect(page.getByText("EXPOSURE:")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("HIGHLIGHTS:")).toBeVisible()
    await expect(page.getByText("MIDTONES:")).toBeVisible()
    await expect(page.getByText("SHADOWS:")).toBeVisible()
    await expect(page.getByText("SATURATION:")).toBeVisible()
    await expect(page.getByText("WHITE BALANCE:")).toBeVisible()

    await setRangeValue(page.locator("input.soRange").nth(0), 8)
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(page.getByRole("button", { name: "Smart Object" })).toBeVisible()
    await expectReadableEditorCanvas(page)
    expect(errors.flush()).toEqual([])
})

test("prod_method_open_preview_apply keeps the editor alive", async ({ page }) => {
    const errors = collectFatalBrowserErrors(page)

    await openProdSmokeImage(page)
    const committedCanvas = await readEditorCanvasSignature(page)

    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByText("METHOD")).toBeVisible({ timeout: 20_000 })
    await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
    await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
    await prodSettle(page)

    const previewCanvas = await readEditorCanvasSignature(page)
    expect(previewCanvas).not.toBe("")
    expect(previewCanvas).not.toBe(committedCanvas)

    await page.getByRole("button", { name: "Apply METHOD" }).click()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeVisible()
    await expectReadableEditorCanvas(page)
    expect(errors.flush()).toEqual([])
})

test("prod_quant_recorder_export downloads a valid MP4", async ({ page }) => {
    test.setTimeout(180_000)
    const errors = collectFatalBrowserErrors(page)

    await openProdSmokeImage(page)
    await page.getByRole("button", { name: "Quantization Recorder" }).click()
    await expect(page.getByRole("button", { name: "Play preview" })).toBeVisible({
        timeout: 30_000,
    })

    await configureFastRecorderExport(page)

    const mp4 = await downloadRecorderExport(page)
    try {
        expect(mp4.suggestedFilename).toBe("pixtudio-quantization.mp4")
        expect(await fileSize(mp4.path)).toBeGreaterThan(1_000)
        await expectMp4Signature(mp4.path)
        expect(errors.flush()).toEqual([])
    } finally {
        await cleanupDownload(mp4.path)
    }
})

async function openProdSmokeImage(page: Page) {
    await page.goto(editorHealthSmokePath)
    await page.evaluate(() => {
        window.sessionStorage.setItem("pixtudio:health-smoke", "1")
    })
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(prodSmokeFixturePath)

    await expect(page.getByRole("button", { name: "OK" })).toBeVisible({
        timeout: 20_000,
    })
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })
    await prodSettle(page)
}

async function configureFastRecorderExport(page: Page) {
    const gridRangeToggle = page.getByLabel("Grid Size")
    const paletteRangeToggle = page.getByLabel("Palette Size")
    const gridValueInput = page.getByLabel("Grid value")
    const paletteValueInput = page.getByLabel("Palette value")
    const durationInput = page.getByLabel("Duration seconds")

    await expect(gridRangeToggle).toBeVisible()
    await expect(gridRangeToggle).toBeEnabled()
    await expect(paletteRangeToggle).toBeVisible()
    await expect(paletteRangeToggle).toBeEnabled()
    await expect(gridValueInput).toBeVisible()
    await expect(paletteValueInput).toBeVisible()
    await expect(durationInput).toBeVisible()

    if (await gridRangeToggle.isChecked()) {
        await setCheckboxChecked(gridRangeToggle, false)
    }
    if (await paletteRangeToggle.isChecked()) {
        await setCheckboxChecked(paletteRangeToggle, false)
    }

    await commitTextInput(gridValueInput, 8)
    await commitTextInput(paletteValueInput, 4)
    await commitTextInput(durationInput, 1)
    await expect(page.getByRole("button", { name: "Export" }).last()).toBeEnabled()
    await prodSettle(page)
}

async function downloadEditorExport(page: Page, label: RegExp) {
    await page.getByRole("button", { name: "Export" }).click()
    await expect(page.getByRole("button", { name: label })).toBeVisible()

    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: label }).click()
    const download = await downloadPromise
    await prodSettle(page)

    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()

    return {
        path: downloadPath as string,
        suggestedFilename: download.suggestedFilename(),
    }
}

async function downloadRecorderExport(page: Page) {
    const downloadPromise = page.waitForEvent("download", { timeout: 150_000 })
    await page.getByRole("button", { name: "Export" }).last().click()
    const download = await downloadPromise
    await prodSettle(page)

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

async function expectReadableEditorCanvas(page: Page) {
    await prodSettle(page)
    await expect.poll(() => readEditorCanvasSignature(page)).not.toBe("")
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

async function commitTextInput(input: Locator, value: number) {
    await input.fill(String(value))
    await input.press("Enter")
}

async function setCheckboxChecked(checkbox: Locator, checked: boolean) {
    await checkbox.evaluate(
        (element, nextChecked) => {
            const input = element as HTMLInputElement
            input.checked = nextChecked
            input.dispatchEvent(new Event("input", { bubbles: true }))
            input.dispatchEvent(new Event("change", { bubbles: true }))
        },
        checked
    )
}

async function prodSettle(page: Page) {
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForTimeout(250)
}

async function expectBrowserRouteHealthy(
    page: Page,
    route: string,
    readyMarker: Locator
) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" })
    expect(response?.status(), route).toBe(200)
    await expect(page.locator("body")).toBeVisible()
    await expect(readyMarker).toBeVisible({ timeout: 20_000 })
    await prodSettle(page)
}

function collectFatalBrowserErrors(page: Page) {
    const errors: string[] = []

    page.on("console", (message) => {
        if (message.type() !== "error") return
        const text = message.text()
        if (fatalConsolePatterns.some((pattern) => pattern.test(text))) {
            errors.push(text)
        }
    })

    page.on("pageerror", (error) => {
        errors.push(error.message)
    })

    return {
        flush() {
            return errors.splice(0, errors.length)
        },
    }
}

async function fileSize(filePath: string) {
    return (await stat(filePath)).size
}

async function expectFileSignature(filePath: string, signature: number[]) {
    const bytes = await readFile(filePath)
    expect(Array.from(bytes.subarray(0, signature.length))).toEqual(signature)
}

async function expectMp4Signature(filePath: string) {
    const bytes = await readFile(filePath)
    const header = new TextDecoder("ascii").decode(bytes.subarray(0, 32))
    expect(header).toContain("ftyp")
}

async function cleanupDownload(filePath: string) {
    await rm(filePath, { force: true }).catch(() => undefined)
}
