import { expect, test, type Page } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import { animatedGifBytes, staticGifBytes } from "../fixtures/staticGifBytes"
import { controlledPng } from "../fixtures/staticRasterBytes"
import { installStableVisualEnvironment } from "./helpers"
import type * as Gate8Proof from "./gate8RunnerHarness"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"

declare global {
    interface Window { gate8Proof: typeof Gate8Proof }
}

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/gate8RunnerHarness.ts")],
        bundle: true, write: false, format: "iife", globalName: "gate8Proof" })
    proofBundle = built.outputFiles[0].text
})
test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

async function encodedRaster(page: Page, width: number, height: number, mime: "image/png" | "image/jpeg",
    color = "#e23b56"): Promise<number[]> {
    return page.evaluate(async ({ width, height, mime, color }) => {
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")!
        context.fillStyle = color
        context.fillRect(0, 0, width, height)
        context.fillStyle = "#163f7a"
        context.fillRect(width / 4, height / 4, width / 2, height / 2)
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
            value => value ? resolve(value) : reject(new Error("Fixture PNG/JPEG encode failed")), mime))
        return [...new Uint8Array(await blob.arrayBuffer())]
    }, { width, height, mime, color })
}

async function sealReference(page: Page, bytes: number[], mime: string,
    configure?: (page: Page) => Promise<void>): Promise<SealedReference> {
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles({ name: mime === "image/gif"
        ? "reference.gif" : "reference.png", mimeType: mime, buffer: Buffer.from(bytes) })
    await expect(page.getByRole("radio", { name: "Aspect ratio 1:1" })).toBeVisible()
    await page.getByRole("radio", { name: "Aspect ratio 1:1" }).click()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Set as Reference" })).toBeVisible()
    if (configure) await configure(page)
    await page.getByRole("button", { name: "Set as Reference" }).click()
    await expect(page.getByText("Reference sealed")).toBeVisible()
    const serialized = await page.getByTestId("gate5-sealed-reference").textContent()
    if (!serialized) throw new Error("Missing sealed Reference")
    await page.addScriptTag({ content: proofBundle })
    return JSON.parse(serialized) as SealedReference
}

test("Gate 8 renders PNG, JPEG and static GIF through exact sequential replay", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const jpeg = await encodedRaster(page, 1, 1, "image/jpeg", "#36a742")
    const sources: Gate8Proof.ControlledSource[] = [
        { name: "frame10.gif", type: "image/gif", bytes: [...staticGifBytes] },
        { name: "frame2.jpg", type: "image/jpeg", bytes: jpeg },
        { name: "frame1.png", type: "image/png", bytes: png },
    ]
    const proof = await page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources, [], { verifyIdentity: true }), { sealed, sources })
    expect(proof.manifest.overallStatus).toBe("ready")
    expect(proof.result.attempted).toBe(3)
    expect(proof.result.succeeded).toBe(3)
    expect(proof.result.outcomes.map(outcome => outcome.sourceFilename))
        .toEqual(["frame1.png", "frame2.jpg", "frame10.gif"])
    expect(proof.writes.map(write => write.outputName)).toEqual(["frame1.png", "frame2.png", "frame10.png"])
    for (const write of proof.writes) {
        expect(write.width).toBe(write.directWidth)
        expect(write.height).toBe(write.directHeight)
        expect(write.rgbaLength).toBe(write.directRgbaLength)
        expect(write.differentBytes).toBe(0)
    }
    expect(proof.result.resources).toEqual({ decodedOpened: 3, decodedClosed: 3,
        peakActiveDecoded: 1, sinkWriteAttempts: 3, sinkWriteSucceeded: 3 })
    expect(proof.peakSinkInFlight).toBe(1)
    expect(proof.recipeUnchanged).toBe(true)
    await test.info().attach("gate8-static-format-rgba-identity", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ recipe: sealed.recipe, writes: proof.writes,
            resources: proof.result.resources }, null, 2)) })
    if (process.env.GATE8_EVIDENCE === "1") {
        console.log("GATE8_IDENTITY", JSON.stringify({ project: test.info().project.name,
            case: "static-formats", writes: proof.writes, resources: proof.result.resources }))
    }
})

