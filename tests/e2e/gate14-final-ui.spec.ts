import { expect, test } from "@playwright/test"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { batchTemplateFixture } from "../fixtures/batchTemplateFixture"
import { staticGifBytes } from "../fixtures/staticGifBytes"
import { controlledPng } from "../fixtures/staticRasterBytes"
import { parseStoredZip } from "../fixtures/parseStoredZip"
import { serializeBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate"
import { installStableVisualEnvironment } from "./helpers"

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await page.addInitScript(bytes => {
        // Existing download assertions exercise the browser fallback; the Save As path has its own test.
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined })
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => {
            if (Reflect.get(window, "gate14CancelNext")) {
                Reflect.set(window, "gate14CancelNext", false)
                throw new DOMException("Cancelled", "AbortError")
            }
            return {
                kind: "directory", name: "GATE14", async *values() {
                    for (const name of ["frame0.gif", "frame1.gif"]) yield { kind: "file", name,
                        async getFile() { return new File([Uint8Array.from(bytes)], name, { type: "image/gif" }) } }
                },
            }
        } })
    }, [...staticGifBytes])
    await page.goto("/plugins/batch-pixelation/")
})

test("Gate 14 Entry logo opens the PIXTUDIO Plugins directory", async ({ page }) => {
    const pluginsUrl = new URL("/plugins/", page.url()).href
    const logo = page.getByRole("link", { name: "PIXTUDIO Plugins" })
    await expect(logo).toBeVisible()
    await logo.click()
    await expect(page).toHaveURL(pluginsUrl)
})

test("Gate 14 Entry uses the Owner assets and a decoded, pixelated video frame", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "BATCH PIXELATION PLUGIN" })).toBeVisible()
    await expect(page.locator(".batch-entry-copy li")).toHaveCount(4)
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeEnabled()
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeEnabled()
    await expect(page.locator(".batch-entry-brand img")).toHaveAttribute("src", "/plugins/batch-pixelation/Logotype_PLUGINS.svg")
    await expect(page.locator(".batch-entry-reference img")).toHaveAttribute("src", "/plugins/batch-pixelation/RefIcon.svg")
    await expect(page.locator(".batch-entry-recipe img")).toHaveAttribute("src", "/plugins/batch-pixelation/RecipeIcon.svg")
    for (const asset of ["MailTo_PLUGINS.svg", "Share_PLUGINS.svg", "Insta_PLUGINS.svg"]) {
        await expect(page.locator(`.batch-entry-footer nav img[src$="${asset}"]`)).toBeVisible()
    }
    await expect(page.locator(".batch-entry-copyright")).toHaveCSS("font-size", "12px")
    await expect(page.locator(".batch-entry-copyright")).toHaveCSS("font-weight", "400")
    await expect(page.locator(".batch-entry-copyright")).toHaveCSS("letter-spacing", "0.2px")
    await expect(page.locator(".batch-entry-copyright")).toHaveCSS("color", "rgba(0, 18, 25, 0.85)")
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1, user-scalable=no/)
    await expect(page.locator("html")).toHaveClass(/pixtudio-editor-viewport-lock/)
    expect(await page.evaluate(() => window.dispatchEvent(new WheelEvent("wheel", {
        ctrlKey: true, cancelable: true,
    })))).toBe(false)
    const canvas = page.locator(".batch-intro-video canvas")
    await expect(canvas).toHaveClass(/batch-intro-canvas-ready/)
    const pixels = await canvas.evaluate(element => {
        const c = element as HTMLCanvasElement
        const context = c.getContext("2d")!
        const data = context.getImageData(0, 0, c.width, c.height).data
        const colors = new Set<number>()
        for (let i = 0; i < data.length; i += 400) colors.add(data[i] * 65536 + data[i + 1] * 256 + data[i + 2])
        return { width: c.width, height: c.height, opaque: data[3] === 255, colors: colors.size,
            smoothing: context.imageSmoothingEnabled }
    })
    expect(pixels).toMatchObject({ width: 720, height: 1280, opaque: true, smoothing: false })
    expect(pixels.colors).toBeGreaterThan(16)
    await page.screenshot({ path: test.info().outputPath("entry.png"), fullPage: true })
})

test("Gate 14 Entry requests muted playback before the first decoded frame", async ({ page }) => {
    await page.route("**/plugins/batch-pixelation/entry.mp4", route => route.abort())
    await page.addInitScript(() => {
        const originalPlay = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function () {
            if (this instanceof HTMLVideoElement && this.src.endsWith("/plugins/batch-pixelation/entry.mp4")) {
                document.documentElement.dataset.introPlayReadyState = String(this.readyState)
                document.documentElement.dataset.introPlayMuted = String(this.muted)
                return Promise.resolve()
            }
            return originalPlay.call(this)
        }
    })
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("data-intro-play-ready-state", "0")
    await expect(page.locator("html")).toHaveAttribute("data-intro-play-muted", "true")
})

test("Gate 14 Entry keeps the video in the visible frame at iPad landscape size", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    const frame = page.locator(".batch-intro-video")
    const video = frame.locator("video")
    await expect(frame).toBeVisible()
    await expect(video).toBeVisible()
    const frameBounds = await frame.boundingBox()
    const videoBounds = await video.boundingBox()
    expect(frameBounds).not.toBeNull()
    expect(videoBounds).not.toBeNull()
    expect(videoBounds!.width).toBeCloseTo(frameBounds!.width, 0)
    expect(videoBounds!.height).toBeCloseTo(frameBounds!.height, 0)
})

test("Gate 14 desktop Entry actions keep equal distance from the center column", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Desktop three-column layout")
    await expect(page.locator(".batch-entry-layout")).toBeVisible()
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 },
        { width: 2048, height: 1080 }]) {
        await page.setViewportSize(viewport)
        const gaps = await page.evaluate(() => {
            const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
            const reference = rect(".batch-entry-reference")
            const center = rect(".batch-intro-video")
            const recipe = rect(".batch-entry-recipe")
            return { left: center.left - reference.right, right: recipe.left - center.right }
        })
        expect(gaps.left).toBeGreaterThan(0)
        expect(Math.abs(gaps.left - gaps.right)).toBeLessThan(2)
        await page.screenshot({ path: testInfo.outputPath(`entry-spacing-${viewport.width}.png`) })
    }
})

test("Gate 14 desktop email opens the same Gmail compose flow as the editor", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop Gmail compose flow")
    await page.evaluate(() => {
        (window as Window & { __emailOpen?: string[] }).__emailOpen = []
        window.open = (...args) => {
            (window as Window & { __emailOpen?: string[] }).__emailOpen?.push(...args.map(String))
            return null
        }
    })
    await page.getByRole("button", { name: "Email PIXTUDIO" }).click()
    expect(await page.evaluate(() => (window as Window & { __emailOpen?: string[] }).__emailOpen)).toEqual([
        "https://mail.google.com/mail/?view=cm&fs=1&to=support%40pixtudio.app&su=PIXTUDIO%20Batch%20Pixelation",
        "_blank",
        "noopener,noreferrer",
    ])
})

test("Gate 14 share failure uses the PIXTUDIO alert and leaves the entry usable", async ({ page }) => {
    await page.evaluate(() => {
        Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText: async () => { throw new Error("Test clipboard failure") } },
        })
    })
    await page.getByRole("button", { name: "Share Batch Pixelation" }).click()
    const alert = page.getByRole("alertdialog", { name: "SHARE ERROR" })
    await expect(alert).toBeVisible()
    await expect(alert).toHaveAttribute("aria-description", "Could not share link")
    await expect(alert.getByRole("button", { name: "OK" })).toBeVisible()
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeEnabled()
})

test("Gate 14 accepts a raster reference without secure-context randomUUID", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined })
    })
    await page.reload()
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined")
    await page.evaluate(() => {
        const state = window as Window & { __batchIntakeFlashed?: boolean }
        new MutationObserver(() => {
            if (document.querySelector(".batch-reference-intake")) state.__batchIntakeFlashed = true
        }).observe(document.body, { childList: true, subtree: true })
    })
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await expect(page.locator(".batch-reference-stage")).toBeVisible()
    await expect(page.locator(".batch-reference-intake")).toHaveCount(0)
    await expect(page.getByText("The image could not be read.")).toHaveCount(0)
    expect(await page.evaluate(() => (window as Window & { __batchIntakeFlashed?: boolean }).__batchIntakeFlashed)).not.toBe(true)
})

