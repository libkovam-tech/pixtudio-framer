import { Routes, Route, Navigate } from "react-router-dom"
import Hub from "./hub/Hub"
import EditorRoute from "./editor/EditorRoute"

function RoomGameStub() {
  return (
    <div style={{ padding: 24 }}>
      <h1>RoomGame</h1>
      <div>Coming soon.</div>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Hub />} />
      <Route path="/editor/*" element={<EditorRoute />} />
      <Route path="/roomgame/*" element={<RoomGameStub />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}