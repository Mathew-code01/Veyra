// ============================================================================
// VEYRA Desktop - Download Worker
//
// Cloudflare Worker for serving release artifacts from R2 bucket.
// Supports: GET, HEAD, Range requests, ETag, partial downloads.
//
// Deployment: wrangler deploy
// ============================================================================

import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  VEYRA_RELEASES: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors({
  origin: [
    "https://veyra-al.vercel.app",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ],
  allowHeaders: ["Range", "Content-Type"],
  exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
  maxAge: 86400,
}));

// Allowed release channels
const ALLOWED_CHANNELS = ["stable", "beta"];

// Allowed platforms and their artifact patterns
const PLATFORM_PATTERNS = {
  windows: [/\.exe$/i, /\.zip$/i, /\.msi$/i],
  macos: [/\.dmg$/i, /\.zip$/i],
  linux: [/\.AppImage$/i, /\.deb$/i, /\.rpm$/i, /\.tar\.gz$/i],
  checksums: [/SHA256SUMS\.txt$/i, /latest\.yml$/i, /latest-beta\.yml$/i],
};

function validatePath(pathname: string): { channel: string; platform: string; version: string; file: string } | null {
  // Expected: /releases/{channel}/{version}/{platform}/{file}
  const parts = pathname.split("/").filter(Boolean);
  
  if (parts.length < 4 || parts[0] !== "releases") {
    return null;
  }

  const channel = parts[1];
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return null;
  }

  const version = parts[2];
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version)) {
    return null;
  }

  const platform = parts[3];
  if (!Object.keys(PLATFORM_PATTERNS).includes(platform) && platform !== "checksums") {
    return null;
  }

  const file = parts.slice(4).join("/");
  if (!file || file.includes("..") || file.includes("\\")) {
    return null;
  }

  // Validate file extension for platform
  const patterns = PLATFORM_PATTERNS[platform as keyof typeof PLATFORM_PATTERNS] || PLATFORM_PATTERNS.checksums;
  if (!patterns.some((re) => re.test(file))) {
    return null;
  }

  return { channel, platform, version, file };
}

function getContentType(filename: string): string {
  if (filename.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (filename.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (filename.endsWith(".AppImage")) return "application/x-iso9660-appimage";
  if (filename.endsWith(".deb")) return "application/vnd.debian.binary-package";
  if (filename.endsWith(".rpm")) return "application/x-rpm";
  if (filename.endsWith(".zip")) return "application/zip";
  if (filename.endsWith(".tar.gz") || filename.endsWith(".tgz")) return "application/gzip";
  if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return "application/yaml";
  if (filename.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

app.get("/releases/*", async (c) => {
  const validation = validatePath(c.req.path);
  
  if (!validation) {
    return c.json({ error: "Invalid or unauthorized path" }, 404);
  }

  const { channel, version, file } = validation;
  const objectKey = `releases/${channel}/${version}/${file}`;

  try {
    const object = await c.env.VEYRA_RELEASES.get(objectKey);

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    // Handle HEAD requests
    if (c.req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "Content-Length": object.size.toString(),
          "Content-Type": getContentType(file),
          "ETag": object.httpEtag,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // Handle Range requests for partial downloads
    const rangeHeader = c.req.header("Range");
    
    if (rangeHeader) {
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : object.size - 1;
        
        if (start >= object.size || end >= object.size || start > end) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${object.size}`,
              "Content-Length": "0",
            },
          });
        }

        const rangeObject = await c.env.VEYRA_RELEASES.get(objectKey, {
          range: [start, end],
        });

        if (!rangeObject) {
          return c.json({ error: "Range not satisfiable" }, 416);
        }

        return new Response(rangeObject.body, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${object.size}`,
            "Content-Length": (end - start + 1).toString(),
            "Content-Type": getContentType(file),
            "ETag": object.httpEtag,
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      // Full download
      return new Response(object.body, {
        status: 200,
        headers: {
          "Content-Length": object.size.toString(),
          "Content-Type": getContentType(file),
          "Content-Disposition": `attachment; filename="${file}"`,
          "ETag": object.httpEtag,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error("[Download Worker] Error:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  });

// List available versions for a channel (for update checking)
app.get("/releases/:channel/versions", async (c) => {
  const channel = c.req.param("channel");
  
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return c.json({ error: "Invalid channel" }, 404);
  }

  try {
    const objects = await c.env.VEYRA_RELEASES.list({
      prefix: `releases/${channel}/`,
      delimiter: "/",
    });

    const versions = new Set<string>();
    
    for (const obj of objects.objects) {
      const parts = obj.key.split("/");
      if (parts.length >= 3) {
        versions.add(parts[2]);
      }
    }

    return c.json({
      channel,
      versions: Array.from(versions).sort((a, b) => {
        // Simple version sort
        const aParts = a.split(".").map(Number);
        const bParts = b.split(".").map(Number);
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
          const aVal = aParts[i] || 0;
          const bVal = bParts[i] || 0;
          if (aVal !== bVal) return bVal - aVal; // Descending
        }
        return 0;
      }),
    });
  } catch (error) {
    console.error("[Download Worker] List error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Latest release metadata for electron-updater
app.get("/releases/:channel/latest.yml", async (c) => {
  const channel = c.req.param("channel");
  
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return c.json({ error: "Invalid channel" }, 404);
  }

  try {
    const object = await c.env.VEYRA_RELEASES.get(`releases/${channel}/latest.yml`);
    
    if (!object) {
      return c.json({ error: "No release metadata found" }, 404);
    }

    const text = await object.text();
    
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/yaml",
        "Cache-Control": "public, max-age=300",
        "ETag": object.httpEtag,
      },
    });
  } catch (error) {
    console.error("[Download Worker] Latest error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Health check
app.get("/health", (c) => {
  return c.json({ 
    status: "healthy", 
    service: "veyra-download-worker",
    timestamp: new Date().toISOString(),
  });
});

export default app;