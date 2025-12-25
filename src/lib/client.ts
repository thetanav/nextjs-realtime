import { treaty } from "@elysiajs/eden";
import type { App } from "../app/api/[[...slugs]]/route";

const baseurl =
  process.env.NODE_ENV === "production" ? "chugli.tanav.me" : "localhost:3000";

export const client = treaty<App>(baseurl).api;