test("Reference canvas stays centered in a narrow landscape viewport for both image orientations", async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 412 })

    for (const [width, height] of [[360, 640], [640, 360]]) {
        const dataUrl = await page.evaluate(([w, h]) => {
            const canvas = document.createElement("canvas")
            canvas.width = w
            canvas.height = h
            canvas.getContext("2d")!.fillRect(0, 0, w, h)
            return canvas.toDataURL("image/png")
        }, [width, height])
        await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
            name: `reference-${width}x${height}.png`,
            mimeType: "image/png",
            buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
        })

        const canvas = page.locator(".batch-reference-stage canvas").first()
        await expect(canvas).toBeVisible()
        await expect.poll(() => canvas.evaluate(element => {
            const viewport = element.parentElement?.parentElement?.parentElement
            if (!viewport) throw new Error("Editor canvas viewport is missing")
            const rect = viewport.getBoundingClientRect()
            return Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2)
        })).toBeLessThan(2)

        if (width !== 640) await page.reload()
    }
})

test("Gate 14 reference uses a general file chooser while validating the selected file", async ({ page }) => {
    const referenceInput = page.locator('input[aria-label="Reference Frame file"]')
    await expect(referenceInput).not.toHaveAttribute("accept")
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await chooser).setFiles({ name: "unsupported.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") })
    await expect(page.getByRole("alertdialog", { name: "IMPORT ERROR" }))
        .toContainText("This image format is not supported by Batch.")
})

test("Gate 14 shows one Batch alert for unsupported reference formats", async ({ page }) => {
    const input = page.locator('input[aria-label="Reference Frame file"]')
    const cases = [
        { name: "photo.webp", mimeType: "image/webp", buffer: Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]) },
        { name: "table.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("spreadsheet") },
        { name: "document.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") },
        { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") },
    ]
    for (const file of cases) {
        await input.setInputFiles(file)
        const alert = page.getByRole("alertdialog", { name: "IMPORT ERROR" })
        await expect(alert).toContainText("This image format is not supported by Batch.")
        await alert.getByRole("button", { name: "OK" }).click()
        await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
    }
})

test("Gate 14 returns to visible Entry after an oversized reference is dismissed", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(32 * 1024 * 1024 + 1),
    })
    const alert = page.getByRole("alertdialog", { name: "IMPORT ERROR" })
    await expect(alert).toContainText("This image is too large to open safely.")
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
    await expect(page.locator(".batch-entry-brand")).toBeVisible()
    await expect(page.locator(".batch-entry-feature")).toBeVisible()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeVisible()
    await expect(page.locator(".batch-entry-brand")).toBeInViewport()
    await expect(page.locator(".batch-entry-feature")).toBeInViewport()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeInViewport()
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeInViewport()
})

test("Gate 14 returns to Entry when decoded reference dimensions exceed the limit", async ({ page }) => {
    await page.evaluate(() => {
        const decode = window.createImageBitmap.bind(window)
        window.createImageBitmap = ((source: ImageBitmapSource, ...args: unknown[]) => {
            if (source instanceof File && source.name === "oversized-dimensions.png") {
                return Promise.resolve({ width: 15_583, height: 19_472, close() {} } as ImageBitmap)
            }
            return Reflect.apply(decode, window, [source, ...args])
        }) as typeof createImageBitmap
    })
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "oversized-dimensions.png", mimeType: "image/png", buffer: Buffer.from(controlledPng(false)),
    })
    const alert = page.getByRole("alertdialog", { name: "IMPORT ERROR" })
    await expect(alert).toContainText("This image is too large to open safely.")
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeInViewport()
    await expect(page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" })).toBeInViewport()
    await expect(page.locator(".batch-reference-stage")).toHaveCount(0)
})

test("Batch authoring edits and removes imported presets without enabling auto swatch edits", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Add swatch" })).toHaveCount(0)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await expect(page.getByRole("button", { name: "Add swatch" })).toBeVisible()
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Load Palette", exact: true }).click()
    await (await picker).setFiles({
        name: "palette.png", mimeType: "image/png", buffer: Buffer.from(controlledPng(false)),
    })
    const deletePreset = page.locator('[aria-label="Delete palette preset"]')
    await expect(deletePreset).toBeVisible()
    await page.getByRole("button", { name: "Add swatch" }).click()
    await page.getByLabel("HEX input").fill("#1A2B3C")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.locator('button[title="#1A2B3C"]')).toBeVisible()
    await page.locator('button[title="#1A2B3C"]').dispatchEvent("contextmenu")
    await page.getByLabel("HEX input").fill("#2B3C4D")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.locator('button[title="#2B3C4D"]')).toBeVisible()

    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    const downloadStarted = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const templateBytes = await readFile((await (await downloadStarted).path())!)
    const template = JSON.parse(templateBytes.toString("utf8"))
    expect(template.sealed.recipe.palette.matchingColors).toContain("#1A2B3C")
    expect(template.sealed.recipe.palette.outputs.some((output: { rgba: number[] }) =>
        output.rgba.join(",") === "43,60,77,255")).toBe(true)

    await deletePreset.click()
    await expect(deletePreset).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Add swatch" })).toHaveCount(0)

    await page.reload()
    const recipePicker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click()
    await (await recipePicker).setFiles({
        name: "edited.pixtudio-batch", mimeType: "application/json", buffer: templateBytes,
    })
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("source")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
})

test("Batch authoring edits a built-in preset into a copy without opening Auto swatch edits", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Add swatch" })).toHaveCount(0)

    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    const original = page.locator('button[title="GRAY"]')
    await original.click()
    await expect(page.getByRole("button", { name: "Add swatch" })).toBeVisible()
    const firstSwatch = page.locator('button[title^="#"]').first()
    const originalColor = await firstSwatch.getAttribute("title")
    await firstSwatch.dispatchEvent("contextmenu")
    await expect(page.getByLabel("Transparent")).toHaveCount(0)
    const transparentSpacer = page.locator('label[aria-hidden="true"]').filter({ hasText: "TRANSPARENT" })
    expect(await transparentSpacer.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(0)
    await page.getByLabel("HEX input").fill("#1A2B3C")
    await page.getByRole("button", { name: "OK", exact: true }).click()

    await expect(page.getByRole("button", { name: /^GRAY Custom\b/ })).toBeVisible()
    await expect(original).toBeVisible()
    await expect(page.locator('button[title="#1A2B3C"]')).toBeVisible()
    const downloadStarted = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const template = JSON.parse((await readFile((await (await downloadStarted).path())!)).toString("utf8"))
    expect(template.sealed.recipe.palette.source).toBe("imported")
    expect(template.sealed.recipe.palette.matchingColors).toContain(originalColor)
    expect(template.sealed.recipe.palette.outputs.some((output: { rgba: number[] }) =>
        output.rgba.join(",") === "26,43,60,255")).toBe(true)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    await expect(page.getByRole("button", { name: "Add swatch" })).toHaveCount(0)
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await original.click()
    await expect(page.locator('button[title="#1A2B3C"]')).toHaveCount(0)
})

test("Batch authoring can remove an imported swatch and still seal the recipe", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Load Palette", exact: true }).click()
    await (await picker).setFiles({
        name: "palette.png", mimeType: "image/png", buffer: Buffer.from(controlledPng(false)),
    })
    await page.getByRole("button", { name: "Add swatch" }).click()
    await page.getByLabel("HEX input").fill("#1A2B3C")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.locator('button[title="#1A2B3C"]').dispatchEvent("contextmenu")
    await page.getByLabel("Delete swatch").check()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.locator('button[title="#1A2B3C"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
})


test("Gate 14 rejects a damaged reference through the editor alert and returns to Entry", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "broken.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    })
    await expect(page.locator(".batch-reference-loading")).toHaveCount(0)
    await expect(page.locator(".batch-reference-intake")).toHaveCount(0)
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
    const alert = page.getByRole("alertdialog", { name: "IMPORT ERROR" })
    await expect(alert).toContainText("The image container is invalid.")
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeEnabled()
})

test("Gate 14 rejects an unsupported reference without exposing the intake screen", async ({ page }) => {
    await page.evaluate(() => {
        const state = window as Window & { __batchIntakeFlashed?: boolean }
        new MutationObserver(() => {
            if (document.querySelector(".batch-reference-intake")) state.__batchIntakeFlashed = true
        }).observe(document.body, { childList: true, subtree: true })
    })
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "project.pixtudio", mimeType: "application/json", buffer: Buffer.from("{}"),
    })
    await expect(page.getByRole("alertdialog", { name: "IMPORT ERROR" }))
        .toContainText("This image format is not supported by Batch.")
    await expect(page.locator(".batch-reference-intake")).toHaveCount(0)
    expect(await page.evaluate(() => (window as Window & { __batchIntakeFlashed?: boolean }).__batchIntakeFlashed)).not.toBe(true)
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
})

