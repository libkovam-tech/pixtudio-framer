import { Suspense, lazy } from "react"
import { Routes, Route, Navigate } from "react-router-dom"

const Hub = lazy(() => import("./hub/Hub"))
const EditorRoute = lazy(() => import("./editor/EditorRoute"))

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
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Hub />} />
        <Route path="/editor/*" element={<EditorRoute />} />
        <Route path="/roomgame/*" element={<RoomGameStub />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
