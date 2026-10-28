import * as React from "react"
import { useNavigate } from "react-router-dom"
import BatchReferenceRoute from "./authoring/BatchReferenceRoute.tsx"
import { BatchIntroVideo } from "./BatchIntroVideo.tsx"
import { useEditorViewportLock } from "../../editor/useEditorViewportLock.ts"
import { EditorImportErrorModal, EDITOR_ALERT_BACKDROP } from "../../editor/EditorImportErrorModal.tsx"
import { batchActionState } from "./batchUiState.ts"
import { SourceSetPanel } from "./sourceSet/SourceSetPanel.tsx"
import { BatchWorkflowController, type BatchWorkflowState } from "./workflow/BatchWorkflowController.ts"
import type { BatchProgress } from "./runner/BatchRunController.ts"
import type { PackagingProgress } from "./packaging/packageBatch.ts"
import { INSTAGRAM_URL, SUPPORT_EMAIL } from "../../hub/SiteShell.tsx"
import { openSupportEmail } from "../../editor/openSupportEmail.ts"
import { pixtudioInk } from "../../theme.ts"
import shareMetadata from "./shareMetadata.json"
import "./batchRun.css"

const INTRO_STEPS = [
    "Use any app you like to split your footage into frames.",
    "In PIXTUDIO, style one frame as pixel art — its settings become the batch recipe.",
    "Run Batch Pixelation to apply the recipe to all frames.",
    "Use any app you like to reassemble the processed frames into a video.",
]
const noSubscribe = () => () => {}
const getNull = () => null

function EntryViewportLock() {
    useEditorViewportLock()
    return null
}

