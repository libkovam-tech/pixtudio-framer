import { expect, test, type Page } from "@playwright/test"
import {
    collectBrowserErrors,
    installStableVisualEnvironment,
    openBearProject,
    settle,
} from "./helpers"

declare global {
    interface Window {
        __pixtudioClipboardMode?: "image" | "unsupported" | "fail"
        __pixtudioClipboardReadCount?: number
    }
}

test.skip(
    process.env.VITE_CLIPBOARD_PALETTE_CANDIDATE === "false",
    "Clipboard palette candidate e2e is disabled by VITE_CLIPBOARD_PALETTE_CANDIDATE=false."
)

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installClipboardPaletteCandidateEnvironment(page)
})

test("clipboard image prompt imports a palette on Yes", async ({
    page,
}, testInfo) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()

    await expectClipboardPromptVisible(page)
    await expect(page.getByRole("button", { name: "SUNSET" })).toHaveCount(0)
    await expect(
        page.getByRole("button", { name: "Load Palette" })
    ).toHaveCount(0)

    await page.getByRole("button", { name: "Yes" }).click()

    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)
    await expect(
        page.locator('button[title^="Clipboard image_"]')
    ).toBeVisible()
    await expect(page.getByText("LOAD PALETTE FROM CLIPBOARD?")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Load Palette" })).toBeVisible()
    await expect(
        page.locator('button[title*="clipboard-image"]')
    ).toHaveCount(0)
    await expect
        .poll(() => page.evaluate(() => window.__pixtudioClipboardReadCount))
        .toBeGreaterThanOrEqual(2)

    expect(testInfo.project.name).toMatch(/desktop|mobile/)
    expect(errors.flush()).toEqual([])
})

test("fresh-read failure on Yes is silent and does not show import error", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()

    await expectClipboardPromptVisible(page)
    await page.evaluate(() => {
        window.__pixtudioClipboardMode = "fail"
    })
    await page.getByRole("button", { name: "Yes" }).click()

    await expect(page.getByText("LOAD PALETTE FROM CLIPBOARD?")).toHaveCount(0)
    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)
    await expect(page.locator('button[title^="Clipboard image_"]')).toHaveCount(
        0
    )
    await expect(page.getByRole("button", { name: "Load Palette" })).toBeVisible()

    expect(errors.flush()).toEqual([])
})

test("unsupported clipboard payload stays silent without prompt or import error", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await page.addInitScript(() => {
        window.__pixtudioClipboardMode = "unsupported"
    })
    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await settle(page)

    await expect(page.getByText("LOAD PALETTE FROM CLIPBOARD?")).toHaveCount(0)
    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Load Palette" })).toBeVisible()

    expect(errors.flush()).toEqual([])
})

async function installClipboardPaletteCandidateEnvironment(page: Page) {
    await page.addInitScript(() => {
        window.__pixtudioClipboardMode = "image"
        window.__pixtudioClipboardReadCount = 0

        Object.defineProperty(navigator, "userAgentData", {
            configurable: true,
            value: {
                brands: [
                    { brand: "Chromium", version: "155" },
                    { brand: "Google Chrome", version: "155" },
                ],
            },
        })

        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: {
                read: async () => {
                    window.__pixtudioClipboardReadCount =
                        (window.__pixtudioClipboardReadCount ?? 0) + 1
                    if (window.__pixtudioClipboardMode === "fail") {
                        throw new Error("clipboard read failed")
                    }
                    if (window.__pixtudioClipboardMode === "unsupported") {
                        return [
                            {
                                types: ["text/plain"],
                                getType: async () =>
                                    new Blob(["not an image"], {
                                        type: "text/plain",
                                    }),
                            },
                        ]
                    }

                    return [
                        {
                            types: ["image/png"],
                            getType: async () => {
                                const canvas = document.createElement("canvas")
                                canvas.width = 4
                                canvas.height = 4
                                const context = canvas.getContext("2d")
                                if (!context) {
                                    throw new Error("canvas unavailable")
                                }
                                const colors = [
                                    "#001219",
                                    "#0A9396",
                                    "#94D2BD",
                                    "#E9D8A6",
                                ]
                                for (let y = 0; y < 4; y += 1) {
                                    for (let x = 0; x < 4; x += 1) {
                                        context.fillStyle =
                                            colors[(x + y) % colors.length] ??
                                            "#001219"
                                        context.fillRect(x, y, 1, 1)
                                    }
                                }

                                const blob = await new Promise<Blob>(
                                    (resolve, reject) => {
                                        canvas.toBlob((nextBlob) => {
                                            if (!nextBlob) {
                                                reject(
                                                    new Error(
                                                        "png encode failed"
                                                    )
                                                )
                                                return
                                            }
                                            resolve(nextBlob)
                                        }, "image/png")
                                    }
                                )
                                return blob
                            },
                        },
                    ]
                },
            },
        })
    })
}

async function expectClipboardPromptVisible(page: Page) {
    await expect(
        page.getByText("LOAD PALETTE FROM CLIPBOARD?")
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "No" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Yes" })).toBeVisible()
}
