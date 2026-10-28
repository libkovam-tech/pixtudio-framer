import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { build } from "esbuild"
import path from "node:path"
import { bearImagePath, installStableVisualEnvironment } from "./helpers"
import { openCanonicalAuthoringCropScreen } from "./canonicalAuthoringFixture"
import { installCropCapture } from "./cropCapture"
import type * as Proof from "./finalFrameHarness"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"

declare global { interface Window { gate5FrameProof: typeof Proof } }

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({
        entryPoints: [path.resolve("tests/e2e/finalFrameHarness.ts")],
        bundle: true,
        write: false,
        format: "iife",
        globalName: "gate5FrameProof",
    })
    proofBundle = built.outputFiles[0].text
})

async function sealedGrid(page: Page): Promise<number | null> {
    await page.getByRole("button", { name: "Set as Reference" }).click()
    if (!(await page.getByText("Reference sealed").isVisible())) return null
    const serialized = await page.getByTestId("gate5-sealed-reference").textContent()
    return serialized ? (JSON.parse(serialized) as SealedReference).recipe.grid.size : null
}

async function sealedPaletteSource(page: Page): Promise<string | null> {
    await page.getByRole("button", { name: "Set as Reference" }).click()
    if (!(await page.getByText("Reference sealed").isVisible())) return null
    const serialized = await page.getByTestId("gate5-sealed-reference").textContent()
    return serialized ? (JSON.parse(serialized) as SealedReference).recipe.palette.source : null
}

async function sealedRecipe(page: Page): Promise<SealedReference["recipe"] | null> {
    await page.getByRole("button", { name: "Set as Reference" }).click()
    if (!(await page.getByText("Reference sealed").isVisible())) return null
    const serialized = await page.getByTestId("gate5-sealed-reference").textContent()
    return serialized ? (JSON.parse(serialized) as SealedReference).recipe : null
}

async function applySmart(page: Page, whiteBalance: string): Promise<void> {
    await page.getByRole("button", { name: "Smart Object", exact: true }).click()
    await page.locator('input[type="range"][max="1"]').fill(whiteBalance)
    await page.getByRole("button", { name: "Apply", exact: true }).click()
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
}

async function commitGrid(page: Page, size: number): Promise<void> {
    const slider = page.locator('input[type="range"][max="128"]')
    const box = await slider.boundingBox()
    if (!box) throw new Error("Grid slider is not laid out")
    const y = box.y + box.height / 2
    let x = box.x + 8 + ((size - 2) / 126) * (box.width - 16)
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    try {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            await page.mouse.move(x, y)
            const actual = Number(await slider.inputValue())
            if (actual === size) break
            x += actual < size ? 1 : -1
        }
        await expect(slider).toHaveValue(String(size))
    } finally {
        await page.mouse.up()
    }
    await expect(slider).toHaveValue(String(size))
}

async function compareCurrentPng(ordinary: Page, rented: Page, phase: string, testInfo: TestInfo): Promise<void> {
    const recipe = await sealedRecipe(rented)
    expect(recipe).not.toBeNull()
    const download = ordinary.waitForEvent("download")
    await ordinary.getByRole("button", { name: "Export", exact: true }).click()
    await ordinary.getByRole("button", { name: /^PNG$/ }).click()
    const png = [...await readFile((await (await download).path())!)]
    const result = await ordinary.evaluate(async ({ recipe, png }) => {
        const crop = window.cropEvidence.captured
        if (!crop) throw new Error("Missing ordinary Crop capture")
        return window.gate5FrameProof.compareFinalPng(crop, recipe, png)
    }, { recipe: JSON.parse(JSON.stringify(recipe)), png })
    expect(result.width).toBe(result.expectedWidth)
    expect(result.height).toBe(result.expectedHeight)
    expect(result.bytes).toBe(result.expectedBytes)
    expect(result.differentBytes).toBe(0)
    await testInfo.attach(`gate5-5-${phase}-pixel-identity`, {
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({ phase, recipe, ...result }, null, 2)),
    })
    if (process.env.GATE5_EVIDENCE === "1") {
        console.log("GATE5_5_EVIDENCE", JSON.stringify({
            project: testInfo.project.name,
            phase,
            recipeSha256: createHash("sha256").update(JSON.stringify(recipe)).digest("hex"),
            grid: recipe?.grid,
            smart: recipe?.smart,
            palette: recipe ? {
                source: recipe.palette.source,
                kernel: recipe.palette.kernel,
                colorSpace: recipe.palette.colorSpace,
                deConfetti: recipe.palette.deConfetti,
            } : null,
            ...result,
        }))
    }
}

