import { describe, expect, it } from "vitest"

import {
    createRootHistoryState,
    rootHistoryAbort,
    rootHistoryBegin,
    rootHistoryCanRedo,
    rootHistoryCanUndo,
    rootHistoryClear,
    rootHistoryCommit,
    rootHistoryFinalize,
    rootHistoryRedo,
    rootHistoryUndo,
} from "./rootHistory.ts"

type EditorState = { label: string; userSwatches: string[] }
type SmartState = { revision: number }

const editor = (label: string, userSwatches: string[] = []): EditorState => ({
    label,
    userSwatches,
})

const smart = (revision: number): SmartState => ({ revision })

describe("root history coordinator", () => {
    it("records one entry for begin/finalize/commit", () => {
        const history = createRootHistoryState<EditorState, SmartState>()

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("before"),
            smartBefore: smart(1),
        })
        rootHistoryFinalize(history, smart(2))

        const entry = rootHistoryCommit(history, editor("after"))

        expect(entry).toEqual({
            kind: "editor-action",
            editorBefore: editor("before"),
            editorAfter: editor("after"),
            smartBefore: smart(1),
            smartAfter: smart(2),
        })
        expect(history.committed).toHaveLength(1)
        expect(history.redo).toHaveLength(0)
        expect(history.pending).toBeNull()
        expect(rootHistoryCanUndo(history)).toBe(true)
    })

    it("does not record entries for abort or commit without begin", () => {
        const history = createRootHistoryState<EditorState, SmartState>()

        expect(rootHistoryCommit(history, editor("orphan"))).toBeNull()

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("before"),
            smartBefore: smart(1),
        })
        rootHistoryAbort(history)

        expect(rootHistoryCommit(history, editor("after"))).toBeNull()
        expect(history.committed).toHaveLength(0)
        expect(history.pending).toBeNull()
        expect(rootHistoryCanUndo(history)).toBe(false)
    })

    it("does not record a no-op commit when both domains are unchanged", () => {
        const history = createRootHistoryState<EditorState, SmartState>()
        const beforeEditor = editor("same", ["user-1"])
        const beforeSmart = smart(1)

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: beforeEditor,
            smartBefore: beforeSmart,
        })
        rootHistoryFinalize(history, smart(1))

        const entry = rootHistoryCommit(history, editor("same", ["user-1"]), {
            isEditorEqual: (a, b) =>
                a?.label === b?.label &&
                a?.userSwatches.join("|") === b?.userSwatches.join("|"),
            isSmartEqual: (a, b) => a?.revision === b?.revision,
        })

        expect(entry).toBeNull()
        expect(history.committed).toHaveLength(0)
        expect(history.redo).toHaveLength(0)
        expect(history.pending).toBeNull()
        expect(rootHistoryCanUndo(history)).toBe(false)
    })

    it("restores both domains through undo and redo", () => {
        const history = createRootHistoryState<EditorState, SmartState>()

        rootHistoryBegin(history, {
            kind: "smart-object-apply",
            editorBefore: editor("old-editor"),
            smartBefore: smart(10),
        })
        rootHistoryFinalize(history, smart(11))
        rootHistoryCommit(history, editor("new-editor"))

        const undoEntry = rootHistoryUndo(history)
        expect(undoEntry?.editorBefore).toEqual(editor("old-editor"))
        expect(undoEntry?.smartBefore).toEqual(smart(10))
        expect(rootHistoryCanUndo(history)).toBe(false)
        expect(rootHistoryCanRedo(history)).toBe(true)

        const redoEntry = rootHistoryRedo(history)
        expect(redoEntry?.editorAfter).toEqual(editor("new-editor"))
        expect(redoEntry?.smartAfter).toEqual(smart(11))
        expect(rootHistoryCanUndo(history)).toBe(true)
        expect(rootHistoryCanRedo(history)).toBe(false)
    })

    it("clears redo on a new commit after undo", () => {
        const history = createRootHistoryState<EditorState, SmartState>()

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("a"),
            smartBefore: smart(1),
        })
        rootHistoryCommit(history, editor("b"))
        rootHistoryUndo(history)

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("a"),
            smartBefore: smart(1),
        })
        rootHistoryCommit(history, editor("c"))

        expect(history.committed).toHaveLength(1)
        expect(history.committed[0]?.editorAfter).toEqual(editor("c"))
        expect(history.redo).toHaveLength(0)
        expect(rootHistoryCanRedo(history)).toBe(false)
    })

    it("clears committed, redo, and pending at import/load boundaries", () => {
        const history = createRootHistoryState<EditorState, SmartState>()

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("before"),
            smartBefore: smart(1),
        })
        rootHistoryCommit(history, editor("after"))
        rootHistoryUndo(history)
        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: editor("pending"),
            smartBefore: smart(2),
        })

        rootHistoryClear(history)

        expect(history.committed).toHaveLength(0)
        expect(history.redo).toHaveLength(0)
        expect(history.pending).toBeNull()
        expect(rootHistoryCanUndo(history)).toBe(false)
        expect(rootHistoryCanRedo(history)).toBe(false)
    })

    it("records user swatch creation as an undoable editor action", () => {
        const history = createRootHistoryState<EditorState, SmartState>()
        const before = editor("before", [])
        const after = editor("after", ["user-1"])

        rootHistoryBegin(history, {
            kind: "editor-action",
            editorBefore: before,
            smartBefore: smart(0),
        })
        rootHistoryFinalize(history, smart(0))
        rootHistoryCommit(history, after)

        const undoEntry = rootHistoryUndo(history)
        expect(undoEntry?.editorBefore?.userSwatches).toEqual([])

        const redoEntry = rootHistoryRedo(history)
        expect(redoEntry?.editorAfter?.userSwatches).toEqual(["user-1"])
    })
})
