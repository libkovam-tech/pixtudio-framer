export type DirectionMode = "one-way" | "both-ways"

type RecorderStepParams = {
    includeGridRange: boolean
    includePaletteRange: boolean
    gridFrom: number
    gridTo: number
    gridSingle: number
    paletteFrom: number
    paletteTo: number
    paletteSingle: number
    direction: DirectionMode
}

export type RecorderStep = {
    gridSize: number
    paletteSize: number
}

function buildOneWayPath(from: number, to: number) {
    const out: number[] = []
    const step = from <= to ? 1 : -1
    for (let v = from; ; v += step) {
        out.push(v)
        if (v === to) break
    }
    return out
}

export function buildDirectedPath(
    from: number,
    to: number,
    direction: DirectionMode
): number[] {
    const forward = buildOneWayPath(from, to)
    if (direction === "one-way" || forward.length <= 1) return forward
    return [...forward, ...forward.slice(0, -1).reverse()]
}

function stretchTrackToLength(track: number[], length: number): number[] {
    if (length <= 0) return []
    if (track.length <= 1) return Array.from({ length }, () => track[0] ?? 0)
    if (track.length === length) return track.slice()

    return Array.from({ length }, (_, i) => {
        if (length === 1) return track[0]
        const sourceIndex = Math.round((i * (track.length - 1)) / (length - 1))
        return track[sourceIndex]
    })
}

export function buildRecorderSteps(params: RecorderStepParams): RecorderStep[] {
    const gridTrack = params.includeGridRange
        ? buildDirectedPath(params.gridFrom, params.gridTo, params.direction)
        : [params.gridSingle]
    const paletteTrack = params.includePaletteRange
        ? buildDirectedPath(
              params.paletteFrom,
              params.paletteTo,
              params.direction
          )
        : [params.paletteSingle]

    const length = Math.max(gridTrack.length, paletteTrack.length)
    const gridResolved = stretchTrackToLength(gridTrack, length)
    const paletteResolved = stretchTrackToLength(paletteTrack, length)

    return Array.from({ length }, (_, i) => ({
        gridSize: gridResolved[i],
        paletteSize: paletteResolved[i],
    }))
}
