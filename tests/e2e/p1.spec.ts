import { expect, test } from "@playwright/test"
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
