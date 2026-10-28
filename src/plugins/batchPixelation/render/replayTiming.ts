export type ReplayTimingStage =
    | "render-validation"
    | "crop"
    | "preparation"
    | "smart-wb"
    | "grid-sampling"
    | "palette-validation"
    | "palette-classification"
    | "palette-label-mapping"
    | "deconfetti"
    | "palette-output-mapping"
    | "final-materialization"

export type ReplayTimingObserver = (stage: ReplayTimingStage, milliseconds: number) => void
