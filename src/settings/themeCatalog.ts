import { ColorThemeId } from "../domain/todoTypes";
import { DEFAULT_CUSTOM_THEME_COLORS } from "./customTheme";

export interface ThemeOption {
  id: ColorThemeId;
  label: string;
  description: string;
  swatches: readonly [string, string, string];
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "graphite-lime",
    label: "石墨青柠",
    description: "深色中性底，清晰青柠强调",
    swatches: ["#111318", "#2b303a", "#84cc16"]
  },
  {
    id: "citic-red",
    label: "赤霞霜白",
    description: "明亮白底，克制红色强调",
    swatches: ["#f7f7f8", "#ffffff", "#c8102e"]
  },
  {
    id: "frost-blue",
    label: "冰川蓝灰",
    description: "冷静蓝灰，适合长时间使用",
    swatches: ["#101820", "#223548", "#4da3ff"]
  },
  {
    id: "jade-forest",
    label: "翡翠深林",
    description: "深绿中性底，低刺激青色强调",
    swatches: ["#101715", "#24352e", "#2dd4bf"]
  },
  {
    id: "ink-gold",
    label: "墨金",
    description: "纯黑灰底，温和金色强调",
    swatches: ["#141414", "#2d2a24", "#f4c95d"]
  },
  {
    id: "custom",
    label: "自定配色",
    description: "三色生成，自动保证文字可读",
    swatches: [
      DEFAULT_CUSTOM_THEME_COLORS.canvas,
      DEFAULT_CUSTOM_THEME_COLORS.surface,
      DEFAULT_CUSTOM_THEME_COLORS.accent
    ]
  }
] as const;
