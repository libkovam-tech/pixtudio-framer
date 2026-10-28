import { expect, type Page } from "@playwright/test"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"

export type PerformanceSource = Readonly<{ name: string; type: string; bytes: number[] }>

export async function makePerformanceSources(page: Page) {
    return page.evaluate(async () => {
        const variants = await Promise.all(Array.from({ length: 5 }, async (_, variant) => {
            const canvas = document.createElement("canvas")
            canvas.width = 512
            canvas.height = 512
            const context = canvas.getContext("2d")!
            for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
                context.fillStyle = `rgb(${(x * 31 + variant * 43) % 256}, ${(y * 29 + x * 7) % 256}, ${
                    (x * 13 + y * 17 + variant * 23) % 256})`
                context.fillRect(x * 16, y * 16, 16, 16)
            }
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
                value => value ? resolve(value) : reject(new Error("Benchmark fixture encode failed")), "image/png"))
            canvas.width = 0
            canvas.height = 0
            return [...new Uint8Array(await blob.arrayBuffer())]
        }))
        return Array.from({ length: 50 }, (_, index) => ({
            name: `frame${index + 1}.png`, type: "image/png", bytes: variants[index % variants.length],
        }))
    })
}

export async function sealPerformanceReference(page: Page, reference: PerformanceSource,
    shape: "P1" | "P2", onStage?: (stage: string) => Promise<void>): Promise<SealedReference> {
    await page.goto("/__batch-gate5")
    await onStage?.("route-ready")
    await onStage?.("reference-authoring-start")
    await page.locator("#gate5-reference-file").setInputFiles({ name: reference.name,
        mimeType: reference.type, buffer: Buffer.from(reference.bytes) })
    await expect(page.getByRole("radio", { name: `Aspect ratio ${shape === "P1" ? "16:9" : "1:1"}` }))
        .toBeVisible()
    await page.getByRole("radio", { name: `Aspect ratio ${shape === "P1" ? "16:9" : "1:1"}` }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Set as Reference" })).toBeVisible()
    await onStage?.("editor-mounted-observed")
    if (onStage && await page.locator("canvas").first().isVisible()) await onStage("first-visible-canvas-observed")
    if (shape === "P1") {
        await page.getByRole("button", { name: "Smart Object", exact: true }).click()
        await page.locator('input[type="range"][max="1"]').fill("0.7")
        await page.getByRole("button", { name: "Apply", exact: true }).click()
        const grid = page.locator('input[type="range"][max="128"]')
        await grid.focus()
        const current = Number(await grid.inputValue())
        for (let step = 0; step < Math.abs(current - 24); step++) {
            await grid.press(current < 24 ? "ArrowRight" : "ArrowLeft")
        }
        await expect(grid).toHaveValue("24")
        await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await page.getByRole("button", { name: /^SUNSET\b/ }).click()
        await page.getByRole("button", { name: "METHOD", exact: true }).click()
        await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
        await page.locator('input[data-de-confetti-control="enabled"]').check()
        await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
    }
    await page.getByRole("button", { name: "Set as Reference" }).click()
    await expect(page.getByText("Reference sealed")).toBeVisible()
    const serialized = await page.getByTestId("gate5-sealed-reference").textContent()
    if (!serialized) throw new Error("Missing sealed Reference")
    await onStage?.("reference-authoring-end")
    return JSON.parse(serialized) as SealedReference
}
