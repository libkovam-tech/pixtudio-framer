import * as React from "react"
import { EditorImportErrorModal } from "../../../editor/EditorImportErrorModal.tsx"
import { chooseSourceDirectory, directoryFromInputFiles, directoryFromSelectedFiles, isIOSDevice,
    supportsInputDirectoryPicker, supportsSourceDirectoryPicker, type SourceDirectoryHandle } from "./sourceDirectory.ts"
import { scanSourceSet, type SourceGeometry, type SourceSetScan } from "./scanSourceSet.ts"

type ScanState =
    | { kind: "idle" | "choosing" | "scanning" }
    | { kind: "ready"; result: SourceSetScan }
    | { kind: "failed"; message: string }

export function SourceSetPanel({ referenceInputGeometry, onScan, onSelectionStart, onSelectionEnd, compact = false, onFeedback }: {
    referenceInputGeometry: SourceGeometry
    onScan?: (result: SourceSetScan | null) => void
    onSelectionStart?: () => boolean
    onSelectionEnd?: () => void
    compact?: boolean
    onFeedback?: (message: string | null) => void
}) {
    const [state, setState] = React.useState<ScanState>({ kind: "idle" })
    const [selectionNotice, setSelectionNotice] = React.useState<string | null>(null)
    const [unsupportedAlertOpen, setUnsupportedAlertOpen] = React.useState(true)
    const revision = React.useRef(0)
    const activeScan = React.useRef<AbortController | null>(null)
    const busy = React.useRef(false)
    const folderInputRef = React.useRef<HTMLInputElement>(null)
    const filesInputRef = React.useRef<HTMLInputElement>(null)
    const pendingInput = React.useRef<{
        mode: "folder" | "files"
        resolve: (directory: SourceDirectoryHandle | null) => void
        reject: (error: Error) => void
    } | null>(null)
    const nativePicker = supportsSourceDirectoryPicker()
    const inputPicker = !nativePicker && supportsInputDirectoryPicker()
    const filesPicker = typeof navigator !== "undefined" && isIOSDevice(navigator.userAgent, navigator.maxTouchPoints)
    const folderPicker = nativePicker || inputPicker
    const supported = folderPicker || filesPicker

    React.useEffect(() => () => {
        revision.current++
        activeScan.current?.abort()
        pendingInput.current?.resolve(null)
        pendingInput.current = null
    }, [])

    React.useEffect(() => {
        const cancel = () => {
            pendingInput.current?.resolve(null)
            pendingInput.current = null
        }
        const inputs = [folderInputRef.current, filesInputRef.current].filter(input => input !== null)
        for (const input of inputs) input.addEventListener("cancel", cancel)
        return () => { for (const input of inputs) input.removeEventListener("cancel", cancel) }
    }, [inputPicker, filesPicker])

    const onInputChange = (event: React.ChangeEvent<HTMLInputElement>, mode: "folder" | "files") => {
        const files = Array.from(event.currentTarget.files ?? [])
        event.currentTarget.value = ""
        const pending = pendingInput.current
        if (!pending || pending.mode !== mode) return
        pendingInput.current = null
        try {
            pending.resolve(files.length ? mode === "folder" ? directoryFromInputFiles(files) :
                directoryFromSelectedFiles(files) : null)
        } catch (error) {
            pending.reject(error instanceof Error ? error : new Error("The selected source could not be read."))
        }
    }

    const chooseSource = async (mode: "folder" | "files") => {
        if (busy.current || onSelectionStart?.() === false) return
        busy.current = true
        let ownedRevision = revision.current
        const previous = state
        setSelectionNotice(null)
        setState({ kind: "choosing" })
        onFeedback?.(mode === "folder" ? "Choosing folder..." : "Choosing frames...")
        try {
            // Both picker variants must open directly from the click's user activation.
            const selection = mode === "folder" && nativePicker ? chooseSourceDirectory() :
                new Promise<SourceDirectoryHandle | null>((resolve, reject) => {
                const input = mode === "folder" ? folderInputRef.current : filesInputRef.current
                if (!input) throw new Error("The source picker is unavailable.")
                if (mode === "folder") input.webkitdirectory = true
                pendingInput.current = { mode, resolve, reject }
                input.click()
            })
            const directory = await selection
            if (ownedRevision !== revision.current) return
            if (!directory) {
                setState(previous)
                onScan?.(previous.kind === "ready" ? previous.result : null)
                setSelectionNotice(mode === "folder" ?
                    "Folder selection was cancelled or not permitted. Source Set unchanged." :
                    "Frame selection was cancelled or not permitted. Source Set unchanged.")
                onFeedback?.(mode === "folder" ? "Folder selection was cancelled. Source Set unchanged." :
                    "Frame selection was cancelled. Source Set unchanged.")
                return
            }
            const nextRevision = ++revision.current
            onScan?.(null)
            ownedRevision = nextRevision
            activeScan.current?.abort()
            const controller = new AbortController()
            activeScan.current = controller
            setState({ kind: "scanning" })
            onFeedback?.("Scanning source...")
            const result = await scanSourceSet(directory, referenceInputGeometry, controller.signal)
            if (nextRevision === revision.current && !controller.signal.aborted) {
                setState({ kind: "ready", result })
                onFeedback?.(null)
                onScan?.(result)
            }
        } catch (error) {
            if (ownedRevision === revision.current && !activeScan.current?.signal.aborted) {
                setState({ kind: "failed", message: error instanceof Error ? error.message :
                    "The Source Folder could not be scanned." })
                onFeedback?.(error instanceof Error ? error.message : "The Source Folder could not be scanned.")
                onScan?.(null)
            }
        } finally {
            busy.current = false
            onSelectionEnd?.()
        }
    }

    return <section aria-label="Source Set" className={compact ? "batch-source-compact" : undefined}
        style={compact ? undefined : { width: "min(380px, calc(100vw - 40px))" }}>
        {inputPicker && <input ref={folderInputRef} type="file" hidden aria-label="Source Folder files"
            onChange={event => onInputChange(event, "folder")} />}
        {filesPicker && <input ref={filesInputRef} type="file" hidden multiple aria-label="Source Frame files"
            onChange={event => onInputChange(event, "files")} />}
        {folderPicker && <button type="button" onClick={() => { void chooseSource("folder") }}
            disabled={state.kind === "choosing" || state.kind === "scanning"}>
                Choose Source Folder
            </button>}
        {filesPicker && <button type="button" onClick={() => { void chooseSource("files") }}
            disabled={state.kind === "choosing" || state.kind === "scanning"}>
                Choose Source Files
            </button>}
        {!supported && !compact && <p role="alert">Folder selection is not supported in this browser.</p>}
        {compact && !supported && unsupportedAlertOpen && <EditorImportErrorModal title="FOLDER SELECTION ERROR"
            message="Folder selection is not supported in this browser."
            onDismiss={() => setUnsupportedAlertOpen(false)} />}
        {!compact && state.kind === "choosing" && <p role="status">Choosing source...</p>}
        {!compact && state.kind === "scanning" && <p role="status">Scanning Source Set...</p>}
        {!compact && selectionNotice && <p role="status">{selectionNotice}</p>}
        {!compact && state.kind === "failed" && <p role="alert">{state.message}</p>}
        {!compact && state.kind === "ready" && <>
            <p role="status">
                {state.result.manifest.folderDisplayName}: {state.result.manifest.overallStatus}
                {` (${state.result.manifest.counts.processable} eligible, ${state.result.manifest.counts.skipped} skipped)`}
            </p>
            <details>
                <summary>Scan details</summary>
                <ol style={{ maxHeight: "24vh", overflow: "auto", paddingLeft: 24 }}>
                    {state.result.manifest.orderedCandidates.map(candidate => <li key={candidate.orderIndex}>
                        {candidate.filename}: {candidate.skipReason ?? candidate.plannedOutputName}
                    </li>)}
                </ol>
            </details>
        </>}
        <output data-testid="gate7-source-manifest" hidden>
            {state.kind === "ready" ? JSON.stringify(state.result.manifest) : ""}
        </output>
        <output data-testid="gate7-runtime-count" hidden>
            {state.kind === "ready" ? state.result.runtime.orderedFileHandles.length : ""}
        </output>
    </section>
}
