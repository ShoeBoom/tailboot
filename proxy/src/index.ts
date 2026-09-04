/** Forward one Tailboot ISO by tag; never accept an upstream host or asset path. */
export async function proxyRelease(
  request: Request,
  allowedOrigin: string,
  fetchUpstream: typeof fetch = fetch,
) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });

  // Reject before fetching: CORS headers alone would still allow hotlink traffic.
  const origin = request.headers.get("Origin");
  if (!origin || origin === "null" || origin !== allowedOrigin) {
    return new Response("Origin not allowed.", { status: 403, headers });
  }
  headers.set("Access-Control-Allow-Origin", allowedOrigin);

  const url = new URL(request.url);
  const tag = /^\/(v\d{4}\.\d{2}\.\d{2}\.\d{6})$/.exec(url.pathname)?.[1];
  if (!tag || url.search) {
    return new Response("Release not found.", { status: 404, headers });
  }

  if (request.method === "OPTIONS") {
    const method = request.headers.get("Access-Control-Request-Method");
    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method not allowed.", { status: 405, headers });
    }
    headers.set("Access-Control-Allow-Methods", "GET, HEAD");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("Allow", "GET, HEAD, OPTIONS");
    return new Response("Method not allowed.", { status: 405, headers });
  }

  const isoName = `tailboot-${tag}-amd64.iso`;
  const upstreamUrl = `https://github.com/ShoeBoom/tailboot/releases/download/${tag}/${isoName}`;
  try {
    // Only forward the method and cancellation signal, never cookies or headers.
    const upstream = await fetchUpstream(upstreamUrl, {
      method: request.method,
      redirect: "follow",
      signal: request.signal,
    });
    if (upstream.status !== 200 || (request.method === "GET" && !upstream.body)) {
      await upstream.body?.cancel();
      return new Response("The release image is unavailable.", {
        status: upstream.status === 404 ? 404 : 502,
        headers,
      });
    }

    headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${isoName}"`);
    const length = upstream.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);
    return new Response(request.method === "HEAD" ? null : upstream.body, { headers });
  } catch (error) {
    console.error("Tailboot ISO request failed", error);
    return new Response("The release image is unavailable.", { status: 502, headers });
  }
}

export default {
  fetch(request: Request, env: Env) {
    return proxyRelease(request, env.ALLOWED_ORIGIN);
  },
};
