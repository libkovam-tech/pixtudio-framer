import type { ReactNode } from "react"

export type ManualGuide = Readonly<{
    title: string
    backLabel: string
    sections: readonly Readonly<{
        id: string
        title: string
        navLabel: string
        mobileNavLines?: readonly [string, string]
        icon?: ReactNode
        content: ReactNode
    }>[]
}>
