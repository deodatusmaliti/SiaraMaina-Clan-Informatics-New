import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

export let isSupabaseConfigured = false;
export let supabase: SupabaseClient | null = null;

export function initializeSupabase() {
  // Supabase is deactivated by user configuration in favor of Cloudflare D1 persistent storage
  isSupabaseConfigured = false;
  supabase = null;
  console.log("[Database] Primary persistent database: Cloudflare D1 (siaramaina-db). Supabase deactivated.");
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
