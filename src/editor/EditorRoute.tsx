import { useEffect } from "react"
import PixelEditorFramer from "./PixelEditorFramer"
import { useEditorViewportLock } from "./useEditorViewportLock"

export default function EditorRoute() {
  useEditorViewportLock()

  useEffect(() => {
    if (typeof document === "undefined") return undefined

    let robotsMeta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="robots"]'
    )
    const previousContent = robotsMeta?.getAttribute("content")
    const createdMeta = !robotsMeta

    if (!robotsMeta) {
      robotsMeta = document.createElement("meta")
      robotsMeta.name = "robots"
      document.head.appendChild(robotsMeta)
    }

    robotsMeta.setAttribute("content", "noindex, nofollow")

    return () => {
      if (createdMeta) {
        robotsMeta?.remove()
        return
      }

      if (previousContent == null) {
        robotsMeta?.removeAttribute("content")
        return
      }

      robotsMeta?.setAttribute("content", previousContent)
    }
  }, [])

  return <PixelEditorFramer />
}