function EntryVisual({ onReference, onRecipe, inactive = false }: {
    onReference?: () => void
    onRecipe?: () => void
    inactive?: boolean
}) {
    const navigate = useNavigate()
    const [shareNotice, setShareNotice] = React.useState<string | null>(null)
    const [shareError, setShareError] = React.useState(false)
    const titleRef = React.useRef<HTMLHeadingElement>(null)
    React.useLayoutEffect(() => {
        const title = titleRef.current
        if (!title) return
        const mobileQuery = window.matchMedia("(max-width: 760px) and (orientation: portrait)")
        let lastWidth = -1
        let lastMobile = false
        let active = true
        const fitTitle = (force = false) => {
            const mobile = mobileQuery.matches
            const width = title.clientWidth
            if (!force && width === lastWidth && mobile === lastMobile) return
            lastWidth = width
            lastMobile = mobile
            title.style.removeProperty("--batch-entry-title-size")
            if (!mobile || width <= 0) return
            const text = document.createRange()
            text.selectNodeContents(title)
            const textWidth = text.getBoundingClientRect().width
            if (textWidth <= 0) return
            const baseSize = parseFloat(getComputedStyle(title).fontSize)
            title.style.setProperty("--batch-entry-title-size", `${baseSize * (width - 1) / textWidth}px`)
        }
        const observer = new ResizeObserver(() => fitTitle())
        observer.observe(title)
        window.addEventListener("resize", onResize)
        function onResize() { fitTitle() }
        fitTitle()
        void document.fonts.ready.then(() => { if (active) fitTitle(true) })
        return () => {
            active = false
            observer.disconnect()
            window.removeEventListener("resize", onResize)
        }
    }, [])
    const share = async () => {
        const url = new URL("/plugins/batch-pixelation/", window.location.origin).href
        setShareNotice(null)
        setShareError(false)
        try {
            if (navigator.share) {
                await navigator.share({ title: shareMetadata.title, text: shareMetadata.description, url })
            } else {
                await navigator.clipboard.writeText(url)
                setShareNotice("Link copied")
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return
            setShareError(true)
        }
    }
    return <div className="batch-entry-composition">
        {!inactive && <EntryViewportLock />}
        <header className="batch-entry-brand">
            <button type="button" aria-label="PIXTUDIO Plugins" onClick={() => navigate("/plugins/")}>
                <img src="/plugins/batch-pixelation/Logotype_PLUGINS.svg" alt="" />
            </button>
        </header>
        <div className="batch-entry-layout">
            <button className="batch-entry-action batch-entry-reference" type="button" onClick={onReference} disabled={inactive} aria-label="SET A FRAME AS REFERENCE">
                <span className="batch-entry-action-content">
                    <span className="batch-entry-action-icon"><img src="/plugins/batch-pixelation/RefIcon.svg" alt="" /></span>
                    <span className="batch-entry-action-label" aria-hidden="true"><span>SET A FRAME AS</span><span>REFERENCE</span></span>
                </span>
            </button>
            <div className="batch-entry-feature">
                <BatchIntroVideo paused={inactive} />
                <div className="batch-entry-copy">
                    <h1 ref={titleRef}>BATCH PIXELATION PLUGIN</h1>
                    <ol>{INTRO_STEPS.map(step => <li key={step}>{step}</li>)}</ol>
                </div>
            </div>
            <button className="batch-entry-action batch-entry-recipe" type="button" onClick={onRecipe} disabled={inactive} aria-label="OPEN SAVED BATCH RECIPE">
                <span className="batch-entry-action-content">
                    <span className="batch-entry-action-icon"><img src="/plugins/batch-pixelation/RecipeIcon.svg" alt="" /></span>
                    <span className="batch-entry-action-label" aria-hidden="true"><span>OPEN SAVED</span><span>BATCH RECIPE</span></span>
                </span>
            </button>
        </div>
        <footer className="batch-entry-footer">
            <span className="batch-entry-copyright" style={{
                fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
                fontSize: 12,
                fontWeight: 400,
                color: pixtudioInk(0.85),
                letterSpacing: 0.2,
            }}>PIXTUDIO ©2026</span>
            <nav aria-label="Contact and sharing">
                <button type="button" onClick={() => openSupportEmail(SUPPORT_EMAIL, "PIXTUDIO Batch Pixelation")} aria-label="Email PIXTUDIO"><img src="/plugins/batch-pixelation/MailTo_PLUGINS.svg" alt="" /></button>
                <button type="button" onClick={() => void share()} aria-label="Share Batch Pixelation"><img src="/plugins/batch-pixelation/Share_PLUGINS.svg" alt="" /></button>
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="PIXTUDIO Instagram"><img src="/plugins/batch-pixelation/Insta_PLUGINS.svg" alt="" /></a>
            </nav>
            {shareNotice && <span role="status" className="batch-entry-share-notice">{shareNotice}</span>}
        </footer>
        {shareError && <EditorImportErrorModal title="SHARE ERROR" message="Could not share link"
            onDismiss={() => setShareError(false)} />}
    </div>
}

function BatchInfo({ state, progress, packaging, feedback }: {
    state: BatchWorkflowState
    progress: BatchProgress | null
    packaging: PackagingProgress | null
    feedback: string | null
}) {
    if (state.kind === "source") {
        const scan = state.scan?.manifest
        if (state.scanning) return <p>Scanning source...</p>
        if (!scan) return feedback ? <p role="alert">{feedback}</p> : <p>Choose a folder of frames.</p>
        const notice = feedback && <p role="status">{feedback}</p>
        if (scan.overallStatus === "blocked-reference-geometry") return <>{notice}<p role="alert">
            Geometry mismatch<br />Expected {state.sealed.referenceInputGeometry.width}×{state.sealed.referenceInputGeometry.height}
            {scan.sourceGeometry && <> · found {scan.sourceGeometry.width}×{scan.sourceGeometry.height}</>}
        </p></>
        if (scan.overallStatus === "no-valid-source-frames" || scan.counts.processable === 0) {
            return <>{notice}<p role="alert">No processable frames found</p></>
        }
        return <>{notice}<p>{scan.counts.processable} frames found · {scan.sourceGeometry?.width}×{scan.sourceGeometry?.height}<br />
            Ready to process{scan.counts.skipped ? ` · ${scan.counts.skipped} excluded` : ""}</p></>
    }
    if (state.kind !== "workspace" || !progress || !packaging) return null
    if (state.disposition === "discarding") return <p>Stopping and clearing temporary files...</p>
    if (state.disposition === "discard-error") return <p role="alert">Temporary files could not be cleared. Retry cleanup.</p>
    if (packaging.status === "packaging" || packaging.status === "archive-ready-pending-cleanup") {
        return <p>Preparing ZIP...<br />{packaging.packaged} / {packaging.total}</p>
    }
    if (packaging.status === "cleaning") return <p>Cleaning temporary files...</p>
    if (packaging.status === "packaging-error") return <p role="alert">Could not prepare ZIP. Stored outputs are retained.</p>
    if (packaging.status === "cleanup-error") return <p role="alert">Temporary files could not be cleared. Download remains unavailable.</p>
    if (packaging.status === "ready" || packaging.status === "download-triggered") {
        return <p>Archive ready · Temporary files cleared<br />
            {packaging.status === "download-triggered" ? "Download started" : "Ready to download"}</p>
    }
    if (progress.status === "running") return <p>Processing {progress.settled} / {progress.totalPlanned}<br />
        Succeeded {progress.succeeded} · Failed {progress.failed}<br />{progress.current?.filename}</p>
    if (progress.status === "cancelling") return <p>Cancelling...<br />Finishing current frame</p>
    return <div>
        <h2>{progress.status === "completed" ? "Completed" : progress.status === "cancelled" ? "Cancelled" : "Failed"}</h2>
        <p>{progress.succeeded} succeeded · {progress.failed} failed
            {progress.notProcessed ? ` · ${progress.notProcessed} not processed` : ""}</p>
        {progress.sourceSetExcluded > 0 && <p>{progress.sourceSetExcluded} excluded during scan</p>}
        {state.workspace.runner.getResult()?.fatalReason && <p role="alert">{state.workspace.runner.getResult()?.fatalReason}</p>}
    </div>
}

function PostAuthoring({ workflow, state, onStartOver }: {
    workflow: BatchWorkflowController
    state: BatchWorkflowState
    onStartOver: () => Promise<void>
}) {
    const workspace = state.kind === "workspace" ? state.workspace : null
    const progress = React.useSyncExternalStore(workspace?.runner.subscribe ?? noSubscribe,
        workspace?.runner.getSnapshot ?? getNull)
    const packaging = React.useSyncExternalStore(workspace?.packager.subscribe ?? noSubscribe,
        workspace?.packager.getSnapshot ?? getNull)
    const [feedback, setFeedback] = React.useState<string | null>(null)
    const [releaseOpen, setReleaseOpen] = React.useState(false)
    const [released, setReleased] = React.useState(false)
    const [savingArchive, setSavingArchive] = React.useState(false)
    const [archiveSaveError, setArchiveSaveError] = React.useState(false)
    const [confirmStartOver, setConfirmStartOver] = React.useState(false)
    const id = workspace?.id ?? null
    React.useEffect(() => {
        if (state.kind === "template-ready") workflow.chooseSource()
    }, [state.kind, workflow])

    const actions = batchActionState(state, progress, packaging, released)
    const cancel = async () => {
        if (state.kind === "workspace" && progress?.status === "running") {
            workflow.cancelRun()
            return
        }
        setFeedback(null)
        if (!await workflow.cancelToAuthoringSafely()) {
            setFeedback("Could not clear temporary files. The run is retained; select Cancel to retry.")
        }
    }
    const prepare = async () => {
        if (!workspace || !packaging) return
        if (packaging.status === "ready" || packaging.status === "download-triggered") {
            if (released) await download()
            else setReleaseOpen(true)
            return
        }
        const done = packaging.status === "cleanup-error" ? await workflow.retryCleanup() : await workflow.package()
        if (done && workflow.getSnapshot().kind === "workspace") setReleaseOpen(true)
    }
    const download = async () => {
        if (savingArchive) return
        setSavingArchive(true)
        setArchiveSaveError(false)
        try {
            const result = await workflow.downloadPrepared()
            if (result === "saved") {
                setReleased(true)
                setReleaseOpen(false)
                setFeedback(null)
            } else if (result === "failed") {
                setArchiveSaveError(true)
                setFeedback("Could not save the archive. It is retained in this page session.")
            }
        } finally { setSavingArchive(false) }
    }
    const startOver = () => {
        if (workspace && state.kind === "workspace" && state.disposition === "discard-error") {
            void onStartOver()
        } else if (workspace && progress && (progress.status === "running" || progress.status === "cancelling" ||
            (progress.status !== "idle" && packaging?.status !== "download-triggered"))) {
            setConfirmStartOver(true)
        } else void onStartOver()
    }

    return <>
        <section className="batch-overlay" style={EDITOR_ALERT_BACKDROP} aria-label="Batch Pixelation controls"
            inert={releaseOpen || confirmStartOver}>
            <div className="batch-overlay-actions">
                {state.kind === "source" ? <SourceSetPanel key={state.token} compact
                    referenceInputGeometry={state.sealed.referenceInputGeometry}
                    onSelectionStart={() => workflow.beginScan(state.token)}
                    onSelectionEnd={() => workflow.endScan(state.token)}
                    onScan={scan => workflow.acceptScan(scan, state.token)}
                    onFeedback={setFeedback} /> : <button type="button" disabled>Choose Source Folder</button>}
                <button type="button" className={actions.cancel ? "batch-cancel-active" : ""}
                    disabled={!actions.cancel} onClick={() => { void cancel() }}>Cancel</button>
                <button type="button" className={actions.start ? "batch-start-active" : ""}
                    disabled={!actions.start} onClick={() => { workflow.startSelectedRun(); setFeedback(null) }}>Start Batch</button>
                <div className="batch-info" aria-live="polite" aria-label="Batch information">
                    <BatchInfo state={state} progress={progress} packaging={packaging} feedback={feedback} />
                </div>
                <button type="button" className={actions.prepare ? "batch-prepare-active" : ""}
                    disabled={!actions.prepare} onClick={() => { void prepare() }}>{actions.prepareLabel}</button>
                <button type="button" className="batch-start-over" disabled={!actions.startOver}
                    onClick={startOver}>START OVER</button>
            </div>
        </section>
        {releaseOpen && <div className="batch-modal-backdrop">
            <section className="batch-release-modal" role="dialog" aria-modal="true" aria-labelledby="batch-release-title">
                <h2 id="batch-release-title">ARCHIVE READY</h2>
                <p>Batch Pixelation is free during Early Access.<br />Continue to download your ZIP.</p>
                {archiveSaveError && <p role="alert">Could not save the archive. It is retained in this page session.</p>}
                <div>
                    <button type="button" onClick={() => setReleaseOpen(false)}>NOT NOW</button>
                    <button type="button" disabled={savingArchive} onClick={() => { void download() }}>DOWNLOAD</button>
                </div>
            </section>
        </div>}
        {confirmStartOver && <div className="batch-modal-backdrop">
            <section className="batch-reset-modal" role="dialog" aria-modal="true" aria-labelledby="batch-reset-title">
                <h2 id="batch-reset-title">Start over?</h2>
                <p>Current progress and any prepared archive in this page session will be discarded.</p>
                <div>
                    <button type="button" onClick={() => setConfirmStartOver(false)}>Keep this run</button>
                    <button type="button" onClick={() => { setConfirmStartOver(false); void onStartOver() }}>Discard and start over</button>
                </div>
            </section>
        </div>}
        <output data-testid="batch-output-run-id" hidden>{id ?? ""}</output>
        <output data-testid="batch-run-progress" hidden>{progress ? JSON.stringify(progress) : ""}</output>
        <output data-testid="batch-run-result" hidden>{workspace?.runner.getResult() ? JSON.stringify(workspace.runner.getResult()) : ""}</output>
        <output data-testid="batch-packaging-state" hidden>{packaging ? JSON.stringify(packaging) : ""}</output>
    </>
}

export default function BatchPixelationRoute() {
    const [workflow] = React.useState(() => new BatchWorkflowController())
    const state = React.useSyncExternalStore(workflow.subscribe, workflow.getSnapshot)
    const templateInput = React.useRef<HTMLInputElement>(null)
    const referenceInput = React.useRef<HTMLInputElement>(null)
    const openToken = React.useRef<number | null>(null)
    const [referenceFile, setReferenceFile] = React.useState<File | null>(null)
    const [legacyConfirmed, setLegacyConfirmed] = React.useState(false)
    React.useEffect(() => {
        if (!import.meta.env.DEV) return
        console.info("[Batch Pixelation][reference intake] workflow", {
            state: state.kind,
            hasReferenceFile: referenceFile !== null,
            error: state.kind === "entry" ? state.error : null,
        })
        if (state.kind !== "entry" || state.error) return
        const frame = requestAnimationFrame(() => {
            const brand = document.querySelector(".batch-entry-brand")
            const feature = document.querySelector(".batch-entry-feature")
            console.info("[Batch Pixelation][reference intake] entry after paint", {
                brand: brand?.getBoundingClientRect().toJSON() ?? null,
                feature: feature?.getBoundingClientRect().toJSON() ?? null,
                actions: document.querySelectorAll(".batch-entry-action").length,
                videoReady: !!document.querySelector(".batch-intro-canvas-ready"),
            })
        })
        return () => cancelAnimationFrame(frame)
    }, [state, referenceFile])
    const postAuthoring = state.kind === "template-ready" || state.kind === "source" || state.kind === "workspace"
    const postAuthoringRef = React.useRef(postAuthoring)
    React.useLayoutEffect(() => { postAuthoringRef.current = postAuthoring }, [postAuthoring])
    React.useLayoutEffect(() => {
        const blockHiddenEditorKey = (event: KeyboardEvent) => {
            if (!postAuthoringRef.current) return
            const historyKey = event.ctrlKey && !event.altKey && (event.code === "KeyZ" || event.key.toLowerCase() === "z")
            const bodySpace = event.code === "Space" &&
                (event.target === document.body || event.target === document.documentElement)
            if (!historyKey && !bodySpace) return
            event.preventDefault()
            event.stopImmediatePropagation()
        }
        window.addEventListener("keydown", blockHiddenEditorKey, true)
        window.addEventListener("keyup", blockHiddenEditorKey, true)
        return () => {
            window.removeEventListener("keydown", blockHiddenEditorKey, true)
            window.removeEventListener("keyup", blockHiddenEditorKey, true)
        }
    }, [])
    React.useEffect(() => { void workflow.scanOrphans(); return () => workflow.dispose() }, [workflow])
    React.useEffect(() => {
        const element = templateInput.current
        const cancel = () => { if (openToken.current !== null) workflow.cancelOpen(openToken.current) }
        element?.addEventListener("cancel", cancel)
        return () => element?.removeEventListener("cancel", cancel)
    }, [workflow])

    const chooseTemplate = () => {
        const token = workflow.beginOpen()
        if (token === null) return
        openToken.current = token
        setReferenceFile(null)
        templateInput.current?.click()
    }
    const reset = async () => {
        if (await workflow.startOverSafely()) setReferenceFile(null)
    }
    const rejectReference = React.useCallback((message: string) => {
        if (import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] preflight rejected", { message })
        if (workflow.rejectReference(message)) setReferenceFile(null)
    }, [workflow])
    const entry = state.kind === "entry" || state.kind === "opening"
    return <main className={entry ? "batch-page batch-page-entry" : "batch-page batch-page-workflow"}>
        <input ref={referenceInput} type="file"
            aria-label="Reference Frame file" hidden onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ""
                if (file && import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] selected", {
                    bytes: file.size, type: file.type,
                })
                if (file && workflow.configure()) setReferenceFile(file)
            }} />
        <input ref={templateInput} type="file" accept=".pixtudiobatch,.pixtudio-batch,application/json" aria-label="Batch Recipe file" hidden
            onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ""
                const token = openToken.current
                if (token === null) return
                if (file) void workflow.open(file, token)
                else workflow.cancelOpen(token)
            }} />
        {(entry || (postAuthoring && !referenceFile)) && <div
            className={postAuthoring ? "batch-entry-backdrop" : undefined} aria-hidden={postAuthoring}
            inert={postAuthoring}>
            <EntryVisual inactive={state.kind === "opening" || postAuthoring}
                onReference={() => referenceInput.current?.click()} onRecipe={chooseTemplate} />
        </div>}
        {entry && <>
            {state.kind === "entry" && state.error && <EditorImportErrorModal title="IMPORT ERROR"
                message={state.error} onDismiss={() => {
                    if (import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] dismiss entry alert")
                    workflow.dismissEntryError()
                }} />}
            {state.kind === "entry" && state.storageNotice && <p className="batch-entry-message" role="status">{state.storageNotice}</p>}
            {state.kind === "entry" && !!state.legacyRunIds?.length && state.legacyCleanup === "idle" &&
                <button type="button" className="batch-legacy-link" onClick={() => { setLegacyConfirmed(false); workflow.beginLegacyCleanup() }}>
                    Clear old temporary files</button>}
            {state.kind === "entry" && state.legacyCleanup === "review" && <section className="batch-legacy-review">
                <p>Close all older Batch Pixelation tabs in this browser profile first. Clearing old temporary files permanently removes unfinished outputs from those runs. Downloaded ZIPs and saved Recipes are not affected.</p>
                <label><input type="checkbox" checked={legacyConfirmed} onChange={event => setLegacyConfirmed(event.target.checked)} />
                    I closed older Batch tabs and do not need their unfinished outputs.</label>
                <button type="button" disabled={!legacyConfirmed} onClick={() => { void workflow.confirmLegacyCleanup(legacyConfirmed); setLegacyConfirmed(false) }}>Clear old temporary files</button>
                <button type="button" onClick={() => { workflow.cancelLegacyCleanup(); setLegacyConfirmed(false) }}>Cancel</button>
            </section>}
            {state.kind === "entry" && state.legacyCleanup === "cleaning" && <p role="status">Clearing old temporary files...</p>}
        </>}
        {referenceFile && !entry && <div className={postAuthoring ? "batch-reference-stage batch-reference-frozen" : "batch-reference-stage"}
            inert={postAuthoring} aria-hidden={postAuthoring}>
            <BatchReferenceRoute initialFile={referenceFile}
                onInitialFileError={rejectReference}
                onGoNext={sealed => { if (state.kind === "authoring") workflow.seal(sealed, state.token) }}
                onSaveRecipe={sealed => state.kind === "authoring"
                    ? workflow.saveAuthoringRecipe(sealed, state.token) : Promise.resolve("failed")}
                onStartOver={state.kind === "authoring" ? () => { void reset() } : undefined} />
        </div>}
        {postAuthoring && <>
            <PostAuthoring key={state.kind === "workspace" ? state.workspace.id :
                state.kind === "source" ? `source-${state.token}` : "template"}
                workflow={workflow} state={state} onStartOver={reset} />
        </>}
        <output data-testid="batch-workflow-state" hidden>{state.kind}</output>
    </main>
}
