import { type CSSProperties, useEffect, useState } from "react";
import {
  browserTargetLabels,
  browserTargets,
  createTargetCookieValue,
  defaultBrowserTarget,
  readBrowserTargetFromCookieString,
  type BrowserTarget,
} from "#app/shared/targets.ts";

export function TargetTabs({ onChange }: { onChange?: (target: BrowserTarget) => void }) {
  const [active, setActive] = useState<BrowserTarget>(defaultBrowserTarget);

  useEffect(() => {
    setActive(readBrowserTargetFromCookieString(document.cookie));
  }, []);

  function handleSelect(target: BrowserTarget) {
    setActive(target);
    document.cookie = createTargetCookieValue(target);
    onChange?.(target);
  }

  return (
    <div style={tabsContainerStyle}>
      {browserTargets.map((target) => (
        <button
          key={target}
          onClick={() => handleSelect(target)}
          style={{
            ...tabButtonStyle,
            ...(active === target ? tabButtonActiveStyle : {}),
          }}
          type="button"
        >
          {browserTargetLabels[target]}
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
