import { decodeAndValidateRasterImageFile } from "../../src/editor/fileIntakeSecurity.ts"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame.ts"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope.ts"
import { runBatchFrames } from "../../src/plugins/batchPixelation/runner/runBatchFrames.ts"
import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet.ts"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory.ts"
import type { PerformanceSource } from "./performanceReferenceFixture.ts"

type PngSample = Readonly<{ call: number; milliseconds: number; width: number; height: number; bytes: number }>
type ExactProof = Readonly<{ width: number; height: number; rgbaLength: number; differentBytes: number }>

function statistics(values: number[]) {
    if (!values.length) throw new Error("Missing diagnostic samples")
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return { n: values.length, mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1)! }
}

async function encode(canvas: HTMLCanvasElement, call: number) {
    const started = performance.now()
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
        value?.type === "image/png" ? resolve(value) : reject(new Error("PNG diagnostic failed")), "image/png"))
    return { sample: { call, milliseconds: performance.now() - started,
        width: canvas.width, height: canvas.height, bytes: blob.size }, blob }
}

async function repeat(canvas: HTMLCanvasElement, label: string, n = 10, readback = false) {
    const samples: PngSample[] = []
    let lastBlob: Blob | null = null
    for (let call = 1; call <= n; call++) {
        if (readback) pixels(canvas)
        const encoded = await encode(canvas, call)
        samples.push(encoded.sample)
        lastBlob = encoded.blob
    }
    return { series: { label, samples, statistics: statistics(samples.map(sample => sample.milliseconds)) },
        lastBlob: lastBlob! }
}

function pixels(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Diagnostic canvas context unavailable")
    return context.getImageData(0, 0, canvas.width, canvas.height)
}

function compare(expected: ImageData, actual: ImageData): ExactProof {
    if (expected.width !== actual.width || expected.height !== actual.height ||
        expected.data.length !== actual.data.length) throw new Error("Diagnostic geometry mismatch")
    let differentBytes = 0
    for (let index = 0; index < expected.data.length; index++) {
        if (expected.data[index] !== actual.data[index]) differentBytes++
    }
    if (differentBytes) throw new Error(`Diagnostic pixel mismatch: ${differentBytes}`)
    return { width: expected.width, height: expected.height,
        rgbaLength: expected.data.length, differentBytes }
}

function release(canvas: HTMLCanvasElement) { canvas.width = 0; canvas.height = 0 }

export const pngLatencyDiagnostics = { statistics, encode, repeat, pixels, release, provePng,
    animationFrame, mainThreadProbe }

async function provePng(expected: ImageData, png: Blob) {
    const bitmap = await createImageBitmap(png)
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    try {
        const context = canvas.getContext("2d")
        if (!context) throw new Error("PNG exactness context unavailable")
        context.drawImage(bitmap, 0, 0)
        return compare(expected, pixels(canvas))
    } finally {
        release(canvas)
        bitmap.close()
    }
}

export async function freshControls() {
    const series = []
    for (const [width, height, pattern] of [[1, 1, false], [512, 512, false],
        [512, 512, true], [903, 504, false], [903, 504, true]] as const) {
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        try {
            const context = canvas.getContext("2d")
            if (!context) throw new Error("Fresh control context unavailable")
            context.fillStyle = "#c93865"
            context.fillRect(0, 0, width, height)
            if (pattern) for (let y = 0; y < height; y += 16) for (let x = 0; x < width; x += 16) {
                context.fillStyle = `rgb(${x % 256}, ${y % 256}, ${(x + y * 3) % 256})`
                context.fillRect(x, y, 16, 16)
            }
            series.push((await repeat(canvas, `fresh-${width}x${height}-${pattern ? "pattern" : "flat"}`)).series)
        } finally { release(canvas) }
    }
    return { series, visibility: document.visibilityState, focused: document.hasFocus() }
}

type Schedule = "immediate" | "microtask" | "timeout0" | "raf" | "two-raf" | "idle-gap75"
const SCHEDULES: Schedule[] = ["immediate", "microtask", "timeout0", "raf", "two-raf", "idle-gap75"]

async function animationFrame() {
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Diagnostic rAF did not run within 1500 ms")), 1500)
        requestAnimationFrame(() => { clearTimeout(timeout); resolve() })
    })
}

