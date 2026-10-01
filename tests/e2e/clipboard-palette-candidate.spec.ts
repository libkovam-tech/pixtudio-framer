import { expect, test, type Page } from "@playwright/test"
import {
    bearProjectPath,
    collectBrowserErrors,
    installStableVisualEnvironment,
    openBearProject,
    settle,
} from "./helpers"

declare global {
    interface Window {
        __pixtudioClipboardMode?: "image" | "unsupported" | "fail"
        __pixtudioClipboardReadDelayMs?: number
        __pixtudioClipboardReadCount?: number
        __pixtudioClipboardImageVariant?: number
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

for (const decision of ["Yes", "No"] as const) {
    test(`clipboard ${decision} suppresses the same image across Presets and Method visits`, async ({ page }) => {
        const errors = collectBrowserErrors(page)
        await openBearProject(page)
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await expectClipboardPromptVisible(page)
        await page.getByRole("button", { name: decision, exact: true }).click()
        await expect(
            page.getByRole("button", { name: "Load Palette" })
        ).toBeVisible()

        await page.evaluate(() => {
            window.__pixtudioClipboardReadDelayMs = 800
        })
        for (let visit = 0; visit < 3; visit += 1) {
            await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
            await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
            await expectClipboardInspectionSuppressed(page)
        }

        if (decision === "No") {
            await page.getByRole("button", { name: /^SUNSET/ }).click()
        }
        await page.getByRole("button", { name: "METHOD", exact: true }).click()
        await page.getByRole("button", { name: "Cancel METHOD" }).click()
        await page.evaluate(() => window.dispatchEvent(new Event("focus")))
        await expectClipboardInspectionSuppressed(page)

        await page.evaluate(() => {
            window.__pixtudioClipboardImageVariant = 1
        })
        await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await expectClipboardPromptVisible(page)
        await page.getByRole("button", { name: "No", exact: true }).click()
        await page.evaluate(() => {
            window.__pixtudioClipboardImageVariant = 0
            window.dispatchEvent(new Event("focus"))
        })
        await expectClipboardInspectionSuppressed(page)

        await page.getByRole("button", { name: "Home", exact: true }).click()
        const chooserPromise = page.waitForEvent("filechooser")
        await page.getByRole("button", { name: "Open File", exact: true }).click()
        await (await chooserPromise).setFiles(bearProjectPath)
        await expect(
            page.getByRole("button", { name: "Export", exact: true })
        ).toBeVisible()
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await expectClipboardInspectionSuppressed(page)
        expect(errors.flush()).toEqual([])
    })

    test(`clipboard ${decision} survives an Android tab hidden-visible cycle`, async ({ page }) => {
        const errors = collectBrowserErrors(page)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, "userAgent", {
                configurable: true,
                value: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36",
            })
        })
        await openBearProject(page)
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await expectClipboardPromptVisible(page)
        await page.getByRole("button", { name: decision, exact: true }).click()
        await expect(
            page.getByRole("button", { name: "Load Palette" })
        ).toBeVisible()
        await page.evaluate(() => {
            window.__pixtudioClipboardReadDelayMs = 800
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "hidden",
            })
            document.dispatchEvent(new Event("visibilitychange"))
            Object.defineProperty(document, "visibilityState", {
                configurable: true,
                value: "visible",
            })
            document.dispatchEvent(new Event("visibilitychange"))
        })
        await expectClipboardInspectionSuppressed(page)
        expect(errors.flush()).toEqual([])
    })
}

test("clipboard activity spinner covers the Presets area while checking", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.evaluate(() => {
        window.__pixtudioClipboardReadDelayMs = 800
    })
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()

    await expect(
        page.getByRole("status", { name: "Loading clipboard palette" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Load Palette" })).toHaveCount(
        0
    )
    await expectClipboardPromptVisible(page)
    await expect(
        page.getByRole("status", { name: "Loading clipboard palette" })
    ).toHaveCount(0)

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

test("clipboard activity spinner covers the Presets area while Yes is reading", async ({
    page,
}) => {
    const errors = collectBrowserErrors(page)

    await openBearProject(page)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()

    await expectClipboardPromptVisible(page)
    await page.evaluate(() => {
        window.__pixtudioClipboardReadDelayMs = 800
    })
    await page.getByRole("button", { name: "Yes" }).click()

    await expect(
        page.getByRole("status", { name: "Loading clipboard palette" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Load Palette" })).toHaveCount(
        0
    )
    await expect(
        page.locator('button[title^="Clipboard image_"]')
    ).toBeVisible()
    await expect(
        page.getByRole("status", { name: "Loading clipboard palette" })
    ).toHaveCount(0)

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
        window.__pixtudioClipboardReadDelayMs = 0
        window.__pixtudioClipboardReadCount = 0
        window.__pixtudioClipboardImageVariant = 0

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
                    const delayMs = window.__pixtudioClipboardReadDelayMs ?? 0
                    if (delayMs > 0) {
                        await new Promise((resolve) => {
                            window.setTimeout(resolve, delayMs)
                        })
                    }
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
                                const variant = window.__pixtudioClipboardImageVariant ?? 0
                                for (let y = 0; y < 4; y += 1) {
                                    for (let x = 0; x < 4; x += 1) {
                                        context.fillStyle =
                                            colors[(x + y + variant) % colors.length] ??
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

async function expectClipboardInspectionSuppressed(page: Page) {
    const spinner = page.getByRole("status", { name: "Loading clipboard palette" })
    await expect(spinner).toBeVisible()
    await expect(spinner).toHaveCount(0)
    await expect(page.getByText("LOAD PALETTE FROM CLIPBOARD?")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Load Palette" })).toBeVisible()
}
