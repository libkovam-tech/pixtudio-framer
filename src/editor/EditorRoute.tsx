import PixelEditorFramer from "./PixelEditorFramer"
import { useEditorViewportLock } from "./useEditorViewportLock"

export default function EditorRoute() {
  useEditorViewportLock()

  return <PixelEditorFramer />
}