async function waitForSchedule(schedule: Schedule) {
    if (schedule === "microtask") await Promise.resolve()
    if (schedule === "timeout0") await new Promise(resolve => setTimeout(resolve, 0))
    if (schedule === "raf" || schedule === "two-raf") await animationFrame()
    if (schedule === "two-raf") await animationFrame()
    if (schedule === "idle-gap75") await new Promise(resolve => setTimeout(resolve, 75))
}

async function schedulingControls(canvas: HTMLCanvasElement) {
    const samples: { schedule: Schedule; waitMs: number; sample: PngSample }[] = []
    for (let cycle = 0; cycle < 3; cycle++) {
        for (let offset = 0; offset < SCHEDULES.length; offset++) {
            const schedule = SCHEDULES[(offset + cycle) % SCHEDULES.length]
            const waitStarted = performance.now()
            await waitForSchedule(schedule)
            const waitMs = performance.now() - waitStarted
            const encoded = await encode(canvas, samples.length + 1)
            samples.push({ schedule, waitMs, sample: encoded.sample })
        }
    }
    return { samples, summary: SCHEDULES.map(schedule => ({ schedule,
        statistics: statistics(samples.filter(row => row.schedule === schedule)
            .map(row => row.sample.milliseconds)) })) }
}

async function mainThreadProbe(canvas: HTMLCanvasElement, includeAnimationAndIdle = true) {
    const started = performance.now()
    const events: { name: string; milliseconds: number; didTimeout?: boolean; idleRemaining?: number }[] = []
    const mark = (name: string) => events.push({ name, milliseconds: performance.now() - started })
    queueMicrotask(() => mark("microtask"))
    const timers = [0, 50, 100].map(delay => setTimeout(() => mark(`timer${delay}`), delay))
    const raf = includeAnimationAndIdle ? requestAnimationFrame(() => mark("raf")) : null
    const idle = includeAnimationAndIdle && typeof requestIdleCallback === "function" ? requestIdleCallback(deadline => {
        events.push({ name: "idle", milliseconds: performance.now() - started,
            didTimeout: deadline.didTimeout, idleRemaining: deadline.timeRemaining() })
    }, { timeout: 1500 }) : null
    const encoded = await encode(canvas, 1)
    const atCallback = events.map(event => ({ ...event }))
    for (const timer of timers) clearTimeout(timer)
    if (raf !== null) cancelAnimationFrame(raf)
    if (idle !== null) cancelIdleCallback(idle)
    return { sample: encoded.sample, eventsBeforeBlob: atCallback,
        pendingAtBlob: ["microtask", "timer0", "timer50", "timer100", ...(includeAnimationAndIdle ? ["raf", "idle"] : [])]
            .filter(name => !atCallback.some(event => event.name === name)) }
}

export async function coldSchedulingControl(sealed: SealedReference, source: PerformanceSource,
    schedule: Schedule, lifecycle: boolean) {
    const bitmap = await decodeAndValidateRasterImageFile(
        new File([Uint8Array.from(source.bytes)], source.name, { type: source.type }))
    const canvas = renderFinalFrame(bitmap, sealed.recipe)
    try {
        const baseline = await repeat(canvas, "cold-baseline", 3)
        const expected = pixels(canvas)
        const timersOnly = await mainThreadProbe(canvas, false)
        const coldRunner = lifecycle ? await runnerControl(sealed, source, expected) : null
        const samples: { waitMs: number; sample: PngSample }[] = []
        for (let call = 1; call <= 3; call++) {
            const before = performance.now()
            await waitForSchedule(schedule)
            const waitMs = performance.now() - before
            samples.push({ waitMs, sample: (await encode(canvas, call)).sample })
        }
        // A plain repeated call after the pulse tests whether the state change persists.
        const afterPulse = lifecycle ? await repeat(canvas, "plain-calls-after-raf-pulse") : null
        const warmRunner = lifecycle ? await runnerControl(sealed, source, expected) : null
        return { schedule, baseline: baseline.series, timersOnly, coldRunner,
            scheduled: { samples, statistics: statistics(samples.map(row => row.sample.milliseconds)) },
            afterPulse: afterPulse?.series ?? null, warmRunner,
            exact: await provePng(expected, afterPulse?.lastBlob ?? baseline.lastBlob),
            visibility: document.visibilityState, focused: document.hasFocus() }
    } finally { release(canvas); bitmap.close() }
}

