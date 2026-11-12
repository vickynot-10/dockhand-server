import { config } from "dotenv";

config();

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost";
const TLS_ENABLED = process.env.TLS_ENABLED === "true";
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT ?? (TLS_ENABLED ? 443 : 80));

export const RESERVED_SLUGS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "dashboard",
  "traefik",
  "dockhand",
  "mail",
]);

export const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export function IsValidSlug(slug: string) {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function BuildHostName(slug: string) {
  return `${slug}.${BASE_DOMAIN}`;
}

export function BuildPublicUrl(host_name: string) {
  const scheme = TLS_ENABLED ? "https" : "http";
  const default_port = TLS_ENABLED ? 443 : 80;
  const port_suffix = PUBLIC_PORT === default_port ? "" : `:${PUBLIC_PORT}`;
  return `${scheme}://${host_name}${port_suffix}`;
}

export function GetEntrypoint() {
  return TLS_ENABLED ? "websecure" : "web";
}