test("Gate 14 opens a static GIF when direct GIF bitmap decoding fails", async ({ page }) => {
    await page.addInitScript(() => {
        const decode = window.createImageBitmap.bind(window)
        window.createImageBitmap = ((source: ImageBitmapSource, ...args: unknown[]) => {
            if (source instanceof Blob && source.type === "image/gif") {
                return Promise.reject(new DOMException("GIF Blob decoder unavailable", "InvalidStateError"))
            }
            return Reflect.apply(decode, window, [source, ...args])
        }) as typeof createImageBitmap
    })
    await page.reload()
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await expect(page.locator(".batch-reference-stage")).toBeVisible()
    await expect(page.getByText("IMPORT ERROR")).toHaveCount(0)
    await expect(page.getByText("9:16")).toBeVisible()
})

test("Gate 14 crop cancellation returns to the plugin Entry", async ({ page }, testInfo) => {
    const chooseReference = async () => {
        await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
        await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled()
    }
    const expectEntry = async () => {
        await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
        await expect(page.locator(".batch-entry-brand")).toBeVisible()
        await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeVisible()
        await expect(page.locator(".batch-reference-stage")).toHaveCount(0)
    }

    await chooseReference()
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expectEntry()

    if (testInfo.project.name === "desktop") {
        await chooseReference()
        await page.keyboard.press("Escape")
        await expectEntry()
    }
})

test("Gate 14 Manual belongs to Batch Pixelation and navigates its sections", async ({ page }, testInfo) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Manual button" }).click()

    await expect(page.getByRole("heading", { name: "Batch Pixelation — User Guide" })).toBeVisible()
    await expect(page.locator('[data-manual-id="about"]')).toContainText("Batch processing requires selecting source frames.")
    await expect(page.getByText("PIXTUDIO — User Guide")).toHaveCount(0)
    await expect(page.locator('[data-manual-id="prepare"]')).toBeAttached()
    await expect(page.locator('[data-manual-id="assemble"]')).toBeAttached()
    const contents = page.getByRole("navigation", { name: "Manual contents" })
    await expect(contents.getByRole("link", { name: "Prepare Frames" })).toBeVisible()
    await expect(contents.locator("svg")).toHaveCount(0)
    await expect(page.locator('[data-manual-id="reference"]')).toContainText("Fullscreen Preview")
    if (testInfo.project.name === "desktop") {
        const layout = await page.evaluate(() => {
            const heading = document.querySelector("h1")!.getBoundingClientRect()
            const nav = document.querySelector('nav[aria-label="Manual contents"]')!.getBoundingClientRect()
            const article = document.querySelector('[data-manual-id="about"]')!.getBoundingClientRect()
            const back = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Back")!.getBoundingClientRect()
            return { viewportWidth: innerWidth, heading, nav, article, back }
        })
        const left = layout.viewportWidth / 4
        const right = layout.viewportWidth * 3 / 4
        expect(layout.heading.left).toBeCloseTo(left, 0)
        expect(layout.nav.left).toBeCloseTo(left, 0)
        expect(layout.nav.right).toBeLessThanOrEqual(right + 1)
        expect(layout.article.right).toBeLessThanOrEqual(right + 1)
        expect(layout.back.right).toBeLessThan(left)
        await page.screenshot({ path: testInfo.outputPath("batch-manual-desktop.png") })
    }
    for (const width of testInfo.project.name === "mobile" ? [412, 360, 320] : [1440, 900, 700]) {
        await page.setViewportSize({ width, height: 915 })
        const links = contents.getByRole("link")
        await expect(links).toHaveCount(6)
        const bounds = await links.evaluateAll(nodes => nodes.map(node => {
            const rect = node.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top,
                lines: node.querySelectorAll("span").length,
                contentFits: node.scrollWidth <= node.clientWidth }
        }))
        expect(bounds.every(box => box.lines === 2 && box.contentFits && box.left >= 0 && box.right <= width)).toBe(true)
        expect(bounds.every(box => Math.abs(box.top - bounds[0].top) < 1)).toBe(true)
    }
    if (testInfo.project.name === "mobile") {
        await page.screenshot({ path: testInfo.outputPath("batch-manual-mobile.png") })
    }
    for (const viewport of [{ width: 900, height: 600 }, { width: 700, height: 400 }]) {
        await page.setViewportSize(viewport)
        await expect(contents).toBeVisible()
        await expect(page.getByRole("complementary")).toHaveCount(0)
        const layout = await page.evaluate(() => {
            const heading = document.querySelector("h1")!.getBoundingClientRect()
            const article = document.querySelector('[data-manual-id="about"]')!.getBoundingClientRect()
            const back = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Back")!.getBoundingClientRect()
            return { heading, article, back, width: innerWidth }
        })
        expect(layout.back.right).toBeLessThan(layout.heading.left)
        expect(layout.article.left).toBeCloseTo(layout.heading.left, 0)
        expect(layout.article.right).toBeLessThanOrEqual(layout.width)
        if (viewport.width === 900 && testInfo.project.name === "desktop") {
            await page.screenshot({ path: testInfo.outputPath("batch-manual-landscape.png") })
        }
    }
    await page.setViewportSize(testInfo.project.name === "mobile"
        ? { width: 412, height: 915 }
        : { width: 1440, height: 1100 })
    await expect(contents).toBeVisible()
    await contents.getByRole("link", { name: "GIF & Video" }).click()
    await expect(page.locator('[data-manual-id="assemble"]')).toBeInViewport()
    for (const href of ["https://ezgif.com/", "https://ezgif.com/maker", "https://ezgif.com/images-to-video"]) {
        const link = page.locator(`[data-manual-id="assemble"] a[href="${href}"]`)
        await expect(link).toBeVisible()
        await expect(link).toHaveCSS("text-decoration-line", "underline")
        await expect(link).toHaveAttribute("target", "_blank")
    }
    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(page.getByRole("button", { name: "Manual button" })).toBeVisible()
})

