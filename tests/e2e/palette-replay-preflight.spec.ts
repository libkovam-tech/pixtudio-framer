import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { collectBrowserErrors, installStableVisualEnvironment, openBearImageCropScreen } from "./helpers"
import type { ProjectSnapshotV2 } from "../../src/editor/projectSnapshotV2"
import { build } from "esbuild"
import path from "node:path"
import type * as Harness from "./paletteReplayHarness"
import type { PaletteReplayRecipe } from "../../src/plugins/batchPixelation/research/paletteReplay"

declare global {
    interface Window {
        paletteProof: typeof Harness & { pixelizeFromImageDominant: (image: ImageData, geometry: { rows: number; columns: number }) => (string | null)[][] }
        paletteProofSession: { source: (string | null)[][]; recipe: PaletteReplayRecipe }
    }
}

let harness: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/paletteReplayHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "paletteProof" })
    harness = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await page.addInitScript(() => {
        Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: undefined })
    })
})

// Checkpoint evidence, not the later canonical PNG/export gate.
test("palette replay preflight: Auto transparency survives palette rebuild without drawing", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)
    await openBearImageCropScreen(page)
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Save Project", exact: true })).toBeVisible()
    const initial = await saveProject(page)
    expect(initial.strokeLayer.cells).toHaveLength(0)
    await page.addScriptTag({ content: harness })
    const title = await page.locator('button[title^="#"], button[title^="rgb("]').nth(7).getAttribute("title")
    if (!title) throw new Error("Missing Auto swatch")
    await openSwatch(page, title)
    await page.getByLabel("Transparent", { exact: true }).check()
    await confirmEdit(page)
    const transparent = await saveProject(page)
    expect(transparent.strokeLayer.cells.length).toBeGreaterThan(0)
    const editedId = Object.keys(transparent.autoOverrides ?? {}).find(id => transparent.autoOverrides?.[id]?.isTransparent)
    if (!editedId) throw new Error("Missing transparent swatch identity")
    await expect(page.getByTitle("Transparent Swatch", { exact: true })).toHaveCount(0)
    const slider = page.locator('input[type="range"][max="32"]').first()
    const beforeCount = Number(await slider.inputValue())
    const targetCount = Number(await slider.getAttribute("min"))
    await slider.focus()
    await slider.press("Home")
    await slider.press("Tab")
    await expect(slider).toHaveValue(String(targetCount))
    let rebuilt = await saveProject(page)
    await expect.poll(async () => {
        rebuilt = await saveProject(page)
        return rebuilt.importLayer.cells
    }).not.toEqual(transparent.importLayer.cells)
    expect(rebuilt.paletteCount).toBe(targetCount)
    expect(rebuilt.strokeLayer.cells.length).toBeGreaterThan(0)
    expect(rebuilt.strokeLayer.cells.every(cell => cell.swatchIndex === -2)).toBe(true)
    const transparentCells = new Set(rebuilt.strokeLayer.cells.map(cell => cell.cellIndex))
    const coverage = new Map<number, { transparent: number; opaque: number }>()
    for (const [index, swatchIndex] of rebuilt.importLayer.cells.entries()) {
        const item = coverage.get(swatchIndex) ?? { transparent: 0, opaque: 0 }
        if (transparentCells.has(index)) item.transparent++
        else item.opaque++
        coverage.set(swatchIndex, item)
    }
    const splitLabels = [...coverage.entries()].filter(([, value]) => value.transparent > 0 && value.opaque > 0)
    const proof = await page.evaluate(({ initial, transparent, rebuilt, editedId }) => {
        if (!initial.ref) throw new Error("Missing Reference fixture")
        const reference = new ImageData(Uint8ClampedArray.from(atob(initial.ref.b64), c => c.charCodeAt(0)), initial.ref.w, initial.ref.h)
        const source = window.paletteProof.pixelizeFromImageDominant(reference, { columns: initial.columns ?? initial.gridSize, rows: initial.rows ?? initial.gridSize })
        const base = window.paletteProof.capture(source, initial)
        const edited = window.paletteProof.transparent(base, editedId)
        const next = window.paletteProof.capture(source, rebuilt)
        const combined = window.paletteProof.rebasePaletteReplay(edited, next)
        return { initial: window.paletteProof.compare(base, source, initial),
            transparent: window.paletteProof.compare(edited, source, transparent),
            rebuilt: window.paletteProof.compare(combined, source, rebuilt) }
    }, { initial, transparent, rebuilt, editedId })
    expect(errors.flush()).toEqual([])

    await testInfo.attach("palette-replay-preflight-evidence", {
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({
            brushActions: 0, beforeCount, afterCount: rebuilt.paletteCount,
            canvas: await canvasDigest(page), proof, splitLabels, coverage: [...coverage.entries()],
            beforePalette: transparent.palette, afterPalette: rebuilt.palette,
            transparentCells: rebuilt.strokeLayer.cells.length,
            note: "Current labels alone cannot reconstruct alpha; the resolved old-classifier alpha predicate replays exactly at the same sampling checkpoint.",
        }, null, 2)),
    })
    expect(splitLabels.length).toBeGreaterThan(0)
    for (const comparison of [proof.initial, proof.transparent, proof.rebuilt]) {
        expect(comparison.length).toBe(comparison.expectedLength)
        expect(comparison.mismatchBytes).toBe(0)
    }
    const gridSlider = page.locator('input[type="range"][max="128"]').first()
    await gridSlider.fill("16")
    await gridSlider.press("Tab")
    await expect(gridSlider).toHaveValue("16")
    const resized = await saveProject(page)
    const resizedProof = await page.evaluate(({ initial, resized, editedId }) => {
        if (!initial.ref) throw new Error("Missing Reference fixture")
        const reference = new ImageData(Uint8ClampedArray.from(atob(initial.ref.b64), c => c.charCodeAt(0)), initial.ref.w, initial.ref.h)
        const oldSource = window.paletteProof.pixelizeFromImageDominant(reference, {
            columns: initial.columns ?? initial.gridSize, rows: initial.rows ?? initial.gridSize,
        })
        const newSource = window.paletteProof.pixelizeFromImageDominant(reference, {
            columns: resized.columns ?? resized.gridSize, rows: resized.rows ?? resized.gridSize,
        })
        const oldRecipe = window.paletteProof.transparent(window.paletteProof.capture(oldSource, initial), editedId)
        return window.paletteProof.compare(window.paletteProof.rebasePaletteReplay(oldRecipe,
            window.paletteProof.capture(newSource, resized)), newSource, resized)
    }, { initial, resized, editedId })
    await testInfo.attach("palette-grid-change-gap", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ oldGrid: initial.gridSize, newGrid: resized.gridSize,
            mismatchBytes: resizedProof.mismatchBytes, comparedBytes: resizedProof.length }, null, 2)) })
    // Characterization: current alpha rules omit the old-grid rasterization/resampling step.
    expect(resizedProof.length).toBe(resizedProof.expectedLength)
    expect(resizedProof.mismatchBytes).toBeGreaterThan(0)
})

