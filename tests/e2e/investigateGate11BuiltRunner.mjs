import { readFile, readdir, writeFile } from "node:fs/promises"
import { chromium } from "@playwright/test"
import { parseStoredZip } from "../fixtures/parseStoredZip.ts"
import { parseBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate.ts"

const folder = "C:/Users/Admin/Downloads/"
const sealed = parseBatchTemplate(await readFile(folder + "PIXTUDIO_Batch_Template.pixtudio-batch", "utf8"))
const archives = await Promise.all(["PIXTUDIO_gate9-owner-source_Completed_20260928T170318012Z.zip", "PIXTUDIO_gate9-owner-source_Completed_20260928T170810925Z.zip"].map(async file => parseStoredZip(await readFile(folder + file))))
const name = [...archives[0].keys()].filter(name => name.endsWith(".png")).sort()[0]
const sourceName = name.replace(/\.png$/, ".gif")
const source = await readFile("test-results/gate9-owner-source/" + sourceName)
const builtFile = (await readdir("dist/assets")).find(name => /^runBatchFrames-.*\.js$/.test(name))
if (!builtFile) throw new Error("Built runner missing")
const records = []
for (const software of [false, true]) {
    const browser = await chromium.launch({ channel: "chrome", headless: true, args: software ? ["--disable-gpu"] : [] })
    try {
        const page = await browser.newPage()
        await page.goto("http://127.0.0.1:5174/")
        const result = await page.evaluate(async ({ sourceName, source, sealed, pngs, builtFile }) => {
            const { scanSourceSet } = await import("/src/plugins/batchPixelation/sourceSet/scanSourceSet.ts")
            const { runBatchFrames } = await import("/src/plugins/batchPixelation/runner/runBatchFrames.ts")
            const built = await import("/dist/assets/" + builtFile)
            const bytes = base64 => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
            async function rgba(blob) {
                const bitmap = await createImageBitmap(blob)
                try {
                    const canvas = document.createElement("canvas")
                    canvas.width = bitmap.width; canvas.height = bitmap.height
                    const ctx = canvas.getContext("2d")
                    ctx.drawImage(bitmap, 0, 0)
                    return ctx.getImageData(0, 0, canvas.width, canvas.height).data
                } finally { bitmap.close() }
            }
            const [a, b] = await Promise.all(pngs.map(png => rgba(new Blob([bytes(png)], { type: "image/png" }))))
            const compare = (left, right) => {
                if (left.length !== right.length) throw new Error("RGBA size mismatch")
                let different = 0
                for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) different++
                return different
            }
            const file = new File([bytes(source)], sourceName, { type: "image/gif" })
            const handle = { kind: "file", name: sourceName, async getFile() { return file } }
            const directory = { kind: "directory", name: "ONE_OWNER_FRAME", async *values() { yield handle } }
            const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
            const outputs = []
            for (const [kind, run] of [["source", runBatchFrames], ["built", built.r]]) {
                for (let repeat = 0; repeat < 2; repeat++) {
                    const result = await run(sealed, scan.manifest, scan.runtime, { async writeFrame(frame) {
                        const actual = await rgba(frame.png)
                        outputs.push({ kind, repeat, vsA: compare(a, actual), vsB: compare(b, actual) })
                    } })
                    if (result.succeeded !== 1) throw new Error("Runner failed")
                }
            }
            return outputs
        }, { sourceName, source: source.toString("base64"), sealed, builtFile, pngs: archives.map(archive => Buffer.from(archive.get(name)).toString("base64")) })
        records.push({ software, outputs: result })
        console.log(JSON.stringify(records.at(-1), null, 2))
    } finally { await browser.close() }
}
await writeFile("docs/evidence/gate11-workflow/owner-built-runner.json", JSON.stringify({ name, builtFile, records }, null, 2))
