import { forwardRef, KeyboardEvent, useRef, useState } from "react";

interface QuickAddInputProps {
  onAdd: (title: string) => void;
  placeholder?: string;
}

export const QuickAddInput = forwardRef<HTMLInputElement, QuickAddInputProps>(function QuickAddInput(
  { onAdd, placeholder = "在此添加任务，Enter 创建" },
  ref
) {
  const [value, setValue] = useState("");
  const isComposingRef = useRef(false);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || isComposingRef.current || event.keyCode === 229) {
      return;
    }

    if (event.key !== "Enter") return;

    const title = value.trim();
    if (!title) return;

    onAdd(title);
    setValue("");
  }

  return (
    <div className="quick-add">
      <input
        ref={ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        placeholder={placeholder}
        aria-label="添加任务"
      />
    </div>
  );
});
