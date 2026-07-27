import * as React from "react"

type ApplyCancelShortcutOptions = {
    enabled?: boolean
    canApply?: boolean
    onApply?: () => void
    onCancel?: () => void
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true

    return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    )
}

function isDesktopShortcutEnvironment(): boolean {
    if (typeof window === "undefined") return false
    if (typeof window.matchMedia !== "function") return true

    return window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

export function useDesktopApplyCancelShortcuts({
    enabled = true,
    canApply = true,
    onApply,
    onCancel,
}: ApplyCancelShortcutOptions) {
    React.useEffect(() => {
        if (!enabled || !isDesktopShortcutEnvironment()) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat) return
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
                return
            }
            if (isEditableShortcutTarget(event.target)) {
                return
            }

            if (event.key === "Enter" && onApply && canApply) {
                event.preventDefault()
                event.stopPropagation()
                onApply()
                return
            }

            if (event.key === "Escape" && onCancel) {
                event.preventDefault()
                event.stopPropagation()
                onCancel()
            }
        }

        window.addEventListener("keydown", handleKeyDown, true)

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true)
        }
    }, [canApply, enabled, onApply, onCancel])
}
