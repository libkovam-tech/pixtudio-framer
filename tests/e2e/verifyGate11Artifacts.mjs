import { readdir, readFile, writeFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { parseBatchTemplate, serializeBatchTemplate } from "../../src/plugins/batchPixelation/template/batchTemplate.ts"
import { parseStoredZip } from "../fixtures/parseStoredZip.ts"

const root = path.resolve(process.argv[2] ?? "test-results/gate11-final-regression")
const destination = path.resolve("docs/evidence/gate11-workflow")
const records = []
for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("gate11-template-workflow")) continue
    const directory = path.join(root, entry.name)
    const files = await readdir(directory)
    const profile = entry.name.endsWith("mobile") ? "mobile" : "desktop"
    const templateFile = files.find(name => name.endsWith(".pixtudio-batch"))
    const nativeWorkflow = files.includes("native-roundtrip.json")
    let record = { scenario: entry.name, profile, nativeWorkflow }
    if (templateFile) {
        const text = await readFile(path.join(directory, templateFile), "utf8")
        const sealed = parseBatchTemplate(text)
        if (serializeBatchTemplate(sealed) !== text) throw new Error("Non-deterministic saved template")
        const keys = []
        function inspect(value, prefix = "") {
            if (!value || typeof value !== "object") return
            for (const [key, nested] of Object.entries(value)) {
                if (Array.isArray(value)) continue
                const current = `${prefix}${key}`
                keys.push(current)
                if (/(bitmap|pixels|history|path|handle|manifest|runId|objectURL|mask)/i.test(key)) {
                    throw new Error(`Unexpected persisted field ${current}`)
                }
                if (Array.isArray(nested)) {
                    for (const child of nested) inspect(child, `${current}[].`)
                } else inspect(nested, `${current}.`)
            }
        }
        inspect(JSON.parse(text))
        const label = `${sealed.recipe.palette.source}-${profile}`
        const copy = `automated-${label}.pixtudio-batch`
        if (nativeWorkflow) await copyFile(path.join(directory, templateFile), path.join(destination, copy))
        record = { ...record, template: { file: nativeWorkflow ? copy : path.relative(root, path.join(directory, templateFile)), bytes: Buffer.byteLength(text), keys,
            sha256: createHash("sha256").update(text).digest("hex"), source: sealed.recipe.palette.source,
            validates: true, deterministic: true, prohibitedFields: [] } }
    }
    const archives = []
    for (const filename of files.filter(name => name.endsWith(".zip"))) {
        const bytes = await readFile(path.join(directory, filename))
        const entries = parseStoredZip(bytes)
        const report = new TextDecoder("utf-8", { fatal: true }).decode(entries.get("batch_report.txt"))
        const expected = /^Succeeded: (\d+)$/m.exec(report)
        if (!expected || entries.size - 1 !== Number(expected[1])) throw new Error("ZIP/report count mismatch")
        archives.push({ filename, bytes: bytes.length, pngCount: entries.size - 1,
            crcVerified: true, reportCountMatches: true, sha256: createHash("sha256").update(bytes).digest("hex") })
    }
    record.archives = archives
    for (const filename of ["native-roundtrip.json", "semantic-roundtrip.json", "second-independent-source.json"]) {
        if (!files.includes(filename)) continue
        const content = JSON.parse(await readFile(path.join(directory, filename), "utf8"))
        record[filename.replace(".json", "")] = content
    }
    if (record.template || archives.length || record["semantic-roundtrip"]) records.push(record)
}
if (records.filter(record => record.nativeWorkflow && record.template).length !== 4) throw new Error("Missing native Auto/Imported desktop/mobile template artifacts")
await writeFile(path.join(destination, "automated-artifact-inspection.json"), JSON.stringify({
    source: root, classification: "AUTOMATED ARTIFACTS; NOT OWNER MANUAL VALIDATION", records,
}, null, 2))
console.log(`Verified ${records.length} artifact groups; 4 actual browser-saved templates; deterministic identity, prohibited fields and ZIP CRC/counts checked.`)
