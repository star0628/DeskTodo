import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { TodoAction } from "../domain/todoReducer";
import {
  AppSettings,
  CustomThemeColors,
  MAX_BACKGROUND_OPACITY,
  MAX_FONT_SIZE,
  MIN_BACKGROUND_OPACITY,
  MIN_FONT_SIZE
} from "../domain/todoTypes";
import { AutostartService, autostartService } from "../platform/autostart";
import { THEME_OPTIONS } from "../settings/themeCatalog";
import { DialogHeader } from "./DialogHeader";
import { CustomThemeEditor } from "./CustomThemeEditor";

interface SettingsDialogProps {
  settings: AppSettings;
  dispatch: (action: TodoAction) => void;
  autostart?: AutostartService;
  onBackgroundOpacityPreview?: (percent: number | null) => void;
  onCustomThemePreview?: (colors: CustomThemeColors | null) => void;
}

export function SettingsDialog({
  settings,
  dispatch,
  autostart = autostartService,
  onBackgroundOpacityPreview,
  onCustomThemePreview
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [fontInput, setFontInput] = useState(String(settings.fontSize));
  const [opacityInput, setOpacityInput] = useState(String(settings.backgroundOpacityPercent));
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);
  const [autostartError, setAutostartError] = useState("");
  const [customThemePreview, setCustomThemePreview] = useState<CustomThemeColors | null>(null);
  const autostartAvailable = autostart.isAvailable();

  useEffect(() => {
    setFontInput(String(settings.fontSize));
  }, [settings.fontSize]);

  useEffect(() => {
    setOpacityInput(String(settings.backgroundOpacityPercent));
  }, [settings.backgroundOpacityPercent]);

  useEffect(
    () => () => onBackgroundOpacityPreview?.(null),
    [onBackgroundOpacityPreview]
  );

  useEffect(() => () => onCustomThemePreview?.(null), [onCustomThemePreview]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!isOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !autostartAvailable) return;
    let active = true;
    setAutostartLoading(true);
    setAutostartError("");

    void autostart
      .isEnabled()
      .then((enabled) => {
        if (active) setAutostartEnabled(enabled);
      })
      .catch((error) => {
        console.warn("DeskTodo autostart status check failed.", error);
        if (active) setAutostartError("无法读取系统启动状态");
      })
      .finally(() => {
        if (active) setAutostartLoading(false);
      });

    return () => {
      active = false;
    };
  }, [autostart, autostartAvailable, isOpen]);

  function closeDialog() {
    commitOpacityInput();
    setCustomThemePreview(null);
    onCustomThemePreview?.(null);
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  const previewCustomTheme = useCallback(
    (colors: CustomThemeColors | null) => {
      setCustomThemePreview(colors);
      onCustomThemePreview?.(colors);
    },
    [onCustomThemePreview]
  );

  function changeFontSize(size: number) {
    if (!Number.isInteger(size) || size < MIN_FONT_SIZE || size > MAX_FONT_SIZE) return;
    dispatch({ type: "setFontSize", size });
  }

  function handleFontInput(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setFontInput(value);
    if (value.trim() === "") return;
    changeFontSize(Number(value));
  }

  function commitFontInput() {
    const parsed = Number(fontInput);
    const clamped = Number.isFinite(parsed)
      ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(parsed)))
      : settings.fontSize;
    setFontInput(String(clamped));
    changeFontSize(clamped);
  }

  function previewOpacity(value: string) {
    setOpacityInput(value);
    const parsed = Number(value);
    if (
      Number.isFinite(parsed) &&
      parsed >= MIN_BACKGROUND_OPACITY &&
      parsed <= MAX_BACKGROUND_OPACITY
    ) {
      onBackgroundOpacityPreview?.(Math.round(parsed));
    }
  }

  function commitOpacityInput() {
    const parsed = Number(opacityInput);
    const percent = Number.isFinite(parsed)
      ? Math.max(
          MIN_BACKGROUND_OPACITY,
          Math.min(MAX_BACKGROUND_OPACITY, Math.round(parsed))
        )
      : settings.backgroundOpacityPercent;
    setOpacityInput(String(percent));
    onBackgroundOpacityPreview?.(null);
    dispatch({ type: "setBackgroundOpacity", percent });
  }

  async function changeAutostart(enabled: boolean) {
    const previous = autostartEnabled;
    setAutostartEnabled(enabled);
    setAutostartLoading(true);
    setAutostartError("");
    try {
      await autostart.setEnabled(enabled);
      setAutostartEnabled(await autostart.isEnabled());
    } catch (error) {
      console.warn("DeskTodo autostart update failed.", error);
      setAutostartEnabled(previous);
      setAutostartError("更改失败，请稍后重试");
    } finally {
      setAutostartLoading(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="settings-trigger"
        aria-label="打开设置"
        title="设置"
        onClick={() => setIsOpen(true)}
      >
        <Settings aria-hidden="true" />
      </button>

      <dialog
        ref={dialogRef}
        className="settings-dialog dialog-surface dialog-sheet"
        aria-labelledby="settings-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="settings-panel">
          <DialogHeader
            titleId="settings-title"
            title="设置"
            subtitle="更改立即生效"
            closeLabel="关闭设置"
            onClose={closeDialog}
          />

          <div className="settings-content">
            <fieldset className="settings-section theme-settings">
              <legend>主题</legend>
              <div className="theme-options">
                {THEME_OPTIONS.map((option) => {
                  const customColors = customThemePreview ?? settings.customThemeColors;
                  const swatchColors =
                    option.id === "custom"
                      ? [customColors.canvas, customColors.surface, customColors.accent]
                      : option.swatches;

                  return (
                    <div key={option.id} className="theme-option-group">
                      <label className="theme-option">
                        <input
                          type="radio"
                          name="color-theme"
                          value={option.id}
                          checked={settings.colorTheme === option.id}
                          onChange={() => dispatch({ type: "setColorTheme", theme: option.id })}
                        />
                        <span className="theme-swatches" aria-hidden="true">
                          {swatchColors.map((color, index) => (
                            <span key={`${color}-${index}`} style={{ background: color }} />
                          ))}
                        </span>
                        <span className="theme-copy">
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                      </label>
                      {isOpen && option.id === "custom" && settings.colorTheme === "custom" && (
                        <CustomThemeEditor
                          colors={settings.customThemeColors}
                          onPreview={previewCustomTheme}
                          onCommit={(colors) =>
                            dispatch({ type: "setCustomThemeColors", colors })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="settings-section">
              <legend>字号</legend>
              <div className="font-size-control">
                <input
                  type="range"
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  step="1"
                  value={settings.fontSize}
                  aria-label="界面字号"
                  onChange={(event) => changeFontSize(Number(event.target.value))}
                />
                <label>
                  <input
                    type="number"
                    min={MIN_FONT_SIZE}
                    max={MAX_FONT_SIZE}
                    step="1"
                    value={fontInput}
                    aria-label="界面字号数值"
                    onChange={handleFontInput}
                    onBlur={commitFontInput}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <span>px</span>
                </label>
              </div>
              <p className="settings-hint">范围 {MIN_FONT_SIZE}–{MAX_FONT_SIZE}px</p>
            </fieldset>

            <fieldset className="settings-section">
              <legend>背景不透明度</legend>
              <div className="opacity-control">
                <input
                  type="range"
                  min={MIN_BACKGROUND_OPACITY}
                  max={MAX_BACKGROUND_OPACITY}
                  step="5"
                  value={opacityInput}
                  aria-label="背景不透明度"
                  onChange={(event) => previewOpacity(event.target.value)}
                  onPointerUp={commitOpacityInput}
                  onKeyUp={commitOpacityInput}
                  onBlur={commitOpacityInput}
                />
                <label>
                  <input
                    type="number"
                    min={MIN_BACKGROUND_OPACITY}
                    max={MAX_BACKGROUND_OPACITY}
                    step="1"
                    value={opacityInput}
                    aria-label="背景不透明度数值"
                    onChange={(event) => previewOpacity(event.target.value)}
                    onBlur={commitOpacityInput}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <span>%</span>
                </label>
              </div>
              <p className={`settings-hint${Number(opacityInput) < 40 ? " warning" : ""}`}>
                {Number(opacityInput) < 40
                  ? "低透明度可能降低文字可读性"
                  : `范围 ${MIN_BACKGROUND_OPACITY}–${MAX_BACKGROUND_OPACITY}%`}
              </p>
            </fieldset>

            <section className="settings-section toggle-settings" aria-label="界面与启动设置">
              <ToggleRow
                label="紧凑模式"
                description="缩小任务间距，显示更多内容"
                checked={settings.compactMode}
                onChange={(enabled) => dispatch({ type: "setCompactMode", enabled })}
              />
              <ToggleRow
                label="默认折叠已完成"
                description="进入今日列表时收起完成项"
                checked={settings.collapseCompletedByDefault}
                onChange={(enabled) =>
                  dispatch({ type: "setCollapseCompletedByDefault", enabled })
                }
              />
              <ToggleRow
                label="开机自启动"
                description={autostartAvailable ? "登录 Windows 后启动 DeskTodo" : "仅桌面版可用"}
                checked={autostartEnabled}
                disabled={!autostartAvailable || autostartLoading}
                onChange={(enabled) => void changeAutostart(enabled)}
              />
              {autostartError && <p className="settings-error" role="status">{autostartError}</p>}
            </section>
          </div>
        </div>
      </dialog>
    </>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, disabled = false, onChange }: ToggleRowProps) {
  return (
    <label className={`setting-toggle${disabled ? " disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
