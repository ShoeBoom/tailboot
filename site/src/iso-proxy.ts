const copiedHeaders = [
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
] as const;

function response(message: string, status: number) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Streams the one ISO selected at build time; callers cannot choose an upstream. */
export async function proxyTailbootIso(
  request: Request,
  selectedRelease: {
    isoName: string;
    upstreamUrl: string;
  },
  fetchUpstream: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  if (url.pathname !== "/tailboot.iso" || url.search) {
    return response("Not found.", 404);
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  // Browsers send this header themselves. It blocks other sites from hotlinking
  // the large response while retaining compatibility with clients that omit it.
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin") {
    return response("Cross-site requests are not allowed.", 403);
  }
  if (!selectedRelease.upstreamUrl) {
    return response("No release image is configured.", 503);
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("Range");
  if (range) upstreamHeaders.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetchUpstream(selectedRelease.upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Tailboot ISO request failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return response("The release image is unavailable.", 502);
  }

  if (!upstream.ok) {
    await upstream.body?.cancel();
    console.error(
      JSON.stringify({
        message: "Tailboot ISO upstream returned an error",
        status: upstream.status,
      }),
    );
    return response("The release image is unavailable.", 502);
  }

  const headers = new Headers({
    "Content-Disposition": `attachment; filename="${selectedRelease.isoName}"`,
    "Content-Type": "application/octet-stream",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of copiedHeaders) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
