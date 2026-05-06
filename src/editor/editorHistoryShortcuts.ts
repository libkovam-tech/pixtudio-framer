export type EditorHistoryShortcutAction = "undo" | "redo"

export type EditorHistoryShortcutEvent = {
    key: string
    code?: string
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    target?: EventTarget | null
    preventDefault?: () => void
}

export type EditorHistoryShortcutHandlers = {
    undo: () => void
    redo: () => void
    canUndo?: boolean
    canRedo?: boolean
    log?: (stage: string, meta: Record<string, unknown>) => void
}

function describeShortcutTarget(target: EventTarget | null | undefined) {
    if (!target || typeof target !== "object") {
        return {
            editable: false,
            tagName: null,
            role: null,
            contentEditable: false,
        }
    }

    const element = target as {
        tagName?: string
        isContentEditable?: boolean
        getAttribute?: (name: string) => string | null
    }

    const tagName = element.tagName?.toLowerCase() ?? null
    const role = element.getAttribute?.("role") ?? null
    const inputType =
        tagName === "input"
            ? element.getAttribute?.("type")?.toLowerCase() ?? "text"
            : null
    const contentEditable = element.isContentEditable === true
    const editableInputTypes = new Set([
        "",
        "date",
        "datetime-local",
        "email",
        "month",
        "number",
        "password",
        "search",
        "tel",
        "text",
        "time",
        "url",
        "week",
    ])
    const editable =
        contentEditable ||
        (tagName === "input" && editableInputTypes.has(inputType ?? "text")) ||
        tagName === "textarea" ||
        tagName === "select" ||
        role === "textbox"

    return {
        editable,
        tagName,
        inputType,
        role,
        contentEditable,
    }
}

export function getEditorHistoryShortcutRejectionReason(
    event: EditorHistoryShortcutEvent
): string | null {
    if (describeShortcutTarget(event.target).editable) return "editable-target"
    if (!event.ctrlKey) return "ctrl-not-pressed"
    if (event.altKey) return "alt-is-pressed"
    if (event.code !== "KeyZ" && event.key.toLowerCase() !== "z") {
        return "not-physical-or-layout-z"
    }

    return null
}

export function getEditorHistoryShortcutAction(
    event: EditorHistoryShortcutEvent
): EditorHistoryShortcutAction | null {
    if (getEditorHistoryShortcutRejectionReason(event)) return null

    return event.shiftKey ? "redo" : "undo"
}

export function handleEditorHistoryShortcut(
    event: EditorHistoryShortcutEvent,
    handlers: EditorHistoryShortcutHandlers
) {
    const target = describeShortcutTarget(event.target)
    const commonMeta = {
        key: event.key,
        code: event.code ?? null,
        ctrlKey: event.ctrlKey === true,
        shiftKey: event.shiftKey === true,
        altKey: event.altKey === true,
        target,
        canUndo: handlers.canUndo ?? null,
        canRedo: handlers.canRedo ?? null,
    }

    const rejectionReason = getEditorHistoryShortcutRejectionReason(event)
    if (rejectionReason) {
        handlers.log?.("rejected", {
            ...commonMeta,
            reason: rejectionReason,
        })
        return false
    }

    const action = getEditorHistoryShortcutAction(event)
    if (!action) {
        handlers.log?.("rejected", {
            ...commonMeta,
            reason: "no-action",
        })
        return false
    }

    event.preventDefault?.()
    handlers.log?.("accepted", {
        ...commonMeta,
        action,
    })

    if (action === "undo") {
        if (handlers.canUndo !== false) {
            handlers.log?.("invoke", {
                ...commonMeta,
                action,
            })
            handlers.undo()
        } else {
            handlers.log?.("blocked", {
                ...commonMeta,
                action,
                reason: "undo-disabled",
            })
        }
        return true
    }

    if (handlers.canRedo !== false) {
        handlers.log?.("invoke", {
            ...commonMeta,
            action,
        })
        handlers.redo()
    } else {
        handlers.log?.("blocked", {
            ...commonMeta,
            action,
            reason: "redo-disabled",
        })
    }
    return true
}
