"use client";

/**
 * EmotionGraph Component
 *
 * Radar/spider chart showing 7 emotions for a relationship.
 * Animated transitions when emotions change.
 */

import { useEffect, useState } from "react";

const EMOTIONS = ["trust", "suspicion", "loyalty", "resentment", "attraction", "respect", "fear"] as const;

const EMOTION_COLORS: Record<string, string> = {
  trust: "#4ade80",
  suspicion: "#f87171",
  loyalty: "#60a5fa",
  resentment: "#f97316",
  attraction: "#e879f9",
  respect: "#fbbf24",
  fear: "#a78bfa",
};

interface EmotionGraphProps {
  emotions: Record<string, number>;
  size?: number;
  animated?: boolean;
}

export function EmotionGraph({ emotions, size = 200, animated = true }: EmotionGraphProps) {
  const [displayValues, setDisplayValues] = useState<Record<string, number>>({...emotions});

  // Animate to target values
  useEffect(() => {
    if (!animated) {
      // Defer to next frame to avoid synchronous setState during effect
      const frame = requestAnimationFrame(() => setDisplayValues(emotions));
      return () => cancelAnimationFrame(frame);
    }

    const interval = setInterval(() => {
      setDisplayValues((prev) => {
        let done = true;
        const next = { ...prev };
        for (const emotion of EMOTIONS) {
          const t = emotions[emotion] || 0;
          const c = prev[emotion] || 0;
          if (Math.abs(t - c) > 0.01) {
            next[emotion] = c + (t - c) * 0.15;
            done = false;
          } else {
            next[emotion] = t;
          }
        }
        if (done) clearInterval(interval);
        return next;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [emotions, animated]);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 30;
  const levels = 5;

  function getPoint(angle: number, value: number) {
    const r = radius * Math.max(0, Math.min(1, value));
    return {
      x: cx + r * Math.cos(angle - Math.PI / 2),
      y: cy + r * Math.sin(angle - Math.PI / 2),
    };
  }

  // Build polygon points
  const polygonPoints = EMOTIONS.map((emotion, i) => {
    const angle = (2 * Math.PI * i) / EMOTIONS.length;
    const value = displayValues[emotion] || 0;
    return getPoint(angle, value);
  });

  const polygonPath = polygonPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid levels */}
        {Array.from({ length: levels }, (_, level) => {
          const r = (radius / levels) * (level + 1);
          const points = EMOTIONS.map((_, i) => {
            const angle = (2 * Math.PI * i) / EMOTIONS.length;
            return `${cx + r * Math.cos(angle - Math.PI / 2)},${cy + r * Math.sin(angle - Math.PI / 2)}`;
          }).join(" ");
          return (
            <polygon
              key={level}
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-border-default"
            />
          );
        })}

        {/* Axis lines */}
        {EMOTIONS.map((_, i) => {
          const angle = (2 * Math.PI * i) / EMOTIONS.length;
          const end = getPoint(angle, 1);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-border-default"
            />
          );
        })}

        {/* Data polygon */}
        <path
          d={polygonPath}
          fill="currentColor"
          fillOpacity={0.15}
          stroke="currentColor"
          strokeWidth={2}
          className="text-accent"
        />

        {/* Data points */}
        {polygonPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={EMOTION_COLORS[EMOTIONS[i]] || "#6b7280"}
            stroke="currentColor"
            strokeWidth={1}
            className="text-bg-elevated"
          />
        ))}

        {/* Labels */}
        {EMOTIONS.map((emotion, i) => {
          const angle = (2 * Math.PI * i) / EMOTIONS.length;
          const labelR = radius + 18;
          const x = cx + labelR * Math.cos(angle - Math.PI / 2);
          const y = cy + labelR * Math.sin(angle - Math.PI / 2);
          const value = displayValues[emotion] || 0;
          return (
            <g key={emotion}>
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-text-muted"
                fontSize={9}
              >
                {emotion}
              </text>
              <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8}
                fontWeight={600}
                fill={EMOTION_COLORS[emotion] || "#6b7280"}
              >
                {value.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
