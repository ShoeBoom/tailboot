import type { APIRoute } from "astro";

import { proxyTailbootIso } from "../iso-proxy.ts";

export const GET: APIRoute = ({ request }) => proxyTailbootIso(request);
export const HEAD: APIRoute = ({ request }) => proxyTailbootIso(request);
