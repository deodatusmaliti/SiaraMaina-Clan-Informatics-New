const FIREBASE_PROJECT_ID = "siaramaina-clan-informat-bf7f2";
const MASTER_ADMIN_EMAIL = "deodatusmaliti2@gmail.com";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let firebaseJwks;
let firebaseJwksExpiresAt = 0;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        const requiresAdmin =
          (url.pathname === "/api/contact" && request.method === "GET") ||
          (url.pathname === "/api/newsletter" && request.method === "GET") ||
          (url.pathname === "/api/content" && request.method === "POST") ||
          (url.pathname === "/api/content" && request.method === "GET" && !url.searchParams.get("key")) ||
          (url.pathname === "/api/visitors" && request.method === "GET") ||
          (url.pathname === "/api/stats" && request.method === "GET");

        if (requiresAdmin) {
          const authError = await authorizeAdmin(request, corsHeaders);
          if (authError) return authError;
        }

        if (url.pathname === "/api/contact" && request.method === "POST") {
          const { name, email, message } = await request.json();
          if (!name || !email || !message) {
            return jsonResponse({ error: "name, email, and message are required" }, 400, corsHeaders);
          }
          await env.DB.prepare("INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)").bind(name, email, message).run();
          return jsonResponse({ success: true, message: "Contact submission saved" }, 200, corsHeaders);
        }

        if (url.pathname === "/api/contact" && request.method === "GET") {
          const results = await env.DB.prepare("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 100").all();
          return jsonResponse({ contacts: results.results }, 200, corsHeaders);
        }

        if (url.pathname === "/api/newsletter" && request.method === "POST") {
          const { email } = await request.json();
          if (!email) {
            return jsonResponse({ error: "email is required" }, 400, corsHeaders);
          }
          try {
            await env.DB.prepare("INSERT INTO newsletter (email) VALUES (?)").bind(email).run();
            return jsonResponse({ success: true, message: "Subscribed successfully" }, 200, corsHeaders);
          } catch (e) {
            if (String(e).includes("UNIQUE")) {
              return jsonResponse({ error: "Already subscribed" }, 409, corsHeaders);
            }
            throw e;
          }
        }

        if (url.pathname === "/api/newsletter" && request.method === "GET") {
          const results = await env.DB.prepare("SELECT * FROM newsletter ORDER BY subscribed_at DESC LIMIT 100").all();
          return jsonResponse({ subscribers: results.results }, 200, corsHeaders);
        }

        if (url.pathname === "/api/content" && request.method === "POST") {
          const { key, value } = await request.json();
          if (!key || value === undefined) {
            return jsonResponse({ error: "key and value are required" }, 400, corsHeaders);
          }
          await env.DB.prepare("INSERT INTO content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')").bind(key, value, value).run();
          return jsonResponse({ success: true, message: "Content saved" }, 200, corsHeaders);
        }

        if (url.pathname === "/api/content" && request.method === "GET") {
          const key = url.searchParams.get("key");
          if (key) {
            const result = await env.DB.prepare("SELECT * FROM content WHERE key = ?").bind(key).first();
            return jsonResponse({ content: result }, 200, corsHeaders);
          }
          const results = await env.DB.prepare("SELECT * FROM content ORDER BY updated_at DESC LIMIT 100").all();
          return jsonResponse({ contents: results.results }, 200, corsHeaders);
        }

        if (url.pathname === "/api/visitor" && request.method === "POST") {
          const ip = request.headers.get("cf-connecting-ip") || "unknown";
          const country = request.headers.get("cf-ipcountry") || "unknown";
          const path = url.searchParams.get("path") || "/";
          const ua = request.headers.get("user-agent") || "unknown";
          await env.DB.prepare("INSERT INTO visitors (ip, country, path, user_agent) VALUES (?, ?, ?, ?)").bind(ip, country, path, ua).run();
          return jsonResponse({ success: true }, 200, corsHeaders);
        }

        if (url.pathname === "/api/visitors" && request.method === "GET") {
          const results = await env.DB.prepare("SELECT * FROM visitors ORDER BY visited_at DESC LIMIT 100").all();
          return jsonResponse({ visitors: results.results }, 200, corsHeaders);
        }

        if (url.pathname === "/api/stats" && request.method === "GET") {
          const contacts = await env.DB.prepare("SELECT COUNT(*) as count FROM contacts").first();
          const subscribers = await env.DB.prepare("SELECT COUNT(*) as count FROM newsletter").first();
          const visitors = await env.DB.prepare("SELECT COUNT(*) as count FROM visitors").first();
          return jsonResponse({ contacts: contacts.count, subscribers: subscribers.count, visitors: visitors.count }, 200, corsHeaders);
        }

        return jsonResponse({ error: "API endpoint not found" }, 404, corsHeaders);
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500, corsHeaders);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

function jsonResponse(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function authorizeAdmin(request, corsHeaders) {
  let claims;
  try {
    claims = await verifyFirebaseIdToken(request);
  } catch {
    return jsonResponse({ error: "Authentication service unavailable" }, 503, corsHeaders);
  }

  if (!claims) {
    return jsonResponse({ error: "Authentication required" }, 401, corsHeaders);
  }

  if (claims.email.toLowerCase() !== MASTER_ADMIN_EMAIL) {
    return jsonResponse({ error: "Administrator access required" }, 403, corsHeaders);
  }

  return null;
}

async function verifyFirebaseIdToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return null;

  const parts = tokenMatch[1].split(".");
  if (parts.length !== 3) return null;

  let header;
  let claims;
  let signature;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    signature = decodeBase64Url(parts[2]);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const jwks = await getFirebaseJwks();
  const jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) return null;

  let validSignature;
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      signature,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !validSignature ||
    claims.aud !== FIREBASE_PROJECT_ID ||
    claims.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
    typeof claims.sub !== "string" ||
    claims.sub.length === 0 ||
    typeof claims.exp !== "number" ||
    claims.exp <= now ||
    typeof claims.iat !== "number" ||
    claims.iat > now + 60 ||
    claims.email_verified !== true ||
    typeof claims.email !== "string"
  ) {
    return null;
  }

  return claims;
}

async function getFirebaseJwks() {
  if (firebaseJwks && Date.now() < firebaseJwksExpiresAt) return firebaseJwks;

  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("Failed to fetch Firebase signing keys");

  firebaseJwks = await response.json();
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebaseJwksExpiresAt = Date.now() + maxAge * 1000;
  return firebaseJwks;
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}