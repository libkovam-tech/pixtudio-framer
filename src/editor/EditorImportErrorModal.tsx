import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import { SvgAlertBacking, SvgOkButton } from "./SvgIcons.tsx"
import { PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN, PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE } from "./viewportActionButtons.ts"
import { PIXTUDIO_INK } from "../theme.ts"

export const EDITOR_ALERT_BACKDROP: CSSProperties = {
    background: "rgba(69,64,49,0.5)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
}

const overlayStyle: CSSProperties = {
    position: "fixed", inset: 0, zIndex: 99999,
    ...EDITOR_ALERT_BACKDROP,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 16, boxSizing: "border-box",
}

const buttonStyle: CSSProperties = {
    width: PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE,
    height: PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE,
    border: "none", background: "transparent", padding: 0,
    marginTop: 35,
    marginLeft: PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN,
    marginRight: PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN,
    cursor: "pointer", touchAction: "manipulation", display: "block",
}

export function EditorImportErrorModal({ title, message, onDismiss }: {
    title: string
    message: string
    onDismiss: () => void
}) {
    const boxWidth = "min(300px, calc(100vw - 48px))"
    return createPortal(
        <div style={overlayStyle} role="alertdialog" aria-modal="true" aria-label={title}
            aria-description={message}
            onClick={event => { event.preventDefault(); event.stopPropagation() }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "auto" }}
                onClick={event => { event.preventDefault(); event.stopPropagation() }}>
                <div style={{ position: "relative", width: boxWidth, height: `calc(${boxWidth} * 100 / 300)` }}>
                    <div style={{ position: "absolute", inset: 0 }}>
                        <SvgAlertBacking style={{ width: "100%", height: "100%", display: "block" }} ariaLabel="Import error modal backing" />
                    </div>
                    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex",
                        flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
                        padding: "26px 32px", boxSizing: "border-box", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 1, textAlign: "center", color: PIXTUDIO_INK }}>{title}</div>
                            <div style={{ fontSize: 12, lineHeight: 1, wordBreak: "break-word", fontWeight: 400,
                                textAlign: "center", color: PIXTUDIO_INK, opacity: 1 }}>{message}</div>
                        </div>
                    </div>
                </div>
                <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); onDismiss() }}
                    style={buttonStyle} aria-label="OK" className="pxUiAnim">
                    <SvgOkButton style={{ width: "100%", height: "100%", display: "block" }} />
                </button>
            </div>
        </div>, document.body,
    )
}
