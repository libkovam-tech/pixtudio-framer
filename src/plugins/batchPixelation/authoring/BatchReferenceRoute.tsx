import * as React from "react"
import "../batchRun.css"
import PixelEditorFramer from "../../../editor/PixelEditorFramer.tsx"
import { RESTRICTED_REFERENCE_CAPABILITIES, type EditorHost } from "../../../editor/editorHost.ts"
import { FileIntakeError } from "../../../editor/fileIntakeSecurity.ts"
import { useEditorViewportLock } from "../../../editor/useEditorViewportLock.ts"
import { BATCH_CROP_RASTER_POLICY } from "../cropRasterPolicy.ts"
import { prepareStaticBatchReferenceFile, BatchRasterPreflightError } from "../staticRasterPolicy.ts"
import { createBatchId } from "../batchId.ts"
import { BatchReferenceEnvelope, type SealedReference } from "./BatchReferenceEnvelope.ts"
import { SourceSetPanel } from "../sourceSet/SourceSetPanel.tsx"
import { BATCH_MANUAL_GUIDE } from "../BatchManualGuide.tsx"
import { EditorImportErrorModal } from "../../../editor/EditorImportErrorModal.tsx"

export default function BatchReferenceRoute({ onReferenceReady, onGoNext, onSaveRecipe, onStartOver, onInitialFileError, initialFile }: {
    onReferenceReady?: (sealed: SealedReference, file: File) => void
    onGoNext?: (sealed: SealedReference, file: File) => void
    onSaveRecipe?: (sealed: SealedReference) => Promise<"saved" | "cancelled" | "failed">
    onStartOver?: () => void
    onInitialFileError?: (message: string) => void
    initialFile?: File | null
} = {}) {
    useEditorViewportLock()
    const [file, setFile] = React.useState<File | null>(null)
    const [sessionId, setSessionId] = React.useState("")
    const [revision, setRevision] = React.useState(0)
    const [error, setError] = React.useState<string | null>(null)
    const [sealed, setSealed] = React.useState<SealedReference | null>(null)
    const [cropOpen, setCropOpen] = React.useState(true)
    const [checkingFile, setCheckingFile] = React.useState(!!initialFile)
    const [saveNotice, setSaveNotice] = React.useState<string | null>(null)
    const [savingRecipe, setSavingRecipe] = React.useState(false)
    const selectionRevision = React.useRef(0)
    const envelope = React.useMemo(
        () => sessionId ? new BatchReferenceEnvelope(sessionId) : null,
        [sessionId]
    )
    const host = React.useMemo<EditorHost | undefined>(() => {
        if (!file || !envelope) return undefined
        return {
            sessionId,
            fullscreenPreviewEnabled: true,
            manualGuide: BATCH_MANUAL_GUIDE,
            initialImageFile: file,
            onInitialImageError: onInitialFileError,
            capabilities: {
                ...RESTRICTED_REFERENCE_CAPABILITIES,
                swatchMutation: true,
                builtinPresetSwatchMutation: true,
            },
            autoPaletteSnapshotPreset: { id: "batch-same-as-auto", name: "SAME AS AUTO", replacesBuiltinId: "sunset-10" },
            cropRasterPolicy: BATCH_CROP_RASTER_POLICY,
            onCommit: (commit) => {
                envelope.accept(commit)
                setSealed(null)
                setRevision(value => value + 1)
            },
            onStatus: (status) => {
                envelope.updateStatus(status)
                setCropOpen(status.cropOpen)
                if (!status.settled) setSealed(null)
                setRevision(value => value + 1)
            },
        }
    }, [file, envelope, sessionId, onInitialFileError])

    const acceptFile = React.useCallback(async (nextFile: File | undefined) => {
        if (!nextFile) return
        const revision = ++selectionRevision.current
        setSealed(null)
        setError(null)
        setCheckingFile(true)
        try {
            const preparedFile = await prepareStaticBatchReferenceFile(nextFile)
            if (revision !== selectionRevision.current) return
            setSessionId(createBatchId())
            setFile(preparedFile)
        } catch (failure) {
            if (revision !== selectionRevision.current) return
            setError(failure instanceof BatchRasterPreflightError || failure instanceof FileIntakeError
                ? failure.message : "The image could not be read.")
        } finally {
            if (revision === selectionRevision.current) setCheckingFile(false)
        }
    }, [])
    React.useEffect(() => {
        if (!initialFile) return
        if (import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] preflight started", {
            bytes: initialFile.size, type: initialFile.type,
        })
        const revisionRef = selectionRevision
        const revision = ++revisionRef.current
        void prepareStaticBatchReferenceFile(initialFile).then(preparedFile => {
            if (revision !== selectionRevision.current) return
            if (import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] preflight passed", {
                bytes: preparedFile.size, type: preparedFile.type,
            })
            setSessionId(createBatchId())
            setFile(preparedFile)
        }).catch(failure => {
            if (revision !== selectionRevision.current) return
            if (import.meta.env.DEV) console.info("[Batch Pixelation][reference intake] preflight failed", {
                code: failure instanceof BatchRasterPreflightError || failure instanceof FileIntakeError ? failure.code : "unexpected",
                message: failure instanceof Error ? failure.message : String(failure),
            })
            const message = failure instanceof BatchRasterPreflightError || failure instanceof FileIntakeError
                ? failure.message : "The image could not be read."
            if (onInitialFileError) onInitialFileError(message)
            else setError(message)
        }).finally(() => {
            if (revision === selectionRevision.current) setCheckingFile(false)
        })
        return () => { revisionRef.current++ }
    }, [initialFile, onInitialFileError])

    const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextFile = event.currentTarget.files?.[0]
        event.currentTarget.value = ""
        void acceptFile(nextFile)
    }

    const captureCurrent = (): SealedReference | null => {
        if (!envelope) return null
        try {
            const next = envelope.seal()
            setSealed(next)
            setError(null)
            return next
        } catch (failure) {
            setSealed(null)
            setError(failure instanceof Error ? failure.message : "Reference cannot be sealed")
            return null
        }
    }

    const setAsReference = () => {
        const next = captureCurrent()
        if (!next) return
        setSaveNotice("Reference sealed")
        if (file) onReferenceReady?.(next, file)
    }

    const saveRecipe = async () => {
        if (!onSaveRecipe || savingRecipe) return
        const current = onGoNext ? captureCurrent() : sealed
        if (!current) return
        setSavingRecipe(true)
        try {
            const result = await onSaveRecipe(current)
            setSaveNotice(result === "cancelled" || (result === "saved" && onGoNext) ? null
                : result === "saved" ? "Recipe save started" : "Could not save Recipe")
        } finally { setSavingRecipe(false) }
    }

    const goNext = () => {
        if (!file || !onGoNext) return
        const current = captureCurrent()
        if (current) onGoNext(current, file)
    }

    return (
        <>
            {!host && initialFile && <main className="batch-reference-loading" role="status" aria-label="Preparing reference frame" aria-busy="true">
                <span aria-hidden="true" />
            </main>}
            {!host && !initialFile && <main className="batch-reference-intake">
                <label htmlFor="gate5-reference-file">Choose Reference Frame</label>
                <input id="gate5-reference-file" type="file" onChange={chooseFile} />
                {checkingFile && <span role="status">Checking file...</span>}
                {error && <span role="alert">{error}</span>}
            </main>}
            {host && <>
                <PixelEditorFramer key={sessionId} host={host} onHostHome={onStartOver}
                    controlsSlot={onGoNext ? <div className="batch-authoring-inline-actions">
                        <button type="button" className="batch-authoring-save" disabled={!envelope?.isSettled || !onSaveRecipe || savingRecipe} onClick={() => { void saveRecipe() }}>Save Batch <br className="batch-authoring-mobile-break" />Recipe</button>
                        <button type="button" className="batch-authoring-next" disabled={!envelope?.isSettled} onClick={goNext}>Choose Source <br className="batch-authoring-mobile-break" />Frames</button>
                    </div> : undefined} />
                {!cropOpen && !onGoNext && <div className="batch-authoring-actions">
                    <button type="button" className="batch-authoring-reference" disabled={!!sealed && !!onGoNext} onClick={setAsReference}>Set as Reference</button>
                    <button type="button" className="batch-authoring-save" disabled={!sealed || !onSaveRecipe || savingRecipe} onClick={() => { void saveRecipe() }}>Save Recipe</button>
                    <button type="button" className="batch-authoring-next" disabled={!sealed || !onGoNext} onClick={goNext}>Go Next Step</button>
                </div>}
                {error && <EditorImportErrorModal title="RECIPE ERROR"
                    message={error} onDismiss={() => setError(null)} />}
                {!error && saveNotice === "Could not save Recipe" && <EditorImportErrorModal title="SAVE ERROR"
                    message={saveNotice} onDismiss={() => setSaveNotice(null)} />}
                {!error && saveNotice && saveNotice !== "Could not save Recipe" &&
                    <p className="batch-authoring-notice" role="status">{saveNotice}</p>}
            </>}
            {sealed && !onGoNext && <div className="batch-legacy-source-panel">
                <SourceSetPanel referenceInputGeometry={sealed.referenceInputGeometry} />
            </div>}
            <output data-testid="gate5-revision" hidden>{revision}</output>
            <output data-testid="gate5-sealed-reference" hidden>{sealed ? JSON.stringify(sealed) : ""}</output>
        </>
    )
}