test("Gate 5.5 native Grid Undo updates the current recipe", async ({ page }) => {
    test.setTimeout(90_000)
    await installStableVisualEnvironment(page)
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles(bearImagePath)
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
    await commitGrid(page, 16)
    await expect.poll(() => sealedGrid(page)).toBe(16)
    const at16 = await sealedRecipe(page)
    expect(at16?.grid.columns).toBe(16)
    expect(at16?.grid.rows).toBe(16)
    await commitGrid(page, 24)
    await expect.poll(() => sealedGrid(page)).toBe(24)
    const at24 = await sealedRecipe(page)
    expect(at24?.grid.columns).toBe(24)
    expect(at24?.grid.rows).toBe(24)
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(at16)
    await expect(page.locator('input[type="range"][max="128"]')).toHaveValue("16")
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(at24)
    await expect(page.locator('input[type="range"][max="128"]')).toHaveValue("24")
})

test("Gate 5.5 native Palette History follows the effective world", async ({ page }) => {
    test.setTimeout(120_000)
    await installStableVisualEnvironment(page)
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles(bearImagePath)
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
    await expect.poll(() => sealedPaletteSource(page)).toBe("auto")
    await page.getByRole("button", { name: /PALETTE PRESETS/i }).click()
    await page.getByRole("button", { name: /^GRAY\b/ }).click()
    await expect.poll(() => sealedPaletteSource(page)).toBe("preset")
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Load Palette" }).click()
    await (await chooser).setFiles(bearImagePath)
    await expect.poll(() => sealedPaletteSource(page)).toBe("imported")
    for (const expected of ["preset", "auto"]) {
        await page.getByRole("button", { name: "Undo", exact: true }).click()
        await expect.poll(() => sealedPaletteSource(page)).toBe(expected)
    }
    for (const expected of ["preset", "imported"]) {
        await page.getByRole("button", { name: "Redo", exact: true }).click()
        await expect.poll(() => sealedPaletteSource(page)).toBe(expected)
    }
})

test("Gate 5.5 native Smart History restores resolved WB effect", async ({ page }) => {
    test.setTimeout(120_000)
    await installStableVisualEnvironment(page)
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles(bearImagePath)
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
    await applySmart(page, "0.7")
    const a = await sealedRecipe(page)
    expect(a?.smart.whiteBalance.kind).toBe("matrix")
    await applySmart(page, "0.8")
    const b = await sealedRecipe(page)
    expect(b?.smart.whiteBalance.kind).toBe("matrix")
    expect(b?.smart).not.toEqual(a?.smart)
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(a)
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(b)
})

test("Gate 5.5 native METHOD History restores method, space and De-confetti", async ({ page }) => {
    test.setTimeout(120_000)
    await installStableVisualEnvironment(page)
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles(bearImagePath)
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "METHOD", exact: true })).toBeVisible()
    const a = await sealedRecipe(page)
    await page.getByRole("button", { name: "METHOD", exact: true }).click()
    await page.locator('button[data-axis="method"][data-method-id="k-means"]').click()
    await page.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
    await page.locator('input[data-de-confetti-control="enabled"]').check()
    await page.locator('button[data-axis="de-confetti"][data-de-confetti-tie-breaker="2"]').click()
    await page.getByRole("button", { name: "Apply METHOD", exact: true }).click()
    const b = await sealedRecipe(page)
    expect(b?.palette).toMatchObject({ version: 2, source: "auto", method: "k-means" })
    expect(b?.palette.colorSpace).toBe("hsv")
    expect(b?.palette.deConfetti).not.toEqual(a?.palette.deConfetti)
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(a)
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    await expect.poll(() => sealedRecipe(page)).toEqual(b)
})

