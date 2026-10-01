export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/")) {
      try {
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