import { expect, test, type Page } from "@playwright/test"
import path from "node:path"
import {
    collectBrowserErrors,
    fixturesDir,
    installStableVisualEnvironment,
    settle,
} from "./helpers"

const heavyFixturePath = path.join(
    fixturesDir,
    "visual-regression",
    "method-05-busy-market.png"
)

const stressPairs = [
    { methodId: "k-means", colorSpaceId: "oklab" },
    { methodId: "pixtudio", colorSpaceId: "oklab" },
    { methodId: "k-means", colorSpaceId: "hsv" },
    { methodId: "k-medoids", colorSpaceId: "hsl" },
    { methodId: "fuzzy-c-means", colorSpaceId: "yuv" },
    { methodId: "k-means", colorSpaceId: "din99" },
    { methodId: "pixtudio", colorSpaceId: "din99" },
    { methodId: "k-means", colorSpaceId: "cam16-ucs" },
    { methodId: "pixtudio", colorSpaceId: "cam16-ucs" },
] as const

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
})

test("METHOD stays responsive while switching color spaces on a heavy image", async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "METHOD stress is desktop-only")
    test.setTimeout(90_000)

    const errors = collectBrowserErrors(page)

    await openHeavyFixture(page)
    const committedCanvas = await readEditorCanvasSignature(page)

    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByText("METHOD")).toBeVisible()

    const previewSignatures = await switchMethodPairs(page, stressPairs)
    expect(new Set(previewSignatures).size).toBeGreaterThanOrEqual(3)
    expect(previewSignatures.some((signature) => signature !== committedCanvas)).toBe(
        true
    )

    await page.getByRole("button", { name: "Cancel METHOD" }).click()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeVisible()
    await expectEditorCanvasSignature(page, committedCanvas)

    await page.getByRole("button", { name: "METHOD" }).click()
    await expect(page.getByText("METHOD")).toBeVisible()

    const applySignatures = await switchMethodPairs(page, stressPairs)
    const finalPreviewCanvas = applySignatures.at(-1)
    expect(finalPreviewCanvas).toBeTruthy()
    expect(finalPreviewCanvas).not.toBe(committedCanvas)

    await page.getByRole("button", { name: "Apply METHOD" }).click()
    await expect(page.getByRole("button", { name: "METHOD" })).toBeVisible()
    await expectEditorCanvasSignature(page, finalPreviewCanvas ?? "")

    expect(errors.flush()).toEqual([])
})

async function openHeavyFixture(page: Page) {
    await page.goto("/editor/")
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(heavyFixturePath)

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

async function switchMethodPairs(
    page: Page,
    pairs: ReadonlyArray<{ methodId: string; colorSpaceId: string }>
) {
    const signatures: string[] = []

    for (const pair of pairs) {
        await selectMethodPair(page, pair.methodId, pair.colorSpaceId)
        await expect(page.getByRole("button", { name: "Apply METHOD" })).toBeEnabled({
            timeout: 20_000,
        })
        signatures.push(await readEditorCanvasSignature(page))
    }

    return signatures
}

async function selectMethodPair(
    page: Page,
    methodId: string,
    colorSpaceId: string
) {
    const methodButton = page.locator(
        `button[data-axis="method"][data-method-id="${methodId}"]`
    )
    await expect(methodButton).toHaveAttribute("data-compatible", "true")
    await methodButton.click()

    const colorSpaceButton = page.locator(
        `button[data-axis="color-space"][data-color-space-id="${colorSpaceId}"]`
    )
    await expect(colorSpaceButton).toHaveAttribute("data-compatible", "true")
    await colorSpaceButton.click()
    await settle(page)
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
