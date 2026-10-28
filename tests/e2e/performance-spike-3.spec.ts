import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { makePerformanceSources, sealPerformanceReference } from "./performanceReferenceFixture"
import type * as Spike3 from "./performanceSpike3Harness"

declare global { interface Window { performanceSpike3: typeof Spike3 } }
let bundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/performanceSpike3Harness.ts")],
        bundle: true, write: false, format: "iife", globalName: "performanceSpike3" })
    bundle = built.outputFiles[0].text
})

for (const round of [1, 2]) {
    test(`Spike 3 fresh headed documents round ${round}`, async ({ page, browser }, testInfo) => {
        test.setTimeout(600_000)
        const cdp = await browser.newBrowserCDPSession()
        const processes = await cdp.send("SystemInfo.getProcessInfo") as { processInfo: { type: string; id: number }[] }
        const pid = processes.processInfo.find(process => process.type === "browser")?.id
        if (!pid || !Number.isInteger(pid)) throw new Error("Browser process id unavailable")
        const launch = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command",
            `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`],
        { encoding: "utf8" })) as { ProcessId: number; ExecutablePath: string; CommandLine: string }
        expect(launch.CommandLine).toBeTruthy()
        expect(launch.CommandLine).not.toMatch(/--headless(?:[=\s"]|$)/)
        expect(testInfo.project.use.headless).toBe(false)
        const sources = await makePerformanceSources(page)
        await page.close()
        const cases = []
        for (const caseName of ["cold-canvas", "cold-runner", "canvas-transition", "runner-transition", "blank"] as const) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
            const fresh = await context.newPage()
            try {
                // No visual test flags or UA override: primary state is a visible active document.
                const sealed = caseName === "blank" ? null : await sealPerformanceReference(fresh, sources[0], "P2")
                await fresh.bringToFront()
                await fresh.addScriptTag({ content: bundle })
                const before = await fresh.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(),
                    userAgent: navigator.userAgent }))
                expect(before.visibility).toBe("visible")
                expect(before.focused).toBe(true)
                const proof = await fresh.evaluate(({ caseName, sealed, source }) =>
                    window.performanceSpike3.measure(caseName, sealed, source), { caseName, sealed, source: sources[0] })
                expect(proof.exact).toMatchObject({ width: 512, height: 512, rgbaLength: 1048576, differentBytes: 0 })
                expect(proof.finalState).toEqual({ visibility: "visible", focused: true })
                expect(proof.events).toEqual([])
                cases.push({ before, proof })
                console.log("SPIKE3_RESULT", testInfo.project.name, round, caseName, JSON.stringify({
                    coldCanvas: proof.cold?.statistics, postCanvas: proof.transition?.plain.statistics,
                    coldRunner: proof.coldRunner?.callbackStatistics,
                    coldFrame: proof.coldRunner?.frameStatistics,
                    postRunner: proof.runnerTransition?.after.callbackStatistics,
                    postFrame: proof.runnerTransition?.after.frameStatistics,
                }))
                // A screenshot is evidence only after timing, never a cold-state prerequisite.
                await fresh.screenshot({ path: testInfo.outputPath(`${caseName}.png`) })
            } finally { await context.close() }
        }
        const artifact = { environment: { browser: testInfo.project.name, version: browser.version(),
            headless: false, launchProcess: launch, os: os.release(), platform: os.platform(),
            viewport: { width: 1440, height: 1100 }, workers: 1, automation: "Playwright / CDP" }, round, cases }
        const evidence = testInfo.outputPath(`spike3-${testInfo.project.name}-round${round}.json`)
        await writeFile(evidence, JSON.stringify(artifact, null, 2))
        await testInfo.attach("headed-evidence", { path: evidence, contentType: "application/json" })
        await cdp.detach()
        console.log("SPIKE3_EVIDENCE", evidence)
    })
}
