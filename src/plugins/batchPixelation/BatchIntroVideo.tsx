import * as React from "react"

const VIDEO_SRC = "/plugins/batch-pixelation/entry.mp4"

export function BatchIntroVideo({ paused = false }: { paused?: boolean }) {
    const videoRef = React.useRef<HTMLVideoElement>(null)
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const [ready, setReady] = React.useState(false)

    React.useEffect(() => {
        const video = videoRef.current
        const canvas = canvasRef.current
        const context = canvas?.getContext("2d")
        if (!video || !canvas || !context) return
        let frame = 0
        let videoFrame = 0
        let stopped = false
        const frameVideo = video as HTMLVideoElement & {
            requestVideoFrameCallback?: (callback: () => void) => number
            cancelVideoFrameCallback?: (handle: number) => void
        }
        const draw = () => {
            if (!video.videoWidth || !video.videoHeight) return
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
            }
            context.imageSmoothingEnabled = false
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            setReady(true)
        }
        const next = () => {
            if (stopped || video.paused) return
            if (frameVideo.requestVideoFrameCallback) {
                videoFrame = frameVideo.requestVideoFrameCallback(() => { videoFrame = 0; draw(); next() })
            } else {
                frame = requestAnimationFrame(() => { frame = 0; draw(); next() })
            }
        }
        const onPause = () => {
            if (frame) cancelAnimationFrame(frame)
            if (videoFrame) frameVideo.cancelVideoFrameCallback?.(videoFrame)
            frame = 0
            videoFrame = 0
        }
        const onLoaded = () => {
            draw()
        }
        video.addEventListener("loadeddata", onLoaded)
        video.addEventListener("play", next)
        video.addEventListener("pause", onPause)
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onLoaded()
        return () => {
            stopped = true
            video.removeEventListener("loadeddata", onLoaded)
            video.removeEventListener("play", next)
            video.removeEventListener("pause", onPause)
            onPause()
        }
    }, [paused])

    React.useEffect(() => {
        const video = videoRef.current
        if (!video) return
        if (paused) video.pause()
        else if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            // Safari may not reach loadeddata with metadata preload until playback starts.
            void video.play().catch(() => {})
        }
    }, [paused])

    return <div className="batch-intro-video" role="img" aria-label="Batch Pixelation intro video">
        <video ref={videoRef} src={VIDEO_SRC} muted loop playsInline preload="metadata" aria-hidden="true" />
        <canvas ref={canvasRef} className={ready ? "batch-intro-canvas-ready" : ""} aria-hidden="true" />
    </div>
}
