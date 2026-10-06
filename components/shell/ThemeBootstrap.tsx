"use client";

/* Applies persisted theme tokens before first paint (no flash). */

import { useEffect } from "react";
import { useSandbox } from "@/lib/store";

export function ThemeBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function () {
  try {
    var raw = localStorage.getItem("hindsight-sandbox-v1");
    if (!raw) return;
    var s = JSON.parse(raw);
    var ui = (s && s.state && s.state.ui) || {};
    var root = document.documentElement;
    root.setAttribute("data-theme", ui.theme === "light" ? "light" : "dark");
    root.setAttribute("data-density", ui.density === "compact" ? "compact" : "cozy");
    root.setAttribute("data-animations", ui.animations === false ? "off" : "on");
    if (typeof ui.accentHue === "number") root.style.setProperty("--h", String(ui.accentHue));
  } catch (e) {}
})();`,
      }}
    />
  );
}

/** keeps DOM attributes in sync with store after hydration */
export function ThemeSync() {
  const ui = useSandbox((s) => s.ui);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", ui.theme);
    root.setAttribute("data-density", ui.density);
    root.setAttribute("data-animations", ui.animations ? "on" : "off");
    root.style.setProperty("--h", String(ui.accentHue));
  }, [ui]);
  return null;
}
