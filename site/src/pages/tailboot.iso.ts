import type { APIRoute } from "astro";

import { proxyTailbootIso } from "../iso-proxy.ts";
import { release } from "../release.ts";

export const GET: APIRoute = ({ request }) => proxyTailbootIso(request, release);
export const HEAD: APIRoute = ({ request }) => proxyTailbootIso(request, release);
