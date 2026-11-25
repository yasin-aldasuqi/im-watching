import { DEFAULT_ALERT_CHANNELS, parseAlertChannels, type AlertChannels } from "@/lib/alertChannels";
import { createSettingStore } from "@/lib/settingStore";

const store = createSettingStore<AlertChannels>({
  name: "alert-channels",
  defaultValue: DEFAULT_ALERT_CHANNELS,
  parse: parseAlertChannels,
  serialize: (value) => JSON.stringify(value),
});

export const ALERT_CHANNELS_STORAGE_KEY = store.key;

export function useAlertChannels() {
  const [channels, setChannels] = store.useSetting();
  const update = (patch: Partial<AlertChannels>) =>
    setChannels(parseAlertChannels(JSON.stringify({ ...channels, ...patch })));
  return { channels, update };
}
