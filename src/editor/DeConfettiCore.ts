export type DeConfettiTieBreaker = 0 | 1 | 2 | 3

export type DeConfettiSettings = {
    enabled: boolean
    tieBreaker: DeConfettiTieBreaker
}

export type DeConfettiSwatchMeta<TIndex extends string | number> = {
    index: TIndex
    isTransparent?: boolean
}

export type DeConfettiResult<TIndex extends string | number> = {
    pixels: (TIndex | null)[][]
    iterations: number
    changed: boolean
}

export const DE_CONFETTI_MAX_ITERATIONS = 10

export const DE_CONFETTI_NEIGHBOR_OFFSETS = [
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
] as const

const DEFAULT_DE_CONFETTI_SETTINGS: DeConfettiSettings = {
    enabled: false,
    tieBreaker: 0,
}

function cloneGrid<T>(grid: ReadonlyArray<ReadonlyArray<T>>): T[][] {
    return grid.map((row) => row.slice())
}

function normalizeTieBreaker(value: unknown): DeConfettiTieBreaker {
    return value === 1 || value === 2 || value === 3 ? value : 0
}

export function resolveDeConfettiSettings(
    settings?: Partial<DeConfettiSettings> | null
): DeConfettiSettings {
    return {
        enabled: settings?.enabled === true,
        tieBreaker: normalizeTieBreaker(settings?.tieBreaker),
    }
}

function buildTransparentIndexSet<TIndex extends string | number>(
    swatches: ReadonlyArray<DeConfettiSwatchMeta<TIndex>> | undefined
): Set<TIndex> {
    const transparent = new Set<TIndex>()
    for (const swatch of swatches ?? []) {
        if (swatch.isTransparent) transparent.add(swatch.index)
    }
    return transparent
}

function buildAreaCounts<TIndex extends string | number>(
    pixels: ReadonlyArray<ReadonlyArray<TIndex | null>>,
    transparentIndices: ReadonlySet<TIndex>
): Map<TIndex, number> {
    const counts = new Map<TIndex, number>()
    for (const row of pixels) {
        for (const value of row) {
            if (value == null || transparentIndices.has(value)) continue
            counts.set(value, (counts.get(value) ?? 0) + 1)
        }
    }
    return counts
}

function compareIndex(a: string | number, b: string | number): number {
    if (typeof a === "number" && typeof b === "number") return a - b
    return String(a).localeCompare(String(b), "en")
}

function firstDirectionalCandidate<TIndex extends string | number>(
    neighbors: ReadonlyArray<TIndex>,
    tied: ReadonlySet<TIndex>
): TIndex {
    for (const neighbor of neighbors) {
        if (tied.has(neighbor)) return neighbor
    }
    return neighbors[0]
}

function chooseTieWinner<TIndex extends string | number>(params: {
    tied: TIndex[]
    clockwiseNeighbors: TIndex[]
    counterClockwiseNeighbors: TIndex[]
    areaCounts: ReadonlyMap<TIndex, number>
    tieBreaker: DeConfettiTieBreaker
}): TIndex {
    if (params.tieBreaker === 1) {
        return params.tied.slice().sort(compareIndex)[0]
    }

    if (params.tieBreaker === 2 || params.tieBreaker === 3) {
        const tiedSet = new Set(params.tied)
        const directional =
            params.tieBreaker === 2
                ? params.clockwiseNeighbors
                : params.counterClockwiseNeighbors
        return firstDirectionalCandidate(directional, tiedSet)
    }

    return params.tied
        .slice()
        .sort((a, b) => {
            const byArea = (params.areaCounts.get(b) ?? 0) -
                (params.areaCounts.get(a) ?? 0)
            return byArea !== 0 ? byArea : compareIndex(a, b)
        })[0]
}

