import { expect, test } from "@playwright/test"
import { build } from "esbuild"
import path from "node:path"
import { writeFile } from "node:fs/promises"
import { installStableVisualEnvironment } from "./helpers"
import { makePerformanceSources, sealPerformanceReference } from "./performanceReferenceFixture"
import type * as Spike2 from "./performanceSpike2Harness"

let proofBundle: string
test.beforeAll(async () => {
    const built = await build({ entryPoints: [path.resolve("tests/e2e/performanceSpike2Harness.ts")],
        bundle: true, write: false, format: "iife", globalName: "performanceSpike2" })
    proofBundle = built.outputFiles[0].text
})

for (const round of [1, 2] as const) {
    test(`Performance Spike 2 independent cold scheduling round ${round}`, async ({ page, context, browser }, testInfo) => {
        test.setTimeout(600_000)
        const sources = await makePerformanceSources(page)
        const schedules = round === 1 ? ["immediate", "microtask", "timeout0", "idle-gap75", "two-raf", "raf"] as const
            : ["raf"] as const
        const cases: Awaited<ReturnType<typeof Spike2.coldSchedulingControl>>[] = []
        // Each intervention starts from a new document, not the state left by another intervention.
        for (const schedule of schedules) {
            const isolated = await context.newPage()
            try {
                await installStableVisualEnvironment(isolated)
                const sealed = await sealPerformanceReference(isolated, sources[0], "P2")
                await isolated.addScriptTag({ content: proofBundle })
                const proof = await isolated.evaluate(({ sealed, source, schedule }) =>
                    window.performanceSpike2.coldSchedulingControl(sealed, source, schedule, schedule === "raf"),
                { sealed, source: sources[0], schedule })
                expect(proof.exact.differentBytes).toBe(0)
                expect(proof.baseline.samples).toHaveLength(3)
                expect(proof.scheduled.samples).toHaveLength(3)
                for (const runner of [proof.coldRunner, proof.warmRunner]) {
                    if (!runner) continue
                    expect(runner.samples).toHaveLength(10)
                    expect(runner.exact.differentBytes).toBe(0)
                    expect(runner.resources).toMatchObject({ decodedOpened: 10, decodedClosed: 10, peakActiveDecoded: 1 })
                }
                cases.push(proof)
                console.log("SPIKE2_COLD", testInfo.project.name, round, schedule,
                    JSON.stringify({ baseline: proof.baseline.statistics, scheduled: proof.scheduled.statistics,
                        coldRunner: proof.coldRunner?.statistics, warmRunner: proof.warmRunner?.statistics }))
            } finally { await isolated.close() }
        }
        const artifact = { environment: { chrome: browser.version(), profile: testInfo.project.name,
            headless: true, workers: 1 }, round, cases }
        const evidencePath = testInfo.outputPath(`spike2-cold-${testInfo.project.name}-round${round}.json`)
        await writeFile(evidencePath, JSON.stringify(artifact, null, 2))
        await testInfo.attach("independent-cold-scheduling", { contentType: "application/json", path: evidencePath })
        console.log("SPIKE2_EVIDENCE", evidencePath)
    })
}
