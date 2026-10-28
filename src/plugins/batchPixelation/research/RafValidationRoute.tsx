import * as React from "react"
import BatchReferenceRoute from "../authoring/BatchReferenceRoute.tsx"
import { SourceSetPanel } from "../sourceSet/SourceSetPanel.tsx"
import type { SourceSetScan } from "../sourceSet/scanSourceSet.ts"
import { classifyPng, parseReferencePackage, referenceIdentity, type ReferencePackage } from "./rafValidationEvidence.ts"
import { runRafValidation, type ValidationReport, type ValidationRow } from "./rafValidationSession.ts"

function download(name: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function RafValidationRoute() {
    const [authoring, setAuthoring] = React.useState(false)
    const [reference, setReference] = React.useState<ReferencePackage | null>(null)
    const [identity, setIdentity] = React.useState("")
    const [scan, setScan] = React.useState<SourceSetScan | null>(null)
    const [mode, setMode] = React.useState<"OFF" | "ON">("OFF")
    const [phase, setPhase] = React.useState<"idle" | "running" | "verifying" | "finished">("idle")
    const [progress, setProgress] = React.useState<ValidationRow | null>(null)
    const [completed, setCompleted] = React.useState(0)
    const [currentFilename, setCurrentFilename] = React.useState("")
    const [report, setReport] = React.useState<ValidationReport | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [visibility, setVisibility] = React.useState(document.visibilityState)
    const [importing, setImporting] = React.useState(false)
    const started = React.useRef(false)
    React.useEffect(() => {
        const update = () => setVisibility(document.visibilityState)
        document.addEventListener("visibilitychange", update)
        return () => document.removeEventListener("visibilitychange", update)
    }, [])
    React.useEffect(() => {
        let cancelled = false
        if (reference) referenceIdentity(reference.sealed).then(value => {
            if (!cancelled) setIdentity(value)
        }).catch(failure => { if (!cancelled) setError(String(failure)) })
        return () => { cancelled = true }
    }, [reference])

    const importReference = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        if (!file || started.current) return
        setImporting(true)
        setError(null)
        try {
            if (file.size > 2_000_000) throw new Error("Reference JSON exceeds the research import limit")
            const next = parseReferencePackage(await file.text())
            setIdentity("")
            setReference(next)
            setScan(null)
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Reference import failed") }
        finally { setImporting(false) }
    }
    const run = async () => {
        if (started.current || !reference || !scan || scan.manifest.overallStatus !== "ready") return
        started.current = true
        setPhase("running")
        setError(null)
        try {
            const result = await runRafValidation(reference.sealed, scan, mode, row => {
                setProgress({ ...row })
                setCompleted(count => count + 1)
                if (row.orderIndex === scan.manifest.processable.at(-1)?.orderIndex) setPhase("verifying")
            }, setCurrentFilename)
            setReport(result)
        } catch (failure) { setError(failure instanceof Error ? failure.message : "Validation failed") }
        finally { setPhase("finished") }
    }

    if (authoring) return <BatchReferenceRoute onReferenceReady={(sealed, file) => {
        setIdentity("")
        setReference({ version: 1, sealed, reference: { name: file.name, size: file.size, lastModified: file.lastModified } })
        setScan(null)
        setAuthoring(false)
    }} />

    return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, color: "#171717",
        background: "#fff", minHeight: "100vh", fontFamily: "system-ui, sans-serif", overflowWrap: "anywhere" }}>
        <h1 style={{ fontSize: 24 }}>Batch Pixelation - rAF Validation Stand</h1>
        <strong style={{ color: "#b42318" }}>RESEARCH ONLY</strong>
        <section aria-label="Reference" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Reference</h2>
            {phase === "idle" && <>
                <button type="button" onClick={() => setAuthoring(true)} disabled={importing}>Choose Reference Frame</button>
                <label style={{ display: "block", marginTop: 12 }}>Import sealed research Reference JSON
                    <input aria-label="Import sealed Reference" type="file" accept=".json,application/json"
                        onChange={importReference} disabled={importing} style={{ display: "block" }} />
                </label>
            </>}
            {reference && <>
                <p>{reference.reference.name} - {reference.sealed.referenceInputGeometry.width} x {reference.sealed.referenceInputGeometry.height}</p>
                <p>Recipe SHA-256: <code data-testid="recipe-identity">{identity || "Calculating..."}</code></p>
                <button type="button" onClick={() => download("batch-raf-reference.json", reference)}>Download sealed Reference</button>
            </>}
        </section>
        {reference && phase === "idle" && <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Source Folder</h2>
            <SourceSetPanel key={identity || "pending"} referenceInputGeometry={reference.sealed.referenceInputGeometry} onScan={setScan} />
            {scan?.manifest.sourceGeometry && <p>Source Geometry: {scan.manifest.sourceGeometry.width} x {scan.manifest.sourceGeometry.height}</p>}
        </section>}
        <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Scheduling Adapter: {mode}</h2>
            <fieldset disabled={phase !== "idle"} style={{ border: 0, padding: 0 }}>
                <legend>Adapter mode</legend>
                {(["OFF", "ON"] as const).map(value => <label key={value} style={{ marginRight: 24 }}>
                    <input type="radio" name="adapter" value={value} checked={mode === value} onChange={() => setMode(value)} />
                    {value}{value === "ON" ? " - one rAF before Batch start" : " - no adapter rAF"}
                </label>)}
            </fieldset>
            <p>ON protocol: after approximately 100 frames, switch to another tab for 30 seconds, then return.</p>
            <button type="button" onClick={run} disabled={phase !== "idle" || !identity || !scan || scan.manifest.overallStatus !== "ready"}>
                Run Validation
            </button>
            <p>No Research Abort. Closing or reloading during a run loses unsaved evidence.</p>
        </section>
        <section aria-label="Live diagnostics" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Live Diagnostics</h2>
            <p role="status">{phase} - Frame {completed} / {scan?.manifest.processable.length ?? 0} - {visibility}</p>
            {phase === "running" && <p>Current source: {currentFilename || "Waiting for runner start"}</p>}
            {progress && <p>{progress.sourceFilename} - native PNG {progress.pngCallbackMs?.toFixed(2) ?? "not measured"} ms
                {progress.pngCallbackMs === null ? "" : ` - ${classifyPng(progress.pngCallbackMs)}`}
                {` - adapter rAF count: ${progress.explicitRafCount}`}</p>}
            {phase === "verifying" && <p>Checking bounded RGBA samples outside run timing...</p>}
        </section>
        {error && <p role="alert">{error}</p>}
        {report && <section aria-label="Final summary" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Final Summary - {report.mode}</h2>
            {report.fatal && <p role="alert">{report.fatal}</p>}
            <p>Planned {report.summary.planned}; attempted {report.summary.attempted}; succeeded {report.summary.succeeded ?? "unknown"};
                failed {report.summary.failed ?? "unknown"}; scan-skipped {report.summary.skipped}.</p>
            <p>FAST {report.summary.fast}; SLOW-PLATEAU {report.summary.slow}; OTHER {report.summary.other}.</p>
            <p>Adapter rAF {report.adapter.explicitRafCount}; wait {report.adapter.waitMs.toFixed(2)} ms;
                run {(report.runDurationMs / 1000).toFixed(2)} s; verification {(report.verificationDurationMs / 1000).toFixed(2)} s.</p>
            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ pngMs: report.summary.png,
                totalFrameMs: report.summary.totalFrame, resources: report.resources,
                peakRetainedPngBlobs: report.peakRetainedPngBlobs, retainedPngBlobs: report.retainedPngBlobs }, null, 2)}</pre>
            <details><summary>Exactness Samples</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(report.exactness, null, 2)}</pre></details>
            <details><summary>Visibility / Focus Timeline</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(report.events, null, 2)}</pre></details>
            <details><summary>First / Last / Slowest Frames</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify({ first10: report.summary.first10,
                last10: report.summary.last10, slowest10: report.summary.slowest10 }, null, 2)}</pre></details>
            <button type="button" onClick={() => download(`batch-raf-${report.mode}-${report.startedAt.replaceAll(":", "-")}.json`,
                { ...report, reference: reference?.reference })}>Download local JSON report</button>
            <p>Run completed. Download the report and sealed Reference before opening a fresh session for the next mode.</p>
        </section>}
    </main>
}