test("palette replay identity: ordinary edit, duplicate collapse, delete and transparency", async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)
    await openBearImageCropScreen(page)
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Save Project", exact: true })).toBeVisible()
    const initial = await saveProject(page)
    expect(initial.strokeLayer.cells).toHaveLength(0)
    await page.addScriptTag({ content: harness })
    await page.evaluate(snapshot => {
        if (!snapshot.ref) throw new Error("Missing Reference fixture")
        const reference = new ImageData(Uint8ClampedArray.from(atob(snapshot.ref.b64), c => c.charCodeAt(0)), snapshot.ref.w, snapshot.ref.h)
        const source = window.paletteProof.pixelizeFromImageDominant(reference, { columns: snapshot.columns ?? snapshot.gridSize, rows: snapshot.rows ?? snapshot.gridSize })
        window.paletteProofSession = { source, recipe: window.paletteProof.capture(source, snapshot) }
    }, initial)
    const evidence = []
    for (const step of ["edit", "collapse", "delete", "transparent"] as const) {
        const operation = await page.evaluate(step => {
            const outputs = window.paletteProofSession.recipe.outputs.filter(value => !value.transparent)
            const swatch = outputs[outputs.length - 1]
            const title = [...document.querySelectorAll("button[title]")].map(button => button.getAttribute("title")!)
                .find(title => /^(#|rgb\()/.test(title) && window.paletteProof.quantizationColorKey(title) === window.paletteProof.quantizationColorKey(swatch.color))
            if (!title) throw new Error("Missing ordinary editor swatch")
            const color = step === "collapse" ? outputs[0].color : step === "transparent" ? swatch.color : "#F10F0F"
            const channels = window.paletteProof.quantizationColorKey(color).match(/\d+/g)!.map(Number)
            const hex = "#" + channels.map(value => value.toString(16).padStart(2, "0")).join("")
            return { title, id: swatch.id, color: hex.toUpperCase() }
        }, step)
        await openSwatch(page, operation.title)
        if (step === "delete") await page.getByLabel("Delete swatch", { exact: true }).check()
        else if (step === "transparent") await page.getByLabel("Transparent", { exact: true }).check()
        else await page.getByLabel("HEX input", { exact: true }).fill(operation.color)
        await confirmEdit(page)
        const snapshot = await saveProject(page)
        const result = await page.evaluate(({ step, operation, snapshot }) => {
            const session = window.paletteProofSession
            session.recipe = window.paletteProof.applyAutoPaletteReplayEdit(session.recipe, step === "delete"
                ? { kind: "delete", id: operation.id }
                : { kind: "edit", id: operation.id, color: operation.color, transparent: step === "transparent" })
            return window.paletteProof.compare(session.recipe, session.source, snapshot)
        }, { step, operation, snapshot })
        expect(result.length).toBe(result.expectedLength)
        expect(result.mismatchBytes).toBe(0)
        evidence.push({ step, ...result })
    }
    await testInfo.attach("palette-operation-replay-evidence", {
        contentType: "application/json", body: Buffer.from(JSON.stringify(evidence, null, 2)),
    })
    expect(errors.flush()).toEqual([])
})

async function openSwatch(page: Page, title: string) {
    await page.getByTitle(title, { exact: true }).click({ button: "right" })
    await expect(page.getByText("SWATCH EDIT", { exact: true })).toBeVisible()
}

async function confirmEdit(page: Page) {
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByText("SWATCH EDIT", { exact: true })).toHaveCount(0)
}

async function saveProject(page: Page): Promise<ProjectSnapshotV2> {
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "Save Project", exact: true }).click()
    const download = await pending
    return JSON.parse(await readFile((await download.path())!, "utf8"))
}

async function canvasDigest(page: Page) {
    return page.locator("canvas").first().evaluate(async element => {
        if (!(element instanceof HTMLCanvasElement)) throw new Error("Expected editor canvas")
        const ctx = element.getContext("2d")
        if (!ctx) throw new Error("Missing context")
        const rgba = ctx.getImageData(0, 0, element.width, element.height)
        const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(rgba.data))
        return { width: element.width, height: element.height,
            sha256: Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("") }
    })
}
