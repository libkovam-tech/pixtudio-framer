import { Suspense, lazy } from "react"
import { Routes, Route, Navigate } from "react-router-dom"

const Hub = lazy(() => import("./hub/Hub"))
const FaqPage = lazy(() => import("./hub/FaqPage"))
const HowItWorksPage = lazy(() => import("./hub/HowItWorksPage"))
const GalleryPage = lazy(() => import("./hub/GalleryPage"))
const LearnPage = lazy(() => import("./hub/LearnPage"))
const LinksPage = lazy(() => import("./hub/LinksPage"))
const EditorRoute = lazy(() => import("./editor/EditorRoute"))

function RoomGameStub() {
  return (
    <div className="roomGameStub">
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
        <Route path="/faq" element={<Navigate to="/faq/" replace />} />
        <Route path="/faq/" element={<FaqPage />} />
        <Route
          path="/how-it-works"
          element={<Navigate to="/how-it-works/" replace />}
        />
        <Route path="/how-it-works/" element={<HowItWorksPage />} />
        <Route path="/gallery" element={<Navigate to="/gallery/" replace />} />
        <Route path="/gallery/" element={<GalleryPage />} />
        <Route
          path="/pixel-art-from-photos"
          element={<Navigate to="/pixel-art-from-photos/" replace />}
        />
        <Route path="/pixel-art-from-photos/" element={<LearnPage />} />
        <Route path="/links" element={<Navigate to="/links/" replace />} />
        <Route path="/links/" element={<LinksPage />} />
        <Route path="/editor/*" element={<EditorRoute />} />
        <Route path="/roomgame/*" element={<RoomGameStub />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