test("Gate 14 Entry fits the visible desktop and mobile viewport", async ({ page }, testInfo) => {
    const viewports = testInfo.project.name === "mobile"
        ? [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 360, height: 640 }, { width: 390, height: 560 }, { width: 360, height: 500 }, { width: 700, height: 400 }]
        : [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 1920, height: 1080 }, { width: 1440, height: 440 }, { width: 1280, height: 400 }, { width: 600, height: 360 }]
    for (const viewport of viewports) {
        await page.setViewportSize(viewport)
        await expect(page.locator(".batch-entry-footer")).toBeVisible()
        const layout = await page.evaluate(() => {
            const bounds = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
            const video = bounds(".batch-intro-video")
            const insideVideo = (selector: string) => {
                const rect = bounds(selector)
                return rect.left >= video.left && rect.top >= video.top && rect.right <= video.right && rect.bottom <= video.bottom
            }
            const visible = (selector: string) => {
                const rect = bounds(selector)
                return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
            }
            const actionContentInside = (selector: string) => {
                const button = bounds(selector)
                return ["img", ".batch-entry-action-label", ".batch-entry-action-label span"].every(child => {
                    const rect = bounds(`${selector} ${child}`)
                    return rect.left >= button.left && rect.top >= button.top && rect.right <= button.right && rect.bottom <= button.bottom
                })
            }
            const actionLabelFits = (selector: string) => {
                const lines = [...document.querySelectorAll<HTMLElement>(`${selector} .batch-entry-action-label span`)]
                return lines.length === 2 && lines.every(line => line.scrollWidth <= line.clientWidth + 1)
            }
            const iconSize = (selector: string) => bounds(`${selector} img`).width / bounds(selector).width
            const brand = bounds(".batch-entry-brand")
            const copy = bounds(".batch-entry-copy")
            const footer = bounds(".batch-entry-footer")
            const heading = document.querySelector<HTMLElement>(".batch-entry-copy h1")!
            const steps = document.querySelector<HTMLElement>(".batch-entry-copy ol")!
            const headingText = document.createRange()
            headingText.selectNodeContents(heading)
            return {
                scrollHeight: document.documentElement.scrollHeight,
                viewportHeight: innerHeight,
                relativeSideSize: bounds(".batch-entry-reference").width / video.width,
                landscapeOrder: bounds(".batch-entry-reference").right <= video.left && video.right <= bounds(".batch-entry-recipe").left,
                cornerRadiusRatio: parseFloat(getComputedStyle(document.querySelector(".batch-intro-video")!).borderTopLeftRadius) / video.width,
                brandBeforeVideo: bounds(".batch-entry-brand").bottom <= video.top,
                videoBeforeFooter: video.bottom <= bounds(".batch-entry-footer").top,
                referenceBeforeFooter: bounds(".batch-entry-reference").bottom <= bounds(".batch-entry-footer").top,
                recipeBeforeFooter: bounds(".batch-entry-recipe").bottom <= bounds(".batch-entry-footer").top,
                footerItemsSeparated: bounds(".batch-entry-copyright").right <= bounds(".batch-entry-footer nav").left,
                referenceSquare: Math.abs(bounds(".batch-entry-reference").width - bounds(".batch-entry-reference").height) < 1,
                recipeSquare: Math.abs(bounds(".batch-entry-recipe").width - bounds(".batch-entry-recipe").height) < 1,
                referenceContentInside: actionContentInside(".batch-entry-reference"),
                recipeContentInside: actionContentInside(".batch-entry-recipe"),
                referenceLabelFits: actionLabelFits(".batch-entry-reference"),
                recipeLabelFits: actionLabelFits(".batch-entry-recipe"),
                referenceIconSize: iconSize(".batch-entry-reference"),
                recipeIconSize: iconSize(".batch-entry-recipe"),
                video: visible(".batch-intro-video"),
                videoHidden: getComputedStyle(document.querySelector(".batch-intro-video")!).display === "none",
                reference: visible(".batch-entry-reference"),
                recipe: visible(".batch-entry-recipe"),
                footer: visible(".batch-entry-footer"),
                copy: visible(".batch-entry-copy"),
                brandBeforeCopy: bounds(".batch-entry-brand").bottom <= bounds(".batch-entry-copy").top,
                copyBeforeReference: bounds(".batch-entry-copy").bottom <= bounds(".batch-entry-reference").top,
                referenceBeforeRecipe: bounds(".batch-entry-reference").bottom <= bounds(".batch-entry-recipe").top,
                copyColor: getComputedStyle(document.querySelector(".batch-entry-copy")!).color,
                sharedMobileColumn: Math.abs(copy.width - footer.width) < 1 &&
                    Math.abs(brand.left + brand.width / 2 - copy.left - copy.width / 2) < 1,
                headingFitsColumn: heading.scrollWidth <= heading.clientWidth + 1,
                headingFillRatio: headingText.getBoundingClientRect().width / heading.clientWidth,
                stepFontWeight: getComputedStyle(steps).fontWeight,
                buttonSmallerThanColumn: bounds(".batch-entry-reference").width < copy.width / 2,
                buttonGap: bounds(".batch-entry-recipe").top - bounds(".batch-entry-reference").bottom,
                recipeIconAboveLabel: bounds(".batch-entry-recipe img").bottom <= bounds(".batch-entry-recipe .batch-entry-action-label").top,
                copyInsideVideo: insideVideo(".batch-entry-copy"),
                headingInsideVideo: insideVideo(".batch-entry-copy h1"),
                stepsInsideVideo: [...document.querySelectorAll(".batch-entry-copy li")].every(element => {
                    const rect = element.getBoundingClientRect()
                    return rect.left >= video.left && rect.top >= video.top && rect.right <= video.right && rect.bottom <= video.bottom
                }),
            }
        })
        expect(layout.scrollHeight, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportHeight + 1)
        expect(layout, `${viewport.width}x${viewport.height}`).toMatchObject({
            reference: true, recipe: true, referenceSquare: true, recipeSquare: true,
            referenceBeforeFooter: true,
            recipeBeforeFooter: true, footerItemsSeparated: true,
            referenceContentInside: true, recipeContentInside: true,
            referenceLabelFits: true, recipeLabelFits: true, footer: true,
        })
        expect(layout.referenceIconSize, `${viewport.width}x${viewport.height}`).toBeGreaterThan(0.4)
        expect(layout.recipeIconSize, `${viewport.width}x${viewport.height}`).toBeGreaterThan(0.4)
        if (viewport.width <= 760 && viewport.height > viewport.width) {
            expect(layout, `${viewport.width}x${viewport.height}`).toMatchObject({
                videoHidden: true, copy: true, brandBeforeCopy: true, copyBeforeReference: true,
                referenceBeforeRecipe: true, copyColor: "rgb(3, 24, 32)",
                sharedMobileColumn: true, headingFitsColumn: true, stepFontWeight: "400",
                buttonSmallerThanColumn: true, recipeIconAboveLabel: true,
            })
            expect(layout.headingFillRatio, `${viewport.width}x${viewport.height}`).toBeGreaterThan(0.97)
            expect(layout.headingFillRatio, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1.005)
            expect(layout.buttonGap, `${viewport.width}x${viewport.height}`).toBeGreaterThanOrEqual(Math.min(viewport.height * .02, 16) - 1)
            if (viewport.width === 390 && viewport.height === 844) {
                await page.screenshot({ path: testInfo.outputPath("entry-mobile-design.png") })
            }
        } else {
            expect(layout, `${viewport.width}x${viewport.height}`).toMatchObject({
                video: true, brandBeforeVideo: true, videoBeforeFooter: true,
                copyInsideVideo: true, headingInsideVideo: true, stepsInsideVideo: true,
            })
            expect(layout.cornerRadiusRatio, `${viewport.width}x${viewport.height}`).toBeLessThan(0.07)
        }
        if (viewport.width > viewport.height) {
            expect(layout.landscapeOrder, `${viewport.width}x${viewport.height}`).toBe(true)
        }
        if (testInfo.project.name !== "mobile") {
            expect(layout.relativeSideSize, `${viewport.width}x${viewport.height}`).toBeGreaterThan(0.38)
            expect(layout.relativeSideSize, `${viewport.width}x${viewport.height}`).toBeLessThan(0.51)
        }
    }
    await page.screenshot({ path: testInfo.outputPath("entry-fit-viewport.png") })
})

test("Gate 14 mobile heading fits the actual font metrics", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addStyleTag({ content: ".batch-entry-copy h1 { font-family: 'Courier New', monospace !important; }" })
    await page.setViewportSize({ width: 391, height: 844 })
    await expect.poll(() => page.locator(".batch-entry-copy h1").evaluate(title => {
        const range = document.createRange()
        range.selectNodeContents(title)
        return range.getBoundingClientRect().width / title.clientWidth
    })).toBeGreaterThan(0.99)
    const ratio = await page.locator(".batch-entry-copy h1").evaluate(title => {
        const range = document.createRange()
        range.selectNodeContents(title)
        return range.getBoundingClientRect().width / title.clientWidth
    })
    expect(ratio).toBeLessThanOrEqual(1.005)
})

test("Gate 14 opening a saved Recipe does not add page scroll", async ({ page }) => {
    const chooserPromise = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click()
    const chooser = await chooserPromise
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("opening")
    await expect(page.getByText("Opening Recipe...")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "START OVER" })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        await page.evaluate(() => innerHeight + 1),
    )
    await chooser.setFiles([])
})

test("Gate 14 plugin buttons lift on hover without styling rented controls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Hover requires a pointing device")
    const lift = async (button: ReturnType<typeof page.getByRole>) => {
        await button.hover()
        await expect.poll(() => button.evaluate(element => {
            const style = getComputedStyle(element)
            const matrix = new DOMMatrixReadOnly(style.transform)
            return {
                scale: Math.round(matrix.a * 100) / 100,
                rise: Math.round(matrix.m42),
                shadow: style.boxShadow !== "none",
            }
        })).toEqual({ scale: 1.03, rise: -2, shadow: true })
    }

    await lift(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }))
    for (const name of ["Email PIXTUDIO", "Share Batch Pixelation", "PIXTUDIO Instagram"]) {
        await lift(page.getByRole(name === "PIXTUDIO Instagram" ? "link" : "button", { name }))
    }
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await lift(page.getByRole("button", { name: "Save Batch Recipe" }))
    await lift(page.getByRole("button", { name: "Choose Source Frames" }))
    await page.screenshot({ path: testInfo.outputPath("plugin-button-hover.png") })
    const home = page.getByRole("button", { name: "Home" })
    await home.hover()
    await expect(home).toHaveCSS("box-shadow", "none")

    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await lift(page.getByRole("button", { name: "Choose Source Folder" }))
})

test("Cancel closes the source overlay and restores the same editable reference", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    const editor = page.locator(".batch-reference-stage")
    const canvas = editor.locator("canvas").first()
    await expect(canvas).toBeVisible()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("source")
    const frozenReference = await page.getByTestId("gate5-sealed-reference").textContent()
    expect(frozenReference).not.toBe("")
    await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled()
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(editor).not.toHaveAttribute("inert")
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    await expect(page.getByTestId("gate5-sealed-reference")).toHaveText(frozenReference ?? "")
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    await download
})

test("Dismissing a replacement folder keeps authored frames ready and visible", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "frame0.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByText("Ready to process", { exact: false })).toBeVisible()
    await page.evaluate(() => Reflect.set(window, "gate14CancelNext", true))
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByText("Folder selection was cancelled. Source Set unchanged.")).toBeVisible()
    await expect(page.getByText("Ready to process", { exact: false })).toBeVisible()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
})

