import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { installStableVisualEnvironment } from "./helpers"
import type * as PerformanceProof from "./performanceSpike1Harness"
import { makePerformanceSources as makeSources, sealPerformanceReference as sealReference } from "./performanceReferenceFixture"

declare global {
    interface Window { performanceSpike1: typeof PerformanceProof }
}

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/performanceSpike1Harness.ts")],
        bundle: true, write: false, format: "iife", globalName: "performanceSpike1" })
    proofBundle = built.outputFiles[0].text
})
test.beforeEach(async ({ page }) => installStableVisualEnvironment(page))

function statistics(values: number[]) {
    if (values.length === 0) throw new Error("Cannot summarize empty timing samples")
    const sorted = [...values].sort((a, b) => a - b)
    const total = values.reduce((sum, value) => sum + value, 0)
    const middle = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    return { total, mean: total / values.length, median,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1)! }
}

test("Performance Spike 1 attributes 50-frame runner cost in evidence and minimal modes", async ({ page }, testInfo) => {
    test.setTimeout(1_200_000)
    const sourceSetupStarted = performance.now()
    const sources = await makeSources(page)
    const sourceFixtureSetupMs = performance.now() - sourceSetupStarted
    expect(sources).toHaveLength(50)
    for (const shape of ["P1", "P2"] as const) {
        const sealStarted = performance.now()
        const sealed = await sealReference(page, sources[0], shape)
        const referenceSealHostMs = performance.now() - sealStarted
        expect(sealed.referenceInputGeometry).toEqual({ width: 512, height: 512 })
        if (shape === "P1") {
            expect(sealed.recipe.smart.whiteBalance.kind).toBe("matrix")
            expect(sealed.recipe.grid.size).toBe(24)
            expect(sealed.recipe.palette.source).toBe("preset")
            expect(sealed.recipe.palette.colorSpace).toBe("hsv")
        } else expect(sealed.recipe.palette.source).toBe("auto")
        const injectionStarted = await page.evaluate(() => performance.now())
        await page.addScriptTag({ content: proofBundle })
        const bundleInjectionBrowserMs = await page.evaluate(started => performance.now() - started,
            injectionStarted)
        const hostStarted = performance.now()
        const proof = await page.evaluate(({ sealed, sources }) =>
            window.performanceSpike1.benchmarkRecipe(sealed, sources), { sealed, sources })
        const hostExperimentMs = performance.now() - hostStarted
        expect(proof.sourceCount).toBe(50)
        expect(proof.exact).toMatchObject({ directWidth: proof.exact.pngWidth,
            directHeight: proof.exact.pngHeight, directRgbaLength: proof.exact.pngRgbaLength,
            differentBytes: 0 })
        for (const run of proof.runs) {
            expect(run.samples).toHaveLength(50)
            expect(run.result).toMatchObject({ attempted: 50, succeeded: 50 })
            expect(run.result.resources).toMatchObject({ decodedOpened: 50, decodedClosed: 50,
                peakActiveDecoded: 1, sinkWriteAttempts: 50, sinkWriteSucceeded: 50 })
        }
        const summary = proof.runs.map(run => {
            const total = statistics(run.samples.map(sample => sample.totalMs))
            const stages = [...new Set(run.samples.flatMap(sample => Object.keys(sample.stages)))]
            const stageStats = Object.fromEntries(stages.map(stage => [stage, statistics(run.samples.map(
                sample => sample.stages[stage as keyof typeof sample.stages] ?? 0))]))
            const evidenceStages = ["arrayBuffer", "hash", "pngDecode", "rgbaInspect", "release"] as const
            const evidenceStats = run.evidence.length ? Object.fromEntries(evidenceStages.map(stage => [stage,
                statistics(run.evidence.map(frame => frame.stages[stage]))])) : {}
            return { mode: run.mode, wallMs: run.wallMs, setupMs: run.setupMs, warmupMs: run.warmupMs,
                total, firstFrameMs: run.samples[0].totalMs,
                steadyMeanMs: statistics(run.samples.slice(1).map(sample => sample.totalMs)).mean,
                stages: stageStats, evidence: evidenceStats }
        })
        const artifact = { profile: testInfo.project.name, shape, sourceFixtureSetupMs,
            referenceSealHostMs, bundleInjectionBrowserMs, hostExperimentMs, ...proof, summary }
        await testInfo.attach(`performance-spike-1-${shape}-${testInfo.project.name}`, {
            contentType: "application/json", body: Buffer.from(JSON.stringify(artifact, null, 2)) })
        console.log("PERFORMANCE_SPIKE_1", JSON.stringify({ profile: artifact.profile, shape,
            sourceFixtureSetupMs, referenceSealHostMs, bundleInjectionBrowserMs,
            hostExperimentMs, experimentWallMs: proof.experimentWallMs, measuredScanMs: proof.measuredScanMs,
            warmupScanMs: proof.warmupScanMs, exact: proof.exact, summary }))
    }
})

