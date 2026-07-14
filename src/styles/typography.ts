import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "../domain/todoTypes";

export interface TypographyScale {
  base: string;
  title: string;
  body: string;
  label: string;
  caption: string;
}

export function createTypographyScale(fontSize: number): TypographyScale {
  const normalizedSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize));
  const scaleStep = normalizedSize - MIN_FONT_SIZE;
  const captionSize =
    normalizedSize <= 16
      ? 10 + scaleStep * 0.25
      : 11 + (normalizedSize - 16) * 0.5;

  return {
    base: toPixels(normalizedSize),
    title: toPixels(18 + scaleStep * 0.5),
    body: toPixels(normalizedSize),
    label: toPixels(11 + scaleStep * 0.5),
    caption: toPixels(captionSize)
  };
}

function toPixels(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}