test("Batch Smart Object omits the unavailable reference export action", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Export", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toBeEnabled()
})

test("Unavailable folder picker uses the PIXTUDIO alert on the plugin source screen", async ({ page }) => {
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.evaluate(() => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined })
        Object.defineProperty(HTMLInputElement.prototype, "webkitdirectory", { configurable: true, value: undefined })
    })
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    const alert = page.getByRole("alertdialog", { name: "FOLDER SELECTION ERROR" })
    await expect(alert).toHaveAttribute("aria-description", "Folder selection is not supported in this browser.")
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toHaveCount(0)
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Cancel" })).toBeEnabled()
})

test("Folder input processes top-level frames when showDirectoryPicker is unavailable", async ({ page }, testInfo) => {
    const folder = testInfo.outputPath("FIREFOX_SOURCE")
    await mkdir(path.join(folder, "nested"), { recursive: true })
    const frame = await readFile("public/favicon-96x96.png")
    await writeFile(path.join(folder, "frame1.png"), frame)
    await writeFile(path.join(folder, "nested", "ignored.png"), frame)
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles("public/favicon-96x96.png")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.evaluate(() => Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true, value: undefined,
    }))
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await expect(page.getByRole("alertdialog", { name: "FOLDER SELECTION ERROR" })).toHaveCount(0)
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await (await picker).setFiles(folder)
    await expect(page.getByTestId("gate7-source-manifest")).not.toBeEmpty()
    const manifest = JSON.parse(await page.getByTestId("gate7-source-manifest").textContent() ?? "")
    expect(manifest.folderDisplayName).toBe("FIREFOX_SOURCE")
    expect(manifest.overallStatus).toBe("ready")
    expect(manifest.orderedCandidates.map((item: { filename: string }) => item.filename)).toEqual(["frame1.png"])
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
})

test("Cancel exits an imported recipe to the plugin start screen", async ({ page }) => {
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click()
    await (await picker).setFiles({ name: "recipe.pixtudio-batch", mimeType: "application/json",
        buffer: Buffer.from(serializeBatchTemplate(batchTemplateFixture())) })
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("source")
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeEnabled()
})

test("Batch recipe uses desktop Save As while Android keeps browser download", async ({ page }, testInfo) => {
    await page.evaluate(() => {
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: async (options: { suggestedName: string }) => {
            document.body.dataset.batchPickerCalled = "true"
            document.body.dataset.batchSaveName = options.suggestedName
            return { createWritable: async () => ({
                write: async (blob: Blob) => { document.body.dataset.batchSaveBytes = String(blob.size) },
                close: async () => {}, abort: async () => {},
            }) }
        } })
    })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    const save = page.getByRole("button", { name: "Save Batch Recipe" })
    await expect(save).toBeEnabled()
    if (testInfo.project.name === "mobile") {
        const download = page.waitForEvent("download")
        await save.click()
        await download
        await expect(page.locator("body")).not.toHaveAttribute("data-batch-picker-called", "true")
    } else {
        await save.click()
        await expect(page.locator("body")).toHaveAttribute("data-batch-save-name", "PIXTUDIO_Batch_Recipe.pixtudiobatch")
        expect(Number(await page.locator("body").getAttribute("data-batch-save-bytes"))).toBeGreaterThan(0)
    }
})

test("Desktop recipe save failure uses the PIXTUDIO alert and retains editing", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Desktop Save As path")
    await page.evaluate(() => {
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true,
            value: async () => { throw new DOMException("Test block", "NotAllowedError") } })
    })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()

    const save = page.getByRole("button", { name: "Save Batch Recipe" })
    await expect(save).toBeEnabled()
    const grid = page.locator('input[type="range"][max="128"]')
    const gridBefore = await grid.inputValue()
    await save.click()
    const alert = page.getByRole("alertdialog", { name: "SAVE ERROR" })
    await expect(alert).toHaveAttribute("aria-description", "Could not save Recipe")
    await expect(alert.getByRole("button", { name: "OK" })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("desktop-recipe-save-error.png") })
    await expect(page.locator(".batch-authoring-notice")).toHaveCount(0)
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(grid).toHaveValue(gridBefore)
    await expect(save).toBeEnabled()
})

test("Android recipe download failure keeps the editor and permits retry", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Android browser download path")
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()

    const save = page.getByRole("button", { name: "Save Batch Recipe" })
    await expect(save).toBeEnabled()
    const canvas = page.locator(".batch-reference-stage canvas").first()
    const imageBefore = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())
    const grid = page.locator('input[type="range"][max="128"]')
    const gridBefore = await grid.inputValue()
    await page.evaluate(() => {
        const originalClick = HTMLAnchorElement.prototype.click
        let failed = false
        HTMLAnchorElement.prototype.click = function () {
            if (this.download.endsWith(".pixtudiobatch") && !failed) {
                failed = true
                throw new Error("Simulated recipe download failure")
            }
            return originalClick.call(this)
        }
    })

    const downloads: string[] = []
    page.on("download", download => downloads.push(download.suggestedFilename()))
    await save.click()
    const alert = page.getByRole("alertdialog", { name: "SAVE ERROR" })
    await expect(alert).toHaveAttribute("aria-description", "Could not save Recipe")
    await page.screenshot({ path: test.info().outputPath("mobile-recipe-save-error.png") })
    await expect(page.locator(".batch-authoring-notice")).toHaveCount(0)
    expect(downloads).toHaveLength(0)
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("authoring")
    await expect(grid).toHaveValue(gridBefore)
    expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(imageBefore)
    const sealedAfterFailure = await page.getByTestId("gate5-sealed-reference").textContent()
    expect(sealedAfterFailure).not.toBe("")
    await alert.getByRole("button", { name: "OK" }).click()
    await expect(alert).toHaveCount(0)
    await expect(save).toBeEnabled()

    const downloadStarted = page.waitForEvent("download")
    await save.click()
    const download = await downloadStarted
    expect(download.suggestedFilename()).toBe("PIXTUDIO_Batch_Recipe.pixtudiobatch")
    const template = JSON.parse((await readFile((await download.path())!)).toString("utf8"))
    expect(template.sealed.recipe.grid).toBeTruthy()
    await expect(page.locator(".batch-authoring-notice")).toHaveCount(0)
    await expect(page.getByTestId("gate5-sealed-reference")).toHaveText(sealedAfterFailure ?? "")
    await expect(grid).toHaveValue(gridBefore)
    expect(await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL())).toBe(imageBefore)
})

