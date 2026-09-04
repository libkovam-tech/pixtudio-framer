export function ImportActivitySpinner({
    size = 48,
}: {
    size?: number
}) {
    const dotSize = size / 6
    const radius = size * 0.375

    return (
        <>
            <style>{`
@keyframes pxImportSpinnerFade {
  0% { opacity: 0.95; }
  100% { opacity: 0.22; }
}
`}</style>
            <div
                aria-hidden="true"
                style={{
                    position: "relative",
                    width: size,
                    height: size,
                }}
            >
                {Array.from({ length: 8 }, (_, index) => {
                    const angle = index * 45
                    return (
                        <span
                            key={index}
                            style={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                width: dotSize,
                                height: dotSize,
                                marginLeft: -dotSize / 2,
                                marginTop: -dotSize / 2,
                                borderRadius: "50%",
                                background: "#666666",
                                transform: `rotate(${angle}deg) translate(0, -${radius}px)`,
                                animation:
                                    "pxImportSpinnerFade 850ms linear infinite",
                                animationDelay: `${-0.85 + index * 0.10625}s`,
                            }}
                        />
                    )
                })}
            </div>
        </>
    )
}
