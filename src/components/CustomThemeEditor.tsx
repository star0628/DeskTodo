import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import type { CustomThemeColors, HexColor } from "../domain/todoTypes";
import {
  DEFAULT_CUSTOM_THEME_COLORS,
  normalizeHexColor
} from "../settings/customTheme";

type ColorField = keyof CustomThemeColors;

interface CustomThemeEditorProps {
  colors: CustomThemeColors;
  onPreview: (colors: CustomThemeColors | null) => void;
  onCommit: (colors: CustomThemeColors) => void;
}

const COLOR_FIELDS: readonly { id: ColorField; label: string }[] = [
  { id: "canvas", label: "窗口底色" },
  { id: "surface", label: "内容表面" },
  { id: "accent", label: "强调颜色" }
];

export function CustomThemeEditor({ colors, onPreview, onCommit }: CustomThemeEditorProps) {
  const [draftColors, setDraftColors] = useState(colors);
  const [activeField, setActiveField] = useState<ColorField | null>(null);
  const [hexInput, setHexInput] = useState("");
  const [inputError, setInputError] = useState("");
  const openingColorRef = useRef<HexColor | null>(null);
  const triggerRefs = useRef<Partial<Record<ColorField, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (activeField === null) setDraftColors(colors);
  }, [activeField, colors]);

  useEffect(() => () => onPreview(null), [onPreview]);

  function openPicker(field: ColorField) {
    const color = colors[field];
    setDraftColors(colors);
    setActiveField(field);
    setHexInput(color);
    setInputError("");
    openingColorRef.current = color;
  }

  function previewColor(color: string) {
    if (activeField === null) return;
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    const nextColors = { ...draftColors, [activeField]: normalized };
    setDraftColors(nextColors);
    setHexInput(normalized);
    setInputError("");
    onPreview(nextColors);
  }

  function updateHexInput(value: string) {
    setHexInput(value);
    const normalized = normalizeHexColor(value);
    if (!normalized || activeField === null) {
      setInputError(value.trim() === "" ? "" : "请输入 #RRGGBB");
      return;
    }
    const nextColors = { ...draftColors, [activeField]: normalized };
    setDraftColors(nextColors);
    setInputError("");
    onPreview(nextColors);
  }

  function commitPicker() {
    const normalized = normalizeHexColor(hexInput);
    if (!normalized || activeField === null) {
      setInputError("请输入 #RRGGBB");
      return;
    }
    const nextColors = { ...draftColors, [activeField]: normalized };
    const field = activeField;
    onCommit(nextColors);
    onPreview(null);
    setDraftColors(nextColors);
    setActiveField(null);
    setInputError("");
    window.setTimeout(() => triggerRefs.current[field]?.focus(), 0);
  }

  function cancelPicker() {
    const field = activeField;
    setDraftColors(colors);
    setActiveField(null);
    setInputError("");
    onPreview(null);
    if (field) window.setTimeout(() => triggerRefs.current[field]?.focus(), 0);
  }

  function resetColors() {
    const nextColors = { ...DEFAULT_CUSTOM_THEME_COLORS };
    setDraftColors(nextColors);
    setActiveField(null);
    setInputError("");
    onPreview(null);
    onCommit(nextColors);
  }

  function handlePickerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancelPicker();
  }

  return (
    <div className="custom-theme-editor" aria-label="自定义主题颜色">
      <div className="custom-theme-fields">
        {COLOR_FIELDS.map((field) => (
          <div key={field.id} className="custom-color-field">
            <span className="custom-color-label">{field.label}</span>
            <button
              ref={(node) => {
                triggerRefs.current[field.id] = node;
              }}
              type="button"
              className="custom-color-swatch"
              style={{ backgroundColor: draftColors[field.id] }}
              aria-label={`编辑${field.label}，当前颜色 ${draftColors[field.id]}`}
              aria-expanded={activeField === field.id}
              aria-controls={`custom-theme-${field.id}-picker`}
              onClick={() =>
                activeField === field.id ? cancelPicker() : openPicker(field.id)
              }
            />
            <button
              type="button"
              className="custom-color-code"
              aria-label={`编辑${field.label}颜色编码`}
              onClick={() => openPicker(field.id)}
            >
              {draftColors[field.id]}
            </button>

            {activeField === field.id && (
              <section
                id={`custom-theme-${field.id}-picker`}
                className="custom-color-picker"
                role="region"
                aria-label={`编辑${field.label}`}
                onKeyDown={handlePickerKeyDown}
              >
                <HexColorPicker
                  color={draftColors[field.id]}
                  onChange={previewColor}
                  aria-label={`选择${field.label}`}
                />
                <div className="custom-color-picker-footer">
                  <span className="custom-color-comparison" aria-label="当前颜色与新颜色">
                    <span>
                      <i style={{ backgroundColor: openingColorRef.current ?? colors[field.id] }} />
                      当前
                    </span>
                    <span>
                      <i style={{ backgroundColor: draftColors[field.id] }} />
                      新颜色
                    </span>
                  </span>
                  <label className={`custom-hex-input${inputError ? " invalid" : ""}`}>
                    <span className="sr-only">{field.label}颜色编码</span>
                    <input
                      value={hexInput}
                      spellCheck={false}
                      aria-invalid={Boolean(inputError)}
                      aria-describedby={inputError ? `custom-theme-${field.id}-error` : undefined}
                      onChange={(event) => updateHexInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitPicker();
                        }
                      }}
                    />
                  </label>
                </div>
                {inputError && (
                  <p id={`custom-theme-${field.id}-error`} className="custom-color-error" role="status">
                    {inputError}
                  </p>
                )}
                <div className="custom-color-actions">
                  <button type="button" onClick={cancelPicker}>取消</button>
                  <button type="button" className="primary" onClick={commitPicker}>确定</button>
                </div>
              </section>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="custom-theme-reset" onClick={resetColors}>
        恢复默认配色
      </button>
      <p className="settings-hint">三种基础色会自动生成可读的文字、边框和交互状态。</p>
    </div>
  );
}
