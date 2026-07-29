import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { CalendarIntegration } from "../calendar/hooks/useCalendarIntegration";
import {
  formatCalendarLastSync,
  getCalendarOperationMessage,
  getCalendarSyncStatusLabel
} from "../calendar/hooks/useCalendarIntegration";
import {
  CALENDAR_SOURCE_COLORS,
  CalendarSourcePaletteColor,
  MAX_CALENDAR_SOURCE_NAME_LENGTH,
  MAX_CALENDAR_SOURCES,
  normalizeCalendarSourceName
} from "../calendar/domain/calendarTypes";

interface CalendarSettingsSectionProps {
  calendar: CalendarIntegration;
  isOpen: boolean;
}

const CALENDAR_COLOR_NAMES: Record<CalendarSourcePaletteColor, string> = {
  "#4da3ff": "亮蓝",
  "#2dd4bf": "薄荷青",
  "#f4c95d": "暖金",
  "#fb7185": "珊瑚粉",
  "#a78bfa": "薰衣紫",
  "#84cc16": "青柠绿",
  "#fb923c": "暖橙",
  "#60a5fa": "柔蓝"
};

export function CalendarSettingsSection({
  calendar,
  isOpen
}: CalendarSettingsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [colorSourceId, setColorSourceId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [draftSourceName, setDraftSourceName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) return;
    setUrl("");
    setName("");
    setError("");
    setShowForm(false);
    setPendingRemoveId(null);
    setColorSourceId(null);
    setEditingSourceId(null);
    setDraftSourceName("");
  }, [isOpen]);

  useEffect(() => {
    if (!editingSourceId) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editingSourceId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction("add");
    setError("");
    try {
      await calendar.addSource({ url, name });
      setUrl("");
      setName("");
      setShowForm(false);
    } catch (caught) {
      setError(getCalendarOperationMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function refresh(sourceId: string) {
    if (busyAction) return;
    setBusyAction(`refresh:${sourceId}`);
    setError("");
    try {
      await calendar.refreshSource(sourceId);
    } catch (caught) {
      setError(getCalendarOperationMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function remove(sourceId: string) {
    if (busyAction) return;
    setBusyAction(`remove:${sourceId}`);
    setError("");
    try {
      await calendar.removeSource(sourceId);
      setPendingRemoveId(null);
    } catch (caught) {
      setError(getCalendarOperationMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function rename(event: FormEvent, sourceId: string) {
    event.preventDefault();
    if (busyAction) return;
    const source = calendar.state.sources.find((item) => item.id === sourceId);
    if (!source) {
      setEditingSourceId(null);
      setDraftSourceName("");
      return;
    }
    const nextName = normalizeCalendarSourceName(draftSourceName);
    if (!nextName) {
      setError("日历名称不能为空。");
      return;
    }
    if (nextName === source.name) {
      setEditingSourceId(null);
      setDraftSourceName("");
      setError("");
      return;
    }

    setBusyAction(`rename:${sourceId}`);
    setError("");
    try {
      await calendar.renameSource(sourceId, nextName);
      setEditingSourceId(null);
      setDraftSourceName("");
    } catch (caught) {
      setError(getCalendarOperationMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  async function changeColor(
    sourceId: string,
    color: CalendarSourcePaletteColor
  ) {
    if (busyAction) return;
    const source = calendar.state.sources.find((item) => item.id === sourceId);
    if (!source) {
      setColorSourceId(null);
      return;
    }
    if (source.color === color) {
      setColorSourceId(null);
      setError("");
      return;
    }

    setBusyAction(`color:${sourceId}`);
    setError("");
    try {
      await calendar.setSourceColor(sourceId, color);
      setColorSourceId(null);
    } catch (caught) {
      setError(getCalendarOperationMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="settings-section calendar-settings" aria-labelledby="calendar-settings-title">
      <div className="calendar-settings-heading">
        <div>
          <h3 id="calendar-settings-title">Apple 日历</h3>
          <p>通过公开链接只读同步，不会修改 Apple 日历</p>
        </div>
        {calendar.available &&
          !showForm &&
          calendar.state.sources.length < MAX_CALENDAR_SOURCES && (
            <button
              type="button"
              className="calendar-add-button"
              onClick={() => {
                setShowForm(true);
                setError("");
                setColorSourceId(null);
                setEditingSourceId(null);
                setDraftSourceName("");
                setPendingRemoveId(null);
              }}
            >
              <Plus aria-hidden="true" />
              添加
            </button>
          )}
      </div>

      {!calendar.available ? (
        <p className="settings-hint">Apple 日历同步仅在 Windows 桌面版中可用。</p>
      ) : (
        <>
          {showForm && (
            <form className="calendar-source-form" onSubmit={submit}>
              <label>
                <span>公开日历链接</span>
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  placeholder="webcal://…"
                  disabled={busyAction === "add"}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
              <label>
                <span>显示名称（可选）</span>
                <input
                  type="text"
                  maxLength={MAX_CALENDAR_SOURCE_NAME_LENGTH}
                  autoComplete="off"
                  value={name}
                  placeholder="自动读取日历名称"
                  disabled={busyAction === "add"}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <p className="settings-hint">
                支持 iCloud 公共订阅及 Apple 官方各地区节假日 .ics；链接将保存在
                Windows 凭据管理器中。
              </p>
              <div className="calendar-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busyAction === "add"}
                  onClick={() => {
                    setShowForm(false);
                    setUrl("");
                    setName("");
                    setError("");
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busyAction === "add" || !url.trim()}
                >
                  {busyAction === "add" ? "正在验证…" : "验证并添加"}
                </button>
              </div>
            </form>
          )}

          <div className="calendar-source-list">
            {calendar.state.sources.map((source) => {
              const refreshing =
                busyAction === `refresh:${source.id}` || source.syncState === "syncing";
              const removing = busyAction === `remove:${source.id}`;
              const renaming = busyAction === `rename:${source.id}`;
              const colorOpen = colorSourceId === source.id;
              const nameOpen = editingSourceId === source.id;
              const normalizedDraftName = normalizeCalendarSourceName(draftSourceName);
              return (
                <article key={source.id} className="calendar-source-row">
                  <button
                    type="button"
                    className="calendar-source-color-button"
                    aria-label={`更改${source.name}的颜色，当前${
                      CALENDAR_COLOR_NAMES[
                        source.color as CalendarSourcePaletteColor
                      ] ?? "自定义颜色"
                    }`}
                    aria-expanded={colorOpen}
                    aria-controls={`calendar-source-colors-${source.id}`}
                    disabled={Boolean(busyAction)}
                    onClick={() => {
                      setColorSourceId(colorOpen ? null : source.id);
                      setEditingSourceId(null);
                      setDraftSourceName("");
                      setPendingRemoveId(null);
                      setError("");
                    }}
                  >
                    <span
                      className="calendar-source-color"
                      style={{ backgroundColor: source.color }}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="calendar-source-copy">
                    <button
                      type="button"
                      className="calendar-source-name-button"
                      aria-label={`编辑${source.name}的显示名称`}
                      aria-expanded={nameOpen}
                      aria-controls={`calendar-source-name-editor-${source.id}`}
                      disabled={Boolean(busyAction)}
                      onClick={() => {
                        if (nameOpen) {
                          setEditingSourceId(null);
                          setDraftSourceName("");
                        } else {
                          setEditingSourceId(source.id);
                          setDraftSourceName(source.name);
                        }
                        setColorSourceId(null);
                        setPendingRemoveId(null);
                        setError("");
                      }}
                    >
                      <strong>{source.name}</strong>
                      <Pencil aria-hidden="true" />
                    </button>
                    <small>
                      {getCalendarSyncStatusLabel(source)}
                      {formatCalendarLastSync(source)
                        ? ` · ${formatCalendarLastSync(source)}`
                        : ""}
                      {` · ${
                        source.kind === "holiday"
                          ? "Apple 官方节假日"
                          : source.region === "chinaMainland"
                            ? "中国大陆"
                            : "全球"
                      }`}
                    </small>
                  </div>
                  <div className="calendar-source-actions">
                    {pendingRemoveId === source.id ? (
                      <>
                        <button
                          type="button"
                          className="calendar-confirm-remove"
                          disabled={removing}
                          onClick={() => void remove(source.id)}
                        >
                          {removing ? "移除中" : "确认"}
                        </button>
                        <button
                          type="button"
                          className="calendar-cancel-remove"
                          disabled={removing}
                          onClick={() => setPendingRemoveId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          aria-label={`刷新${source.name}`}
                          title="立即刷新"
                          disabled={refreshing || Boolean(busyAction)}
                          onClick={() => void refresh(source.id)}
                        >
                          <RefreshCw
                            aria-hidden="true"
                            className={refreshing ? "is-spinning" : undefined}
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`移除${source.name}`}
                          title="移除本地订阅"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            setPendingRemoveId(source.id);
                            setColorSourceId(null);
                            setEditingSourceId(null);
                            setDraftSourceName("");
                            setError("");
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                  {colorOpen && (
                    <fieldset
                      id={`calendar-source-colors-${source.id}`}
                      className="calendar-source-color-panel"
                      disabled={Boolean(busyAction)}
                    >
                      <legend className="sr-only">
                        选择{source.name}的日历颜色
                      </legend>
                      <div className="calendar-source-color-options">
                        {CALENDAR_SOURCE_COLORS.map((color) => {
                          const selected = source.color === color;
                          return (
                            <label
                              key={color}
                              className={`calendar-source-color-option${
                                selected ? " is-selected" : ""
                              }`}
                              title={CALENDAR_COLOR_NAMES[color]}
                            >
                              <input
                                type="radio"
                                name={`calendar-source-color-${source.id}`}
                                value={color}
                                checked={selected}
                                aria-label={CALENDAR_COLOR_NAMES[color]}
                                onChange={() => void changeColor(source.id, color)}
                              />
                              <span
                                className="calendar-source-color-option-swatch"
                                style={{ backgroundColor: color }}
                                aria-hidden="true"
                              />
                              {selected && <Check aria-hidden="true" />}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                  {nameOpen && (
                    <form
                      id={`calendar-source-name-editor-${source.id}`}
                      className="calendar-source-name-editor"
                      onSubmit={(event) => void rename(event, source.id)}
                    >
                      <label htmlFor={`calendar-source-name-${source.id}`}>
                        显示名称
                      </label>
                      <input
                        ref={nameInputRef}
                        id={`calendar-source-name-${source.id}`}
                        type="text"
                        maxLength={MAX_CALENDAR_SOURCE_NAME_LENGTH}
                        autoComplete="off"
                        value={draftSourceName}
                        disabled={Boolean(busyAction)}
                        onChange={(event) => setDraftSourceName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") return;
                          event.preventDefault();
                          setEditingSourceId(null);
                          setDraftSourceName("");
                          setError("");
                        }}
                      />
                      <div className="calendar-source-name-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={Boolean(busyAction)}
                          onClick={() => {
                            setEditingSourceId(null);
                            setDraftSourceName("");
                            setError("");
                          }}
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={
                            Boolean(busyAction) ||
                            !normalizedDraftName ||
                            normalizedDraftName === source.name
                          }
                        >
                          {renaming ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>

          {!showForm && calendar.state.sources.length === 0 && (
            <p className="settings-hint">尚未添加公开日历。</p>
          )}
        </>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
