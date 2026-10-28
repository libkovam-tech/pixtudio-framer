import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import path from "node:path"
import { bearImagePath, fixturesDir, installStableVisualEnvironment } from "./helpers"
import { installCropCapture } from "./cropCapture"
import { animatedGifBytes, staticGifBytes } from "../fixtures/staticGifBytes"
import { controlledPng, insertPngMarkerPayload } from "../fixtures/staticRasterBytes"
import { inspectStaticRaster } from "../../src/plugins/batchPixelation/staticRasterPolicy"
import type * as Harness from "./canonicalDecodeHarness"

declare global { interface Window { canonicalDecodeProof: typeof Harness; gate6DecoderCalls: number } }
let harness: string
test.beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve("tests/e2e/canonicalDecodeHarness.ts")], bundle: true,
        write: false, format: "iife", globalName: "canonicalDecodeProof" })
    harness = result.outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
    await installStableVisualEnvironment(page)
    await installCropCapture(page)
})

async function compareRentedReference(page: Page, bytes: number[], name: string, mimeType: string) {
    const rented = await page.context().newPage()
    try {
        await installStableVisualEnvironment(rented)
        await installCropCapture(rented)
        await rented.goto("/__batch-gate5")
        await rented.locator("#gate5-reference-file").setInputFiles({
            name, mimeType, buffer: Buffer.from(bytes),
        })
        await expect(rented.getByRole("button", { name: "OK", exact: true })).toBeVisible()
        await rented.evaluate(() => { window.cropEvidence.armed = true })
        await rented.getByRole("button", { name: "OK", exact: true }).click()
        await expect.poll(() => rented.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
        await rented.addScriptTag({ content: harness })
        return await rented.evaluate(({ bytes, name, mimeType }) => {
            if (!window.cropEvidence.captured) throw new Error("Missing rented authoring decode")
            return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
                window.cropEvidence.captured, bytes, name, mimeType)
        }, { bytes, name, mimeType })
    } finally {
        await rented.close()
    }
}

function expectExactDecode(result: Awaited<ReturnType<typeof compareRentedReference>>) {
    expect(result.replayWidth).toBe(result.authoringWidth)
    expect(result.replayHeight).toBe(result.authoringHeight)
    expect(result.replayBytes).toBe(result.authoringBytes)
    expect(result.differentBytes).toBe(0)
    expect(result.replaySha256).toBe(result.authoringSha256)
}

async function recordControlledEvidence(testInfo: TestInfo, fixture: string,
    ordinary: Awaited<ReturnType<typeof compareRentedReference>>,
    rented: Awaited<ReturnType<typeof compareRentedReference>>) {
    const evidence = { project: testInfo.project.name, fixture, ordinary, rented }
    await testInfo.attach("gate6-controlled-decode-identity", {
        contentType: "application/json", body: Buffer.from(JSON.stringify(evidence, null, 2)),
    })
    if (process.env.GATE6_EVIDENCE === "1") console.log("GATE6_CONTROLLED_EVIDENCE", JSON.stringify(evidence))
}

async function exifRotatedJpeg(page: import("@playwright/test").Page) {
    return page.evaluate(async () => {
        const canvas = document.createElement("canvas")
        canvas.width = 2; canvas.height = 3
        const context = canvas.getContext("2d")!
        context.fillStyle = "#f00"; context.fillRect(0, 0, 1, 3)
        context.fillStyle = "#00f"; context.fillRect(1, 0, 1, 3)
        const blob = await new Promise<Blob>(resolve => canvas.toBlob(result => resolve(result!), "image/jpeg")!)
        const original = new Uint8Array(await blob.arrayBuffer())
        const exif = new Uint8Array([
            0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00,
            0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ])
        const output = new Uint8Array(original.length + exif.length)
        output.set(original.subarray(0, 2), 0)
        output.set(exif, 2)
        output.set(original.subarray(2), exif.length + 2)
        return [...output]
    })
}

