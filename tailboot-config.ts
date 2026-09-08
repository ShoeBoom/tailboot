import { parseTailcatKey, type TailcatKey } from "./tailcat.ts";

export type TailbootConfig = (
  | { authKey: string; tailcat?: TailcatKey }
  | { authKey?: string; tailcat: TailcatKey }
) & { wifi?: { ssid: string; password: string } };

/** Both connection routes are independent, but an ISO needs at least one. */
export function validateTailbootConfig(config: {
  authKey?: string;
  tailcat?: TailcatKey;
  wifi?: { ssid: string; password: string };
}): TailbootConfig {
  const tailcat = config.tailcat === undefined ? undefined : parseTailcatKey(config.tailcat);
  if (config.authKey?.trim()) return { ...config, authKey: config.authKey, tailcat };
  if (tailcat) return { ...config, authKey: undefined, tailcat };
  throw new Error("Configure Tailscale, Tailcat, or both before creating the ISO.");
}
