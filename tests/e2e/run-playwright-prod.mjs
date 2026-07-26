import { spawn } from "node:child_process"
import path from "node:path"

const baseUrl = process.env.PIXTUDIO_PROD_BASE_URL ?? "https://pixtudio.app"
const args =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ["prod-health.spec.ts", "--project=desktop"]

const exitCode = await runPlaywright(args)
process.exit(exitCode)

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
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: baseUrl,
      },
      stdio: "inherit",
      shell: false,
    })

    child.on("exit", (code) => {
      resolve(code ?? 1)
    })
  })
}
