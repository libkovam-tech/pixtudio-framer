import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    openBearImageCropScreen,
    openBearProject,
    settle,
    snapshotName,
} from "./helpers"

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installDownloadFallbackEnvironment(page)
})

test("swatch edit modal is stable", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    const swatch = page.locator('button[title^="#"]').first()
    await expect(swatch).toBeVisible()
    await swatch.click({ button: "right" })

    await expect(page.getByText("SWATCH EDIT")).toBeVisible()
    await expect(page.getByLabel("SV Picker")).toBeVisible()
    await expect(page.getByLabel("Hue Picker")).toBeVisible()
    await expect(page.getByLabel("HEX input")).toBeVisible()
    await expect(page.getByLabel("Delete swatch")).toBeVisible()
    await settle(page)

    await expect(page).toHaveScreenshot(
        snapshotName(testInfo, "editor-swatch-edit")
    )
    expect(errors.flush()).toEqual([])
})

test("crop screen is stable", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearImageCropScreen(page)

    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible()
    await expect(page.getByRole("button", { name: "OK" })).toBeVisible()
    await expect(page.locator("canvas").last()).toBeVisible()
    await settle(page)

    await expect(page).toHaveScreenshot(snapshotName(testInfo, "editor-crop"))
    expect(errors.flush()).toEqual([])
})

test("crop screen keeps vertical frames inside fixed viewport regions", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openImageCropScreen(
        page,
        path.join(fixturesDir, "generated-portrait-white-swatch.png")
    )
    await page.getByRole("radio", { name: "Aspect ratio 9:16" }).click()
    await settle(page)

    const metrics = await page.evaluate(() => {
        const rectOf = (selector: string) => {
            const el = document.querySelector(selector) as HTMLElement | null
            if (!el) return null
            const rect = el.getBoundingClientRect()
            return {
                x: rect.x,
                y: rect.y,
                top: rect.top,
                right: rect.right,
                width: rect.width,
                height: rect.height,
                bottom: rect.bottom,
            }
        }

        return {
            isMobileLayout:
                window.matchMedia("(pointer: coarse)").matches ||
                navigator.maxTouchPoints > 0,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            screen: rectOf('[data-crop-screen="true"]'),
            aspect: rectOf('[data-crop-aspect-region="true"]'),
            frame: rectOf('[data-crop-frame-region="true"]'),
            frameWindow: rectOf('[data-crop-frame-window="true"]'),
            frameOverlay: rectOf('[data-crop-frame-overlay="true"]'),
            actions: rectOf('[data-crop-actions-region="true"]'),
            canvas: rectOf('[data-crop-frame-region="true"] canvas'),
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
        }
    })

    expect(metrics.screen).not.toBeNull()
    expect(metrics.aspect).not.toBeNull()
    expect(metrics.frame).not.toBeNull()
    expect(metrics.frameWindow).not.toBeNull()
    expect(metrics.actions).not.toBeNull()
    expect(metrics.canvas).not.toBeNull()
    expect(metrics.aspect!.height).toBeCloseTo(metrics.viewportHeight * (5 / 24), 0)
    expect(metrics.frame!.height).toBeCloseTo(metrics.viewportHeight * (14 / 24), 0)
    expect(metrics.actions!.height).toBeCloseTo(metrics.viewportHeight * (5 / 24), 0)
    expect(metrics.frameWindow!.width).toBeCloseTo(
        metrics.isMobileLayout
            ? metrics.viewportWidth - 40
            : metrics.viewportHeight * (14 / 24),
        0
    )
    expect(metrics.frameWindow!.height).toBeCloseTo(
        metrics.viewportHeight * (14 / 24),
        0
    )
    if (metrics.frameOverlay) {
        expect(metrics.frameOverlay.top).toBeGreaterThanOrEqual(
            metrics.frameWindow!.y - 1
        )
        expect(metrics.frameOverlay.bottom).toBeLessThanOrEqual(
            metrics.frameWindow!.bottom + 1
        )
        expect(metrics.frameOverlay.width).toBeLessThanOrEqual(
            metrics.frameWindow!.width + 1
        )
        expect(metrics.frameOverlay.height).toBeLessThanOrEqual(
            metrics.frameWindow!.height + 1
        )
    }
    expect(metrics.canvas!.width).toBeLessThan(metrics.canvas!.height)
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1)

    expect(errors.flush()).toEqual([])
})

test("crop handles stay anchored to crop-frame corners for every aspect ratio", async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop pointer handles")
    const errors = collectBrowserErrors(page)

    await openBearImageCropScreen(page)

    for (const aspectRatioId of [
        "16:9",
        "3:2",
        "4:3",
        "1:1",
        "3:4",
        "2:3",
        "9:16",
    ]) {
        await page
            .getByRole("radio", { name: `Aspect ratio ${aspectRatioId}` })
            .click()
        await settle(page)

        const metrics = await page.evaluate(() => {
            const rectOf = (selector: string) => {
                const el = document.querySelector(selector) as HTMLElement | null
                if (!el) return null
                const rect = el.getBoundingClientRect()
                return {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                }
            }

            return {
                frame: rectOf('[data-crop-frame-overlay="true"]'),
                rotate: rectOf('[data-crop-rotate-handle="true"]'),
                scale: rectOf('[data-crop-scale-handle="true"]'),
            }
        })

        expect(metrics.frame).not.toBeNull()
        expect(metrics.rotate).not.toBeNull()
        expect(metrics.scale).not.toBeNull()
        expect(metrics.rotate!.top).toBeCloseTo(metrics.frame!.top, 0)
        expect(metrics.rotate!.right).toBeCloseTo(metrics.frame!.right, 0)
        expect(metrics.scale!.bottom).toBeCloseTo(metrics.frame!.bottom, 0)
        expect(metrics.scale!.right).toBeCloseTo(metrics.frame!.right, 0)
    }

    expect(errors.flush()).toEqual([])
})

