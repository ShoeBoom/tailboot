/** Build the download URL from the release workflow's explicit metadata. */
export function getRelease(env: Record<string, string | undefined>) {
  const tag = env.TAILBOOT_RELEASE;
  if (!tag || !/^v\d{4}\.\d{2}\.\d{2}\.\d{6}$/.test(tag)) {
    throw new Error("Set TAILBOOT_RELEASE to the published ISO's CalVer tag.");
  }

  const size = Number(env.TAILBOOT_ISO_SIZE);
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Set TAILBOOT_ISO_SIZE to the published ISO's byte count.");
  }

  if (!env.TAILBOOT_PROXY_URL) {
    throw new Error("Set TAILBOOT_PROXY_URL to the release proxy's origin.");
  }
  const proxy = new URL(env.TAILBOOT_PROXY_URL);
  if (
    !["http:", "https:"].includes(proxy.protocol) ||
    proxy.pathname !== "/" || proxy.search || proxy.hash || proxy.username || proxy.password
  ) {
    throw new Error("TAILBOOT_PROXY_URL must be an HTTP(S) origin without a path or credentials.");
  }

  return {
    tag,
    isoName: `tailboot-${tag}-amd64.iso`,
    size,
    isoUrl: `${proxy.origin}/${tag}`,
  };
}
