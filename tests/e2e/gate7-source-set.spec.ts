import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { staticGifBytes, animatedGifBytes } from "../fixtures/staticGifBytes"
import { controlledPng } from "../fixtures/staticRasterBytes"
import { installStableVisualEnvironment } from "./helpers"
import type { SourceSetManifest } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet"

type FolderFixture = {
    name: string
    pauseReads?: boolean
    entries: ({ kind: "file"; name: string; mimeType: string; bytes: number[] } |
        { kind: "directory"; name: string })[]
}

declare global {
    interface Window {
        gate7PickerCalls: number
        gate7NestedVisits: number
        gate7DecodeCalls: number
        gate7ReleaseRead?: () => void
    }
}

const MIME: Record<string, string> = {
    ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
}

async function rasterFixtures(page: Page) {
    return page.evaluate(async () => {
        async function encode(width: number, height: number, mimeType: string) {
            const canvas = document.createElement("canvas")
            canvas.width = width
            canvas.height = height
            const context = canvas.getContext("2d")!
            context.fillStyle = "#3b91d3"
            context.fillRect(0, 0, width, height)
            const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
                value => value ? resolve(value) : reject(new Error("Canvas encode failed")), mimeType))
            return [...new Uint8Array(await blob.arrayBuffer())]
        }
        const png1 = await encode(1, 1, "image/png")
        const png2 = await encode(2, 2, "image/png")
        const jpeg1 = await encode(1, 1, "image/jpeg")
        const jpeg2by3 = await encode(2, 3, "image/jpeg")
        const exif = new Uint8Array([
            0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00,
            0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ])
        return {
            png1, png2, jpeg1,
            orientedJpeg: [...jpeg2by3.slice(0, 2), ...exif, ...jpeg2by3.slice(2)],
        }
    })
}

async function createFolderFixture(testInfo: TestInfo, name: string,
    files: Record<string, number[]>): Promise<FolderFixture> {
    const directory = testInfo.outputPath(name)
    await mkdir(directory, { recursive: true })
    for (const [relativePath, bytes] of Object.entries(files)) {
        const target = path.join(directory, relativePath)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, Buffer.from(bytes))
    }
    const entries: FolderFixture["entries"] = []
    for (const entry of (await readdir(directory, { withFileTypes: true })).reverse()) {
        if (entry.isDirectory()) {
            entries.push({ kind: "directory", name: entry.name })
        } else {
            const bytes = await readFile(path.join(directory, entry.name))
            entries.push({ kind: "file", name: entry.name,
                mimeType: MIME[path.extname(entry.name).toLowerCase()] ?? "application/octet-stream",
                bytes: [...bytes] })
        }
    }
    return { name, entries }
}

async function injectFolderPicker(page: Page, folders: (FolderFixture | "cancel" | "fail" | "scan-abort")[]) {
    await page.addInitScript((selections) => {
        window.gate7PickerCalls = 0
        window.gate7NestedVisits = 0
        const original = window.createImageBitmap
        window.gate7DecodeCalls = 0
        window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
            window.gate7DecodeCalls++
            return original(...args)
        }) as typeof createImageBitmap
        let next = 0
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: async () => {
            window.gate7PickerCalls++
            const selection = selections[next++]
            if (selection === "cancel") throw new DOMException("Cancelled", "AbortError")
            if (selection === "fail" || selection === "scan-abort") return { kind: "directory", name: "DENIED", values() {
                throw new DOMException(selection === "fail" ? "Access denied" : "Read interrupted",
                    selection === "fail" ? "NotAllowedError" : "AbortError")
            } }
            if (!selection) throw new Error("No controlled Source Folder remains")
            return { kind: "directory", name: selection.name, async *values() {
                for (const entry of selection.entries) {
                    if (entry.kind === "directory") {
                        yield { kind: "directory", name: entry.name, values() {
                            window.gate7NestedVisits++
                            throw new Error("Nested folder must not be visited")
                        } }
                    } else {
                        yield { kind: "file", name: entry.name, async getFile() {
                            if (selection.pauseReads) await new Promise<void>(resolve => {
                                window.gate7ReleaseRead = resolve
                            })
                            return new File([Uint8Array.from(entry.bytes)], entry.name, { type: entry.mimeType })
                        } }
                    }
                }
            } }
        } })
    }, folders)
}

