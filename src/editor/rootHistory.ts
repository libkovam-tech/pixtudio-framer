export type RootHistoryEntryKind =
    | "editor-action"
    | "smart-object-apply"
    | "unknown"

export type RootHistoryEntry<TEditor, TSmart> = {
    kind: RootHistoryEntryKind
    editorBefore: TEditor | null
    editorAfter: TEditor | null
    smartBefore: TSmart | null
    smartAfter: TSmart | null
}

export type RootHistoryPendingTransaction<TEditor, TSmart> = {
    kind: RootHistoryEntryKind
    editorBefore: TEditor | null
    smartBefore: TSmart | null
    smartAfter: TSmart | null
}

export type RootHistoryState<TEditor, TSmart> = {
    committed: RootHistoryEntry<TEditor, TSmart>[]
    redo: RootHistoryEntry<TEditor, TSmart>[]
    pending: RootHistoryPendingTransaction<TEditor, TSmart> | null
}

export type RootHistoryBeginInput<TEditor, TSmart> = {
    kind: RootHistoryEntryKind
    editorBefore: TEditor | null
    smartBefore: TSmart | null
}

export type RootHistoryCommitOptions<TEditor, TSmart> = {
    isEditorEqual?: (a: TEditor | null, b: TEditor | null) => boolean
    isSmartEqual?: (a: TSmart | null, b: TSmart | null) => boolean
}

export function createRootHistoryState<
    TEditor,
    TSmart,
>(): RootHistoryState<TEditor, TSmart> {
    return {
        committed: [],
        redo: [],
        pending: null,
    }
}

export function rootHistoryCanUndo<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
): boolean {
    return state.committed.length > 0
}

export function rootHistoryCanRedo<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
): boolean {
    return state.redo.length > 0
}

export function rootHistoryBegin<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>,
    input: RootHistoryBeginInput<TEditor, TSmart>
) {
    state.pending = {
        kind: input.kind,
        editorBefore: input.editorBefore,
        smartBefore: input.smartBefore,
        smartAfter: null,
    }
}

export function rootHistoryFinalize<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>,
    smartAfter: TSmart | null
): boolean {
    if (!state.pending) return false
    state.pending.smartAfter = smartAfter
    return true
}

export function rootHistoryCommit<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>,
    editorAfter: TEditor | null,
    options?: RootHistoryCommitOptions<TEditor, TSmart>
): RootHistoryEntry<TEditor, TSmart> | null {
    const pending = state.pending
    if (!pending) return null

    const editorEqual = options?.isEditorEqual
        ? options.isEditorEqual(pending.editorBefore, editorAfter)
        : Object.is(pending.editorBefore, editorAfter)
    const smartEqual = options?.isSmartEqual
        ? options.isSmartEqual(pending.smartBefore, pending.smartAfter)
        : Object.is(pending.smartBefore, pending.smartAfter)

    if (editorEqual && smartEqual) {
        state.pending = null
        return null
    }

    const entry: RootHistoryEntry<TEditor, TSmart> = {
        kind: pending.kind,
        editorBefore: pending.editorBefore,
        editorAfter,
        smartBefore: pending.smartBefore,
        smartAfter: pending.smartAfter,
    }

    state.committed.push(entry)
    state.redo = []
    state.pending = null
    return entry
}

export function rootHistoryAbort<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
) {
    state.pending = null
}

export function rootHistoryClear<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
) {
    state.committed = []
    state.redo = []
    state.pending = null
}

export function rootHistoryUndo<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
): RootHistoryEntry<TEditor, TSmart> | null {
    const entry = state.committed.pop()
    if (!entry) return null

    state.redo.push(entry)
    return entry
}

export function rootHistoryRedo<TEditor, TSmart>(
    state: RootHistoryState<TEditor, TSmart>
): RootHistoryEntry<TEditor, TSmart> | null {
    const entry = state.redo.pop()
    if (!entry) return null

    state.committed.push(entry)
    return entry
}