test("Gate 14 Save and Next independently capture settled editor settings", async ({ page }, testInfo) => {
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await expect(page.getByRole("button", { name: "OK", exact: true })).toBeVisible()
    await expect(page.locator(".batch-authoring-actions")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "START OVER", exact: true })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath("crop-without-batch-actions.png") })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.locator(".batch-authoring-inline-actions")).toBeVisible()
    await expect(page.locator(".batch-authoring-inline-actions > button")).toHaveCount(2)
    await expect(page.getByRole("group", { name: "Batch Auto palette mode" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Set as Reference", exact: true })).toHaveCount(0)
    await expect(page.getByText("BRUSH SIZE:")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "START OVER", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible()
    const actionGeometry = await page.locator(".batch-authoring-inline-actions").evaluate(element => {
        const row = element.getBoundingClientRect()
        const buttons = [...element.querySelectorAll(":scope > button")].map(button => button.getBoundingClientRect())
        return {
            oneRow: buttons.every(button => Math.abs(button.top - buttons[0].top) < 1),
            inside: buttons.every(button => button.left >= row.left && button.right <= row.right),
            noOverflow: element.scrollWidth <= element.clientWidth + 1,
            textInside: [...element.querySelectorAll(":scope > button")].every(button =>
                button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1),
            badgeClear: buttons[buttons.length - 1].right <= document.querySelector('button[aria-label="METHOD"]')!.getBoundingClientRect().left,
            mobileBreaks: [...element.querySelectorAll(":scope > button br")].every(br => getComputedStyle(br).display !== "none"),
        }
    })
    expect(actionGeometry).toEqual({ oneRow: true, inside: true, noOverflow: true, textInside: true,
        badgeClear: true, mobileBreaks: testInfo.project.name === "mobile" })
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toBeEnabled()
    await page.getByRole("button", { name: "METHOD", exact: true }).click()
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toHaveCount(0)
    await page.getByRole("button", { name: "Cancel METHOD" }).click()
    await expect(page.getByRole("button", { name: "Save Batch Recipe" })).toBeEnabled()
    const activeColors = await page.locator(".batch-authoring-inline-actions").evaluate(element => {
        const color = (selector: string) => getComputedStyle(element.querySelector(selector)!).backgroundColor
        return { save: color(".batch-authoring-save"), next: color(".batch-authoring-next") }
    })
    expect(activeColors).toEqual({ save: "rgb(104, 29, 175)", next: "rgb(223, 63, 114)" })
    await expect(page.locator(".batch-authoring-notice")).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath("authoring-ready.png"), fullPage: true })
    const recipeDownload = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const savedTemplate = JSON.parse((await readFile((await (await recipeDownload).path())!)).toString("utf8"))
    await expect(page.locator(".batch-authoring-notice")).toHaveCount(0)
    const slider = page.locator('input[type="range"][max="128"]')
    const box = await slider.boundingBox()
    if (!box) throw new Error("Grid slider is not laid out")
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    try {
        let x = box.x + 8 + ((24 - 2) / 126) * (box.width - 16)
        for (let attempt = 0; attempt < 20; attempt++) {
            await page.mouse.move(x, y)
            const actual = Number(await slider.inputValue())
            if (actual === 24) break
            x += actual < 24 ? 1 : -1
        }
        await expect(slider).toHaveValue("24")
    } finally {
        await page.mouse.up()
    }
    await expect(page.getByRole("button", { name: "Choose Source Frames" })).toBeEnabled()
    await page.getByRole("button", { name: "Choose Source Frames" }).click()
    await expect(page.locator(".batch-reference-stage")).toHaveAttribute("inert", "")
    const frozenReference = await page.getByTestId("gate5-sealed-reference").textContent()
    const current = JSON.parse(frozenReference ?? "")
    expect(savedTemplate.sealed.recipe.grid.size).not.toBe(current.recipe.grid.size)
    expect(current.recipe.grid.size).toBe(24)
    await page.keyboard.press("Control+z")
    await expect(page.getByTestId("gate5-sealed-reference")).toHaveText(frozenReference ?? "")
    await expect(slider).toHaveValue("24")
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeDisabled()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath("reference-ready.png"), fullPage: true })
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("completed.png"), fullPage: true })
})

test("Batch Auto palette saves and reopens a dynamic per-frame recipe by default", async ({ page }) => {
    test.setTimeout(90_000)
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    const mode = page.getByRole("group", { name: "Batch Auto palette mode" })
    await expect(mode).toHaveCount(0)
    const downloadStarted = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const bytes = await readFile((await (await downloadStarted).path())!)
    const template = JSON.parse(bytes.toString("utf8"))
    expect(template.renderSemantics).toContain("dynamic-auto-palette")
    expect(template.sealed.recipe.palette).toMatchObject({ version: 2, source: "auto", method: "default" })
    expect(template.sealed.recipe.palette).not.toHaveProperty("matchingColors")
    expect(template.sealed.recipe.palette).not.toHaveProperty("outputs")
    await page.screenshot({ path: test.info().outputPath("dynamic-auto-authoring.png"), fullPage: true })
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await expect(mode).toHaveCount(0)
    const fixedDownload = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Batch Recipe" }).click()
    const fixed = JSON.parse((await readFile((await (await fixedDownload).path())!)).toString("utf8"))
    expect(fixed.sealed.recipe.palette).toMatchObject({ version: 1, source: "preset" })
    await page.reload()
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click()
    await (await picker).setFiles({ name: "dynamic.pixtudiobatch", mimeType: "application/json", buffer: bytes })
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("source")
    expect(template.sealed.referenceInputGeometry).toEqual({ width: 1, height: 1 })
    await page.evaluate(() => {
        const createFrame = async (name: string, color: string) => {
            const canvas = document.createElement("canvas")
            canvas.width = canvas.height = 1
            const context = canvas.getContext("2d")!
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
            const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), "image/png"))
            return new File([blob], name, { type: "image/png" })
        }
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "COLOR_SEQUENCE", async *values() {
                for (const [name, color] of [["blue.png", "#0000ff"], ["red.png", "#ff0000"]]) {
                    const file = await createFrame(name, color)
                    yield { kind: "file", name, async getFile() { return file } }
                }
            },
        }) })
    })
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    const archiveStarted = page.waitForEvent("download")
    await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
    const archive = parseStoredZip(await readFile((await (await archiveStarted).path())!))
    expect([...archive.keys()]).toEqual(["batch_report.txt", "blue.png", "red.png"])
    const colors = await page.evaluate(async frames => {
        const readPixel = async (bytes: number[]) => {
            const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: "image/png" }))
            const canvas = document.createElement("canvas")
            canvas.width = canvas.height = 1
            const context = canvas.getContext("2d")!
            context.drawImage(bitmap, 0, 0, 1, 1)
            bitmap.close()
            return [...context.getImageData(0, 0, 1, 1).data]
        }
        return { blue: await readPixel(frames.blue), red: await readPixel(frames.red) }
    }, { blue: [...archive.get("blue.png")!], red: [...archive.get("red.png")!] })
    expect(colors.blue[2]).toBeGreaterThan(colors.blue[0] * 2)
    expect(colors.red[0]).toBeGreaterThan(colors.red[2] * 2)
})

test("Batch SAME AS AUTO freezes the current Auto palette as an imported preset", async ({ page }) => {
    test.setTimeout(90_000)
    const reference = await page.evaluate(() => {
        const canvas = document.createElement("canvas")
        canvas.width = canvas.height = 64
        const context = canvas.getContext("2d")!
        for (const [index, color] of ["#f02020", "#20e030", "#2040f0", "#f0e020"].entries()) {
            context.fillStyle = color
            context.fillRect((index % 2) * 32, Math.floor(index / 2) * 32, 32, 32)
        }
        return canvas.toDataURL("image/png").split(",")[1]
    })
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "reference.png", mimeType: "image/png", buffer: Buffer.from(reference, "base64"),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()

    const savePalette = async () => {
        const download = page.waitForEvent("download")
        await page.getByRole("button", { name: "Save Batch Recipe" }).click()
        const template = JSON.parse((await readFile((await (await download).path())!)).toString("utf8"))
        return template.sealed.recipe.palette
    }

    const initialAuto = await savePalette()
    expect(initialAuto).toMatchObject({ version: 2, source: "auto" })
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await expect(page.getByRole("button", { name: /^SUNSET\b/ })).toHaveCount(0)
    const snapshotButton = page.getByRole("button", { name: /^SAME AS AUTO\b/ })
    await expect(snapshotButton).toBeVisible()
    await snapshotButton.click()
    const firstPreset = await savePalette()
    expect(firstPreset).toMatchObject({ version: 1, source: "imported" })
    expect(firstPreset.matchingColors).toHaveLength(4)
    expect(firstPreset.matchingColors).toEqual(expect.arrayContaining(["#F02020", "#20E030", "#2040F0", "#F0E020"]))
    await expect(page.getByRole("group", { name: "Batch Auto palette mode" })).toHaveCount(0)

    await page.getByRole("button", { name: /AUTO PALETTE/i }).click()
    const countSlider = page.locator('input[type="range"][max="32"]')
    await countSlider.fill("2")
    await countSlider.blur()
    await expect(countSlider).toHaveValue("2")
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await snapshotButton.click()
    const revisedPreset = await savePalette()
    expect(revisedPreset.matchingColors).toHaveLength(2)
    expect(revisedPreset.matchingColors).not.toEqual(firstPreset.matchingColors)
})

