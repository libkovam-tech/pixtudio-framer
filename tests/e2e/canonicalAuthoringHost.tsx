import { createRoot } from "react-dom/client"
import { useState } from "react"
import { MemoryRouter } from "react-router-dom"
import PixelEditorFramer from "../../src/editor/PixelEditorFramer"
import { useEditorViewportLock } from "../../src/editor/useEditorViewportLock"
import { BATCH_CROP_RASTER_POLICY } from "../../src/plugins/batchPixelation/cropRasterPolicy"
import "../../src/index.css"

// Export controls are test-only; the actual restricted host is checked separately.
export default function AuthoringHost() {
    useEditorViewportLock()
    const [file, setFile] = useState<File | null>(null)
    return file ? <PixelEditorFramer host={{ sessionId: "canonical-export-proof",
        initialImageFile: file, cropRasterPolicy: BATCH_CROP_RASTER_POLICY }} /> :
        <input id="canonical-reference-file" type="file" onChange={event => setFile(event.currentTarget.files?.[0] ?? null)} />
}
const element = document.getElementById("root")
if (!element) throw new Error("Canonical authoring test root unavailable")
createRoot(element).render(<MemoryRouter><AuthoringHost /></MemoryRouter>)
