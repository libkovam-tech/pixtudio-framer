import { useNavigate } from "react-router-dom"

export default function Hub() {
  const nav = useNavigate()

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0c1720",
        color: "#e9d8a6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 600, width: "100%" }}>
        <h1 style={{ fontSize: 48, marginBottom: 12 }}>PIXTUDIO</h1>
        <p style={{ marginBottom: 24 }}>Studio Hub</p>

        <button
          onClick={() => nav("/editor")}
          style={{
            padding: 16,
            fontSize: 18,
            borderRadius: 12,
            border: "none",
            background: "#e9d8a6",
            color: "#0c1720",
            cursor: "pointer",
            width: "100%",
          }}
        >
          Open Editor
        </button>
      </div>
    </div>
  )
}