test("Gate 14 fullscreen preview reuses the inert canvas and restores the editor", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === "mobile"
    const frame = await page.evaluate(({ width, height }) => {
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")!
        context.fillStyle = "#344357"
        context.fillRect(0, 0, width, height)
        context.fillStyle = "#f4f1e7"
        context.fillRect(width * .2, height * .2, width * .6, height * .6)
        return canvas.toDataURL("image/png").split(",")[1]
    }, { width: isMobile ? 180 : 320, height: isMobile ? 320 : 180 })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "frame.png", mimeType: "image/png", buffer: Buffer.from(frame, "base64") })
    await page.getByRole("button", { name: "OK", exact: true }).click()

    const previewButton = page.getByRole("button", { name: "Fullscreen preview" })
    await expect(previewButton).toBeEnabled()
    await expect(previewButton.locator("img")).toHaveAttribute("src", "/plugins/batch-pixelation/PreviewIcon.svg")
    const toolbarOrder = await page.locator(".batch-preview-toolbar button").evaluateAll(buttons =>
        buttons.map(button => button.getAttribute("aria-label")))
    expect(toolbarOrder.indexOf("Fullscreen preview")).toBe(toolbarOrder.indexOf("Hand tool") + 1)
    expect(toolbarOrder.indexOf("Manual button")).toBe(toolbarOrder.indexOf("Fullscreen preview") + 1)
    const toolbarFits = await page.locator(".batch-preview-toolbar").evaluate(toolbar => {
        const buttons = [...toolbar.querySelectorAll("button")].map(button => button.getBoundingClientRect())
        return buttons.every((button, index) =>
            button.left >= 0 && button.right <= window.innerWidth &&
            (index === 0 || buttons[index - 1].right <= button.left))
    })
    expect(toolbarFits).toBe(true)
    await page.screenshot({ path: test.info().outputPath("editor-with-preview-button.png") })
    const original = await page.locator("canvas").last().boundingBox()
    if (!original) throw new Error("Editor canvas is not visible")
    await page.locator("canvas").last().evaluate(canvas => {
        Object.assign(window, { gate14Canvas: canvas })
    })
    const pixelsBefore = await page.locator("canvas").last().evaluate(canvas => canvas.toDataURL())
    const revision = await page.getByTestId("gate5-revision").textContent()

    await previewButton.click()
    const preview = page.getByRole("dialog", { name: "Fullscreen canvas preview" })
    const canvas = preview.locator("canvas")
    await expect(preview).toBeVisible()
    await expect(page.getByRole("button", { name: "Close fullscreen preview" })).toBeFocused()
    await expect(page.getByRole("button", { name: "Close fullscreen preview" }).locator("img"))
        .toHaveAttribute("src", "/plugins/batch-pixelation/closePreviewIcon.svg")
    expect(await canvas.evaluate(element =>
        element === (window as Window & { gate14Canvas?: HTMLCanvasElement }).gate14Canvas)).toBe(true)
    expect(await canvas.evaluate(element => element.toDataURL())).toBe(pixelsBefore)
    expect(await canvas.evaluate(element => getComputedStyle(element).imageRendering)).toBe("pixelated")
    const bounds = await canvas.boundingBox()
    if (!bounds) throw new Error("Preview canvas is not visible")
    expect(bounds.width).toBeGreaterThan(original.width)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
    await expect(canvas.locator("xpath=..")).toHaveCSS("pointer-events", "none")
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.keyboard.press("Control+z")
    expect(await canvas.evaluate(element => element.toDataURL())).toBe(pixelsBefore)
    await expect(page.getByTestId("gate5-revision")).toHaveText(revision ?? "")
    await page.screenshot({ path: test.info().outputPath("fullscreen-preview.png") })

    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()
    await expect(previewButton).toBeFocused()
    const restored = await page.locator("canvas").last().boundingBox()
    expect(restored?.width).toBeCloseTo(original.width, 0)
    expect(restored?.height).toBeCloseTo(original.height, 0)
    expect(await page.locator("canvas").last().evaluate(element => element.toDataURL())).toBe(pixelsBefore)
    await previewButton.click()
    await page.keyboard.press("Escape")
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()
    await previewButton.click()
    await expect(preview).toBeVisible()
    await page.goBack()
    await expect(preview).toHaveCount(0)
    await expect(page).toHaveURL(/\/plugins\/batch-pixelation\/$/)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()
    await expect(page.getByTestId("gate5-revision")).toHaveText(revision ?? "")
})

test("Gate 14 mobile landscape frame rotates only in portrait fullscreen preview", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile preview orientation")
    await page.setViewportSize({ width: 390, height: 844 })
    const frame = await page.evaluate(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 320
        canvas.height = 180
        const context = canvas.getContext("2d")!
        context.fillStyle = "#344357"
        context.fillRect(0, 0, 320, 180)
        context.fillStyle = "#e23b3b"
        context.fillRect(0, 0, 80, 70)
        context.fillStyle = "#f4f1e7"
        context.fillRect(240, 110, 80, 70)
        return canvas.toDataURL("image/png").split(",")[1]
    })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "landscape.png", mimeType: "image/png", buffer: Buffer.from(frame, "base64") })
    await page.getByRole("radio", { name: "Aspect ratio 16:9" }).click()
    await expect(page.getByRole("radio", { name: "Aspect ratio 16:9" })).toHaveAttribute("aria-checked", "true")
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByText("57 × 32")).toBeVisible()
    await page.getByRole("button", { name: "Fullscreen preview" }).click()
    const preview = page.getByRole("dialog", { name: "Fullscreen canvas preview" })
    const frameElement = preview.locator("canvas").locator("xpath=../../../..")
    await expect(frameElement).toHaveCSS("transform", /matrix\(0, 1, -1, 0, 0, 0\)/)
    const portrait = await frameElement.boundingBox()
    const closePortrait = await page.getByRole("button", { name: "Close fullscreen preview" }).boundingBox()
    if (!portrait || !closePortrait) throw new Error("Portrait preview is not visible")
    expect(portrait.height).toBeGreaterThan(portrait.width)
    const frameStyle = await frameElement.evaluate(element => ({
        width: getComputedStyle(element).width,
        height: getComputedStyle(element).height,
        transform: getComputedStyle(element).transform,
    }))
    expect(portrait.height, JSON.stringify({ portrait, frameStyle })).toBeGreaterThan(600)
    expect(portrait.x).toBeGreaterThanOrEqual(0)
    expect(portrait.y).toBeGreaterThanOrEqual(0)
    expect(portrait.x + portrait.width).toBeLessThanOrEqual(390)
    expect(portrait.y + portrait.height).toBeLessThanOrEqual(844)
    expect(closePortrait.x).toBeGreaterThanOrEqual(portrait.x + portrait.width - closePortrait.width - 12)
    expect(closePortrait.y).toBeLessThanOrEqual(portrait.y + 12)
    await page.screenshot({ path: test.info().outputPath("landscape-frame-rotated-portrait.png") })
    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()
    await page.getByRole("button", { name: "Fullscreen preview" }).click()

    await page.setViewportSize({ width: 844, height: 390 })
    await expect(frameElement).toHaveCSS("transform", "none")
    const landscape = await frameElement.boundingBox()
    if (!landscape) throw new Error("Landscape preview is not visible")
    expect(landscape.width).toBeGreaterThan(landscape.height)
    expect(landscape.x).toBeGreaterThanOrEqual(0)
    expect(landscape.y).toBeGreaterThanOrEqual(0)
    expect(landscape.x + landscape.width).toBeLessThanOrEqual(844)
    expect(landscape.y + landscape.height).toBeLessThanOrEqual(390)
    await page.screenshot({ path: test.info().outputPath("landscape-frame-landscape.png") })
})

test("Gate 14 mobile preview owns fullscreen and portrait lock with viewport fallback", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile browser APIs")
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.png", mimeType: "image/png", buffer: Buffer.from(controlledPng(false)) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await page.evaluate(() => {
        const state = { element: null as Element | null, calls: [] as string[], lockFails: false, fullscreenFails: false }
        Object.assign(window, { previewBrowserApiTest: state })
        Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => state.element })
        Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: function () {
            state.calls.push("request")
            if (state.fullscreenFails) return Promise.reject(new Error("Fullscreen denied"))
            state.element = this
            document.dispatchEvent(new Event("fullscreenchange"))
            return Promise.resolve()
        } })
        Object.defineProperty(document, "exitFullscreen", { configurable: true, value: async () => {
            state.calls.push("exit")
            state.element = null
            document.dispatchEvent(new Event("fullscreenchange"))
        } })
        Object.defineProperty(screen.orientation, "lock", { configurable: true, value: async (value: string) => {
            state.calls.push(`lock:${value}`)
            if (state.lockFails) throw new Error("Orientation lock denied")
        } })
        Object.defineProperty(screen.orientation, "unlock", { configurable: true, value: () => {
            state.calls.push("unlock")
        } })
    })
    const browserCalls = () => page.evaluate(() =>
        (window as Window & { previewBrowserApiTest: { calls: string[] } }).previewBrowserApiTest.calls)
    const previewButton = page.getByRole("button", { name: "Fullscreen preview" })
    const preview = page.getByRole("dialog", { name: "Fullscreen canvas preview" })
    await previewButton.click()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait"])
    await expect(preview).toBeVisible()
    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit"])
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()

    await page.evaluate(() => {
        (window as Window & { previewBrowserApiTest: { lockFails: boolean } }).previewBrowserApiTest.lockFails = true
    })
    await previewButton.click()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit", "request", "lock:portrait", "exit"])
    await expect(preview).toBeVisible()
    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()

    await page.evaluate(() => {
        (window as Window & { previewBrowserApiTest: { fullscreenFails: boolean } }).previewBrowserApiTest.fullscreenFails = true
    })
    await previewButton.click()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit", "request", "lock:portrait", "exit", "request"])
    await expect(preview).toBeVisible()
    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect(preview).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.history.state?.batchFullscreenPreview ?? null)).toBeNull()

    await page.evaluate(() => {
        const state = (window as Window & { previewBrowserApiTest: {
            lockFails: boolean, fullscreenFails: boolean,
        } }).previewBrowserApiTest
        state.lockFails = false
        state.fullscreenFails = false
    })
    await previewButton.click()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit", "request", "lock:portrait", "exit", "request", "request", "lock:portrait"])
    await page.evaluate(() => document.exitFullscreen())
    await expect(preview).toBeVisible()
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit", "request", "lock:portrait", "exit", "request", "request", "lock:portrait", "exit", "unlock"])
    await page.getByRole("button", { name: "Close fullscreen preview" }).click()
    await expect(preview).toHaveCount(0)
    await expect.poll(browserCalls).toEqual(["request", "lock:portrait", "unlock", "exit", "request", "lock:portrait", "exit", "request", "request", "lock:portrait", "exit", "unlock"])
})