test("crop can bake a fully transparent reference", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "mouse drag coverage")
    const errors = collectBrowserErrors(page)

    await openBearImageCropScreen(page)
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await settle(page)

    const cropCanvas = page.locator('[data-crop-frame-region="true"] canvas')
    const box = await cropCanvas.boundingBox()
    expect(box).not.toBeNull()
    const startX = box!.x + box!.width / 2
    const startY = box!.y + box!.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 1400, startY + 1400, { steps: 8 })
    await page.mouse.up()

    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText(/AUTO PALETTE 1 color/i)).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.getByTitle("Transparent")).toBeVisible()
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeEnabled()
    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByRole("button", { name: "Cancel METHOD" })).toBeVisible()
    await page.getByRole("button", { name: "Cancel METHOD" }).click()
    await expect(
        page.getByRole("button", { name: "Cancel METHOD" })
    ).toHaveCount(0)

    expect(errors.flush()).toEqual([])
})

test("crop aspect ratio selection creates matching canvas geometry", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearImageCropScreen(page)
    await page.getByRole("radio", { name: "Aspect ratio 9:16" }).click()
    await page.getByRole("button", { name: "OK" }).click()
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })
    await settle(page)

    const save = await downloadProjectSave(page)
    const snapshot = JSON.parse(await readFile(save.path, "utf8"))
    expect(snapshot.aspectRatioId).toBe("9:16")
    expect(snapshot.columns).toBe(32)
    expect(snapshot.rows).toBe(57)
    expect(snapshot.ref.w).toBe(512)
    expect(snapshot.ref.h).toBe(910)

    expect(errors.flush()).toEqual([])
})

for (const expected of [
    {
        aspectRatioId: "16:9",
        columns: 57,
        rows: 32,
        ref: { w: 910, h: 512 },
    },
    {
        aspectRatioId: "9:16",
        columns: 32,
        rows: 57,
        ref: { w: 512, h: 910 },
    },
    {
        aspectRatioId: "1:1",
        columns: 32,
        rows: 32,
        ref: { w: 512, h: 512 },
    },
] as const) {
    test(`crop can create ${expected.aspectRatioId} projects`, async ({
        page,
    }) => {
        const errors = collectBrowserErrors(page)

        await openBearImageCropScreen(page)
        await page
            .getByRole("radio", {
                name: `Aspect ratio ${expected.aspectRatioId}`,
            })
            .click()
        await page.getByRole("button", { name: "OK" }).click()
        await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({
            timeout: 20_000,
        })
        await settle(page)

        const save = await downloadProjectSave(page)
        const snapshot = JSON.parse(await readFile(save.path, "utf8"))
        expect(snapshot.aspectRatioId).toBe(expected.aspectRatioId)
        expect(snapshot.columns).toBe(expected.columns)
        expect(snapshot.rows).toBe(expected.rows)
        expect(snapshot.ref.w).toBe(expected.ref.w)
        expect(snapshot.ref.h).toBe(expected.ref.h)

        expect(errors.flush()).toEqual([])
    })
}

test("tablet crop screen keeps action buttons in viewport", async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "tablet guard uses touch UI")
    const errors = collectBrowserErrors(page)

    await page.setViewportSize({ width: 1024, height: 768 })
    await openBearImageCropScreen(page)

    const cancelBox = await page
        .getByRole("button", { name: "Cancel" })
        .boundingBox()
    const okBox = await page.getByRole("button", { name: "OK" }).boundingBox()

    expect(cancelBox).not.toBeNull()
    expect(okBox).not.toBeNull()
    expect(cancelBox!.y + cancelBox!.height).toBeLessThanOrEqual(768)
    expect(okBox!.y + okBox!.height).toBeLessThanOrEqual(768)
    expect(errors.flush()).toEqual([])
})

test("smart object screen is stable", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: "Smart Object" }).click()

    await expect(page.getByText("EXPOSURE:")).toBeVisible()
    await expect(page.getByText("WHITE BALANCE:")).toBeVisible()
    await expect(page.getByRole("button", { name: "Apply" })).toBeVisible()
    await expect(
        page.getByRole("button", { name: "Export" }).last()
    ).toBeVisible()
    await settle(page)

    await expect(page).toHaveScreenshot(
        snapshotName(testInfo, "editor-smart-object")
    )
    expect(errors.flush()).toEqual([])
})

test("quantization recorder screen is stable", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: "Quantization Recorder" }).click()

    await expect(
        page.getByRole("button", { name: "Play preview" })
    ).toBeVisible()
    await expect(page.getByText("Grid Size", { exact: true })).toBeVisible()
    await expect(page.getByText("Palette Size", { exact: true })).toBeVisible()
    await expect(
        page.getByRole("button", { name: "Export" }).last()
    ).toBeVisible()
    await settle(page)

    await expect(page).toHaveScreenshot(
        snapshotName(testInfo, "editor-quantization-recorder")
    )
    expect(errors.flush()).toEqual([])
})

async function downloadProjectSave(page: Page) {
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save" }).click()
    const download = await downloadPromise
    await settle(page)
    const downloadPath = await download.path()
    expect(downloadPath).toBeTruthy()
    return { path: downloadPath as string }
}

async function openImageCropScreen(page: Page, imagePath: string) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(imagePath)

    await expect(page.getByRole("button", { name: "OK" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.locator("canvas").last()).toBeVisible({ timeout: 20_000 })
    await settle(page)
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
