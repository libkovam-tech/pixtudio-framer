import { expect, test, type Page } from "@playwright/test"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    openBearProject,
    settle,
} from "./helpers"

const unsupportedFilePath = path.join(fixturesDir, "unsupported-open-file.txt")

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
    await expect(page.getByText("Import failed. Please try again.")).toBeVisible()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "Open File" })).toBeVisible()

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
        page.getByRole("heading", { name: "PIXTUDIO - User Guide" })
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
