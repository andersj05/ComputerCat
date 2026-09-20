import catImage from "../../../assets/app-icon.svg";

export function WindowCaption({
  title,
  titleId,
  onClose,
  onMinimize,
  onMaximize,
  maximized = false,
  disabled = false,
}: {
  title: string;
  titleId?: string;
  onClose: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  maximized?: boolean;
  disabled?: boolean;
}) {
  return (
    <header className="titlebar">
      <div className="window-title">
        <img src={catImage} alt="" />
        <span id={titleId}>{title}</span>
      </div>
      <div className="window-controls">
        {onMinimize && (
          <button type="button" aria-label="Minimize window" title="Minimize" onClick={onMinimize}>
            <span className="minimize-glyph" />
          </button>
        )}
        {onMaximize && (
          <button
            type="button"
            aria-label={maximized ? "Restore window" : "Maximize window"}
            title={maximized ? "Restore" : "Maximize"}
            onClick={onMaximize}
          >
            <span className={maximized ? "restore-glyph" : "maximize-glyph"} />
          </button>
        )}
        <button
          type="button"
          className="close-control"
          aria-label={onMinimize ? "Close chat to desktop" : "Close dialog"}
          title={onMinimize ? "Close chat; keep cat on desktop" : "Close"}
          disabled={disabled}
          onClick={onClose}
        >
          <span className="close-glyph" />
        </button>
      </div>
    </header>
  );
}