async function sealOnePixelReference(page: Page) {
    await page.goto("/__batch-gate5")
    await page.locator("#gate5-reference-file").setInputFiles({
        name: "reference.gif", mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })
    await expect(page.getByRole("button", { name: "OK", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "OK", exact: true }).click()
    await expect(page.getByRole("button", { name: "Set as Reference" })).toBeVisible()
    await page.getByRole("button", { name: "Set as Reference" }).click()
    await expect(page.getByText("Reference sealed")).toBeVisible()
}

async function chooseFolder(page: Page): Promise<SourceSetManifest> {
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByTestId("gate7-source-manifest")).not.toBeEmpty()
    return JSON.parse(await page.getByTestId("gate7-source-manifest").textContent() ?? "")
}

test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

test("Gate 7 test Chrome exposes the production folder capability", async ({ page }) => {
    await page.goto("/__batch-gate5")
    expect(await page.evaluate(() => typeof window.showDirectoryPicker)).toBe("function")
})

test("Gate 7 iPad can choose multiple source files while retaining folder selection", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "userAgent", { configurable: true,
            value: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15" })
        Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 })
    })
    await sealOnePixelReference(page)
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toBeVisible()
    const picker = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Choose Source Files" }).click()
    const chooser = await picker
    expect(chooser.isMultiple()).toBe(true)
    await chooser.setFiles(["frame2.gif", "frame1.gif"].map(name => ({
        name, mimeType: "image/gif", buffer: Buffer.from(staticGifBytes),
    })))
    await expect(page.getByTestId("gate7-source-manifest")).not.toBeEmpty()
    const manifest: SourceSetManifest = JSON.parse(await page.getByTestId("gate7-source-manifest").textContent() ?? "")
    expect(manifest.folderDisplayName).toBe("Selected frames")
    expect(manifest.overallStatus).toBe("ready")
    expect(manifest.processable.map(frame => frame.filename)).toEqual(["frame1.gif", "frame2.gif"])
    await expect(page.getByTestId("gate7-runtime-count")).toHaveText("2")
})

test("Gate 7 panel leaves the rented editor Grid slider pointer-accessible", async ({ page }) => {
    await sealOnePixelReference(page)
    const slider = page.locator('input[type="range"][max="128"]')
    const box = await slider.boundingBox()
    expect(box).not.toBeNull()
    const y = box!.y + box!.height / 2
    for (const x of [box!.x + box!.width / 2, box!.x + 8 + (22 / 126) * (box!.width - 16)]) {
        const hitIsSlider = await page.evaluate(({ x, y }) => {
            const target = document.elementFromPoint(x, y)
            return target?.matches('input[type="range"][max="128"]') ?? false
        }, { x, y })
        expect(hitIsSlider).toBe(true)
    }
})

