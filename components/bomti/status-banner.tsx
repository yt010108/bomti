type StatusTone = "info" | "success" | "warning" | "error";

const icons: Record<StatusTone, string> = { info: "i", success: "✓", warning: "!", error: "×" };

export function StatusBanner({ tone, title, children }: { tone: StatusTone; title: string; children: React.ReactNode }) {
  return (
    <div className={`bomti-status bomti-status--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="bomti-status__icon" aria-hidden="true">{icons[tone]}</span>
      <div><strong className="bomti-status__title">{title}</strong><p className="bomti-status__description">{children}</p></div>
    </div>
  );
}
