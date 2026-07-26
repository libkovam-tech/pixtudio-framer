import { expect, test, type Page } from "@playwright/test"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    settle,
    snapshotName,
} from "./helpers"

type VisualFixture = {
    id: string
    fileName: string
}

const visualFixtures: VisualFixture[] = [
    { id: "01-high-key-portrait", fileName: "method-01-high-key-portrait.png" },
    { id: "02-portrait-dark-bg", fileName: "method-02-portrait-dark-bg.jpg" },
    { id: "03-poster", fileName: "method-03-poster.png" },
    { id: "04-sunset", fileName: "method-04-sunset.jpg" },
    { id: "05-busy-market", fileName: "method-05-busy-market.png" },
    { id: "06-transparent-object", fileName: "method-06-transparent-object.png" },
    { id: "07-low-contrast", fileName: "method-07-low-contrast.jpg" },
    { id: "08-pixel-art", fileName: "method-08-pixel-art.jpg" },
]

const fixedPaletteCheckpoints = [
    { fixtureId: "02-portrait-dark-bg", preset: /^GRAY\b/, id: "gray" },
    { fixtureId: "06-transparent-object", preset: /^BLACK\/WHITE\b/, id: "bw" },
    { fixtureId: "08-pixel-art", preset: /^SUNSET\b/, id: "sunset" },
] as const

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
})

for (const fixture of visualFixtures) {
    test(`METHOD visual baseline ${fixture.id}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "visual baseline is desktop-only")
        const errors = collectBrowserErrors(page)

        await openVisualFixture(page, fixture)
        await expectEditorCanvasScreenshot(
            page,
            testInfo,
            `method-visual-${fixture.id}-import`
        )

        await applyMethodProfile(page, "k-means", "hsv")
        await expectEditorCanvasScreenshot(
            page,
            testInfo,
            `method-visual-${fixture.id}-k-means-hsv`
        )

        const fixedCheckpoint = fixedPaletteCheckpoints.find(
            (checkpoint) => checkpoint.fixtureId === fixture.id
        )
        if (fixedCheckpoint) {
            await applyFixedPalettePreset(page, fixedCheckpoint.preset)
            await expectEditorCanvasScreenshot(
                page,
                testInfo,
                `method-visual-${fixture.id}-fixed-${fixedCheckpoint.id}`
            )
        }

        expect(errors.flush()).toEqual([])
    })
}

async function openVisualFixture(page: Page, fixture: VisualFixture) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(
        path.join(fixturesDir, "visual-regression", fixture.fileName)
    )

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

async function applyMethodProfile(
    page: Page,
    methodId: string,
    colorSpaceId: string
) {
    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByText("METHOD")).toBeVisible()
    await page
        .locator(`button[data-axis="method"][data-method-id="${methodId}"]`)
        .click()
    await page
        .locator(
            `button[data-axis="color-space"][data-color-space-id="${colorSpaceId}"]`
        )
        .click()
    await settle(page)
    await page.getByRole("button", { name: "Apply METHOD" }).click()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeVisible()
    await settle(page)
}

async function applyFixedPalettePreset(page: Page, presetName: RegExp) {
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: presetName }).click()
    await settle(page)
}

async function expectEditorCanvasScreenshot(
    page: Page,
    testInfo: { project: { name: string } },
    name: string
) {
    await settle(page)
    await expect(page.locator("canvas").first()).toHaveScreenshot(
        snapshotName(testInfo, name)
    )
}