test("Gate 14 portrait reference keeps the mobile action row inside the viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Portrait mobile layout")
    const pngBase64 = await page.evaluate(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 180
        canvas.height = 320
        const context = canvas.getContext("2d")!
        context.fillStyle = "#344357"
        context.fillRect(0, 0, 180, 320)
        context.fillStyle = "#f4f1e7"
        context.fillRect(35, 70, 110, 180)
        return canvas.toDataURL("image/png").split(",")[1]
    })
    await page.locator('input[aria-label="Reference Frame file"]').setInputFiles({
        name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(pngBase64, "base64"),
    })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.locator(".batch-authoring-inline-actions")).toBeVisible()
    const geometry = await page.locator(".batch-authoring-inline-actions").evaluate(element => {
        const bounds = [...element.querySelectorAll(":scope > button")].map(button => button.getBoundingClientRect())
        const badge = document.querySelector('button[aria-label="METHOD"]')!.getBoundingClientRect()
        return {
            buttonsFit: [...element.querySelectorAll(":scope > button")].every(button =>
                button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1),
            oneRow: bounds.every(button => Math.abs(button.top - bounds[0].top) < 1),
            noBadgeOverlap: bounds[bounds.length - 1].right <= badge.left,
            insideViewport: bounds.every(button => button.left >= 0 && button.right <= window.innerWidth),
            fontSizes: [...element.querySelectorAll(":scope > button")].map(button => getComputedStyle(button).fontSize),
        }
    })
    expect(geometry).toEqual({ buttonsFit: true, oneRow: true, noBadgeOverlap: true, insideViewport: true,
        fontSizes: ["13px", "13px"] })
    await page.screenshot({ path: test.info().outputPath("portrait-authoring-mobile.png"), fullPage: true })
})

test("Gate 14 rented Home returns to the plugin Entry", async ({ page }) => {
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "SET A FRAME AS REFERENCE" }).click()
    await (await picker).setFiles({ name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes) })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Home" })).toBeVisible()
    await page.getByRole("button", { name: "Home" }).click()
    await expect(page.getByRole("heading", { name: "BATCH PIXELATION PLUGIN" })).toBeVisible()
    await expect(page.getByRole("button", { name: "SET A FRAME AS REFERENCE" })).toBeEnabled()
    await expect(page.locator(".batch-authoring-inline-actions")).toHaveCount(0)
})

test("Gate 14 Saved Recipe releases once; NOT NOW retains ZIP and repeat download reuses bytes", async ({ page }) => {
    const canvas = page.locator(".batch-intro-video canvas")
    await expect(canvas).toHaveClass(/batch-intro-canvas-ready/)
    await canvas.evaluate(element => { element.dataset.frameIdentity = "entry-frame" })
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "OPEN SAVED BATCH RECIPE" }).click()
    await (await picker).setFiles({ name: "saved.pixtudio-batch", mimeType: "application/json",
        buffer: Buffer.from(serializeBatchTemplate({ ...batchTemplateFixture(), referenceInputGeometry: { width: 1, height: 1 } })) })
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("source")
    await expect(page.locator(".batch-reference-stage")).toHaveCount(0)
    await expect(page.locator(".batch-overlay")).toHaveCSS("background-color", "rgba(69, 64, 49, 0.5)")
    await expect(page.locator(".batch-overlay")).toHaveCSS("backdrop-filter", "blur(10px)")
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toHaveCSS("font-size",
        test.info().project.name === "mobile" ? "13px" : "10px")
    await expect(page.locator(".batch-entry-backdrop")).toHaveCSS("filter", "none")
    await expect(canvas).toHaveAttribute("data-frame-identity", "entry-frame")
    await expect(canvas).toHaveClass(/batch-intro-canvas-ready/)
    const heldFrame = await canvas.evaluate(element => {
        const surface = element as HTMLCanvasElement
        const pixels = surface.getContext("2d")!.getImageData(0, 0, surface.width, surface.height).data
        const colors = new Set<number>()
        for (let i = 0; i < pixels.length; i += 400) colors.add(pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2])
        return { colors: colors.size, paused: document.querySelector(".batch-intro-video video")!.paused }
    })
    expect(heldFrame.colors).toBeGreaterThan(16)
    expect(heldFrame.paused).toBe(true)
    await page.screenshot({ path: test.info().outputPath("saved-recipe-overlay.png"), fullPage: true })
    await page.evaluate(bytes => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => ({
            kind: "directory", name: "GATE14", async *values() {
                let held = true
                yield { kind: "file", name: "frame0.gif", async getFile() {
                    if (held) {
                        held = false
                        await new Promise<void>(resolve => {
                            (window as Window & { gate14ReleaseRead?: () => void }).gate14ReleaseRead = resolve
                        })
                    }
                    return new File([Uint8Array.from(bytes)], "frame0.gif", { type: "image/gif" })
                } }
                yield { kind: "file", name: "frame1.gif", async getFile() {
                    return new File([Uint8Array.from(bytes)], "frame1.gif", { type: "image/gif" })
                } }
            },
        }) })
    }, [...staticGifBytes])
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByText("Scanning source...")).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("scanning.png"), fullPage: true })
    await page.evaluate(() => (window as Window & { gate14ReleaseRead?: () => void }).gate14ReleaseRead?.())
    await expect(page.getByRole("button", { name: "Start Batch" })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath("saved-recipe-ready.png"), fullPage: true })
    await page.getByRole("button", { name: "Start Batch" }).click()
    await expect(page.getByRole("heading", { name: "Completed", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    await expect(page.getByRole("dialog", { name: "ARCHIVE READY" })).toBeVisible()
    const releaseButtons = page.getByRole("dialog", { name: "ARCHIVE READY" }).getByRole("button")
    await expect(releaseButtons).toHaveCount(2)
    expect(await releaseButtons.evaluateAll(buttons => buttons.every(button => {
        const style = getComputedStyle(button)
        return style.paddingLeft === style.paddingRight && button.scrollWidth <= button.clientWidth + 1 &&
            button.scrollHeight <= button.clientHeight + 1
    }))).toBe(true)
    await expect(page.locator(".batch-overlay")).toHaveAttribute("inert", "")
    await expect(page.locator(".batch-entry-backdrop")).toHaveAttribute("inert", "")
    expect(await page.locator(".batch-overlay-actions button").evaluateAll(buttons =>
        buttons.map(button => getComputedStyle(button).backgroundColor),
    )).toEqual(Array(5).fill("rgba(15, 32, 42, 0.24)"))
    expect(await page.locator(".batch-start-over").evaluate(button => {
        (button as HTMLButtonElement).focus()
        return document.activeElement === button
    })).toBe(false)
    await page.screenshot({ path: test.info().outputPath("release-gate.png"), fullPage: true })
    await page.getByRole("button", { name: "NOT NOW" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.locator(".batch-overlay")).not.toHaveAttribute("inert", "")
    await expect(page.locator(".batch-start-over")).toHaveCSS("background-color", "rgb(4, 24, 32)")
    await page.getByRole("button", { name: "Prepare and Download ZIP" }).click()
    const firstEvent = page.waitForEvent("download")
    await page.getByRole("button", { name: "DOWNLOAD", exact: true }).click()
    const first = await readFile((await (await firstEvent).path())!)
    const secondEvent = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download again" }).click()
    const second = await readFile((await (await secondEvent).path())!)
    expect(first.equals(second)).toBe(true)
    expect([...parseStoredZip(first).keys()]).toEqual(["batch_report.txt", "frame0.png", "frame1.png"])
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByRole("button", { name: "START OVER" }).click()
    await expect(page.getByTestId("batch-workflow-state")).toHaveText("entry")
})
