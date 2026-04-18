import type { SmartReferenceAdjustments } from "./SmartReferenceEditor.tsx"

export const PROJECT_SNAPSHOT_V2_MAGIC = "PIXTUDIO" as const
export const PROJECT_SNAPSHOT_V2_VERSION = 2 as const
export const PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION = 1 as const
export const PROJECT_SNAPSHOT_V2_PALETTE_MIN = 10
export const PROJECT_SNAPSHOT_V2_PALETTE_MAX = 32
export const V2_CELL_NULL = -1 as const
export const V2_CELL_TRANSPARENT = -2 as const

export type ImportCellV2 = typeof V2_CELL_NULL | typeof V2_CELL_TRANSPARENT | number
export type StrokeSwatchIndexV2 = typeof V2_CELL_TRANSPARENT | number

export type AutoSwatchOverrideV2 = {
    hex?: string
    isTransparent?: boolean
}

export type AutoSwatchOverridesMapV2 = Record<string, AutoSwatchOverrideV2>

export type ProjectSnapshotV2 = {
    magic: typeof PROJECT_SNAPSHOT_V2_MAGIC
    version: typeof PROJECT_SNAPSHOT_V2_VERSION
    gridSize: number
    palette: {
        swatches: Array<{
            index: number
            id: string
            hex: string
            isUser: boolean
        }>
    }
    paletteCount?: number
    smartObjectState?: {
        version: typeof PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION
        adjustments: SmartReferenceAdjustments
    }
    autoOverrides?: AutoSwatchOverridesMapV2
    importLayer: {
        cells: ImportCellV2[]
    }
    strokeLayer: {
        cells: Array<{
            cellIndex: number
            swatchIndex: StrokeSwatchIndexV2
        }>
    }
    ref: null | {
        w: 512
        h: 512
        ext: "rgba8"
        b64: string
    }
}

export type ValidatedSnapshotV2 = ProjectSnapshotV2

export type LoadGateErrorCode =
    | "E_READ"
    | "E_JSON_PARSE"
    | "E_ROOT_KEYS"
    | "E_MAGIC"
    | "E_VERSION"
    | "E_GRID"
    | "E_PALETTE"
    | "E_IMPORT_LAYER"
    | "E_STROKE_LAYER"
    | "E_REF"

export type LoadGateError = {
    code: LoadGateErrorCode
    message: string
}

export type ProjectSnapshotV2ParseResult =
    | {
          ok: true
          snapshot: ValidatedSnapshotV2
          canonical: ProjectSnapshotV2
      }
    | {
          ok: false
          error: LoadGateError
      }

export function makeLoadGateError(
    code: LoadGateErrorCode,
    message: string
): LoadGateError {
    return { code, message }
}

function clampInt(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n))
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x)
}

function assertExactKeys(
    obj: Record<string, unknown>,
    allowed: string[],
    code: LoadGateErrorCode,
    where: string
) {
    const keys = Object.keys(obj)
    if (keys.length !== allowed.length) {
        throw makeLoadGateError(code, `${where}: keys length mismatch`)
    }
    for (const k of keys) {
        if (!allowed.includes(k)) {
            throw makeLoadGateError(code, `${where}: unexpected key "${k}"`)
        }
    }
    for (const k of allowed) {
        if (!(k in obj)) {
            throw makeLoadGateError(code, `${where}: missing key "${k}"`)
        }
    }
}

function isInt(n: unknown) {
    return Number.isInteger(n)
}

function assertIntInRange(
    n: unknown,
    min: number,
    max: number,
    code: LoadGateErrorCode,
    where: string
) {
    if (!isInt(n)) throw makeLoadGateError(code, `${where}: not integer`)
    if ((n as number) < min || (n as number) > max) {
        throw makeLoadGateError(code, `${where}: out of range`)
    }
}

function assertFiniteNumberInRange(
    n: unknown,
    min: number,
    max: number,
    code: LoadGateErrorCode,
    where: string
) {
    if (typeof n !== "number" || !Number.isFinite(n)) {
        throw makeLoadGateError(code, `${where}: not finite number`)
    }
    if (n < min || n > max) {
        throw makeLoadGateError(code, `${where}: out of range`)
    }
}

function assertString(
    n: unknown,
    code: LoadGateErrorCode,
    where: string
): asserts n is string {
    if (typeof n !== "string") {
        throw makeLoadGateError(code, `${where}: not string`)
    }
}

function assertBool(
    n: unknown,
    code: LoadGateErrorCode,
    where: string
): asserts n is boolean {
    if (typeof n !== "boolean") {
        throw makeLoadGateError(code, `${where}: not boolean`)
    }
}