test("Gate 8 preserves exact-case output names as distinct planned outputs", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const sources: Gate8Proof.ControlledSource[] = ["Frame1.png", "frame1.png"].map(name =>
        ({ name, type: "image/png", bytes: png }))
    const proof = await page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources), { sealed, sources })
    expect(proof.manifest.collisions).toEqual([])
    expect(proof.writes.map(write => write.outputName)).toEqual(["Frame1.png", "frame1.png"])
})

test("Gate 8 uses nontrivial sealed Crop, Smart/WB, Grid, preset and Method without re-authoring", async ({ page }) => {
    test.setTimeout(120_000)
    const reference = await encodedRaster(page, 64, 48, "image/png", "#d5bd29")
    const sealed = await sealReference(page, reference, "image/png", async editor => {
        await editor.getByRole("button", { name: "Smart Object", exact: true }).click()
        await editor.locator('input[type="range"][max="1"]').fill("0.7")
        await editor.getByRole("button", { name: "Apply", exact: true }).click()
        const grid = editor.locator('input[type="range"][max="128"]')
        await grid.focus()
        const current = Number(await grid.inputValue())
        for (let step = 0; step < Math.abs(current - 24); step++) {
            await grid.press(current < 24 ? "ArrowRight" : "ArrowLeft")
        }
        await expect(grid).toHaveValue("24")
        await editor.getByRole("button", { name: /PALETTE PRESETS/i }).click()
        await editor.getByRole("button", { name: /^GRAY\b/ }).click()
        await editor.getByRole("button", { name: "METHOD", exact: true }).click()
        await editor.locator('button[data-axis="color-space"][data-color-space-id="hsv"]').click()
        await editor.locator('input[data-de-confetti-control="enabled"]').check()
        await editor.getByRole("button", { name: "Apply METHOD", exact: true }).click()
    })
    expect(sealed.referenceInputGeometry).toEqual({ width: 64, height: 48 })
    expect(sealed.recipe.smart.whiteBalance.kind).toBe("matrix")
    expect(sealed.recipe.grid.size).toBe(24)
    expect(sealed.recipe.palette.source).toBe("preset")
    expect(sealed.recipe.palette.colorSpace).toBe("hsv")
    const png = await encodedRaster(page, 64, 48, "image/png", "#298dcf")
    const baseline = await page.evaluate(({ sealed, reference }) => window.gate8Proof.runControlledBatch(sealed,
        [{ name: "different.png", type: "image/png", bytes: reference }], [], { verifyIdentity: true }),
    { sealed, reference })
    const proof = await page.evaluate(({ sealed, reference, png }) => window.gate8Proof.runControlledBatch(sealed,
        [{ name: "different.png", type: "image/png", bytes: reference }],
        [{ name: "different.png", kind: "replace", bytes: png, type: "image/png" }],
        { verifyIdentity: true }), { sealed, reference, png })
    expect(proof.result.succeeded).toBe(1)
    expect(proof.writes[0].differentBytes).toBe(0)
    expect(baseline.writes[0].differentBytes).toBe(0)
    expect(proof.writes[0].sha256).not.toBe(baseline.writes[0].sha256)
    expect(proof.recipeUnchanged).toBe(true)
    await test.info().attach("gate8-complex-recipe-rgba-identity", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ recipe: sealed.recipe, writes: proof.writes,
            resources: proof.result.resources }, null, 2)) })
    if (process.env.GATE8_EVIDENCE === "1") {
        console.log("GATE8_IDENTITY", JSON.stringify({ project: test.info().project.name,
            case: "complex-recipe", grid: sealed.recipe.grid, writes: proof.writes,
            resources: proof.result.resources }))
    }
})

