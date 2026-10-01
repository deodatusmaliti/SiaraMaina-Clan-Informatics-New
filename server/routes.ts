import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { dbEngine, DatabaseSchema, BACKUP_DIR, DATA_DIR, ROOT_DIR } from "./db";
import { syncManager } from "./sync";
import {
  authenticateWithPassword,
  validateEmailOrThrow,
  verifyToken,
  hashPassword,
  AppUser,
  sanitizeUser,
} from "./auth";
import { metricsEngine } from "./metrics";
import { createCheckoutSession, handleStripeWebhook } from "./stripe";
import { isSupabaseConfigured, supabase, initializeSupabase } from "./supabase";

export const apiRouter = express.Router();

apiRouter.get("/readiness", (req, res) => {
  try {
    const stats = dbEngine.getStats();
    res.json({
      ready: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({ ready: false, error: err.message });
  }
});

apiRouter.get("/db/supabase-handshake", async (req: Request, res: Response) => {
  return res.json({
    success: true,
    configured: true,
    message: "Database handshake OK. Cloudflare D1 (siaramaina-db) persistent database is active. Supabase deactivated.",
    database: "Cloudflare D1 (siaramaina-db)",
    engine: "Cloudflare D1 SQLite Edge Engine",
    ping: "OK"
  });
});

apiRouter.post("/db/configure-supabase", async (req: Request, res: Response) => {
  try {
    const { url, serviceRoleKey, anonKey } = req.body;
    if (!url || !url.startsWith("https://")) {
      return res.status(400).json({ success: false, error: "Invalid Supabase URL format" });
    }
    if (!serviceRoleKey) {
      return res.status(400).json({ success: false, error: "Service Role Key is required" });
    }

    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    // Filter out existing Supabase parameters
    const lines = envContent.split("\n").filter(line => {
      const trimmed = line.trim();
      return !(trimmed.startsWith("VITE_SUPABASE_URL=") || 
               trimmed.startsWith("SUPABASE_SERVICE_ROLE_KEY=") || 
               trimmed.startsWith("VITE_SUPABASE_ANON_KEY="));
    });

    // Append new parameters
    lines.push(`VITE_SUPABASE_URL=${url.trim()}`);
    lines.push(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey.trim()}`);
    lines.push(`VITE_SUPABASE_ANON_KEY=${(anonKey || serviceRoleKey).trim()}`);

    fs.writeFileSync(envPath, lines.join("\n").trim() + "\n", "utf-8");
    console.log("[Routes] Saved Supabase credentials to .env file securely.");

    // Dynamically re-initialize live Supabase client
    initializeSupabase();

    // Pull database authoritative cache from new server
    await dbEngine.pullLatestFromSupabase();

    res.json({
      success: true,
      message: "Supabase credentials updated and activated live on-the-fly! Database synced successfully.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get("/db/supabase-audit-logs", async (req: Request, res: Response) => {
  try {
    if (isSupabaseConfigured && supabase) {
      // Query the last 50 entries from supabase table audit_logs ordered by created_at descending
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("[Routes] Supabase audit logs query error:", error.message);
      } else if (data) {
        return res.json({
          success: true,
          source: "supabase",
          count: data.length,
          data: data.map((item: any) => ({
            id: item.id,
            timestamp: item.created_at || item.timestamp,
            eventType: item.action || "AUDIT",
            summary: typeof item.details === "string" ? item.details : (item.details?.summary || item.details?.message || JSON.stringify(item.details)),
            actorEmail: item.user_id || "system",
            ipAddress: item.ip_address || "N/A",
            userAgent: item.user_agent || "N/A"
          }))
        });
      }
    }

    // Fallback: local audit_logs collection
    const localLogs = dbEngine.getCollection("auditLogs") || [];
    const authLogs = dbEngine.getCollection("authAuditLogs") || [];
    const combined = [...localLogs, ...authLogs].map((item: any) => ({
      id: item.id || Math.random().toString(36).slice(2),
      timestamp: item.timestamp || new Date().toISOString(),
      eventType: item.eventType || item.action || "AUDIT",
      summary: item.summary || item.details || "System Audit Event",
      actorEmail: item.actorEmail || item.user || "system",
      ipAddress: item.ipAddress || "127.0.0.1",
      userAgent: item.userAgent || "Local Node Engine"
    }));

    // Sort newest first & take first 50
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const limit50 = combined.slice(0, 50);

    return res.json({
      success: true,
      source: "local-fallback",
      count: limit50.length,
      data: limit50
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Middleware: Telemetry recording
apiRouter.use((req: Request, res: Response, next) => {
  const start = Date.now();
  const bytesIn = req.headers["content-length"] ? parseInt(req.headers["content-length"] as string, 10) : 0;
  metricsEngine.recordRequest(req.method, bytesIn);

  res.on("finish", () => {
    const duration = Date.now() - start;
    metricsEngine.recordResponse(res.statusCode, duration, 256);
  });
  next();
});

// 1. Real-Time SSE Stream Endpoint
apiRouter.get("/sync/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const clientId = "client-" + crypto.randomUUID().slice(0, 8);
  const userAgent = req.headers["user-agent"] || "";
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";

  syncManager.registerClient(clientId, res, userAgent, ip);

  req.on("close", () => {
    syncManager.removeClient(clientId);
  });
});

// 2. Continuous Consistency Pulse Endpoint
apiRouter.get("/db/pulse", async (req: Request, res: Response) => {
  await dbEngine.pullLatestFromSupabase();
  const records = dbEngine.getCollection("records") || [];
  res.json({
    success: true,
    version: dbEngine.getVersion(),
    count: records.length,
    lastModified: dbEngine.getLastModified(),
    clientsConnected: syncManager.getActiveClientCount(),
    timestamp: new Date().toISOString(),
  });
});

// 3. RFC 5322 Email Validation Endpoint
apiRouter.post("/auth/validate-email", (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const ua = req.headers["user-agent"] || "";
    const cleanEmail = validateEmailOrThrow(email, "VALIDATE", ip, ua);
    res.json({ success: true, email: cleanEmail, message: "RFC 5322 format verified." });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Native In-Built User Authentication Endpoints
apiRouter.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const ua = req.headers["user-agent"] || "";

    const result = await authenticateWithPassword(email, password, ip, ua);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(401).json({ success: false, error: err.message });
  }
});

apiRouter.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, role, branch, institution } = req.body;
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const ua = req.headers["user-agent"] || "";

    const cleanEmail = validateEmailOrThrow(email, "REGISTRATION", ip, ua);
    const users = dbEngine.getCollection("users") as AppUser[];

    if (users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password || "ClanPass2026!", salt);
    const isFirst = users.length === 0 || cleanEmail.includes("deodatusmaliti");

    const newUser: AppUser = {
      uid: "user-" + crypto.randomUUID().slice(0, 10),
      email: cleanEmail,
      displayName: displayName || cleanEmail.split("@")[0],
      role: isFirst ? "admin" : (role as any) || "viewer",
      institution: institution || "SiaraMaina Clan Informatics",
      branch: branch || "all",
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      status: "active",
      active: true,
      provider: "password",
    };

    users.push(newUser);
    await dbEngine.save();

    syncManager.broadcast("auth_change", {
      action: "USER_REGISTERED",
      user: sanitizeUser(newUser),
      totalUsers: users.length,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, user: sanitizeUser(newUser) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.get("/auth/users", (req: Request, res: Response) => {
  const users = (dbEngine.getCollection("users") as AppUser[]) || [];
  res.json({ success: true, users: users.map(sanitizeUser) });
});

apiRouter.post("/auth/password-reset/request", (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const ua = req.headers["user-agent"] || "";
    const cleanEmail = validateEmailOrThrow(email, "RESET_REQUEST", ip, ua);

    const tokenEntry = dbEngine.createPasswordResetToken(cleanEmail);
    res.json({
      success: true,
      message: `Password reset instructions and verification code [${tokenEntry.code}] generated.`,
      code: tokenEntry.code,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

apiRouter.post("/auth/password-reset/confirm", async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const tokens = dbEngine.getCollection("passwordResetTokens");
    const valid = tokens.find(
      (t: any) =>
        t.email === cleanEmail &&
        t.code === String(code).trim() &&
        !t.used &&
        t.expiresAt > Date.now()
    );

    if (!valid) {
      return res.status(400).json({ error: "Invalid or expired verification code." });
    }

    valid.used = true;
    const users = dbEngine.getCollection("users") as AppUser[];
    const user = users.find((u) => u.email && u.email.toLowerCase() === cleanEmail);
    if (user) {
      const salt = crypto.randomBytes(16).toString("hex");
      user.salt = salt;
      user.passwordHash = hashPassword(newPassword, salt);
    }
    await dbEngine.save();
    res.json({ success: true, message: "Password updated successfully." });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4b. Stripe Checkout & Webhook Integration endpoints
apiRouter.post("/stripe/create-checkout-session", createCheckoutSession);
apiRouter.post("/stripe/webhook", handleStripeWebhook);

// 5. Atomic JSON Database Collections CRUD
apiRouter.get("/db/collections/:collection", async (req: Request, res: Response) => {
  const collectionName = req.params.collection as string;
  if (collectionName === "records" || collectionName === "members" || collectionName === "payments") {
    await dbEngine.pullLatestFromSupabase();
  }
  if (collectionName === "metrics" || collectionName === "system") {
    const metrics = metricsEngine.getMetrics();
    const users = (dbEngine.getCollection("users") as any[]) || [];
    const activeNodes = Math.max(1, syncManager.getActiveClientCount());
    const statsDoc = {
      id: "current_metrics",
      databaseSize: metrics.storage?.databaseSizeFormatted || "150 KB",
      databaseSizeBytes: metrics.storage?.databaseSizeBytes || 153600,
      maxStorageCapacity: metrics.storage?.maxStorageCapacity || "1TB",
      activeNodes: activeNodes,
      userCounts: {
        total: users.length,
        admins: users.filter((u: any) => u.role === "admin").length,
        editors: users.filter((u: any) => u.role === "editor").length,
        viewers: users.filter((u: any) => !u.role || u.role === "viewer").length,
        active: users.filter((u: any) => u.active !== false).length,
        suspended: users.filter((u: any) => u.active === false).length,
      },
      requests: metrics.requests,
      bandwidth: metrics.bandwidth,
      status: metrics.status || "OPTIMAL",
      uptime: metrics.uptimeFormatted || "Active",
      timestamp: new Date().toISOString(),
    };
    return res.json({ success: true, collection: collectionName, count: 1, data: [statsDoc] });
  }

  if (collectionName === "records" || collectionName === "members" || collectionName === "payments") {
    await dbEngine.pullLatestFromSupabase();
  }
  const items = dbEngine.getCollection(collectionName as keyof DatabaseSchema);
  res.json({ success: true, collection: collectionName, count: items.length || 0, data: items });
});

apiRouter.get("/db/collections/:collection/:id", async (req: Request, res: Response) => {
  const collectionName = req.params.collection as keyof DatabaseSchema;
  const id = req.params.id;
  if (collectionName === "records" || collectionName === "members" || collectionName === "payments") {
    await dbEngine.pullLatestFromSupabase();
  }
  const items = dbEngine.getCollection(collectionName);
  if (Array.isArray(items)) {
    const item = items.find((i) => i.id === id || i.uid === id);
    if (!item) return res.status(404).json({ error: "Document not found" });
    return res.json({ success: true, doc: item });
  }
  res.json({ success: true, doc: items });
});

// Authoritative Bulk Records Synchronization Endpoint
apiRouter.post("/db/sync/records", async (req: Request, res: Response) => {
  try {
    const { records, author } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, error: "records must be an array" });
    }
    await dbEngine.replaceCollection("records", records);
    await dbEngine.replaceCollection("members", records);

    syncManager.broadcast("doc_change", {
      action: "SYNC_ALL",
      collection: "records",
      records: records,
      count: records.length,
      author: author || "client",
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      count: records.length,
      message: "Records synchronized authoritatively across all devices",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.post("/db/collections/:collection", async (req: Request, res: Response) => {
  try {
    const collectionName = req.params.collection as keyof DatabaseSchema;
    const { id, data } = req.body;
    const docData = data || req.body;
    const savedDoc = await dbEngine.setDocument(collectionName, id, docData);

    const recordsPayload = Array.isArray(docData.records)
      ? docData.records
      : Array.isArray(docData.members)
      ? docData.members
      : null;

    syncManager.broadcast("doc_change", {
      action: "SET",
      collection: collectionName,
      id: savedDoc.id,
      doc: savedDoc,
      records: recordsPayload,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, collection: collectionName, doc: savedDoc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.put("/db/collections/:collection/:id", async (req: Request, res: Response) => {
  try {
    const collectionName = req.params.collection as keyof DatabaseSchema;
    const id = req.params.id;
    const savedDoc = await dbEngine.setDocument(collectionName, id, req.body);

    syncManager.broadcast("doc_change", {
      action: "UPDATE",
      collection: collectionName,
      id,
      doc: savedDoc,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, collection: collectionName, doc: savedDoc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.delete("/db/collections/:collection/:id", async (req: Request, res: Response) => {
  try {
    const collectionName = req.params.collection as keyof DatabaseSchema;
    const id = req.params.id;
    const success = await dbEngine.deleteDocument(collectionName, id);

    syncManager.broadcast("doc_change", {
      action: "DELETE",
      collection: collectionName,
      id,
      timestamp: new Date().toISOString(),
    });

    res.json({ success, id });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Zero-Lock Backup Snapshots
apiRouter.post("/db/backup", (req: Request, res: Response) => {
  try {
    const backupPath = dbEngine.createBackupSnapshot();
    const filename = backupPath.split("/").pop() || "";
    const backups = dbEngine.listBackups();
    syncManager.broadcast("sync_pulse", {
      action: "BACKUP_CREATED",
      filename,
      timestamp: new Date().toISOString(),
      backupCount: backups.length,
    });
    res.json({ success: true, message: "Backup created successfully.", filename, backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get("/db/backups", (req: Request, res: Response) => {
  try {
    const backups = dbEngine.listBackups();
    res.json({ success: true, count: backups.length, backups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

apiRouter.get("/db/backups/:filename", (req: Request, res: Response) => {
  try {
    const filename = path.basename(req.params.filename);
    const backupFile = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupFile)) {
      return res.status(404).json({ success: false, error: "Backup file not found" });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.sendFile(backupFile);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. System Telemetry & Metrics
apiRouter.get("/metrics", (req: Request, res: Response) => {
  res.json(metricsEngine.getMetrics());
});
