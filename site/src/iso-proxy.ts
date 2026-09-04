import type { release } from "./release.ts";

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

/** Streams the build-selected ISO without buffering it or accepting an upstream URL. */
export async function proxyTailbootIso(
  request: Request,
  selectedRelease: typeof release,
  fetchUpstream: typeof fetch = fetch,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }
  if (!selectedRelease) {
    return response("No release image is configured.", 503);
  }

  // A page left open across a deployment must not receive a different release.
  const url = new URL(request.url);
  if (url.pathname !== `/${selectedRelease.isoName}` || url.search) {
    return response("Image not found. Reload the page to use the current release.", 404);
  }

  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return response("Cross-site requests are not allowed.", 403);
  }

  try {
    // The customizer needs the entire ISO. Do not forward ranges or credentials.
    const upstream = await fetchUpstream(selectedRelease.upstreamUrl, {
      method: request.method,
      redirect: "follow",
      signal: request.signal,
    });
    if (upstream.status !== 200 || (request.method === "GET" && !upstream.body)) {
      await upstream.body?.cancel();
      return response("The release image is unavailable.", 502);
    }

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${selectedRelease.isoName}"`,
        "Content-Length": String(selectedRelease.size),
        "Content-Type": "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Tailboot ISO request failed", error);
    return response("The release image is unavailable.", 502);
  }
}