test("Gate 8 revalidates changed files, keeps collision loser skipped and continues", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const pngWrong = await encodedRaster(page, 2, 2, "image/png")
    const jpeg = await encodedRaster(page, 1, 1, "image/jpeg")
    const sources: Gate8Proof.ControlledSource[] = [
        { name: "a.png", type: "image/png", bytes: png },
        { name: "b.png", type: "image/png", bytes: png },
        { name: "c.png", type: "image/png", bytes: png },
        { name: "d.png", type: "image/png", bytes: png },
        { name: "e.png", type: "image/png", bytes: png },
        { name: "f.png", type: "image/png", bytes: png },
        { name: "scananimated.gif", type: "image/gif", bytes: [...animatedGifBytes] },
        { name: "scanbad.webp", type: "image/webp", bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80] },
        { name: "scanwrong.png", type: "image/png", bytes: pngWrong },
        { name: "same.gif", type: "image/gif", bytes: [...staticGifBytes] },
        { name: "same.jpg", type: "image/jpeg", bytes: jpeg },
        { name: "z.jpg", type: "image/jpeg", bytes: jpeg },
    ]
    const mutations: Gate8Proof.ControlledMutation[] = [
        { name: "a.png", kind: "unreadable" },
        { name: "b.png", kind: "replace", bytes: [...animatedGifBytes], type: "image/gif" },
        { name: "c.png", kind: "replace", bytes: pngWrong, type: "image/png" },
        { name: "d.png", kind: "replace", bytes: jpeg, type: "image/jpeg" },
        { name: "e.png", kind: "replace", bytes: [...controlledPng(true)], type: "image/png" },
        { name: "f.png", kind: "replace", bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], type: "image/webp" },
        { name: "same.gif", kind: "replace", bytes: [...staticGifBytes].slice(0, -5), type: "image/gif" },
    ]
    const proof = await page.evaluate(({ sealed, sources, mutations }) =>
        window.gate8Proof.runControlledBatch(sealed, sources, mutations, { verifyIdentity: true }),
    { sealed, sources, mutations })
    expect(proof.manifest.processable.map(entry => entry.filename))
        .toEqual(["a.png", "b.png", "c.png", "d.png", "e.png", "f.png", "same.gif", "z.jpg"])
    expect(proof.result.outcomes.map(outcome => [outcome.sourceFilename, outcome.reason]))
        .toEqual([["a.png", "source-read-failed"], ["b.png", "animated-gif"],
            ["c.png", "geometry-mismatch"], ["d.png", null],
            ["e.png", "animated-png"], ["f.png", "unsupported-format"],
            ["same.gif", "invalid-or-corrupt"], ["z.jpg", null]])
    expect(proof.writes.map(write => write.outputName)).toEqual(["d.png", "z.png"])
    expect(proof.writes.every(write => write.differentBytes === 0)).toBe(true)
    expect(proof.readsDuringRun["same.jpg"]).toBe(0)
    expect(proof.readsDuringRun["scananimated.gif"]).toBe(0)
    expect(proof.readsDuringRun["scanbad.webp"]).toBe(0)
    expect(proof.readsDuringRun["scanwrong.png"]).toBe(0)
    expect(proof.writes.find(write => write.outputName === "same.png")).toBeUndefined()
    expect(proof.result.resources.decodedOpened).toBe(proof.result.resources.decodedClosed)
    expect(proof.result.resources.peakActiveDecoded).toBe(1)
})

test("Gate 8 missing handle, renamed source and sink failure stay frame-local", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const sources: Gate8Proof.ControlledSource[] = ["a.png", "b.png", "c.png", "d.png"].map(name =>
        ({ name, type: "image/png", bytes: png }))
    const mutations: Gate8Proof.ControlledMutation[] = [
        { name: "a.png", kind: "missing-handle" }, { name: "b.png", kind: "rename" },
    ]
    const proof = await page.evaluate(({ sealed, sources, mutations }) =>
        window.gate8Proof.runControlledBatch(sealed, sources, mutations, { failSinkFor: "c.png" }),
    { sealed, sources, mutations })
    expect(proof.result.outcomes.map(outcome => outcome.reason))
        .toEqual(["source-handle-missing", "source-changed", "sink-write-failed", null])
    expect(proof.writes.map(write => write.outputName)).toEqual(["d.png"])
    expect(proof.result.resources).toEqual({ decodedOpened: 2, decodedClosed: 2,
        peakActiveDecoded: 1, sinkWriteAttempts: 2, sinkWriteSucceeded: 1 })
})

test("Gate 8 PNG encode failure releases the frame and continues", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob
        let rejectNext = true
        HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
            if (rejectNext) { rejectNext = false; callback(null); return }
            original.call(this, callback, type, quality)
        }
    })
    const sources: Gate8Proof.ControlledSource[] = ["first.png", "second.png"].map(name =>
        ({ name, type: "image/png", bytes: png }))
    const proof = await page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources), { sealed, sources })
    expect(proof.result.outcomes.map(outcome => outcome.reason)).toEqual(["png-encode-failed", null])
    expect(proof.writes.map(write => write.outputName)).toEqual(["second.png"])
    expect(proof.result.resources.decodedOpened).toBe(2)
    expect(proof.result.resources.decodedClosed).toBe(2)
})