for (const fixture of [
    { name: "PNG", path: bearImagePath, mimeType: "image/png" },
    { name: "JPEG", path: path.join(fixturesDir, "visual-regression/method-04-sunset.jpg"), mimeType: "image/jpeg" },
] as const) {
    test(`authoring and replay use identical static decode: ${fixture.name}`, async ({ page }, testInfo) => {
        const bytes = [...await readFile(fixture.path)]
        await page.goto("/editor/")
        const chooser = page.waitForEvent("filechooser")
        await page.getByRole("button", { name: "Open File" }).click()
        await (await chooser).setFiles(fixture.path)
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
        await page.addScriptTag({ content: harness })
        const result = await page.evaluate(({ bytes, name, mimeType }) => {
            if (!window.cropEvidence.captured) throw new Error("Missing authoring decode")
            return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
                window.cropEvidence.captured, bytes, name, mimeType)
        }, { bytes, name: path.basename(fixture.path), mimeType: fixture.mimeType })
        const rented = await compareRentedReference(page, bytes, path.basename(fixture.path), fixture.mimeType)
        expectExactDecode(result)
        expectExactDecode(rented)
        expect(rented.authoringSha256).toBe(result.authoringSha256)
        expect([rented.authoringWidth, rented.authoringHeight]).toEqual([result.authoringWidth, result.authoringHeight])
        await recordControlledEvidence(testInfo, fixture.name, result, rented)
    })
}

test("authoring and replay apply the same EXIF rotation", async ({ page }, testInfo) => {
    await page.goto("/editor/")
    const bytes = await exifRotatedJpeg(page)
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    await (await chooser).setFiles({ name: "orientation-6.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) })
    await page.evaluate(() => { window.cropEvidence.armed = true })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
    await page.addScriptTag({ content: harness })
    const result = await page.evaluate(({ bytes }) => {
        if (!window.cropEvidence.captured) throw new Error("Missing authoring decode")
        return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
            window.cropEvidence.captured, bytes, "orientation-6.jpg", "image/jpeg")
    }, { bytes })
    expect(result.authoringWidth).toBe(3)
    expect(result.authoringHeight).toBe(2)
    expect(result.replayWidth).toBe(3)
    expect(result.replayHeight).toBe(2)
    const rented = await compareRentedReference(page, bytes, "orientation-6.jpg", "image/jpeg")
    expectExactDecode(result)
    expectExactDecode(rented)
    expect([rented.authoringWidth, rented.authoringHeight]).toEqual([3, 2])
    expect(rented.authoringSha256).toBe(result.authoringSha256)
    await recordControlledEvidence(testInfo, "EXIF-orientation-6 JPEG", result, rented)
})

test("static GIF uses the same authoring/replay decode", async ({ page }, testInfo) => {
    await page.goto("/editor/")
    const bytes = [...staticGifBytes]
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    await (await chooser).setFiles({ name: "single-frame.gif", mimeType: "image/gif", buffer: Buffer.from(bytes) })
    await page.evaluate(() => { window.cropEvidence.armed = true })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
    await page.addScriptTag({ content: harness })
    const result = await page.evaluate(({ bytes }) => {
        if (!window.cropEvidence.captured) throw new Error("Missing authoring decode")
        return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
            window.cropEvidence.captured, bytes, "single-frame.gif", "image/gif")
    }, { bytes })
    expect(result.authoringWidth).toBe(1)
    expect(result.authoringHeight).toBe(1)
    expect(result.replayWidth).toBe(1)
    expect(result.replayHeight).toBe(1)
    expect(result.opaquePixels).toBe(1)
    const rented = await compareRentedReference(page, bytes, "single-frame.gif", "image/gif")
    expectExactDecode(result)
    expectExactDecode(rented)
    expect(rented.authoringSha256).toBe(result.authoringSha256)
    await recordControlledEvidence(testInfo, "single-frame GIF", result, rented)
})

test("PNG marker text is not mistaken for APNG in the rented Reference path", async ({ page }, testInfo) => {
    const bytes = [...insertPngMarkerPayload(new Uint8Array(await readFile(bearImagePath)))]
    await page.goto("/editor/")
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Open File" }).click()
    await (await chooser).setFiles({ name: "marker-text.png", mimeType: "image/png", buffer: Buffer.from(bytes) })
    await page.evaluate(() => { window.cropEvidence.armed = true })
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
    await page.addScriptTag({ content: harness })
    const ordinary = await page.evaluate(({ bytes }) => {
        if (!window.cropEvidence.captured) throw new Error("Missing ordinary authoring decode")
        return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
            window.cropEvidence.captured, bytes, "marker-text.png", "image/png")
    }, { bytes })
    const rented = await compareRentedReference(page, bytes, "marker-text.png", "image/png")
    expectExactDecode(ordinary)
    expectExactDecode(rented)
    expect(rented.authoringSha256).toBe(ordinary.authoringSha256)
    await recordControlledEvidence(testInfo, "PNG with marker-like tEXt", ordinary, rented)
})