test("Gate 5.5 mixed native History has exact final PNG after Undo, Redo and recommit", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    page.setDefaultTimeout(15_000)
    const rented = await page.context().newPage()
    rented.setDefaultTimeout(15_000)
    try {
        await installStableVisualEnvironment(page)
        await installStableVisualEnvironment(rented)
        await installCropCapture(page)
        await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", {
            configurable: true, value: undefined,
        }))
        await openCanonicalAuthoringCropScreen(page, { stabilizeStartButton: true })
        await rented.goto("/__batch-gate5")
        await rented.locator("#gate5-reference-file").setInputFiles(bearImagePath)
        for (const editor of [page, rented]) {
            await editor.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
        }
        await page.evaluate(() => { window.cropEvidence.armed = true })
        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: "OK", exact: true }).click()
            await expect(editor.getByRole("button", { name: "Smart Object", exact: true })).toBeVisible()
        }
        await page.addScriptTag({ content: proofBundle })

        for (const editor of [page, rented]) await commitGrid(editor, 16)
        await expect.poll(() => sealedGrid(rented)).toBe(16)
        for (const editor of [page, rented]) await applySmart(editor, "0.7")
        const afterSmartA = await sealedRecipe(rented)
        expect(afterSmartA?.smart.whiteBalance.kind).toBe("matrix")
        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: /PALETTE PRESETS/i }).click()
            await editor.getByRole("button", { name: /^GRAY\b/ }).click()
        }
        await expect.poll(async () => (await sealedRecipe(rented))?.palette.source).toBe("preset")
        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: "METHOD", exact: true }).click()
            await editor.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
            await editor.locator('input[data-de-confetti-control="enabled"]').check()
            await editor.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        await expect.poll(async () => (await sealedRecipe(rented))?.palette.colorSpace).toBe("hsv")
        for (const editor of [page, rented]) await commitGrid(editor, 24)
        const afterGrid24 = await sealedRecipe(rented)
        expect(afterGrid24?.grid.size).toBe(24)
        for (const editor of [page, rented]) await applySmart(editor, "0.8")
        const afterSmartB = await sealedRecipe(rented)
        expect(afterSmartB?.smart).not.toEqual(afterGrid24?.smart)
        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: "METHOD", exact: true }).click()
            await editor.locator('button[data-axis="color-space"][data-color-space-id="hsl"]').click()
            await editor.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        await expect.poll(async () => (await sealedRecipe(rented))?.palette.colorSpace).toBe("hsl")

        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Undo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(afterSmartB)
        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Undo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(afterGrid24)
        await compareCurrentPng(page, rented, "undo", testInfo)

        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Redo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(afterSmartB)
        await compareCurrentPng(page, rented, "redo", testInfo)

        for (const editor of [page, rented]) await commitGrid(editor, 32)
        await expect.poll(() => sealedGrid(rented)).toBe(32)
        await expect(rented.getByRole("button", { name: "Redo", exact: true })).toBeDisabled()
        await compareCurrentPng(page, rented, "recommit", testInfo)
    } finally {
        await rented.close()
    }
})

test("Gate 5.5 Auto METHOD and Imported Palette History have exact final PNG", async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    page.setDefaultTimeout(15_000)
    const rented = await page.context().newPage()
    rented.setDefaultTimeout(15_000)
    try {
        await installStableVisualEnvironment(page)
        await installStableVisualEnvironment(rented)
        await installCropCapture(page)
        await page.addInitScript(() => Object.defineProperty(window, "showSaveFilePicker", {
            configurable: true, value: undefined,
        }))
        await openCanonicalAuthoringCropScreen(page, { stabilizeStartButton: true })
        await rented.goto("/__batch-gate5")
        await rented.locator("#gate5-reference-file").setInputFiles(bearImagePath)
        for (const editor of [page, rented]) {
            await editor.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
        }
        await page.evaluate(() => { window.cropEvidence.armed = true })
        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: "OK", exact: true }).click()
            await expect(editor.getByRole("button", { name: "METHOD", exact: true })).toBeVisible()
        }
        await page.addScriptTag({ content: proofBundle })

        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: "METHOD", exact: true }).click()
            await editor.locator('button[data-axis="method"][data-method-id="k-means"]').click()
            await editor.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
            await editor.locator('input[data-de-confetti-control="enabled"]').check()
            await editor.getByRole("button", { name: "Apply METHOD", exact: true }).click()
        }
        const autoMethod = await sealedRecipe(rented)
        expect(autoMethod?.palette.source).toBe("auto")
        expect(autoMethod?.palette).toMatchObject({ version: 2, source: "auto", method: "k-means" })
        expect(autoMethod?.palette.colorSpace).toBe("hsv")

        for (const editor of [page, rented]) {
            await editor.getByRole("button", { name: /PALETTE PRESETS/i }).click()
            await editor.getByRole("button", { name: /^GRAY\b/ }).click()
        }
        const preset = await sealedRecipe(rented)
        expect(preset?.palette.source).toBe("preset")
        for (const editor of [page, rented]) {
            const chooser = editor.waitForEvent("filechooser")
            await editor.getByRole("button", { name: "Load Palette" }).click()
            await (await chooser).setFiles(bearImagePath)
        }
        const imported = await sealedRecipe(rented)
        expect(imported?.palette.source).toBe("imported")

        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Undo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(preset)
        await compareCurrentPng(page, rented, "preset-undo", testInfo)
        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Undo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(autoMethod)
        await compareCurrentPng(page, rented, "auto-method-undo", testInfo)

        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Redo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(preset)
        for (const editor of [page, rented]) await editor.getByRole("button", { name: "Redo", exact: true }).click()
        await expect.poll(() => sealedRecipe(rented)).toEqual(imported)
        await compareCurrentPng(page, rented, "imported-redo", testInfo)
    } finally {
        await rented.close()
    }
})
