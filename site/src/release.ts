import type { getRelease } from "../release.ts";

declare const __TAILBOOT_RELEASE__: Awaited<ReturnType<typeof getRelease>> | null;

export const release = __TAILBOOT_RELEASE__;
