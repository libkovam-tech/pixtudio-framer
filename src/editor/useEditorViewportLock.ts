import React from "react"

const EDITOR_VIEWPORT_CONTENT =
    "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual"

const LOCK_CLASS = "pixtudio-editor-viewport-lock"

export function useEditorViewportLock() {
    React.useEffect(() => {
        if (typeof document === "undefined") return

        let viewportMeta = document.querySelector<HTMLMetaElement>(
            'meta[name="viewport"]'
        )
        const createdViewportMeta = !viewportMeta
        if (!viewportMeta) {
            viewportMeta = document.createElement("meta")
            viewportMeta.name = "viewport"
            document.head.appendChild(viewportMeta)
        }

        const previousViewportContent = viewportMeta.getAttribute("content")
        viewportMeta.setAttribute("content", EDITOR_VIEWPORT_CONTENT)

        document.documentElement.classList.add(LOCK_CLASS)
        document.body.classList.add(LOCK_CLASS)

        const preventGesture = (event: Event) => {
            event.preventDefault()
        }

        const preventMultiTouch = (event: TouchEvent) => {
            if (event.touches.length <= 1) return
            event.preventDefault()
        }

        const preventBrowserWheelZoom = (event: WheelEvent) => {
            if (!event.ctrlKey) return
            event.preventDefault()
        }

        const touchOptions: AddEventListenerOptions = {
            capture: true,
            passive: false,
        }
        const activeOptions: AddEventListenerOptions = {
            capture: true,
            passive: false,
        }

        document.addEventListener("touchstart", preventMultiTouch, touchOptions)
        document.addEventListener("touchmove", preventMultiTouch, touchOptions)
        document.addEventListener("gesturestart", preventGesture, activeOptions)
        document.addEventListener("gesturechange", preventGesture, activeOptions)
        document.addEventListener("gestureend", preventGesture, activeOptions)
        window.addEventListener("gesturestart", preventGesture, activeOptions)
        window.addEventListener("gesturechange", preventGesture, activeOptions)
        window.addEventListener("gestureend", preventGesture, activeOptions)
        window.addEventListener("wheel", preventBrowserWheelZoom, activeOptions)

        return () => {
            document.removeEventListener(
                "touchstart",
                preventMultiTouch,
                touchOptions
            )
            document.removeEventListener(
                "touchmove",
                preventMultiTouch,
                touchOptions
            )
            document.removeEventListener(
                "gesturestart",
                preventGesture,
                activeOptions
            )
            document.removeEventListener(
                "gesturechange",
                preventGesture,
                activeOptions
            )
            document.removeEventListener(
                "gestureend",
                preventGesture,
                activeOptions
            )
            window.removeEventListener(
                "gesturestart",
                preventGesture,
                activeOptions
            )
            window.removeEventListener(
                "gesturechange",
                preventGesture,
                activeOptions
            )
            window.removeEventListener("gestureend", preventGesture, activeOptions)
            window.removeEventListener(
                "wheel",
                preventBrowserWheelZoom,
                activeOptions
            )

            document.documentElement.classList.remove(LOCK_CLASS)
            document.body.classList.remove(LOCK_CLASS)

            if (createdViewportMeta) {
                viewportMeta?.remove()
                return
            }
            if (previousViewportContent === null) {
                viewportMeta?.removeAttribute("content")
                return
            }
            viewportMeta?.setAttribute("content", previousViewportContent)
        }
    }, [])
}
