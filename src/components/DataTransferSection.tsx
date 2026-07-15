import { useMemo, useState } from "react";
import { Download, Undo2, Upload } from "lucide-react";
import { TodoAction } from "../domain/todoReducer";
import { AppState, LocalDateKey } from "../domain/todoTypes";
import { RecordFileService, recordFileService } from "../platform/recordFileService";
import {
  analyzeCompletionArchiveImport,
  buildCompletionArchive,
  getCompletionArchiveFilename,
  parseCompletionArchiveText,
  serializeCompletionArchive
} from "../transfer/completionArchive";
import { CompletionArchiveDocument } from "../transfer/completionArchiveTypes";
import { addLocalDays, isLocalDateKey, toLocalDateKey } from "../utils/date";

interface DataTransferSectionProps {
  state: AppState;
  dispatch: (action: TodoAction) => void;
  fileService?: RecordFileService;
}

export function DataTransferSection({
  state,
  dispatch,
  fileService = recordFileService
}: DataTransferSectionProps) {
  const today = toLocalDateKey();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [from, setFrom] = useState<LocalDateKey>(() => addLocalDays(today, -6));
  const [to, setTo] = useState<LocalDateKey>(today);
  const [pendingArchive, setPendingArchive] = useState<CompletionArchiveDocument | null>(null);
  const [pendingFilename, setPendingFilename] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState("");
  const [lastImport, setLastImport] = useState<{ batchId: string; count: number } | null>(null);

  const exportArchive = useMemo(() => {
    if (!isLocalDateKey(from) || !isLocalDateKey(to) || from > to) return null;
    return buildCompletionArchive(state, { from, to });
  }, [from, state, to]);
  const importAnalysis = useMemo(
    () => (pendingArchive ? analyzeCompletionArchiveImport(state, pendingArchive) : null),
    [pendingArchive, state]
  );

  function applyPreset(preset: "week" | "month") {
    if (preset === "week") {
      setFrom(addLocalDays(today, -6));
      setTo(today);
      return;
    }
    setFrom(`${today.slice(0, 8)}01`);
    setTo(today);
  }

  async function exportRecords() {
    if (!exportArchive) return;
    setBusy("export");
    setMessage("");
    try {
      const result = await fileService.saveText(
        getCompletionArchiveFilename(from, to),
        serializeCompletionArchive(exportArchive)
      );
      if (result === "saved") {
        setMessage(`已导出 ${exportArchive.summary.totalRecords} 条完成记录。`);
      }
    } catch (error) {
      console.warn("DeskTodo completion archive export failed.", error);
      setMessage("导出失败，原有数据未发生变化。");
    } finally {
      setBusy(null);
    }
  }

  async function chooseImportFile() {
    setBusy("import");
    setMessage("");
    setLastImport(null);
    try {
      const file = await fileService.openText();
      if (!file) return;
      const parsed = parseCompletionArchiveText(file.text);
      if (parsed.status === "invalid") {
        setPendingArchive(null);
        setPendingFilename("");
        setMessage(parsed.message);
        return;
      }
      setPendingFilename(file.name);
      setPendingArchive(parsed.archive);
    } catch (error) {
      console.warn("DeskTodo completion archive import read failed.", error);
      setMessage("无法读取所选文件，原有数据未发生变化。");
    } finally {
      setBusy(null);
    }
  }

  function confirmImport() {
    if (!importAnalysis || importAnalysis.records.length === 0) return;
    const importBatchId = importAnalysis.records[0].importBatchId;
    dispatch({ type: "importCompletionRecords", records: importAnalysis.records });
    setLastImport({ batchId: importBatchId, count: importAnalysis.records.length });
    setMessage(`已导入 ${importAnalysis.records.length} 条完成记录。`);
    setPendingArchive(null);
    setPendingFilename("");
  }

  function undoImport() {
    if (!lastImport) return;
    dispatch({ type: "removeImportedCompletionBatch", importBatchId: lastImport.batchId });
    setMessage(`已撤销导入的 ${lastImport.count} 条完成记录。`);
    setLastImport(null);
  }

  return (
    <fieldset className="settings-section data-transfer-settings">
      <legend>数据</legend>
      <p className="settings-hint data-transfer-description">
        导出和恢复完成历史，不包含未完成任务、设置或活动重复规则。
      </p>
      <div className="data-transfer-actions">
        <button type="button" onClick={() => setIsExportOpen((open) => !open)}>
          <Download aria-hidden="true" />
          导出完成记录
        </button>
        <button type="button" disabled={busy !== null} onClick={() => void chooseImportFile()}>
          <Upload aria-hidden="true" />
          {busy === "import" ? "正在读取…" : "导入完成记录"}
        </button>
      </div>

      {isExportOpen && (
        <div className="data-transfer-panel" aria-label="导出完成记录">
          <div className="data-transfer-presets" aria-label="日期范围快捷选项">
            <button type="button" onClick={() => applyPreset("week")}>最近 7 天</button>
            <button type="button" onClick={() => applyPreset("month")}>本月</button>
          </div>
          <div className="data-transfer-range">
            <label>
              <span>开始</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              <span>结束</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <div className="data-transfer-summary" aria-live="polite">
            {exportArchive
              ? `${exportArchive.summary.days} 天，${exportArchive.summary.totalRecords} 条完成记录`
              : "请选择有效的日期范围"}
          </div>
          <button
            type="button"
            className="data-transfer-primary"
            disabled={!exportArchive || busy !== null}
            onClick={() => void exportRecords()}
          >
            {busy === "export" ? "正在导出…" : "保存 TXT"}
          </button>
        </div>
      )}

      {pendingArchive && importAnalysis && (
        <div className="data-transfer-panel" aria-label="导入完成记录预览">
          <strong className="data-transfer-filename" title={pendingFilename}>
            {pendingFilename}
          </strong>
          <dl className="data-transfer-preview">
            <div><dt>日期范围</dt><dd>{pendingArchive.range.from} 至 {pendingArchive.range.to}</dd></div>
            <div><dt>文件记录</dt><dd>{pendingArchive.summary.totalRecords}</dd></div>
            <div><dt>可导入</dt><dd>{importAnalysis.records.length}</dd></div>
            <div><dt>重复跳过</dt><dd>{importAnalysis.duplicateCount}</dd></div>
            <div><dt>冲突跳过</dt><dd>{importAnalysis.conflictCount}</dd></div>
          </dl>
          <div className="data-transfer-confirm-actions">
            <button
              type="button"
              onClick={() => {
                setPendingArchive(null);
                setPendingFilename("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="data-transfer-primary"
              disabled={importAnalysis.records.length === 0}
              onClick={confirmImport}
            >
              导入 {importAnalysis.records.length} 条
            </button>
          </div>
        </div>
      )}

      {message && <p className="data-transfer-message" role="status">{message}</p>}
      {lastImport && (
        <button type="button" className="data-transfer-undo" onClick={undoImport}>
          <Undo2 aria-hidden="true" />
          撤销本次导入
        </button>
      )}
    </fieldset>
  );
}
