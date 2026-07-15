import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isTauriRuntime } from "../persistence";

export interface OpenedTextFile {
  name: string;
  text: string;
}

export interface RecordFileService {
  saveText(suggestedName: string, text: string): Promise<"saved" | "cancelled">;
  openText(): Promise<OpenedTextFile | null>;
}

class TauriRecordFileService implements RecordFileService {
  async saveText(suggestedName: string, text: string): Promise<"saved" | "cancelled"> {
    const path = await save({
      title: "导出 DeskTodo 完成记录",
      defaultPath: suggestedName,
      filters: [{ name: "DeskTodo 完成记录", extensions: ["txt", "json"] }]
    });
    if (!path) return "cancelled";
    await writeTextFile(path, text);
    return "saved";
  }

  async openText(): Promise<OpenedTextFile | null> {
    const path = await open({
      title: "导入 DeskTodo 完成记录",
      multiple: false,
      directory: false,
      filters: [{ name: "DeskTodo 完成记录", extensions: ["txt", "json"] }]
    });
    if (!path || Array.isArray(path)) return null;
    return { name: getFilename(path), text: await readTextFile(path) };
  }
}

class BrowserRecordFileService implements RecordFileService {
  async saveText(suggestedName: string, text: string): Promise<"saved"> {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return "saved";
  }

  openText(): Promise<OpenedTextFile | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.json,text/plain,application/json";
      input.hidden = true;
      document.body.append(input);

      let settled = false;
      const handleWindowFocus = () => window.setTimeout(() => finish(null), 0);
      const finish = (result: OpenedTextFile | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("focus", handleWindowFocus);
        input.remove();
        resolve(result);
      };

      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) {
          finish(null);
          return;
        }
        void file
          .text()
          .then((text) => finish({ name: file.name, text }))
          .catch((error) => {
            settled = true;
            window.removeEventListener("focus", handleWindowFocus);
            input.remove();
            reject(error);
          });
      });
      window.addEventListener("focus", handleWindowFocus, { once: true });
      input.click();
    });
  }
}

export const recordFileService: RecordFileService = isTauriRuntime()
  ? new TauriRecordFileService()
  : new BrowserRecordFileService();

function getFilename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