test("Gate 8 renderer failure releases the frame and continues", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.getContext
        let rejectNext = true
        HTMLCanvasElement.prototype.getContext = function(contextId: "2d",
            options?: CanvasRenderingContext2DSettings) {
            if (rejectNext) { rejectNext = false; return null }
            return original.call(this, contextId, options)
        } as typeof HTMLCanvasElement.prototype.getContext
    })
    const sources: Gate8Proof.ControlledSource[] = ["first.png", "second.png"].map(name =>
        ({ name, type: "image/png", bytes: png }))
    const proof = await page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources), { sealed, sources })
    expect(proof.result.outcomes.map(outcome => outcome.reason)).toEqual(["render-failed", null])
    expect(proof.writes.map(write => write.outputName)).toEqual(["second.png"])
    expect(proof.result.resources.decodedOpened).toBe(2)
    expect(proof.result.resources.decodedClosed).toBe(2)
})

test("Gate 8 fatal sink state aborts rather than continuing a potentially unsafe write", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const sources: Gate8Proof.ControlledSource[] = ["first.png", "second.png"].map(name =>
        ({ name, type: "image/png", bytes: png }))
    await expect(page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources, [], { fatalSinkFor: "first.png" }),
    { sealed, sources })).rejects.toThrow("Controlled fatal sink failure")
})

test("Gate 8 rejects invalid global recipe, geometry and runtime association before output", async ({ page }) => {
    const sealed = await sealReference(page, [...staticGifBytes], "image/gif")
    const png = await encodedRaster(page, 1, 1, "image/png")
    const source: Gate8Proof.ControlledSource = { name: "frame.png", type: "image/png", bytes: png }
    for (const kind of ["geometry", "association", "recipe"] as const) {
        const proof = await page.evaluate(({ sealed, source, kind }) =>
            window.gate8Proof.probeInvalidRunPlan(sealed, source, kind), { sealed, source, kind })
        expect(proof.rejected).toBe(true)
        expect(proof.message).toBeTruthy()
        expect(proof.sinkCalls).toBe(0)
    }
})

test("Gate 8 processes 50 live 512px frames without retaining decoded sources or PNG bytes", async ({ page }) => {
    test.setTimeout(240_000)
    const image = await encodedRaster(page, 512, 512, "image/png")
    const sealed = await sealReference(page, image, "image/png")
    const sources: Gate8Proof.ControlledSource[] = Array.from({ length: 50 }, (_, index) => ({
        name: `frame${index + 1}.png`, type: "image/png", bytes: image,
    }))
    const started = Date.now()
    const proof = await page.evaluate(({ sealed, sources }) =>
        window.gate8Proof.runControlledBatch(sealed, sources), { sealed, sources })
    const elapsedMs = Date.now() - started
    expect(proof.result.attempted).toBe(50)
    expect(proof.result.succeeded).toBe(50)
    expect(proof.result.resources).toEqual({ decodedOpened: 50, decodedClosed: 50,
        peakActiveDecoded: 1, sinkWriteAttempts: 50, sinkWriteSucceeded: 50 })
    const expected = Array.from({ length: 50 }, (_, index) => `frame${index + 1}.png`)
    expect(proof.result.outcomes.map(outcome => outcome.sourceFilename)).toEqual(expected)
    expect(proof.writes.map(write => write.outputName)).toEqual(expected)
    expect(proof.peakSinkInFlight).toBe(1)
    expect(proof.sinkRetainedBytesAfterWrite).toBe(0)
    expect(proof.writes.every(write => write.width > 0 && write.height > 0 && write.pngBytes > 0)).toBe(true)
    expect(JSON.stringify(proof.result)).not.toMatch(/data:image|base64|"png":|"bytes":/)
    await test.info().attach("gate8-50-frame-lifecycle", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ elapsedMs, resources: proof.result.resources,
            first: proof.writes[0], last: proof.writes.at(-1) }, null, 2)) })
    if (process.env.GATE8_EVIDENCE === "1") {
        console.log("GATE8_LONG_SEQUENCE", JSON.stringify({ project: test.info().project.name,
            elapsedMs, resources: proof.result.resources, first: proof.writes[0], last: proof.writes.at(-1) }))
    }
})