function chooseReplacement<TIndex extends string | number>(params: {
    clockwiseNeighbors: TIndex[]
    counterClockwiseNeighbors: TIndex[]
    areaCounts: ReadonlyMap<TIndex, number>
    tieBreaker: DeConfettiTieBreaker
}): TIndex | null {
    if (params.clockwiseNeighbors.length === 0) return null

    const localCounts = new Map<TIndex, number>()
    for (const neighbor of params.clockwiseNeighbors) {
        localCounts.set(neighbor, (localCounts.get(neighbor) ?? 0) + 1)
    }

    let maxCount = 0
    for (const count of localCounts.values()) {
        if (count > maxCount) maxCount = count
    }

    const tied = Array.from(localCounts.entries())
        .filter(([, count]) => count === maxCount)
        .map(([index]) => index)

    if (tied.length === 1) return tied[0]

    return chooseTieWinner({
        tied,
        clockwiseNeighbors: params.clockwiseNeighbors,
        counterClockwiseNeighbors: params.counterClockwiseNeighbors,
        areaCounts: params.areaCounts,
        tieBreaker: params.tieBreaker,
    })
}

export function applyDeConfetti<TIndex extends string | number>(input: {
    pixels: ReadonlyArray<ReadonlyArray<TIndex | null>>
    settings?: Partial<DeConfettiSettings> | null
    swatches?: ReadonlyArray<DeConfettiSwatchMeta<TIndex>>
    maxIterations?: number
}): DeConfettiResult<TIndex> {
    const settings = resolveDeConfettiSettings(
        input.settings ?? DEFAULT_DE_CONFETTI_SETTINGS
    )
    const initialPixels = cloneGrid(input.pixels)
    if (!settings.enabled) {
        return { pixels: initialPixels, iterations: 0, changed: false }
    }

    const height = initialPixels.length
    if (height === 0) {
        return { pixels: initialPixels, iterations: 0, changed: false }
    }

    const transparentIndices = buildTransparentIndexSet(input.swatches)
    const maxIterations = Math.min(
        DE_CONFETTI_MAX_ITERATIONS,
        Math.max(0, Math.floor(input.maxIterations ?? DE_CONFETTI_MAX_ITERATIONS))
    )
    let current = initialPixels
    let changedAtLeastOnce = false
    let iterations = 0

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const areaCounts = buildAreaCounts(current, transparentIndices)
        const next = cloneGrid(current)
        let changedThisIteration = false

        for (let row = 0; row < current.length; row += 1) {
            const sourceRow = current[row] ?? []
            for (let column = 0; column < sourceRow.length; column += 1) {
                const value = sourceRow[column] ?? null
                if (value == null || transparentIndices.has(value)) continue

                const clockwiseCandidates: TIndex[] = []
                const candidateByDirection: Array<TIndex | null> = []
                let hasSameNeighbor = false

                for (const [rowOffset, columnOffset] of DE_CONFETTI_NEIGHBOR_OFFSETS) {
                    const neighborRow = current[row + rowOffset]
                    if (!neighborRow) {
                        candidateByDirection.push(null)
                        continue
                    }
                    const neighbor = neighborRow[column + columnOffset] ?? null
                    if (neighbor == null || transparentIndices.has(neighbor)) {
                        candidateByDirection.push(null)
                        continue
                    }
                    if (neighbor === value) {
                        hasSameNeighbor = true
                        break
                    }
                    clockwiseCandidates.push(neighbor)
                    candidateByDirection.push(neighbor)
                }

                if (hasSameNeighbor) continue

                const counterClockwiseCandidates = [
                    candidateByDirection[0],
                    candidateByDirection[7],
                    candidateByDirection[6],
                    candidateByDirection[5],
                    candidateByDirection[4],
                    candidateByDirection[3],
                    candidateByDirection[2],
                    candidateByDirection[1],
                ].filter((candidate): candidate is TIndex => candidate != null)
                const replacement = chooseReplacement({
                    clockwiseNeighbors: clockwiseCandidates,
                    counterClockwiseNeighbors: counterClockwiseCandidates,
                    areaCounts,
                    tieBreaker: settings.tieBreaker,
                })
                if (replacement != null && replacement !== value) {
                    next[row][column] = replacement
                    changedThisIteration = true
                }
            }
        }

        if (!changedThisIteration) break

        current = next
        changedAtLeastOnce = true
        iterations += 1
    }

    return {
        pixels: current,
        iterations,
        changed: changedAtLeastOnce,
    }
}
