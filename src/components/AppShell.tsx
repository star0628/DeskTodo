import { CSSProperties, ReactNode } from "react";
import { AppSettings } from "../domain/todoTypes";
import { createCustomThemeTokens } from "../settings/customTheme";
import { createTypographyScale } from "../styles/typography";

interface AppShellProps {
  children: ReactNode;
  settings: AppSettings;
}

export function AppShell({ children, settings }: AppShellProps) {
  const typography = createTypographyScale(settings.fontSize);
  const customTheme =
    settings.colorTheme === "custom"
      ? createCustomThemeTokens(settings.customThemeColors)
      : null;

  return (
    <main
      className="app-shell"
      data-theme={settings.colorTheme}
      data-compact={settings.compactMode ? "true" : "false"}
      style={
        {
          "--font-size-base": typography.base,
          "--type-title-size": typography.title,
          "--type-body-size": typography.body,
          "--type-label-size": typography.label,
          "--type-caption-size": typography.caption,
          "--window-bg-opacity": settings.backgroundOpacityPercent / 100,
          ...(customTheme?.variables ?? {}),
          ...(customTheme ? { colorScheme: customTheme.colorScheme } : {})
        } as CSSProperties
      }
    >
      {children}
    </main>
  );
}