function base64DecodedLenOrThrow(
    b64: string,
    code: LoadGateErrorCode,
    where: string
): number {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
        throw makeLoadGateError(code, `${where}: invalid base64 charset`)
    }
    if (b64.length === 0) return 0
    if (b64.length % 4 !== 0) {
        throw makeLoadGateError(code, `${where}: base64 length not multiple of 4`)
    }
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
    return (b64.length / 4) * 3 - pad
}

export function canonicalizeSnapshotV2(
    s: ProjectSnapshotV2
): ProjectSnapshotV2 {
    const sw = [...s.palette.swatches].sort((a, b) => a.index - b.index)
    const st = [...s.strokeLayer.cells].sort((a, b) => {
        if (a.cellIndex !== b.cellIndex) return a.cellIndex - b.cellIndex
        return a.swatchIndex - b.swatchIndex
    })

    let autoOverridesCanon: AutoSwatchOverridesMapV2 | undefined
    if (s.autoOverrides && Object.keys(s.autoOverrides).length > 0) {
        const keys = Object.keys(s.autoOverrides).sort()
        const out: AutoSwatchOverridesMapV2 = {}
        for (const k of keys) out[k] = s.autoOverrides[k]
        autoOverridesCanon = out
    }

    const smartObjectStateCanon = s.smartObjectState
        ? {
              version: PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION,
              adjustments: {
                  exposure: s.smartObjectState.adjustments.exposure,
                  whiteBalance: s.smartObjectState.adjustments.whiteBalance,
                  contrast: s.smartObjectState.adjustments.contrast,
                  saturation: s.smartObjectState.adjustments.saturation,
                  shadows: s.smartObjectState.adjustments.shadows,
                  midtones: s.smartObjectState.adjustments.midtones,
                  highlights: s.smartObjectState.adjustments.highlights,
              },
          }
        : undefined

    const canonical: ProjectSnapshotV2 = {
        magic: PROJECT_SNAPSHOT_V2_MAGIC,
        version: PROJECT_SNAPSHOT_V2_VERSION,
        gridSize: s.gridSize,
        palette: {
            swatches: sw.map((x, i) => ({
                index: i,
                id: x.id,
                hex: x.hex,
                isUser: !!x.isUser,
            })),
        },
        importLayer: { cells: [...s.importLayer.cells] },
        strokeLayer: {
            cells: st.map((c) => ({
                cellIndex: c.cellIndex,
                swatchIndex: c.swatchIndex,
            })),
        },
        ref: s.ref ? { w: 512, h: 512, ext: "rgba8", b64: s.ref.b64 } : null,
    }

    if (typeof s.paletteCount === "number") {
        canonical.paletteCount = clampInt(
            s.paletteCount,
            PROJECT_SNAPSHOT_V2_PALETTE_MIN,
            PROJECT_SNAPSHOT_V2_PALETTE_MAX
        )
    }
    if (smartObjectStateCanon) {
        canonical.smartObjectState = smartObjectStateCanon
    }
    if (autoOverridesCanon) {
        canonical.autoOverrides = autoOverridesCanon
    }

    return canonical
}

