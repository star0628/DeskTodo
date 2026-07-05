import { KeyboardEvent, useState } from "react";

interface QuickAddInputProps {
  onAdd: (title: string) => void;
}

export function QuickAddInput({ onAdd }: QuickAddInputProps) {
  const [value, setValue] = useState("");

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;

    const title = value.trim();
    if (!title) return;

    onAdd(title);
    setValue("");
  }

  return (
    <div className="quick-add">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="在此添加任务，Enter 创建"
        aria-label="添加任务"
      />
    </div>
  );
}