test("Gate 7 mixed Source Folder produces deterministic ready manifest", async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const image = await rasterFixtures(page)
    const folder = await createFolderFixture(testInfo, "SOURCE", {
        "01_animated.gif": [...animatedGifBytes],
        "01_apng.png": [...controlledPng(true)],
        "02_first.png": image.png1,
        "bad.webp": [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
        "badname.gif": [...animatedGifBytes],
        "badname.png": image.png1,
        "corrupt.png": [...controlledPng(false).subarray(0, -5)],
        "frame1.png": image.png1,
        "frame2.jpg": image.jpeg1,
        "frame10.gif": [...staticGifBytes],
        "oriented.jpg": image.orientedJpeg,
        "same.gif": [...staticGifBytes],
        "same.jpg": image.jpeg1,
        "wrong.png": image.png2,
        "nested/valid.png": image.png1,
    })
    await injectFolderPicker(page, [folder, { ...folder, entries: [...folder.entries].reverse() }])
    await sealOnePixelReference(page)
    const manifest = await chooseFolder(page)
    expect(manifest.referenceInputGeometry).toEqual({ width: 1, height: 1 })
    expect(manifest.sourceGeometry).toEqual({ width: 1, height: 1 })
    expect(manifest.overallStatus).toBe("ready")
    expect(manifest.orderedCandidates.map(candidate => candidate.filename)).toEqual([
        "01_animated.gif", "01_apng.png", "02_first.png", "bad.webp", "badname.gif",
        "badname.png", "corrupt.png", "frame1.png", "frame2.jpg", "frame10.gif",
        "oriented.jpg", "same.gif", "same.jpg", "wrong.png",
    ])
    expect(manifest.processable.map(candidate => [candidate.filename, candidate.outputName])).toEqual([
        ["02_first.png", "02_first.png"], ["badname.png", "badname.png"],
        ["frame1.png", "frame1.png"], ["frame2.jpg", "frame2.png"],
        ["frame10.gif", "frame10.png"], ["same.gif", "same.png"],
    ])
    expect(manifest.skipped.map(candidate => [candidate.filename, candidate.reason])).toEqual([
        ["01_animated.gif", "animated-gif"], ["01_apng.png", "animated-png"],
        ["bad.webp", "unsupported-format"], ["badname.gif", "animated-gif"],
        ["corrupt.png", "invalid-or-corrupt"], ["oriented.jpg", "geometry-mismatch"],
        ["same.jpg", "output-name-collision"], ["wrong.png", "geometry-mismatch"],
    ])
    expect(manifest.orderedCandidates.find(candidate => candidate.filename === "oriented.jpg")?.decodedGeometry)
        .toEqual({ width: 3, height: 2 })
    expect(manifest.collisions).toEqual([{
        outputName: "same.png", winnerIndex: 11, winnerFilename: "same.gif",
        skippedIndex: 12, skippedFilename: "same.jpg",
    }])
    expect(manifest.counts).toEqual({ candidates: 14, processable: 6, skipped: 8, collisions: 1 })
    expect(await page.getByTestId("gate7-runtime-count").textContent()).toBe("14")
    expect(await page.evaluate(() => window.gate7NestedVisits)).toBe(0)
    expect(JSON.stringify(manifest)).not.toContain(testInfo.outputDir)
    await testInfo.attach("gate7-ready-manifest", {
        contentType: "application/json", body: Buffer.from(JSON.stringify(manifest, null, 2)),
    })
    const again = await chooseFolder(page)
    expect(again).toEqual(manifest)
    expect(await page.evaluate(() => window.gate7PickerCalls)).toBe(2)
})

test("Gate 7 first valid mismatch blocks the entire Source Set", async ({ page }, testInfo) => {
    const image = await rasterFixtures(page)
    const folder = await createFolderFixture(testInfo, "MISMATCH", {
        "01_bad_animated.gif": [...animatedGifBytes],
        "02_first_valid.png": image.png2,
        "03_reference_size.png": image.png1,
    })
    await injectFolderPicker(page, [folder])
    await sealOnePixelReference(page)
    const manifest = await chooseFolder(page)
    expect(manifest.sourceGeometry).toEqual({ width: 2, height: 2 })
    expect(manifest.overallStatus).toBe("blocked-reference-geometry")
    expect(manifest.processable).toEqual([])
    expect(manifest.orderedCandidates.map(candidate => candidate.skipReason))
        .toEqual(["animated-gif", "reference-geometry-incompatible", "geometry-mismatch"])
    expect(manifest.orderedCandidates[2].decodedGeometry).toEqual({ width: 1, height: 1 })
})

test("Gate 7 no-valid folder does not decode rejected frames", async ({ page }, testInfo) => {
    const image = await rasterFixtures(page)
    const folder = await createFolderFixture(testInfo, "NO_VALID", {
        "01_animated.gif": [...animatedGifBytes],
        "02_apng.png": [...controlledPng(true)],
        "03_corrupt.png": [...controlledPng(false).subarray(0, -5)],
        "04_unsupported.webp": [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80],
        "nested/valid.png": image.png1,
    })
    await injectFolderPicker(page, [folder])
    await sealOnePixelReference(page)
    const before = await page.evaluate(() => window.gate7DecodeCalls)
    const manifest = await chooseFolder(page)
    expect(manifest.sourceGeometry).toBeNull()
    expect(manifest.overallStatus).toBe("no-valid-source-frames")
    expect(manifest.processable).toEqual([])
    expect(manifest.counts).toEqual({ candidates: 4, processable: 0, skipped: 4, collisions: 0 })
    expect(await page.evaluate(() => window.gate7DecodeCalls)).toBe(before)
    expect(await page.evaluate(() => window.gate7NestedVisits)).toBe(0)
})