async function runnerControl(sealed: SealedReference, source: PerformanceSource, expected: ImageData) {
    const directory: SourceDirectoryHandle = { kind: "directory", name: "SPIKE_2_RUNNER", async *values() {
        for (let index = 1; index <= 10; index++) {
            const name = `frame${index}.png`
            yield { kind: "file", name, async getFile() {
                return new File([Uint8Array.from(source.bytes)], name, { type: source.type })
            } }
        }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob
    const samples: PngSample[] = []
    let firstPng: Blob | null = null
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        const started = performance.now()
        const width = this.width
        const height = this.height
        nativeToBlob.call(this, blob => {
            if (blob) samples.push({ call: samples.length + 1, milliseconds: performance.now() - started,
                width, height, bytes: blob.size })
            callback(blob)
        }, type, quality)
    }
    try {
        const result = await runBatchFrames(sealed, scan.manifest, scan.runtime, {
            async writeFrame(frame) { if (!firstPng) firstPng = frame.png },
        })
        if (!firstPng || result.succeeded !== 10 || samples.length !== 10 ||
            result.resources.decodedOpened !== result.resources.decodedClosed ||
            result.resources.peakActiveDecoded !== 1) throw new Error("Runner diagnostic invariant failed")
        return { label: "runner-fresh-per-frame", samples,
            statistics: statistics(samples.map(sample => sample.milliseconds)),
            exact: await provePng(expected, firstPng), resources: result.resources }
    } finally { HTMLCanvasElement.prototype.toBlob = nativeToBlob }
}

export async function canonicalControls(sealed: SealedReference, source: PerformanceSource,
    full: boolean) {
    const bitmap = await decodeAndValidateRasterImageFile(
        new File([Uint8Array.from(source.bytes)], source.name, { type: source.type }))
    const canvases: HTMLCanvasElement[] = []
    const render = () => {
        const canvas = renderFinalFrame(bitmap, sealed.recipe)
        canvases.push(canvas)
        return canvas
    }
    try {
        const canonical = render()
        const initial = await repeat(canonical, "canonical-untouched")
        // Readback is deliberately deferred until the untouched series finishes.
        const expected = pixels(canonical)
        const afterReadback = await repeat(canonical, "canonical-readback-before-each-call", 10, true)
        const canonicalExact = await provePng(expected, initial.lastBlob)
        const copy = document.createElement("canvas")
        canvases.push(copy)
        copy.width = canonical.width
        copy.height = canonical.height
        const copyContext = copy.getContext("2d")
        if (!copyContext) throw new Error("Pixel-copy context unavailable")
        copyContext.putImageData(expected, 0, 0)
        const copyExact = compare(expected, pixels(copy))
        const copied = await repeat(copy, "putImageData-copy-verified")
        const copiedPngExact = await provePng(expected, copied.lastBlob)
        release(copy)
        const series = [initial.series, afterReadback.series, copied.series]
        const drawProofs: ExactProof[] = []
        if (full) {
            const drawn = document.createElement("canvas")
            canvases.push(drawn)
            drawn.width = canonical.width
            drawn.height = canonical.height
            const context = drawn.getContext("2d")
            if (!context) throw new Error("DrawImage-copy context unavailable")
            context.drawImage(canonical, 0, 0)
            drawProofs.push(compare(expected, pixels(drawn)))
            const drawSeries = await repeat(drawn, "drawImage-copy-verified")
            drawProofs.push(await provePng(expected, drawSeries.lastBlob))
            series.push(drawSeries.series)
            release(drawn)
        }
        release(canonical)
        const scheduleCanvas = full ? render() : null
        const scheduling = scheduleCanvas ? await schedulingControls(scheduleCanvas) : null
        if (scheduleCanvas) release(scheduleCanvas)
        const probes = []
        for (let index = 0; index < (full ? 3 : 1); index++) {
            const canvas = render()
            probes.push(await mainThreadProbe(canvas))
            release(canvas)
        }
        const isolatedFreshSamples: PngSample[] = []
        for (let call = 1; call <= 10; call++) {
            const canvas = render()
            isolatedFreshSamples.push((await encode(canvas, call)).sample)
            release(canvas)
        }
        const runner = await runnerControl(sealed, source, expected)
        return { series, canonicalExact, copyExact, copiedPngExact, drawProofs,
            scheduling, probes, runner,
            isolatedFresh: { label: "isolated-fresh-per-call", samples: isolatedFreshSamples,
                statistics: statistics(isolatedFreshSamples.map(sample => sample.milliseconds)) },
            recipeUnchanged: JSON.stringify(sealed.recipe),
            visibility: document.visibilityState, focused: document.hasFocus() }
    } finally {
        for (const canvas of canvases) release(canvas)
        bitmap.close()
    }
}
