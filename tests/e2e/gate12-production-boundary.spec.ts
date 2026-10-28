import { expect, test } from "@playwright/test"

test("production App does not expose the isolated rAF research route", async ({ page }) => {
    await page.goto("/__batch-raf-validation")
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole("heading", { name: "Batch Pixelation - rAF Validation Stand" })).toHaveCount(0)
    await expect(page.getByText("RESEARCH ONLY", { exact: true })).toHaveCount(0)
})

test("production chunks contain Batch authoring but no research modules", async ({ request }) => {
    const response = await request.get("/batch-production-modules.json")
    expect(response.ok()).toBe(true)
    const graph = await response.json() as { version: number; chunks: { modules: string[] }[] }
    expect(graph.version).toBe(1)
    const modules = graph.chunks.flatMap(chunk => chunk.modules)
    expect(modules.some(module => module.endsWith("authoring/BatchReferenceRoute.tsx"))).toBe(true)
    expect(modules.filter(module => module.includes("batchPixelation/research/"))).toEqual([])
})
