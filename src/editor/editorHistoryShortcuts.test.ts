import { describe, expect, it, vi } from "vitest"

import {
    getEditorHistoryShortcutAction,
    handleEditorHistoryShortcut,
    type EditorHistoryShortcutEvent,
} from "./editorHistoryShortcuts.ts"

function shortcut(
    input: Partial<EditorHistoryShortcutEvent>
): EditorHistoryShortcutEvent {
    return {
        key: "z",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        ...input,
    }
}

describe("editor history keyboard shortcuts", () => {
    it("maps Ctrl+Z to undo and Ctrl+Shift+Z to redo", () => {
        expect(getEditorHistoryShortcutAction(shortcut({}))).toBe("undo")
        expect(getEditorHistoryShortcutAction(shortcut({ shiftKey: true }))).toBe(
            "redo"
        )
    })

    it("uses the physical Z key independently of the active keyboard layout", () => {
        expect(
            getEditorHistoryShortcutAction(shortcut({ key: "я", code: "KeyZ" }))
        ).toBe("undo")
        expect(
            getEditorHistoryShortcutAction(
                shortcut({ key: "Я", code: "KeyZ", shiftKey: true })
            )
        ).toBe("redo")
    })

    it("routes shortcuts to coordinated handlers and prevents browser undo", () => {
        const undo = vi.fn()
        const redo = vi.fn()
        const undoEvent = shortcut({})
        const redoEvent = shortcut({ shiftKey: true })

        expect(
            handleEditorHistoryShortcut(undoEvent, {
                undo,
                redo,
                canUndo: true,
                canRedo: true,
            })
        ).toBe(true)
        expect(
            handleEditorHistoryShortcut(redoEvent, {
                undo,
                redo,
                canUndo: true,
                canRedo: true,
            })
        ).toBe(true)

        expect(undo).toHaveBeenCalledOnce()
        expect(redo).toHaveBeenCalledOnce()
        expect(undoEvent.preventDefault).toHaveBeenCalledOnce()
        expect(redoEvent.preventDefault).toHaveBeenCalledOnce()
    })

    it("does not hijack editable fields or unsupported key chords", () => {
        const undo = vi.fn()
        const redo = vi.fn()
        const editableTarget = {
            tagName: "INPUT",
            getAttribute: (name: string) => (name === "type" ? "text" : null),
        } as unknown as EventTarget
        const editableEvent = shortcut({ target: editableTarget })
        const altEvent = shortcut({ altKey: true })

        expect(handleEditorHistoryShortcut(editableEvent, { undo, redo })).toBe(
            false
        )
        expect(handleEditorHistoryShortcut(altEvent, { undo, redo })).toBe(false)
        expect(undo).not.toHaveBeenCalled()
        expect(redo).not.toHaveBeenCalled()
        expect(editableEvent.preventDefault).not.toHaveBeenCalled()
        expect(altEvent.preventDefault).not.toHaveBeenCalled()
    })

    it("allows shortcuts while a range slider keeps focus", () => {
        const undo = vi.fn()
        const redo = vi.fn()
        const sliderTarget = {
            tagName: "INPUT",
            getAttribute: (name: string) => (name === "type" ? "range" : null),
        } as unknown as EventTarget
        const event = shortcut({ target: sliderTarget })

        expect(
            handleEditorHistoryShortcut(event, {
                undo,
                redo,
                canUndo: true,
                canRedo: false,
            })
        ).toBe(true)

        expect(undo).toHaveBeenCalledOnce()
        expect(redo).not.toHaveBeenCalled()
        expect(event.preventDefault).toHaveBeenCalledOnce()
    })

    it("prevents the browser shortcut but skips disabled history actions", () => {
        const undo = vi.fn()
        const redo = vi.fn()
        const undoEvent = shortcut({})
        const redoEvent = shortcut({ shiftKey: true })

        expect(
            handleEditorHistoryShortcut(undoEvent, {
                undo,
                redo,
                canUndo: false,
                canRedo: false,
            })
        ).toBe(true)
        expect(
            handleEditorHistoryShortcut(redoEvent, {
                undo,
                redo,
                canUndo: false,
                canRedo: false,
            })
        ).toBe(true)

        expect(undo).not.toHaveBeenCalled()
        expect(redo).not.toHaveBeenCalled()
        expect(undoEvent.preventDefault).toHaveBeenCalledOnce()
        expect(redoEvent.preventDefault).toHaveBeenCalledOnce()
    })
})
