"use client"

import { Warp } from "@paper-design/shaders-react"

export type OrbState = "idle" | "listening" | "saved"

const PRESETS: Record<
  OrbState,
  { colors: [string, string, string]; speed: number; distortion: number; softness: number; pulseGain: number }
> = {
  idle: {
    colors: ["#bfe6ff", "#eaf4ff", "#4fb3ff"],
    speed: 4,
    distortion: 0.28,
    softness: 1,
    pulseGain: 0.04,
  },
  listening: {
    colors: ["#ade7ff", "#ebf4ff", "#00bbff"],
    speed: 13,
    distortion: 0.38,
    softness: 1,
    pulseGain: 0.18,
  },
  saved: {
    colors: ["#b7f0cf", "#eefff5", "#2ecf7b"],
    speed: 3,
    distortion: 0.22,
    softness: 1,
    pulseGain: 0.02,
  },
}

export function Orb({
  state = "idle",
  audioLevel = 0,
  size = 280,
}: {
  state?: OrbState
  audioLevel?: number
  size?: number
}) {
  const preset = PRESETS[state]
  const scale = 1 + audioLevel * preset.pulseGain

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-full blur-3xl opacity-60 transition-colors duration-500"
        style={{
          background:
            state === "saved"
              ? "radial-gradient(circle, rgba(46,207,123,0.45), transparent 70%)"
              : state === "listening"
                ? "radial-gradient(circle, rgba(0,187,255,0.45), transparent 70%)"
                : "radial-gradient(circle, rgba(79,179,255,0.28), transparent 70%)",
        }}
      />
      <div
        className="rounded-full overflow-hidden relative"
        style={{
          width: size,
          height: size,
          transform: `scale(${scale})`,
          transition: "transform 80ms ease-out",
        }}
      >
        <Warp
          width={size}
          height={size}
          colors={preset.colors}
          proportion={0.35}
          softness={preset.softness}
          distortion={preset.distortion}
          swirl={1}
          swirlIterations={0}
          shape={"edge"}
          shapeScale={0}
          speed={preset.speed}
          scale={0.31}
          rotation={176}
          offsetX={0.65}
          offsetY={0.09}
        />
      </div>
    </div>
  )
}