test("rented Reference rejects animated, malformed and unsupported inputs before decode", async ({ page }) => {
    await page.addInitScript(() => {
        const original = window.createImageBitmap
        window.gate6DecoderCalls = 0
        window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
            window.gate6DecoderCalls++
            return original(...args)
        }) as typeof createImageBitmap
    })
    await page.goto("/__batch-gate5")
    for (const fixture of [
        { name: "animated.gif", mimeType: "image/gif", bytes: [...animatedGifBytes], message: "Animated GIF is not supported by Batch." },
        { name: "animated.png", mimeType: "image/png", bytes: [...controlledPng(true)], message: "Animated PNG is not supported by Batch." },
        { name: "broken.gif", mimeType: "image/gif", bytes: [...staticGifBytes.subarray(0, -1)], message: "The image container is invalid." },
        { name: "broken.png", mimeType: "image/png", bytes: [...controlledPng(false).subarray(0, -5)], message: "The image container is invalid." },
        { name: "image.webp", mimeType: "image/webp", bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], message: "This image format is not supported by Batch." },
        { name: "image.avif", mimeType: "image/avif", bytes: [0, 0, 0, 16, 102, 116, 121, 112, 97, 118, 105, 102], message: "This image format is not supported by Batch." },
    ]) {
        await page.locator("#gate5-reference-file").setInputFiles({
            name: fixture.name, mimeType: fixture.mimeType, buffer: Buffer.from(fixture.bytes),
        })
        await expect(page.getByRole("alert")).toHaveText(fixture.message)
        await expect(page.locator("#gate5-reference-file")).toBeVisible()
        await expect(page.getByRole("button", { name: "OK", exact: true })).toHaveCount(0)
        expect(await page.evaluate(() => window.gate6DecoderCalls)).toBe(0)
    }
    await page.locator("#gate5-reference-file").setInputFiles({
        name: "static.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await expect(page.getByRole("button", { name: "OK", exact: true })).toBeVisible()
    await expect(page.getByRole("alert")).toHaveCount(0)
})

test("animated GIF is rejected before the browser decoder", async ({ page }) => {
    await page.goto("/editor/")
    await page.addScriptTag({ content: harness })
    const result = await page.evaluate(({ bytes }) =>
        window.canonicalDecodeProof.inspectAnimatedRejection(bytes, "two-frames.gif", "image/gif"),
        { bytes: [...animatedGifBytes] })
    expect(result).toEqual({ rejected: true, code: "animated-gif", decoderCalls: 0 })
})

if (process.env.GATE6_OWNER_GIF_PATH) {
    test("Owner workflow static GIF has exact normal/rented/replay decode", async ({ page }, testInfo) => {
        test.setTimeout(90_000)
        const filePath = process.env.GATE6_OWNER_GIF_PATH!
        const bytes = [...await readFile(filePath)]
        const filename = path.basename(filePath)
        const header = String.fromCharCode(...bytes.slice(0, 6))
        const inspection = inspectStaticRaster(Uint8Array.from(bytes))
        expect(header === "GIF87a" || header === "GIF89a").toBe(true)
        expect(inspection).toEqual({ kind: "static", format: "gif" })
        await page.goto("/editor/")
        const chooser = page.waitForEvent("filechooser")
        await page.getByRole("button", { name: "Open File" }).click()
        await (await chooser).setFiles(filePath)
        await page.evaluate(() => { window.cropEvidence.armed = true })
        await page.getByRole("button", { name: "OK", exact: true }).click()
        await expect.poll(() => page.evaluate(() => !!window.cropEvidence.captured)).toBe(true)
        await page.addScriptTag({ content: harness })
        const ordinary = await page.evaluate(({ bytes, filename }) => {
            if (!window.cropEvidence.captured) throw new Error("Missing ordinary authoring decode")
            return window.canonicalDecodeProof.compareAuthoringAndReplayDecode(
                window.cropEvidence.captured, bytes, filename, "image/gif")
        }, { bytes, filename })
        const rented = await compareRentedReference(page, bytes, filename, "image/gif")
        expectExactDecode(ordinary)
        expectExactDecode(rented)
        expect([rented.authoringWidth, rented.authoringHeight])
            .toEqual([ordinary.authoringWidth, ordinary.authoringHeight])
        expect(rented.authoringSha256).toBe(ordinary.authoringSha256)
        const evidence = { filename, encodedBytes: bytes.length, header, declaredMimeType: "image/gif",
            inspection, ordinary, rented }
        await testInfo.attach("owner-static-gif-decode-identity", {
            contentType: "application/json", body: Buffer.from(JSON.stringify(evidence, null, 2)),
        })
        console.log("GATE6_OWNER_GIF_EVIDENCE", JSON.stringify({ project: testInfo.project.name, ...evidence }))
    })
}
