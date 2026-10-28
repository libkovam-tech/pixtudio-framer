import { relative } from "node:path"
import { createHash } from "node:crypto"
import type { Plugin } from "vite"

export function batchProductionBoundary(worker = false): Plugin {
    let root = ""
    return {
        name: "batch-production-boundary",
        apply: "build",
        configResolved(config) { root = config.root },
        generateBundle(_options, bundle) {
            const modules = [...this.getModuleIds()].map(id => relative(root, id).replaceAll("\\", "/")).sort()
            const chunks = Object.values(bundle).filter(output => output.type === "chunk")
                .map(chunk => ({ file: chunk.fileName, imports: chunk.imports, dynamicImports: chunk.dynamicImports,
                    modules: Object.keys(chunk.modules).map(id => relative(root, id).replaceAll("\\", "/")).sort() }))
            const forbidden = modules
                .filter(id => /(?:^|\/)src\/plugins\/batchPixelation\/research\//.test(id))
            if (forbidden.length) this.error(`Research modules in production build: ${forbidden.join(", ")}`)
            const fingerprint = createHash("sha256").update(JSON.stringify(modules)).digest("hex").slice(0, 12)
            this.emitFile({ type: "asset", fileName: worker ? `batch-worker-production-modules-${fingerprint}.json` : "batch-production-modules.json",
                source: JSON.stringify({ version: 1, modules, chunks }, null, 2) })
        },
    }
}
