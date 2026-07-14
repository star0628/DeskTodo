import { X } from "lucide-react";

interface DialogHeaderProps {
  titleId: string;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
}

export function DialogHeader({
  titleId,
  title,
  subtitle,
  closeLabel,
  onClose
}: DialogHeaderProps) {
  return (
    <header className="dialog-header">
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <button type="button" className="dialog-close" onClick={onClose} aria-label={closeLabel}>
        <X aria-hidden="true" />
      </button>
    </header>
  );
}
