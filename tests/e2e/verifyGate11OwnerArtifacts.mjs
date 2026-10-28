import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import { chromium } from "@playwright/test"
import { parseBatchTemplate, serializeBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate.ts"
import { parseStoredZip } from "../fixtures/parseStoredZip.ts"

const folder = "C:/Users/Admin/Downloads/"
const freshC1 = process.argv.includes("--fresh-c1")
const files = freshC1
    ? ["PIXTUDIO_Batch_Template (1).pixtudio-batch", "PIXTUDIO_gate9-owner-source_Completed_20260929T135729244Z.zip", "PIXTUDIO_gate9-owner-source_Completed_20260929T141230513Z.zip"]
    : ["PIXTUDIO_Batch_Template.pixtudio-batch", "PIXTUDIO_gate9-owner-source_Completed_20260928T170318012Z.zip", "PIXTUDIO_gate9-owner-source_Completed_20260928T170810925Z.zip"]
const destination = freshC1 ? "docs/evidence/gate11-c1-owner-closure/" : "docs/evidence/gate11-workflow/"
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const inputs = await Promise.all(files.map(file => readFile(folder + file)))
const text = new TextDecoder("utf-8", { fatal: true }).decode(inputs[0])
const sealed = parseBatchTemplate(text)
assert.equal(serializeBatchTemplate(sealed), text)
const archives = inputs.slice(1).map(parseStoredZip)
const reports = archives.map(entries => new TextDecoder("utf-8", { fatal: true }).decode(entries.get("batch_report.txt")))
const names = [...archives[0].keys()].filter(name => name.endsWith(".png")).sort()
assert.deepEqual(names, [...archives[1].keys()].filter(name => name.endsWith(".png")).sort())
for (let i = 0; i < 2; i++) {
    assert.equal(Number(/^Succeeded: (\d+)$/m.exec(reports[i])?.[1]), names.length)
    assert.equal(archives[i].size, names.length + 1)
    assert.match(reports[i], /Completed/)
}
assert.equal(names.length, 100)
const browser = await chromium.launch({ channel: "chrome", headless: true })
const comparisons = []
try {
    const page = await browser.newPage()
    for (const name of names) {
        const pair = archives.map(entries => Buffer.from(entries.get(name)).toString("base64"))
        const result = await page.evaluate(async pair => {
            async function decode(base64) {
                const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
                const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }))
                try {
                    const canvas = document.createElement("canvas")
                    canvas.width = bitmap.width; canvas.height = bitmap.height
                    const context = canvas.getContext("2d")
                    context.drawImage(bitmap, 0, 0)
                    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }
                } finally { bitmap.close() }
            }
            const [a, b] = await Promise.all(pair.map(decode))
            let differentBytes = Math.abs(a.data.length - b.data.length)
            for (let i = 0; i < Math.min(a.data.length, b.data.length); i++) if (a.data[i] !== b.data[i]) differentBytes++
            return { width: a.width, height: a.height, secondWidth: b.width, secondHeight: b.height, differentBytes }
        }, pair)
        assert.equal(result.width, result.secondWidth)
        assert.equal(result.height, result.secondHeight)
        assert.equal(result.width, 495)
        assert.equal(result.height, 880)
        assert.equal(result.differentBytes, 0, name)
        comparisons.push({ name, ...result, encodedBytesIdentical: hash(archives[0].get(name)) === hash(archives[1].get(name)) })
    }
} finally { await browser.close() }
const evidence = {
    date: freshC1 ? "2026-09-29" : "2026-09-28", classification: "OWNER PROVIDED ARTIFACTS; DIRECT INSPECTION",
    ownerConfirmation: "Path A and Path B completed separately without deviations, as confirmed in chat",
    archiveMapping: "Chronological supplied ZIP order: first Path A, second Path B",
    files: files.map((name, i) => ({ name, bytes: inputs[i].length, sha256: hash(inputs[i]) })),
    template: { strictValidation: true, deterministicRoundTrip: true, sealed },
    reports, zipCrcAndLayoutVerified: true, pngCountPerArchive: names.length,
    comparisons, totalDifferentRgbaBytes: 0,
    limitations: "Owner actions are attested, not independently observed; physical Android and production readiness not asserted"
}
await mkdir(destination, { recursive: true })
await writeFile(destination + "owner-artifact-inspection.json", JSON.stringify(evidence, null, 2))
await copyFile(folder + files[0], destination + "owner-template.pixtudio-batch")
if (freshC1) {
    await copyFile(folder + files[1], destination + "owner-path-a.zip")
    await copyFile(folder + files[2], destination + "owner-path-b.zip")
}
console.log(JSON.stringify({ pngCountPerArchive: names.length, totalDifferentRgbaBytes: 0,
    encodedPngPairsIdentical: comparisons.filter(row => row.encodedBytesIdentical).length,
    dimensions: comparisons[0], reports, destination }, null, 2))
