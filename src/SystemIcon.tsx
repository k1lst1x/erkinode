import { Network, Server, Terminal } from "lucide-react";
import paths from "./assets/os/paths.json";
import { iconForSystem } from "../shared/systems.js";
import { t } from "./i18n";
import type { RemoteSystem } from "./types";

export default function SystemIcon({
  system,
  size = 24,
}: {
  system?: RemoteSystem;
  size?: number;
}) {
  const icon = iconForSystem(system);
  if (!system || !icon)
    return <Server size={size} aria-label={t("System not detected")} />;
  const label = t("Detected system: {{name}}", { name: system.name });
  if (icon === "network") return <Network size={size} aria-label={label} />;
  if (icon === "unix") return <Terminal size={size} aria-label={label} />;
  const path =
    icon === "windows"
      ? "M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z"
      : Object.hasOwn(paths, icon)
        ? paths[icon as keyof typeof paths]
        : null;
  if (!path) return <Server size={size} aria-label={label} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      data-system-icon={icon}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}
