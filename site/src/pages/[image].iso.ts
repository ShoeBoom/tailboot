import type { APIRoute } from "astro";

import { proxyTailbootIso } from "../iso-proxy.ts";
import { release } from "../release.ts";

export const ALL: APIRoute = ({ request }) => proxyTailbootIso(request, release);
