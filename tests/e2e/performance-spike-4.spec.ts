import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { makePerformanceSources, sealPerformanceReference } from "./performanceReferenceFixture"
import { installTimeline } from "./performanceSpike4Harness"
import type * as Spike4 from "./performanceSpike4Harness"
declare global { interface Window { performanceSpike4: typeof Spike4 } }
let bundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/performanceSpike4Harness.ts")], bundle: true,
        write: false, format: "iife", globalName: "performanceSpike4" })
    bundle = built.outputFiles[0].text
})

test("Spike 4 planned fresh-document lifecycle matrix", async ({ browser, page }, info) => {
    test.setTimeout(1_200_000)
    const cdp = await browser.newBrowserCDPSession()
    const processes = await cdp.send("SystemInfo.getProcessInfo") as { processInfo: { type: string; id: number }[] }
    const pid = processes.processInfo.find(row => row.type === "browser")?.id
    if (!pid || !Number.isInteger(pid)) throw new Error("Missing browser process")
    const process = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command",
        `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`],
    { encoding: "utf8" })) as { CommandLine: string }
    expect(process.CommandLine).toBeTruthy()
    expect(process.CommandLine).not.toMatch(/--headless(?:[=\s"]|$)/)
    expect(info.project.use.headless).toBe(false)
    const sources = await makePerformanceSources(page)
    const seed = await sealPerformanceReference(page, sources[0], "P2")
    await page.close()
    const plans = [
        ...Array.from({ length: 20 }, (_, index) => ({ kind: "baseline", delay: 0, observe: index % 2 === 0 })),
        ...[0, 100, 500, 1000, 2000].flatMap(delay => [0, 1].map(() => ({ kind: "timer", delay, observe: true }))),
        ...["pointer", "click", "keyboard", "turn", "route-ready"].flatMap(kind => [0, 1].map(() => ({ kind, delay: 0, observe: true }))),
    ]
    const rows = []
    let longevityCount = 0
    let backgroundDone = false
    let fastRunnerDone = false
    for (const [index, plan] of plans.entries()) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
        await context.addInitScript(installTimeline, plan.observe)
        const fresh = await context.newPage()
        try {
            await fresh.bringToFront()
            let sealed = seed
            if (plan.kind === "route-ready") {
                await fresh.goto("/__batch-gate5", { waitUntil: "domcontentloaded" })
                await expect(fresh.locator("#gate5-reference-file")).toBeVisible()
                await fresh.evaluate(() => window.spike4Mark("route-ready"))
            } else {
                await sealPerformanceReference(fresh, sources[0], "P2",
                    stage => fresh.evaluate(stage => window.spike4Mark(stage), stage))
                const text = await fresh.getByTestId("gate5-sealed-reference").textContent()
                if (!text) throw new Error("Missing fresh recipe")
                sealed = JSON.parse(text)
                expect(sealed.recipe).toEqual(seed.recipe)
            }
            await fresh.addScriptTag({ content: bundle })
            await fresh.evaluate(({ sealed, source }) => window.performanceSpike4.prepare(sealed, source), { sealed, source: sources[0] })
            await fresh.evaluate(() => window.spike4Mark("ready"))
            if (plan.kind === "timer") await fresh.evaluate(delay => new Promise(resolve => setTimeout(resolve, delay)), plan.delay)
            if (plan.kind === "pointer") await fresh.mouse.move(10, 10)
            if (plan.kind === "click") await fresh.mouse.click(10, 10)
            if (plan.kind === "keyboard") await fresh.keyboard.press("Shift")
            if (plan.kind === "turn") await fresh.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
            const cold = await fresh.evaluate(() => window.performanceSpike4.cold())
            expect(cold.exact).toMatchObject({ width: 512, height: 512, rgbaLength: 1048576, differentBytes: 0 })
            expect(cold.explicitRafBeforeCold).toBe(0)
            const slow = cold.classification === "SLOW-PLATEAU"
            const longevity = slow && longevityCount < 2
            if (longevity) longevityCount++
            const runnerCheck = longevity || (cold.classification === "FAST" && !fastRunnerDone)
            if (cold.classification === "FAST" && runnerCheck) fastRunnerDone = true
            const control = await fresh.evaluate(({ longevity, runnerCheck }) => window.performanceSpike4.control(longevity, runnerCheck),
                { longevity, runnerCheck })
            expect(control.exact.differentBytes).toBe(0)
            let background: Awaited<ReturnType<typeof Spike4.hiddenEncode>> | { status: string } | null = null
            if (slow && !backgroundDone && control.samples.every(sample => sample.milliseconds < 100)) {
                backgroundDone = true
                const cover = await context.newPage()
                await cover.bringToFront()
                const hidden = await fresh.evaluate(() => document.visibilityState)
                if (hidden === "hidden") background = await fresh.evaluate(() => window.performanceSpike4.hiddenEncode())
                else background = { status: "NOT VERIFIED: new tab did not hide measured document" }
                await cover.close()
                await fresh.bringToFront()
            }
            const state = await fresh.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus() }))
            rows.push({ id: index + 1, ...plan, cold, control, background, state })
            await writeFile(info.outputPath("spike4-automatic.json"), JSON.stringify({ environment: {
                browser: browser.version(), process, headless: false, os: os.release(), viewport: { width: 1440, height: 1100 },
                workers: 1 }, rows }, null, 2))
            console.log("SPIKE4_ROW", index + 1, plan.kind, plan.delay, plan.observe, cold.classification,
                cold.samples.map(sample => sample.milliseconds.toFixed(1)).join(","), "POST", control.statistics.mean.toFixed(1))
            expect(cold.timeline.find(row => row.name === "cold-call")).toMatchObject({ visibility: "visible", focused: true })
        } finally { await fresh.evaluate(() => window.performanceSpike4?.cleanup()); await context.close() }
    }
    await cdp.detach()
})

test("Spike 4 genuine manual final trigger protocol", async ({ browser, page }, info) => {
    test.setTimeout(240_000)
    const sources = await makePerformanceSources(page)
    await page.close()
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    await context.addInitScript(installTimeline, true)
    const fresh = await context.newPage()
    try {
        const sealed = await sealPerformanceReference(fresh, sources[0], "P2",
            stage => fresh.evaluate(stage => window.spike4Mark(stage), stage))
        await fresh.addScriptTag({ content: bundle })
        await fresh.evaluate(({ sealed, source }) => window.performanceSpike4.prepare(sealed, source), { sealed, source: sources[0] })
        await fresh.evaluate(() => window.spike4Mark("ready"))
        await fresh.bringToFront()
        const pending = fresh.evaluate(() => window.performanceSpike4.armManual())
        console.log("SPIKE4_MANUAL_READY: human must click Start manual measurement; no automation final action")
        const cold = await pending
        if (cold) expect(cold.exact.differentBytes).toBe(0)
        await writeFile(info.outputPath("spike4-manual.json"), JSON.stringify({ status: cold ? "MANUAL EVIDENCE" : "NOT VERIFIED: no human final trigger within 180 seconds",
            browser: browser.version(), headless: false, cold }, null, 2))
        console.log("SPIKE4_MANUAL_RESULT", cold?.classification ?? "NOT VERIFIED")
    } finally { await fresh.evaluate(() => window.performanceSpike4?.cleanup()); await context.close() }
})