test("Performance Spike 1 standalone PNG callback latency diagnostic", async ({ page }, testInfo) => {
    await page.goto("/")
    const result = await page.evaluate(async () => {
        const timerSamples = []
        for (let index = 0; index < 5; index++) {
            const started = performance.now()
            await new Promise<void>(resolve => setTimeout(resolve, 0))
            timerSamples.push(performance.now() - started)
        }
        const pngSamples = []
        for (const size of [1, 512]) {
            const canvas = document.createElement("canvas")
            canvas.width = size
            canvas.height = size
            const context = canvas.getContext("2d")!
            context.fillStyle = "#c93865"
            context.fillRect(0, 0, size, size)
            for (let index = 0; index < 5; index++) {
                const started = performance.now()
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
                    value ? resolve(value) : reject(new Error("Standalone PNG failed")), "image/png"))
                pngSamples.push({ size, milliseconds: performance.now() - started, bytes: blob.size })
            }
            canvas.width = 0
            canvas.height = 0
        }
        return { timerSamples, pngSamples }
    })
    expect(result.pngSamples).toHaveLength(10)
    expect(result.pngSamples.every(sample => sample.bytes > 0)).toBe(true)
    await testInfo.attach(`performance-spike-1-standalone-${testInfo.project.name}`, {
        contentType: "application/json", body: Buffer.from(JSON.stringify(result, null, 2)) })
    console.log("PERFORMANCE_SPIKE_1_STANDALONE", JSON.stringify({ profile: testInfo.project.name, ...result }))
})

test("Performance Spike 1 canonical rendered canvas PNG callback diagnostic", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const sources = await makeSources(page)
    const sealed = await sealReference(page, sources[0], "P2")
    await page.addScriptTag({ content: proofBundle })
    const result = await page.evaluate(({ sealed, source }) =>
        window.performanceSpike1.diagnoseRenderedPng(sealed, source), { sealed, source: sources[0] })
    expect(result.samples).toHaveLength(4)
    expect(result.samples.every(sample => sample.pngBytes > 0)).toBe(true)
    await testInfo.attach(`performance-spike-1-rendered-png-${testInfo.project.name}`, {
        contentType: "application/json", body: Buffer.from(JSON.stringify(result, null, 2)) })
    console.log("PERFORMANCE_SPIKE_1_RENDERED_PNG", JSON.stringify({ profile: testInfo.project.name, ...result }))
})

test("Performance Spike 1 first runner frame before measured warm-up", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const sources = await makeSources(page)
    for (const shape of ["P1", "P2"] as const) {
        const sealed = await sealReference(page, sources[0], shape)
        await page.addScriptTag({ content: proofBundle })
        const result = await page.evaluate(({ sealed, source }) =>
            window.performanceSpike1.diagnoseFirstRunnerFrame(sealed, source),
        { sealed, source: sources[0] })
        expect(result.firstFrame.totalMs).toBeGreaterThan(0)
        expect(result.resources).toMatchObject({ decodedOpened: 1, decodedClosed: 1,
            peakActiveDecoded: 1, sinkWriteAttempts: 1, sinkWriteSucceeded: 1 })
        await testInfo.attach(`performance-spike-1-first-runner-${shape}-${testInfo.project.name}`, {
            contentType: "application/json", body: Buffer.from(JSON.stringify(result, null, 2)) })
        console.log("PERFORMANCE_SPIKE_1_FIRST_RUNNER", JSON.stringify({
            profile: testInfo.project.name, shape, ...result }))
    }
})

test("Performance Spike 1 instrumented runner preserves exact replay RGBA", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const sources = await makeSources(page)
    for (const shape of ["P1", "P2"] as const) {
        const sealed = await sealReference(page, sources[0], shape)
        await page.addScriptTag({ content: proofBundle })
        const exact = await page.evaluate(({ sealed, source }) =>
            window.performanceSpike1.proveProfiledExact(sealed, source),
        { sealed, source: sources[0] })
        expect(exact).toMatchObject({ directWidth: exact.pngWidth,
            directHeight: exact.pngHeight, directRgbaLength: exact.pngRgbaLength,
            differentBytes: 0, observedFrames: 1 })
        console.log("PERFORMANCE_SPIKE_1_PROFILED_EXACT", JSON.stringify({
            profile: testInfo.project.name, shape, ...exact }))
    }
})
