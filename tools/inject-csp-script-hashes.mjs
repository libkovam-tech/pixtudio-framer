import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const distDir = path.resolve("dist")
const headersPath = path.join(distDir, "_headers")

const headers = await readFile(headersPath, "utf8")
const htmlFiles = await findHtmlFiles(distDir)
const hashes = new Set()

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8")
  for (const script of extractInlineScripts(html)) {
    if (!script.content) continue
    hashes.add(
      `'sha256-${createHash("sha256").update(script.content).digest("base64")}'`
    )
  }
}

if (hashes.size === 0) {
  process.exit(0)
}

let injectedScriptSrc = false
const updated = headers.replace(
  /(Content-Security-Policy:[^\r\n]*)/u,
  (line) =>
    line.replace(/(script-src\s+)([^;]*)/u, (_match, prefix, sourceList) => {
      injectedScriptSrc = true
      const sources = new Set(sourceList.trim().split(/\s+/u).filter(Boolean))
      for (const hash of hashes) sources.add(hash)
      return `${prefix}${Array.from(sources).join(" ")}`
    })
)

if (!injectedScriptSrc) {
  throw new Error("Unable to find script-src in dist/_headers")
}

await writeFile(headersPath, updated)

async function findHtmlFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const nextPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findHtmlFiles(nextPath)))
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(nextPath)
    }
  }

  return files
}

function extractInlineScripts(html) {
  const scripts = []
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/giu

  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? ""
    if (/\bsrc\s*=/iu.test(attributes)) continue
    scripts.push({ attributes, content: match[2] ?? "" })
  }

  return scripts
}
