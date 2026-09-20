import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

export class WebError extends Error {}
export const MAX_WEB_BYTES = 2_000_000;
export interface HttpDocument {
  url: string;
  contentType: string;
  body: string;
}
export type ResolveHost = (hostname: string) => Promise<{ address: string; family: number }[]>;
export interface HttpReply {
  status: number;
  location?: string;
  contentType: string;
  body: string;
}
export type HttpTransport = (
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
  headers: Record<string, string>,
) => Promise<HttpReply>;

export function publicAddress(address: string): boolean {
  if (!isIP(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.range() !== "unicast") return false;
  // Positive global IPv6 allocation check also excludes unknown/local translation ranges.
  return parsed.kind() === "ipv4" || parsed.match(ipaddr.parse("2000::"), 3);
}

export function publicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebError("Use a complete public HTTP or HTTPS URL.");
  }
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    !/^https?:\/\//i.test(value) ||
    /\s/.test(value) ||
    value.includes("\\") ||
    url.username ||
    url.password ||
    url.href.length > 4096 ||
    url.port ||
    !host ||
    host === "localhost" ||
    /\.(localhost|local|internal|home|lan|test|invalid)$/.test(host) ||
    (!isIP(host) && !host.includes(".")) ||
    (isIP(host) && !publicAddress(host))
  ) {
    throw new WebError(
      "Only public HTTP/HTTPS pages on standard ports are supported. Local/private addresses, credentials and other protocols are unavailable.",
    );
  }
  url.hash = "";
  return url;
}

// Use the vetted address for the actual socket; never perform a second DNS lookup.
export const requestPublic: HttpTransport = (url, target, signal, headers) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const options: RequestOptions = {
      method: "GET",
      agent: false,
      family: target.family,
      signal,
      maxHeaderSize: 16_384,
      lookup: (_host, _options, callback) => callback(null, target.address, target.family),
      headers: {
        "User-Agent": "ComputerCat/0.1 (public page reader)",
        Accept: "text/html, text/plain, application/json;q=0.9",
        "Accept-Encoding": "identity",
        ...headers,
      },
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      options,
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = response.headers["content-type"] ?? "";
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({ status, contentType, body: "", ...(location ? { location } : {}) });
          return;
        }
        const encoding = response.headers["content-encoding"];
        if (
          (encoding && encoding !== "identity") ||
          Number(response.headers["content-length"]) > MAX_WEB_BYTES
        ) {
          response.destroy();
          reject(new WebError("The page is too large or uses unsupported compression."));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > MAX_WEB_BYTES) {
            response.destroy();
            reject(new WebError("The page exceeds the 2 MB download limit."));
          } else chunks.push(chunk);
        });
        response.on("error", () =>
          reject(new WebError("The page transfer failed or was cancelled.")),
        );
        response.on("end", () => {
          if (!response.complete) {
            reject(new WebError("The page transfer was incomplete."));
            return;
          }
          try {
            const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1] ?? "utf-8";
            const body = new TextDecoder(charset).decode(Buffer.concat(chunks));
            resolve({ status, contentType, body });
          } catch {
            reject(new WebError("The page uses an unsupported text encoding."));
          }
        });
      },
    );
    request.on("error", () => reject(new WebError("The public website could not be reached.")));
    request.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new WebError("Protocol upgrades are unsupported."));
    });
    request.end();
  });

export class PublicHttp {
  constructor(
    private readonly resolveHost: ResolveHost = (hostname) =>
      lookup(hostname, { all: true, verbatim: true }),
    private readonly transport: HttpTransport = requestPublic,
  ) {}

  async get(
    value: string,
    signal: AbortSignal,
    authorization?: { origin: string; headers: Record<string, string> },
  ): Promise<HttpDocument> {
    let url = publicUrl(value);
    const visited = new Set<string>();
    for (let hop = 0; hop <= 4; hop++) {
      signal.throwIfAborted();
      if (visited.has(url.href)) throw new WebError("The website redirected in a loop.");
      visited.add(url.href);
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await this.resolveHost(hostname);
      signal.throwIfAborted();
      if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address)))
        throw new WebError("The website resolves to an unsupported or private network address.");
      const target = addresses[0];
      if (!target) throw new WebError("The website address is unavailable.");
      const response = await this.transport(
        url,
        target,
        signal,
        authorization && url.origin === authorization.origin ? authorization.headers : {},
      );
      signal.throwIfAborted();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        // A keyed API never redirects: credentials cannot be forwarded to a redirected path.
        if (authorization)
          throw new WebError("The search provider returned an unexpected redirect.");
        if (!response.location) throw new WebError("The website returned an invalid redirect.");
        const next = publicUrl(new URL(response.location, url).href);
        if (url.protocol === "https:" && next.protocol !== "https:")
          throw new WebError("The website redirected to an insecure connection.");
        url = next;
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        throw new WebError(
          `The website returned HTTP ${response.status}. It may require sign-in or be unavailable.`,
        );
      return { url: url.href, contentType: response.contentType, body: response.body };
    }
    throw new WebError("The website redirected too many times.");
  }
}
