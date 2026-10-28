import assert from "node:assert/strict"
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const root = process.cwd()
const modules = new Set()
const edges = []
const relative = file => path.relative(root, file).replaceAll("\\", "/")
async function resolveLocal(from, specifier) {
    const base = path.resolve(path.dirname(from), specifier.split("?")[0])
    for (const candidate of [base, base + ".ts", base + ".tsx", base + ".js", path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        try { if ((await stat(candidate)).isFile()) return candidate }
        catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error }
    }
    throw new Error(`Unresolved local import ${relative(from)} -> ${specifier}`)
}
async function visit(file) {
    if (modules.has(file)) return
    modules.add(file)
    if (!/\.[cm]?[jt]sx?$/.test(file)) return
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true)
    const imports = []
    function walk(node) {
        if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
            const bindings = node.importClause?.namedBindings
            const onlyTypes = !node.importClause?.name && bindings && ts.isNamedImports(bindings)
                && bindings.elements.length > 0 && bindings.elements.every(value => value.isTypeOnly)
            if (!onlyTypes) imports.push(node.moduleSpecifier.text)
        } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
            const onlyTypes = node.exportClause && ts.isNamedExports(node.exportClause)
                && node.exportClause.elements.length > 0 && node.exportClause.elements.every(value => value.isTypeOnly)
            if (!onlyTypes) imports.push(node.moduleSpecifier.text)
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            assert.equal(node.arguments.length, 1, "Unexpected dynamic import arity")
            assert.ok(ts.isStringLiteral(node.arguments[0]), "Non-literal dynamic import needs an explicit boundary audit")
            imports.push(node.arguments[0].text)
        }
        ts.forEachChild(node, walk)
    }
    walk(source)
    for (const specifier of imports.filter(value => value.startsWith("."))) {
        const target = await resolveLocal(file, specifier)
        edges.push({ from: relative(file), to: relative(target) })
        await visit(target)
    }
}
await visit(path.resolve("src/main.tsx"))
const forbiddenModule = file => /(?:^|\/)src\/plugins\/batchPixelation\/research\//.test(file)
const sourceResearch = [...modules].map(relative).filter(forbiddenModule)
assert.deepEqual(sourceResearch, [], "Production source depends on research")
const graph = JSON.parse(await readFile("dist/batch-production-modules.json", "utf8"))
assert.equal(graph.version, 1)
assert.ok(graph.chunks.length > 0)
assert.ok(Array.isArray(graph.modules) && graph.modules.length > 0)
const workerGraphs = []
for (const name of await readdir("dist")) {
    if (name.startsWith("batch-worker-production-modules-") && name.endsWith(".json")) {
        const workerGraph = JSON.parse(await readFile(path.join("dist", name), "utf8"))
        assert.equal(workerGraph.version, 1)
        assert.ok(workerGraph.modules.length > 0)
        workerGraphs.push({ file: name, ...workerGraph })
    }
}
const buildResearch = [...graph.modules, ...workerGraphs.flatMap(worker => worker.modules)].filter(forbiddenModule)
assert.deepEqual(buildResearch, [], "Production build graph contains research")
const forbiddenText = ["/__batch-raf-validation", "RafValidationRoute", "RESEARCH ONLY", "rafValidationSession", "rafValidationEvidence", "rafValidationExactness"]
const scanned = []
async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isDirectory()) { await scan(file); continue }
        const name = relative(file)
        assert.ok(!/research|rafValidation/i.test(name), `Research-named artifact: ${name}`)
        const bytes = await readFile(file)
        for (const needle of forbiddenText) assert.ok(!bytes.includes(Buffer.from(needle)), `Research marker ${needle} in ${name}`)
        scanned.push({ file: name, size: bytes.length })
    }
}
await scan("dist")
console.log(JSON.stringify({ status: "PASS", checkedAt: new Date().toISOString(),
    productionRuntimeResearchModules: sourceResearch.length, productionBuildResearchModules: buildResearch.length,
    runtimeModules: [...modules].map(relative).sort(), edges, buildModules: graph.modules, buildChunks: graph.chunks, workerGraphs, scanned }, null, 2))
