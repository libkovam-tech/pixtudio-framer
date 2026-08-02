import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import {
    collectBrowserErrors,
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
