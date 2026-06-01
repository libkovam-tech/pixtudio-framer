import { spawn } from "node:child_process"
import http from "node:http"
import path from "node:path"

const host = "127.0.0.1"
const port = 4173
const baseUrl = `http://${host}:${port}`
const args = process.argv.slice(2)

const server = spawn(process.execPath, ["tests/e2e/serve-dist.mjs"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
})

server.stdout.on("data", (chunk) => {
  process.stdout.write(`[e2e-server] ${chunk}`)
})

server.stderr.on("data", (chunk) => {
  process.stderr.write(`[e2e-server] ${chunk}`)
})

let serverExited = false
server.on("exit", () => {
  serverExited = true
})

try {
  await waitForServer(baseUrl, 30_000)
  const exitCode = await runPlaywright(args)
  await stopServer()
  process.exit(exitCode)
} catch (error) {
  console.error(error)
  await stopServer()
  process.exit(1)
}

function runPlaywright(playwrightArgs) {
  return new Promise((resolve) => {
    const cli = path.resolve(
      process.cwd(),
      "node_modules",
      "playwright",
      "cli.js"
    )
    const child = spawn(process.execPath, [cli, "test", ...playwrightArgs], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    })

    child.on("exit", (code) => {
      resolve(code ?? 1)
    })
  })
}

function waitForServer(url, timeoutMs) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve()
          return
        }
        retry()
      })

      request.on("error", retry)
      request.setTimeout(1000, () => {
        request.destroy()
        retry()
      })
    }

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`))
        return
      }
      setTimeout(tick, 250)
    }

    tick()
  })
}

function stopServer() {
  return new Promise((resolve) => {
    if (serverExited) {
      resolve()
      return
    }

    const timeout = setTimeout(() => {
      if (!serverExited) server.kill("SIGKILL")
      resolve()
    }, 1500)

    server.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })

    server.kill("SIGTERM")
  })
}