test("Gate 7 empty selected folder has an explicit no-valid manifest", async ({ page }) => {
    await injectFolderPicker(page, [{ name: "EMPTY", entries: [] }])
    await sealOnePixelReference(page)
    const manifest = await chooseFolder(page)
    expect(manifest.folderDisplayName).toBe("EMPTY")
    expect(manifest.overallStatus).toBe("no-valid-source-frames")
    expect(manifest.counts).toEqual({ candidates: 0, processable: 0, skipped: 0, collisions: 0 })
})

test("Gate 7 cancelled selection preserves the old manifest; replacement does not merge folders", async ({ page }, testInfo) => {
    const image = await rasterFixtures(page)
    const first = await createFolderFixture(testInfo, "FIRST", { "frame1.png": image.png1 })
    const second = await createFolderFixture(testInfo, "SECOND", {
        "animated.gif": [...animatedGifBytes],
    })
    await injectFolderPicker(page, [first, "cancel", { ...second, pauseReads: true }])
    await sealOnePixelReference(page)
    const initial = await chooseFolder(page)
    expect(initial.overallStatus).toBe("ready")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect.poll(async () => page.getByTestId("gate7-source-manifest").textContent())
        .toBe(JSON.stringify(initial))
    await expect(page.getByText("Folder selection was cancelled or not permitted. Source Set unchanged."))
        .toBeVisible()
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("region", { name: "Source Set" }).getByRole("status"))
        .toContainText("Scanning Source Set...")
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
    await expect.poll(() => page.evaluate(() => typeof window.gate7ReleaseRead)).toBe("function")
    await page.evaluate(() => window.gate7ReleaseRead?.())
    await expect(page.getByTestId("gate7-source-manifest")).not.toBeEmpty()
    const replacement: SourceSetManifest = JSON.parse(
        await page.getByTestId("gate7-source-manifest").textContent() ?? "")
    expect(replacement.overallStatus).toBe("no-valid-source-frames")
    expect(replacement.folderDisplayName).toBe("SECOND")
    expect(replacement.orderedCandidates.map(candidate => candidate.filename)).toEqual(["animated.gif"])
    expect(replacement.processable).toEqual([])
})

test("Gate 7 global scan failure clears the previous manifest", async ({ page }, testInfo) => {
    const image = await rasterFixtures(page)
    const first = await createFolderFixture(testInfo, "FIRST", { "frame1.png": image.png1 })
    await injectFolderPicker(page, [first, "fail"])
    await sealOnePixelReference(page)
    expect((await chooseFolder(page)).overallStatus).toBe("ready")
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("alert")).toContainText("Source folder or files became unavailable during scan. Choose the folder again.")
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
})

test("Gate 7 interrupted scan exits scanning state with explicit failure", async ({ page }) => {
    await injectFolderPicker(page, ["scan-abort"])
    await sealOnePixelReference(page)
    await page.getByRole("button", { name: "Choose Source Folder" }).click()
    await expect(page.getByRole("alert")).toContainText("Read interrupted")
    await expect(page.getByRole("status", { name: "Scanning Source Set..." })).toHaveCount(0)
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
})

test("Gate 7 unsupported folder capability has no fallback picker", async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, "showDirectoryPicker", { configurable: true, value: undefined })
        Object.defineProperty(HTMLInputElement.prototype, "webkitdirectory", { configurable: true, value: undefined })
    })
    await sealOnePixelReference(page)
    await expect(page.getByRole("alert")).toHaveText("Folder selection is not supported in this browser.")
    await expect(page.getByRole("button", { name: "Choose Source Folder" })).toHaveCount(0)
    await expect(page.getByTestId("gate7-source-manifest")).toBeEmpty()
})
