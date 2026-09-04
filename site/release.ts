const repository = "https://github.com/ShoeBoom/tailboot";

type GitHubRelease = {
  tag_name: string;
  assets: { name: string; state: string; size: number }[];
};

/** Resolve once during the build so the page and proxy use the same published ISO. */
export async function getRelease(fetchRelease: typeof fetch = fetch) {
  const response = await fetchRelease(
    "https://api.github.com/repos/ShoeBoom/tailboot/releases/latest",
    {
      headers: { Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not load the latest Tailboot release: HTTP ${response.status}.`);
  }

  const { tag_name: tag, assets } = await response.json() as GitHubRelease;
  if (!/^v\d{4}\.\d{2}\.\d{2}\.\d{6}$/.test(tag)) {
    throw new Error("The latest Tailboot release has an unexpected tag.");
  }

  const isoName = `tailboot-${tag}-amd64.iso`;
  const iso = assets.find((asset) => asset.name === isoName);
  const checksum = assets.find((asset) => asset.name === `${isoName}.sha256`);
  if (
    !iso || iso.state !== "uploaded" || !Number.isSafeInteger(iso.size) || iso.size <= 0 ||
    !checksum || checksum.state !== "uploaded" || checksum.size <= 0
  ) {
    throw new Error("The latest Tailboot release is missing its ISO or checksum.");
  }

  return {
    tag,
    isoName,
    size: iso.size,
    upstreamUrl: `${repository}/releases/download/${tag}/${isoName}`,
  };
}
