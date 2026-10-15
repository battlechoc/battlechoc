import React from "react";

// A ring drawn around a round icon that fills clockwise from the top with `progress` (0..1).
// The parent needs `position: relative`; `outset` is how far (in % of the parent) the ring sits outside it.
const ProgressRing = ({ progress, color = "white", track = "rgba(0, 0, 0, 0.25)", width = 9, outset = 12 }) => {
  const radius = 50 - width / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: `-${outset}%`,
        width: `${100 + 2 * outset}%`,
        height: `${100 + 2 * outset}%`,
        transform: "rotate(-90deg)",
        pointerEvents: "none",
      }}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke={track} strokeWidth={width} />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
      />
    </svg>
  );
};

export default ProgressRing;
