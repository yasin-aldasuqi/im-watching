import type { NotificationStatus } from "@/lib/notifications";
import { secondaryButton } from "./styles";

export default function NotificationControl({
  status,
  onEnable,
}: {
  status: NotificationStatus;
  onEnable: () => void;
}) {
  const note = "text-sm text-soft";
  switch (status) {
    case "unsupported":
      return null;
    case "default":
      return (
        <button type="button" className={`${secondaryButton} self-start text-sm`} onClick={onEnable}>
          Enable notifications
        </button>
      );
    case "granted":
      return (
        <p className={note}>
          <span aria-hidden="true">🔔 </span>
          <span>Desktop notifications are on.</span>
        </p>
      );
    case "denied":
      return <p className={note}>Notifications are blocked in your browser settings.</p>;
  }
}
