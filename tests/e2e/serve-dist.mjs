import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "../../dist")
const host = "127.0.0.1"
const port = 4173

const mimeTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
])

const server = createServer((request, response) => {
  const requestedUrl = new URL(request.url || "/", `http://${host}:${port}`)
  const filePath = resolveFilePath(requestedUrl.pathname)

  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    response.end("Not found")
    return
  }

  const ext = path.extname(filePath)
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}`)
})

function resolveFilePath(pathname) {
  const decodedPath = decodeURIComponent(pathname)
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "")
  const candidates = []

  if (normalizedPath.endsWith("/")) {
    candidates.push(path.join(root, normalizedPath, "index.html"))
  } else {
    candidates.push(path.join(root, normalizedPath))
    candidates.push(path.join(root, normalizedPath, "index.html"))
  }

  candidates.push(path.join(root, "index.html"))

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue
    if (!existsSync(candidate)) continue
    if (!statSync(candidate).isFile()) continue
    return candidate
  }

  return null
}

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 1000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
