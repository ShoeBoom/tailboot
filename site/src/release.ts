declare const __TAILBOOT_RELEASE_TAG__: string;

const releaseTag = typeof __TAILBOOT_RELEASE_TAG__ === "undefined"
  ? ""
  : __TAILBOOT_RELEASE_TAG__;
const isoName = releaseTag
  ? `tailboot-${releaseTag}-amd64.iso`
  : "tailboot.iso";

export const release = {
  tag: releaseTag || "development",
  isoName,
  upstreamUrl: releaseTag
    ? `https://github.com/ShoeBoom/tailboot/releases/download/${releaseTag}/${isoName}`
    : "",
} as const;
