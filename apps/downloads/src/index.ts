const downloadPrefix = "/downloads/";
const rangePattern = /^bytes=(\d*)-(\d*)$/u;
const versionedReleasePattern =
  /^host\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\//u;

export const downloadKey = (pathname: string) => {
  if (!pathname.startsWith(downloadPrefix)) {
    return;
  }
  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(downloadPrefix.length));
  } catch {
    return;
  }
  const segments = key.split("/");
  if (
    !key.startsWith("host/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return;
  }
  return key;
};

const cacheControl = (key: string) => {
  if (key.startsWith("host/latest-")) {
    return "no-cache, must-revalidate";
  }
  if (versionedReleasePattern.test(key)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=300, must-revalidate";
};

export const requestedContentRange = (header: string | null, size: number) => {
  const match = header ? rangePattern.exec(header.trim()) : undefined;
  if (!match) {
    return;
  }
  const [, startValue = "", endValue = ""] = match;
  if (startValue) {
    const start = Number(startValue);
    const end = endValue ? Math.min(Number(endValue), size - 1) : size - 1;
    return start <= end && start < size
      ? `bytes ${start}-${end}/${size}`
      : undefined;
  }
  const suffix = Number(endValue);
  if (!(suffix > 0)) {
    return;
  }
  const length = Math.min(suffix, size);
  return `bytes ${size - length}-${size - 1}/${size}`;
};

const landingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VibePad</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { align-items: center; display: flex; margin: 0; min-height: 100vh; }
    main { margin: auto; max-width: 34rem; padding: 2rem; }
    h1 { font-size: clamp(3rem, 12vw, 6rem); letter-spacing: -0.06em; margin: 0; }
    p { color: color-mix(in srgb, currentColor 65%, transparent); font-size: 1.25rem; line-height: 1.5; }
  </style>
</head>
<body><main><h1>VibePad</h1><p>Remote coding, on your computer.</p></main></body>
</html>`;

const downloadResponse = async (request: Request, env: Env, key: string) => {
  if (request.method === "HEAD") {
    const object = await env.DOWNLOADS.head(key);
    if (!object) {
      return new Response("Download unavailable", { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", cacheControl(key));
    headers.set("content-length", String(object.size));
    headers.set("etag", object.httpEtag);
    return new Response(null, { headers });
  }

  const object = await env.DOWNLOADS.get(key, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) {
    return new Response("Download unavailable", { status: 404 });
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", cacheControl(key));
  headers.set("etag", object.httpEtag);
  const resolvedRange = requestedContentRange(
    request.headers.get("range"),
    object.size
  );
  if (resolvedRange) {
    headers.set("content-range", resolvedRange);
  }
  const hasBody = "body" in object;
  let status = 412;
  if (hasBody) {
    status = resolvedRange ? 206 : 200;
  }
  return new Response(hasBody ? object.body : undefined, {
    headers,
    status,
  });
};

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (
      url.pathname === "/" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      return new Response(request.method === "HEAD" ? null : landingPage, {
        headers: {
          "cache-control": "public, max-age=300, must-revalidate",
          "content-security-policy":
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }
    const key = downloadKey(url.pathname);
    if (!key) {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        headers: { allow: "GET, HEAD" },
        status: 405,
      });
    }
    return downloadResponse(request, env, key);
  },
} satisfies ExportedHandler<Env>;
