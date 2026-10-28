import { readFile, readdir, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { chromium } from "@playwright/test"
import { parseStoredZip } from "../fixtures/parseStoredZip.ts"
import { parseBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate.ts"

const destination = "docs/evidence/gate11-workflow/"
const templateText = await readFile("C:/Users/Admin/Downloads/PIXTUDIO_Batch_Template.pixtudio-batch", "utf8")
const sealed = parseBatchTemplate(templateText)
const filenames = ["PIXTUDIO_gate9-owner-source_Completed_20260928T170318012Z.zip", "PIXTUDIO_gate9-owner-source_Completed_20260928T170810925Z.zip"]
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const archiveBytes = await Promise.all(filenames.map(name => readFile("C:/Users/Admin/Downloads/" + name)))
const archives = archiveBytes.map(parseStoredZip)
const names = [...archives[0].keys()].filter(name => name.endsWith(".png")).sort()
const sourceDirectory = "test-results/gate9-owner-source/"
const sourceNames = await readdir(sourceDirectory)
const sourceBytes = new Map(await Promise.all(sourceNames.map(async name => [name, await readFile(sourceDirectory + name)])))
const software = process.argv.includes("--software")
const browser = await chromium.launch({ channel: "chrome", headless: true, args: software ? ["--disable-gpu"] : [] })
const records = []
try {
    const page = await browser.newPage()
    await page.goto("http://127.0.0.1:5174/")
    const replayCache = new Map()
    for (const name of names) {
        const sourceName = name.replace(/\.png$/, ".gif")
        const source = sourceBytes.get(sourceName)
        if (!source || !archives[1].has(name)) throw new Error("Missing matching source/output")
        const sourceHash = hash(source)
        const payload = { name: sourceName, source: source.toString("base64"), sealed,
            pngs: archives.map(archive => Buffer.from(archive.get(name)).toString("base64")),
            replay: !replayCache.has(sourceHash) }
        const result = await page.evaluate(async ({ name, source, sealed, pngs, replay }) => {
            const bytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
            async function rgba(base64) {
                const bitmap = await createImageBitmap(new Blob([bytes(base64)], { type: "image/png" }))
                try {
                    const canvas = document.createElement("canvas")
                    canvas.width = bitmap.width; canvas.height = bitmap.height
                    const context = canvas.getContext("2d")
                    context.drawImage(bitmap, 0, 0)
                    return context.getImageData(0, 0, canvas.width, canvas.height)
                } finally { bitmap.close() }
            }
            function compare(a, b) {
                if (a.width !== b.width || a.height !== b.height) throw new Error("Geometry mismatch")
                const channelDifferences = [0, 0, 0, 0]
                let differentPixels = 0
                for (let i = 0; i < a.data.length; i += 4) {
                    let changed = false
                    for (let channel = 0; channel < 4; channel++) if (a.data[i + channel] !== b.data[i + channel]) {
                        channelDifferences[channel]++; changed = true
                    }
                    if (changed) differentPixels++
                }
                return { width: a.width, height: a.height, differentPixels,
                    differentBytes: channelDifferences.reduce((a, b) => a + b, 0), channelDifferences }
            }
            const images = await Promise.all(pngs.map(rgba))
            const comparison = compare(images[0], images[1])
            if (!replay) return { comparison }
            const { decodeAndValidateRasterImageFile } = await import("/src/editor/fileIntakeSecurity.ts")
            const { renderFinalFrame } = await import("/src/plugins/batchPixelation/render/finalFrame.ts")
            const file = new File([bytes(source)], name, { type: "image/gif" })
            const replayOutputs = []
            const replayImages = []
            for (let repeat = 0; repeat < 3; repeat++) {
                const bitmap = await decodeAndValidateRasterImageFile(file)
                try {
                    const canvas = renderFinalFrame(bitmap, sealed.recipe)
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
                    if (!blob) throw new Error("PNG encode failed")
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onload = () => resolve(reader.result.split(",")[1])
                        reader.onerror = () => reject(reader.error ?? new Error("Diagnostic PNG read failed"))
                        reader.readAsDataURL(blob)
                    })
                    const image = await rgba(base64)
                    replayImages.push(image)
                    replayOutputs.push({ vsA: compare(images[0], image), vsB: compare(images[1], image),
                        vsFirstReplay: compare(replayImages[0], image), png: repeat === 0 ? base64 : null })
                    canvas.width = 0; canvas.height = 0
                } finally { bitmap.close() }
            }
            return { comparison, replayOutputs }
        }, payload)
        if (result.replayOutputs) {
            const png = result.replayOutputs[0].png
            if (records.length === 0 && !software) {
                await writeFile(destination + "owner-first-A.png", archives[0].get(name))
                await writeFile(destination + "owner-first-B.png", archives[1].get(name))
                await writeFile(destination + "owner-first-replay.png", Buffer.from(png, "base64"))
            }
            for (const output of result.replayOutputs) delete output.png
            replayCache.set(sourceHash, { aSha256: hash(archives[0].get(name)), bSha256: hash(archives[1].get(name)), outputs: result.replayOutputs })
        }
        const cached = replayCache.get(sourceHash)
        if (cached.aSha256 !== hash(archives[0].get(name)) || cached.bSha256 !== hash(archives[1].get(name))) {
            throw new Error("Identical source bytes produced different archived outputs; representative replay cannot be reused")
        }
        records.push({ name, sourceName, sourceSha256: sourceHash,
            aSha256: hash(archives[0].get(name)), bSha256: hash(archives[1].get(name)),
            ...result, replayOutputs: cached.outputs })
    }
    const evidence = { date: "2026-09-28", browser: await browser.version(), software,
        archiveFiles: filenames.map((name, i) => ({ name, sha256: hash(archiveBytes[i]) })),
        templateSha256: hash(templateText), template: sealed, sourceDirectory,
        reports: archives.map(archive => new TextDecoder().decode(archive.get("batch_report.txt"))),
        uniqueSourceCount: replayCache.size, totalPairs: records.length,
        mismatchingPairs: records.filter(record => record.comparison.differentBytes !== 0).length,
        records }
    await writeFile(destination + (software ? "owner-investigation-software.json" : "owner-investigation.json"), JSON.stringify(evidence, null, 2))
    console.log(JSON.stringify({ totalPairs: records.length, mismatchingPairs: evidence.mismatchingPairs,
        uniqueSourceCount: replayCache.size, first: records[0],
        replayMatchesA: records.filter(record => record.replayOutputs[0].vsA.differentBytes === 0).length,
        replayMatchesB: records.filter(record => record.replayOutputs[0].vsB.differentBytes === 0).length,
        unstableReplays: records.filter(record => record.replayOutputs.some(output => output.vsFirstReplay.differentBytes !== 0)).length }, null, 2))
} finally { await browser.close() }
