import type { Page } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect } from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const fixturesDir = path.resolve(__dirname, "../fixtures")
export const bearProjectPath = path.join(fixturesDir, "Bear-test.pixtudio")
export const bearImagePath = path.join(fixturesDir, "Bear-test.png")

export async function installStableVisualEnvironment(page: Page) {
    await page.addInitScript(() => {
        window.localStorage.setItem("pixtudio-e2e", "true")
        window.sessionStorage.setItem("pixtudio:orbit-quality", "lite")
    })
}

export async function openBearProject(page: Page) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(bearProjectPath)

    await expect(page.getByRole("button", { name: "Export" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.getByText(/BRUSH SIZE/i)).toBeVisible({ timeout: 20_000 })
    await settle(page)
}

export async function openBearImageCropScreen(page: Page) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(bearImagePath)

    await expect(page.getByRole("button", { name: "OK" })).toBeVisible({
        timeout: 20_000,
    })
    await expect(page.locator("canvas").last()).toBeVisible({ timeout: 20_000 })
    await settle(page)
}

export async function settle(page: Page) {
    await page.addStyleTag({
        content: `
      *,
      *::before,
      *::after {
        animation-duration: 0.001s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
    })
    await page.evaluate(() => document.fonts?.ready)
    await page.waitForTimeout(250)
}

export function snapshotName(
    testInfo: { project: { name: string } },
    name: string
) {
    return `${name}-${testInfo.project.name}.png`
}

export function promoDynamicMasks(page: Page) {
    return [
        page.locator(".hubMobileVideoHero"),
        page.locator("video"),
        page.locator("canvas"),
    ]
}

export function collectBrowserErrors(page: Page) {
    const errors: string[] = []

    page.on("console", (message) => {
        if (message.type() !== "error") return
        errors.push(message.text())
    })

    page.on("pageerror", (error) => {
        errors.push(error.message)
    })

    return {
        flush() {
            return errors
        },
    }
}
