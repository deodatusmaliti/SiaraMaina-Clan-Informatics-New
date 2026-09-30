import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

export let isSupabaseConfigured = false;
export let supabase: SupabaseClient | null = null;

export function initializeSupabase() {
  dotenv.config({ override: true });
  let url = (process.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  // Strip trailing slashes first
  url = url.replace(/\/$/, "");

  // Strip trailing REST endpoint paths if incorrectly supplied by the user
  if (url.endsWith("/rest/v1")) {
    url = url.substring(0, url.length - 8);
  } else if (url.endsWith("/rest/v1/")) {
    url = url.substring(0, url.length - 9);
  }

  url = url.trim().replace(/\/$/, "");

  isSupabaseConfigured = !!(
    url &&
    url.startsWith("https://") &&
    !url.includes("your-project.supabase.co") &&
    (serviceRoleKey || anonKey)
  );

  if (isSupabaseConfigured) {
    try {
      // Backend uses Service Role Key to perform private administrative actions securely
      supabase = createClient(url, serviceRoleKey || anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      console.log(`[Supabase] Active connection initialized successfully with postgres engine at ${url}`);
    } catch (err) {
      console.warn("[Supabase] Error initializing client:", err);
      supabase = null;
      isSupabaseConfigured = false;
    }
  } else {
    supabase = null;
    console.log(
      "[Supabase] Working in local-fallback mode. Awaiting VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY variables."
    );
  }
}

// Perform initial load
initializeSupabase();

// Unified Database mapping layer
export const supabaseDb = {
  async fetchCollection(tableName: string): Promise<any[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase.from(tableName).select("*");
      if (error) {
        console.warn(`[Supabase DB] Error fetching from ${tableName}:`, error.message);
        return null;
      }
      return data;
    } catch (err: any) {
      console.warn(`[Supabase DB] Query failed for ${tableName}:`, err.message);
      return null;
    }
  },

  async saveDocument(tableName: string, id: string, doc: any): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const payload = { ...doc };
      // Normalise key names to match PG column schema if applicable, or save as json/structured record
      const { error } = await supabase.from(tableName).upsert({
        id,
        ...payload,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn(`[Supabase DB] Upsert error in ${tableName}:`, error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn(`[Supabase DB] Upsert request failed for ${tableName}:`, err.message);
      return false;
    }
  },

  async deleteDocument(tableName: string, id: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) {
        console.warn(`[Supabase DB] Delete error in ${tableName}:`, error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn(`[Supabase DB] Delete request failed in ${tableName}:`, err.message);
      return false;
    }
  },

  async logAudit(
    action: string,
    details: any,
    ipAddress: string,
    userAgent: string,
    userId?: string
  ): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase.from("audit_logs").insert({
        user_id: userId || null,
        action,
        details,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn("[Supabase Audit] Failed to commit remote audit log:", err);
    }
  }
};
