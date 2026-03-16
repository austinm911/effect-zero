import { type CSSProperties, useEffect, useState } from "react";

export type BrowserTarget = "control" | "v3-drizzle" | "v4-drizzle";

const targetLabels: Record<BrowserTarget, string> = {
  control: "Promise",
  "v3-drizzle": "Effect v3 (Drizzle)",
  "v4-drizzle": "Effect v4 (Drizzle)",
};

const allTargets: readonly BrowserTarget[] = ["control", "v3-drizzle", "v4-drizzle"];

function readTargetFromCookie(): BrowserTarget {
  const match = document.cookie.match(/effect-zero-target=([^;]+)/);
  const value = match?.[1]?.trim();
  if (value === "control" || value === "v3-drizzle" || value === "v4-drizzle") return value;
  return "control";
}

function setTargetCookie(target: BrowserTarget) {
  document.cookie = `effect-zero-target=${target}; path=/; samesite=lax; max-age=31536000`;
}

export function TargetTabs({ onChange }: { onChange?: (target: BrowserTarget) => void }) {
  const [active, setActive] = useState<BrowserTarget>("control");

  useEffect(() => {
    setActive(readTargetFromCookie());
  }, []);

  function handleSelect(target: BrowserTarget) {
    setActive(target);
    setTargetCookie(target);
    onChange?.(target);
  }

  return (
    <div style={tabsContainerStyle}>
      {allTargets.map((target) => (
        <button
          key={target}
          onClick={() => handleSelect(target)}
          style={{
            ...tabButtonStyle,
            ...(active === target ? tabButtonActiveStyle : {}),
          }}
          type="button"
        >
          {targetLabels[target]}
        </button>
      ))}
    </div>
  );
}

const tabsContainerStyle: CSSProperties = {
  display: "inline-flex",
  gap: 2,
  padding: 3,
  background: "#f4f4f5",
  borderRadius: 8,
};

const tabButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: "0.8125rem",
  fontWeight: 500,
  fontFamily: "inherit",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  background: "transparent",
  color: "#71717a",
  transition: "all 150ms",
};

const tabButtonActiveStyle: CSSProperties = {
  background: "#fff",
  color: "#09090b",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
};