export function validateProjectSnapshotV2OrThrow(
    raw: unknown
): ValidatedSnapshotV2 {
    if (!isPlainObject(raw)) {
        throw makeLoadGateError("E_ROOT_KEYS", "root: not an object")
    }

    const keys = Object.keys(raw).sort().join("|")
    const allowBase = [
        "magic",
        "version",
        "gridSize",
        "palette",
        "importLayer",
        "strokeLayer",
        "ref",
        "paletteCount",
    ]
    const allowedRootKeySets = new Set([
        [...allowBase].sort().join("|"),
        [...allowBase, "autoOverrides"].sort().join("|"),
        [...allowBase, "smartObjectState"].sort().join("|"),
        [...allowBase, "autoOverrides", "smartObjectState"].sort().join("|"),
    ])

    if (!allowedRootKeySets.has(keys)) {
        throw makeLoadGateError("E_ROOT_KEYS", "root: unexpected keys")
    }

    if (!("paletteCount" in raw)) {
        throw makeLoadGateError("E_PALETTE", "paletteCount: missing")
    }
    assertIntInRange(
        raw.paletteCount,
        PROJECT_SNAPSHOT_V2_PALETTE_MIN,
        PROJECT_SNAPSHOT_V2_PALETTE_MAX,
        "E_PALETTE",
        "paletteCount"
    )

    if ("autoOverrides" in raw) {
        const ao = raw.autoOverrides
        if (!isPlainObject(ao)) {
            throw makeLoadGateError("E_ROOT_KEYS", "autoOverrides: not object")
        }

        for (const k of Object.keys(ao)) {
            if (!/^auto-\d+$/.test(k)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    `autoOverrides: invalid key "${k}"`
                )
            }

            const v = ao[k]
            if (!isPlainObject(v)) {
                throw makeLoadGateError(
                    "E_ROOT_KEYS",
                    `autoOverrides["${k}"]: not object`
                )
            }

            for (const kk of Object.keys(v)) {
                if (kk !== "hex" && kk !== "isTransparent") {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"]: unexpected key "${kk}"`
                    )
                }
            }

            if ("hex" in v) {
                const overrideHex = v.hex
                assertString(overrideHex, "E_ROOT_KEYS", `autoOverrides["${k}"].hex`)
                if (!/^#[0-9A-F]{6}$/.test(overrideHex.toUpperCase())) {
                    throw makeLoadGateError(
                        "E_ROOT_KEYS",
                        `autoOverrides["${k}"].hex invalid`
                    )
                }
            }

            if ("isTransparent" in v) {
                assertBool(
                    v.isTransparent,
                    "E_ROOT_KEYS",
                    `autoOverrides["${k}"].isTransparent`
                )
            }

            if (!("hex" in v) && !("isTransparent" in v)) {
                throw makeLoadGateError("E_ROOT_KEYS", `autoOverrides["${k}"] empty`)
            }
        }
    }

    if ("smartObjectState" in raw) {
        const so = raw.smartObjectState
        if (!isPlainObject(so)) {
            throw makeLoadGateError("E_ROOT_KEYS", "smartObjectState: not object")
        }
        assertExactKeys(so, ["version", "adjustments"], "E_ROOT_KEYS", "smartObjectState")

        if (so.version !== PROJECT_SNAPSHOT_V2_SMART_REFERENCE_VERSION) {
            throw makeLoadGateError(
                "E_ROOT_KEYS",
                "smartObjectState.version: not supported"
            )
        }

        const adj = so.adjustments
        if (!isPlainObject(adj)) {
            throw makeLoadGateError(
                "E_ROOT_KEYS",
                "smartObjectState.adjustments: not object"
            )
        }

        assertExactKeys(
            adj,
            [
                "exposure",
                "whiteBalance",
                "contrast",
                "saturation",
                "shadows",
                "midtones",
                "highlights",
            ],
            "E_ROOT_KEYS",
            "smartObjectState.adjustments"
        )

        assertFiniteNumberInRange(adj.exposure, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.exposure")
        assertFiniteNumberInRange(adj.whiteBalance, 0, 1, "E_ROOT_KEYS", "smartObjectState.adjustments.whiteBalance")
        assertFiniteNumberInRange(adj.contrast, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.contrast")
        assertFiniteNumberInRange(adj.saturation, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.saturation")
        assertFiniteNumberInRange(adj.shadows, 0, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.shadows")
        assertFiniteNumberInRange(adj.midtones, -100, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.midtones")
        assertFiniteNumberInRange(adj.highlights, 0, 100, "E_ROOT_KEYS", "smartObjectState.adjustments.highlights")
    }

    if ("smartObjectState" in raw && raw.ref === null) {
        throw makeLoadGateError(
            "E_REF",
            "ref: must not be null when smartObjectState is present"
        )
    }

    if (raw.magic !== PROJECT_SNAPSHOT_V2_MAGIC) {
        throw makeLoadGateError("E_MAGIC", "magic: not allowed")
    }
    if (raw.version !== PROJECT_SNAPSHOT_V2_VERSION) {
        throw makeLoadGateError("E_VERSION", "version: not allowed")
    }

    assertIntInRange(raw.gridSize, 4, 128, "E_GRID", "gridSize")
    const g = raw.gridSize as number
    const cellsN = g * g

    const pal = raw.palette
    if (!isPlainObject(pal)) {
        throw makeLoadGateError("E_PALETTE", "palette: not object")
    }
    assertExactKeys(pal, ["swatches"], "E_PALETTE", "palette")
    if (!Array.isArray(pal.swatches)) {
        throw makeLoadGateError("E_PALETTE", "palette.swatches: not array")
    }

    const swatches = pal.swatches
    if (swatches.length <= 0 || swatches.length > 256) {
        throw makeLoadGateError("E_PALETTE", "palette.swatches: invalid length")
    }

    const seenSwatchIds = new Set<string>()
    for (let i = 0; i < swatches.length; i++) {
        const sw = swatches[i]
        if (!isPlainObject(sw)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}]: not object`)
        }
        assertExactKeys(sw, ["index", "id", "hex", "isUser"], "E_PALETTE", `swatches[${i}]`)

        if (sw.index !== i) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].index mismatch`)
        }
        const swatchId = sw.id
        assertString(swatchId, "E_PALETTE", `swatches[${i}].id`)
        if (!swatchId) throw makeLoadGateError("E_PALETTE", `swatches[${i}].id empty`)
        if (seenSwatchIds.has(swatchId)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].id duplicate`)
        }
        seenSwatchIds.add(swatchId)

        const swatchHex = sw.hex
        assertString(swatchHex, "E_PALETTE", `swatches[${i}].hex`)
        if (!/^#[0-9A-F]{6}$/.test(swatchHex)) {
            throw makeLoadGateError("E_PALETTE", `swatches[${i}].hex invalid`)
        }
        assertBool(sw.isUser, "E_PALETTE", `swatches[${i}].isUser`)
    }

    const imp = raw.importLayer
    if (!isPlainObject(imp)) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer: not object")
    }
    assertExactKeys(imp, ["cells"], "E_IMPORT_LAYER", "importLayer")
    if (!Array.isArray(imp.cells)) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer.cells: not array")
    }
    if (imp.cells.length !== cellsN) {
        throw makeLoadGateError("E_IMPORT_LAYER", "importLayer.cells: length mismatch")
    }
    for (let i = 0; i < imp.cells.length; i++) {
        const v = imp.cells[i]
        if (!isInt(v)) {
            throw makeLoadGateError("E_IMPORT_LAYER", `importLayer.cells[${i}]: not int`)
        }
        if (v === V2_CELL_NULL || v === V2_CELL_TRANSPARENT) continue
        assertIntInRange(v, 0, swatches.length - 1, "E_IMPORT_LAYER", `importLayer.cells[${i}]`)
    }

    const st = raw.strokeLayer
    if (!isPlainObject(st)) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer: not object")
    }
    assertExactKeys(st, ["cells"], "E_STROKE_LAYER", "strokeLayer")
    if (!Array.isArray(st.cells)) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer.cells: not array")
    }
    if (st.cells.length > cellsN) {
        throw makeLoadGateError("E_STROKE_LAYER", "strokeLayer.cells: too large")
    }

    const seenStrokeCells = new Set<number>()
    for (let i = 0; i < st.cells.length; i++) {
        const cell = st.cells[i]
        if (!isPlainObject(cell)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}]: not object`
            )
        }
        assertExactKeys(
            cell,
            ["cellIndex", "swatchIndex"],
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}]`
        )
        assertIntInRange(
            cell.cellIndex,
            0,
            cellsN - 1,
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}].cellIndex`
        )

        const cellIndex = cell.cellIndex as number
        if (seenStrokeCells.has(cellIndex)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].cellIndex duplicate`
            )
        }
        seenStrokeCells.add(cellIndex)

        const si = cell.swatchIndex
        if (!isInt(si)) {
            throw makeLoadGateError(
                "E_STROKE_LAYER",
                `strokeLayer.cells[${i}].swatchIndex: not int`
            )
        }
        if (si === V2_CELL_TRANSPARENT) continue
        assertIntInRange(
            si,
            0,
            swatches.length - 1,
            "E_STROKE_LAYER",
            `strokeLayer.cells[${i}].swatchIndex`
        )
    }

    const ref = raw.ref
    if (ref !== null) {
        if (!isPlainObject(ref)) {
            throw makeLoadGateError("E_REF", "ref: not null/object")
        }
        assertExactKeys(ref, ["w", "h", "ext", "b64"], "E_REF", "ref")
        if (ref.w !== 512 || ref.h !== 512) {
            throw makeLoadGateError("E_REF", "ref: invalid size")
        }
        if (ref.ext !== "rgba8") {
            throw makeLoadGateError("E_REF", "ref.ext: not allowed")
        }

        const refB64 = ref.b64
        assertString(refB64, "E_REF", "ref.b64")
        const expectedLen = 512 * 512 * 4
        const decodedLen = base64DecodedLenOrThrow(refB64, "E_REF", "ref.b64")
        if (decodedLen !== expectedLen) {
            throw makeLoadGateError("E_REF", "ref.b64: decoded length mismatch")
        }
    }

    return raw as ValidatedSnapshotV2
}

export function parseProjectSnapshotV2Json(
    jsonText: string
): ProjectSnapshotV2ParseResult {
    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText)
    } catch {
        return {
            ok: false,
            error: makeLoadGateError("E_JSON_PARSE", "json: parse failed"),
        }
    }

    try {
        const snapshot = validateProjectSnapshotV2OrThrow(parsed)
        return {
            ok: true,
            snapshot,
            canonical: canonicalizeSnapshotV2(snapshot),
        }
    } catch (error) {
        const gateError = isPlainObject(error) && "code" in error && "message" in error
            ? (error as LoadGateError)
            : makeLoadGateError("E_ROOT_KEYS", "snapshot: validation failed")

        return { ok: false, error: gateError }
    }
}
