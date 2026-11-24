import type { NotificationStatus } from "@/lib/notifications";
import { secondaryButton } from "./buttons";

export default function NotificationControl({
  status,
  onEnable,
}: {
  status: NotificationStatus;
  onEnable: () => void;
}) {
  const note = "text-sm text-stone-500 dark:text-stone-400";
  switch (status) {
    case "unsupported":
      return null;
    case "default":
      return (
        <button type="button" className={`${secondaryButton} text-sm`} onClick={onEnable}>
          Enable notifications
        </button>
      );
    case "granted":
      return <p className={note}>Desktop notifications are on.</p>;
    case "denied":
      return <p className={note}>Notifications are blocked in your browser settings.</p>;
  }
}
