import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MemoryRouter } from "react-router-dom"
import RafValidationRoute from "./RafValidationRoute.tsx"
import "../../../index.css"

const root = document.getElementById("root")
if (!root) throw new Error("Research root missing")
createRoot(root).render(<StrictMode><MemoryRouter><RafValidationRoute /></MemoryRouter></StrictMode>)
