import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch
} from "firebase/firestore";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// 1. Load centralized configuration from firebase-applet-config.json
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const rawConfig = fs.readFileSync(configPath, "utf-8");
export const firebaseAppletConfig = JSON.parse(rawConfig);

const firebaseApp = getApps().length === 0 ? initializeApp({
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
}, "SiaraMainaServerApp") : getApp("SiaraMainaServerApp");

export const firestoreDb = initializeFirestore(
  firebaseApp,
  { experimentalForceLongPolling: true },
  firebaseAppletConfig.firestoreDatabaseId
);

export const TRUSTED_OWNER_EMAIL = "deodatusmaliti2@gmail.com";

export interface ClanMemberRecord {
  id: string;
  recordId: string;
  clanMemberNumber?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  sex?: string;
  branchType?: string;
  honorific?: string;
  dob?: string;
  placeOfBirth?: string;
  birthPeriod?: string;
  deceased: boolean;
  dod?: string;
  ageCategory?: string;
  deathAge?: string;
  causeOfDeath?: string;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  siblingIds?: string[];
  maritalStatus?: string;
  education?: string;
  course?: string;
  employment?: string;
  occupation?: string;
  organization?: string;
  religion?: string;
  denomination?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  location?: string;
  photoFile?: string;
  narrative?: string;
  photo?: string;
  storedPhoto?: string;
  version: number;
  active: boolean;
  deleted: boolean;
  deletedAt?: string | null;
  createdBy: string;
  lastModifiedBy: string;
  createdAt: string;
  updatedAt: string;
  submissionId?: string;
}

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "viewer";
  approved: boolean;
  active: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export interface ActivityLogEntry {
  id: string;
  eventType: string;
  action: string;
  actorEmail: string;
  actorUid?: string;
  actorRole?: string;
  targetId?: string;
  details?: string;
  timestamp: string;
}

export function sanitizeForFirestore(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = (v && typeof v === "object" && !Array.isArray(v)) ? sanitizeForFirestore(v) : v;
    }
  }
  return clean;
}

export const dbEngine = {
  // Fetch members with soft-delete filter
  getMembers: async (includeDeleted = false): Promise<ClanMemberRecord[]> => {
    const colRef = collection(firestoreDb, "members");
    const snap = await getDocs(colRef);
    const list: ClanMemberRecord[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      if (data && d.id !== "test-connection-check") {
        const item: ClanMemberRecord = {
          ...data,
          id: d.id,
          recordId: data.recordId || d.id,
          version: typeof data.version === "number" ? data.version : 1,
          active: data.active !== false && !data.deleted,
          deleted: data.deleted === true,
          deceased: Boolean(data.deceased),
        };
        if (includeDeleted || !item.deleted) {
          list.push(item);
        }
      }
    });
    return list;
  },

  getMember: async (id: string): Promise<ClanMemberRecord | null> => {
    if (!id) return null;
    const ref = doc(firestoreDb, "members", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    return {
      ...data,
      id: snap.id,
      recordId: data.recordId || snap.id,
      version: typeof data.version === "number" ? data.version : 1,
      active: data.active !== false && !data.deleted,
      deleted: data.deleted === true,
      deceased: Boolean(data.deceased),
    };
  },

  // Reliable member addition with submissionId idempotency and server timestamps
  addMember: async (
    rawBody: any,
    userEmail: string,
    submissionId?: string
  ): Promise<{ member: ClanMemberRecord; isDuplicateRetry: boolean }> => {
    const now = new Date().toISOString();
    const subId = submissionId || rawBody.submissionId || null;

    // Idempotency check if submissionId provided
    if (subId) {
      const subRef = doc(firestoreDb, "submissions", subId);
      const subSnap = await getDoc(subRef);
      if (subSnap.exists()) {
        const existingMemberId = subSnap.data()?.memberId;
        if (existingMemberId) {
          const existing = await dbEngine.getMember(existingMemberId);
          if (existing) {
            return { member: existing, isDuplicateRetry: true };
          }
        }
      }
    }

    const memberId = rawBody.id || rawBody.recordId || ("rec-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex"));
    const memberRef = doc(firestoreDb, "members", memberId);

    // Normalize sibling array
    let siblingIds = rawBody.siblingIds;
    if (typeof siblingIds === "string") {
      try { siblingIds = JSON.parse(siblingIds); } catch { siblingIds = siblingIds ? [siblingIds.trim()] : []; }
    } else if (!Array.isArray(siblingIds)) {
      siblingIds = [];
    }

    const newRecord: ClanMemberRecord = {
      id: memberId,
      recordId: memberId,
      clanMemberNumber: String(rawBody.clanMemberNumber || rawBody.clan_member_number || "").trim(),
      firstName: String(rawBody.firstName || rawBody.first_name || "").trim(),
      middleName: String(rawBody.middleName || rawBody.middle_name || "").trim(),
      lastName: String(rawBody.lastName || rawBody.last_name || "").trim(),
      sex: String(rawBody.sex || rawBody.gender || "").trim(),
      branchType: String(rawBody.branchType || rawBody.branch_type || "").trim(),
      honorific: String(rawBody.honorific || "").trim(),
      dob: String(rawBody.dob || rawBody.date_of_birth || "").trim(),
      placeOfBirth: String(rawBody.placeOfBirth || rawBody.place_of_birth || "").trim(),
      birthPeriod: String(rawBody.birthPeriod || rawBody.birth_period || "").trim(),
      deceased: rawBody.deceased === true || rawBody.deceased === "true" || rawBody.deceased === 1,
      dod: String(rawBody.dod || rawBody.date_of_death || "").trim(),
      ageCategory: String(rawBody.ageCategory || rawBody.age_category || "").trim(),
      deathAge: rawBody.deathAge != null ? String(rawBody.deathAge) : "",
      causeOfDeath: String(rawBody.causeOfDeath || rawBody.cause_of_death || "").trim(),
      fatherId: String(rawBody.fatherId || rawBody.father_id || "").trim(),
      motherId: String(rawBody.motherId || rawBody.mother_id || "").trim(),
      spouseId: String(rawBody.spouseId || rawBody.spouse_id || "").trim(),
      siblingIds,
      maritalStatus: String(rawBody.maritalStatus || rawBody.marital_status || "").trim(),
      education: String(rawBody.education || "").trim(),
      course: String(rawBody.course || "").trim(),
      employment: String(rawBody.employment || "").trim(),
      occupation: String(rawBody.occupation || "").trim(),
      organization: String(rawBody.organization || "").trim(),
      religion: String(rawBody.religion || "").trim(),
      denomination: String(rawBody.denomination || "").trim(),
      phone: String(rawBody.phone || rawBody.mobile || "").trim(),
      whatsapp: String(rawBody.whatsapp || "").trim(),
      email: String(rawBody.email || "").trim(),
      location: String(rawBody.location || rawBody.address || "").trim(),
      photoFile: String(rawBody.photoFile || "").trim(),
      narrative: String(rawBody.narrative || rawBody.bio || "").trim(),
      photo: String(rawBody.storedPhoto || rawBody.photo || rawBody.photoFile || "").trim(),
      storedPhoto: String(rawBody.storedPhoto || rawBody.photo || "").trim(),
      version: 1,
      active: true,
      deleted: false,
      deletedAt: null,
      createdBy: userEmail || "system",
      lastModifiedBy: userEmail || "system",
      createdAt: now,
      updatedAt: now,
      submissionId: subId || "",
    };

    await setDoc(memberRef, sanitizeForFirestore(newRecord));

    if (subId) {
      await setDoc(doc(firestoreDb, "submissions", subId), {
        memberId,
        createdAt: now,
        createdBy: userEmail,
      });
    }

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "GENEALOGY_CREATE",
      action: `Added member: ${newRecord.firstName} ${newRecord.lastName} (${memberId})`,
      actorEmail: userEmail,
      targetId: memberId,
      timestamp: now,
    });

    return { member: newRecord, isDuplicateRetry: false };
  },

  // Optimistic concurrency version check before update
  updateMember: async (
    id: string,
    updates: any,
    userEmail: string,
    expectedVersion?: number
  ): Promise<ClanMemberRecord> => {
    const memberRef = doc(firestoreDb, "members", id);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) {
      throw new Error(`Member with ID "${id}" was not found in the database.`);
    }

    const current = snap.data() as ClanMemberRecord;
    const currentVersion = typeof current.version === "number" ? current.version : 1;

    if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== currentVersion) {
      throw new Error(
        `CONFLICT_STALE_RECORD: Record has been modified by another session (Database Version: ${currentVersion}, Your Version: ${expectedVersion}). Please reload the profile and try again.`
      );
    }

    const now = new Date().toISOString();

    let siblingIds = updates.siblingIds !== undefined ? updates.siblingIds : current.siblingIds;
    if (typeof siblingIds === "string") {
      try { siblingIds = JSON.parse(siblingIds); } catch { siblingIds = siblingIds ? [siblingIds.trim()] : []; }
    } else if (!Array.isArray(siblingIds)) {
      siblingIds = [];
    }

    const updatedRecord: ClanMemberRecord = {
      ...current,
      ...updates,
      id,
      recordId: id,
      siblingIds,
      deceased: updates.deceased !== undefined
        ? (updates.deceased === true || updates.deceased === "true" || updates.deceased === 1)
        : current.deceased,
      version: currentVersion + 1,
      lastModifiedBy: userEmail || "system",
      updatedAt: now,
    };

    await setDoc(memberRef, sanitizeForFirestore(updatedRecord));

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "GENEALOGY_UPDATE",
      action: `Updated member: ${updatedRecord.firstName} ${updatedRecord.lastName} (Version: ${updatedRecord.version})`,
      actorEmail: userEmail,
      targetId: id,
      timestamp: now,
    });

    return updatedRecord;
  },

  // Authoritative CSV and Bulk Member Import directly into Cloud Firestore
  importMembersBatch: async (
    membersList: any[],
    userEmail: string
  ): Promise<{ added: number; updated: number; count: number; members: ClanMemberRecord[] }> => {
    console.log("[importMembersBatch] Called with membersList length:", Array.isArray(membersList) ? membersList.length : typeof membersList);
    if (!Array.isArray(membersList) || membersList.length === 0) {
      const active = await dbEngine.getMembers(false);
      return { added: 0, updated: 0, count: active.length, members: active };
    }

    const now = new Date().toISOString();
    const currentAll = await dbEngine.getMembers(true);
    console.log("[importMembersBatch] currentAll length from db:", currentAll.length);
    const existingById = new Map<string, ClanMemberRecord>();
    for (const m of currentAll) {
      existingById.set(m.id, m);
      if (m.recordId && m.recordId !== m.id) {
        existingById.set(m.recordId, m);
      }
    }

    const docsToWrite: ClanMemberRecord[] = [];
    let addedCount = 0;
    let updatedCount = 0;

    for (const raw of membersList) {
      if (!raw || typeof raw !== "object") continue;
      
      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          if (raw[k] !== undefined && raw[k] !== null) return String(raw[k]).trim();
        }
        return "";
      };

      let firstName = getVal("firstName", "first_name", "First Name", "firstname", "fname", "givenName", "given_name", "name", "fullName");
      let lastName = getVal("lastName", "last_name", "Last Name", "lastname", "lname", "surname", "familyName");
      let middleName = getVal("middleName", "middle_name", "Middle Name", "middlename", "mname", "otherNames");

      if (firstName && !lastName && firstName.indexOf(" ") > -1) {
        const parts = firstName.split(/\s+/);
        if (parts.length === 2) {
          firstName = parts[0];
          lastName = parts[1];
        } else if (parts.length > 2) {
          firstName = parts[0];
          middleName = middleName || parts[1];
          lastName = parts.slice(2).join(" ");
        }
      } else if (!firstName && lastName && lastName.indexOf(" ") > -1) {
        const parts = lastName.split(/\s+/);
        if (parts.length === 2) {
          firstName = parts[0];
          lastName = parts[1];
        } else if (parts.length > 2) {
          firstName = parts[0];
          middleName = middleName || parts[1];
          lastName = parts.slice(2).join(" ");
        }
      }

      if (!firstName && !lastName) {
        const anyVal = Object.values(raw).find((v) => v && typeof v === "string" && v.trim().length > 0);
        if (anyVal) {
          firstName = String(anyVal).trim();
        } else {
          continue;
        }
      }

      const id = String(raw.id || raw.recordId || raw["Member ID"] || raw["id"] || ("rec-" + Date.now() + "-" + crypto.randomBytes(4).toString("hex"))).trim();
      const existing = existingById.get(id);

      let siblingIds = raw.siblingIds || raw.sibling_ids || raw["Sibling Profiles"];
      if (typeof siblingIds === "string") {
        try { siblingIds = JSON.parse(siblingIds); } catch { siblingIds = siblingIds ? [siblingIds.trim()] : []; }
      } else if (!Array.isArray(siblingIds)) {
        siblingIds = [];
      }

      const rawBranch = getVal("branchType", "branch_type", "Family Clan", "branch", "familyClan", "familyClassification");
      let branchType = rawBranch;
      if (branchType.toLowerCase().includes("foundation") || branchType.toLowerCase().includes("heritage")) branchType = "heritage";
      else if (branchType.toLowerCase().includes("siara")) branchType = "siara";
      else if (branchType.toLowerCase().includes("maina")) branchType = "maina";
      else if (branchType.toLowerCase().includes("maliti")) branchType = "maliti";

      if (existing) {
        const currentVersion = typeof existing.version === "number" ? existing.version : 1;
        const updatedRecord: ClanMemberRecord = {
          ...existing,
          clanMemberNumber: getVal("clanMemberNumber", "clan_member_number", "Member Number") || existing.clanMemberNumber || "",
          firstName: firstName || existing.firstName,
          middleName: middleName || existing.middleName || "",
          lastName: lastName || existing.lastName || "",
          sex: getVal("sex", "gender", "Sex") || existing.sex || "Not Recorded",
          branchType: branchType || existing.branchType || "heritage",
          honorific: getVal("honorific", "title", "Title / Honorific") || existing.honorific || "",
          dob: getVal("dob", "date_of_birth", "Date of Birth") || existing.dob || "",
          placeOfBirth: getVal("placeOfBirth", "place_of_birth", "Place of Birth") || existing.placeOfBirth || "",
          birthPeriod: getVal("birthPeriod", "birth_period", "Historical Age") || existing.birthPeriod || "",
          deceased: raw.deceased !== undefined
            ? (raw.deceased === true || String(raw.deceased).toLowerCase() === "true" || raw.deceased === 1 || String(raw.deceased).toLowerCase() === "deceased")
            : Boolean(existing.deceased),
          dod: getVal("dod", "date_of_death", "Date of Death") || existing.dod || "",
          ageCategory: getVal("ageCategory", "age_category") || existing.ageCategory || "",
          deathAge: getVal("deathAge", "death_age", "Age at Death") || existing.deathAge || "",
          causeOfDeath: getVal("causeOfDeath", "cause_of_death", "Cause of Death") || existing.causeOfDeath || "",
          fatherId: getVal("fatherId", "father_id", "Father Profile") || existing.fatherId || "",
          motherId: getVal("motherId", "mother_id", "Mother Profile") || existing.motherId || "",
          spouseId: getVal("spouseId", "spouse_id", "Spouse Profile") || existing.spouseId || "",
          siblingIds,
          maritalStatus: getVal("maritalStatus", "marital_status", "Marital Status") || existing.maritalStatus || "",
          education: getVal("education", "education_level", "Education Level") || existing.education || "",
          course: getVal("course", "course_area_of_study", "Course / Area of Study") || existing.course || "",
          employment: getVal("employment", "employment_status", "Employment Status") || existing.employment || "",
          occupation: getVal("occupation", "profession", "Occupation / Profession") || existing.occupation || "",
          organization: getVal("organization", "employer", "Organisation / Employer") || existing.organization || "",
          religion: getVal("religion", "religious_affiliation", "Religious Affiliation") || existing.religion || "",
          denomination: getVal("denomination", "Denomination / Tradition") || existing.denomination || "",
          phone: getVal("phone", "mobile", "Telephone") || existing.phone || "",
          whatsapp: getVal("whatsapp", "WhatsApp") || existing.whatsapp || "",
          email: getVal("email", "Email Address") || existing.email || "",
          location: getVal("location", "address", "Current Location") || existing.location || "",
          photoFile: getVal("photoFile") || existing.photoFile || "",
          narrative: getVal("narrative", "bio", "Historical Location") || existing.narrative || "",
          photo: getVal("storedPhoto", "photo", "photoUrl") || existing.photo || "",
          storedPhoto: getVal("storedPhoto", "photo") || existing.storedPhoto || "",
          id,
          recordId: id,
          active: true,
          deleted: false,
          deletedAt: null,
          version: currentVersion + 1,
          lastModifiedBy: userEmail || "csv_importer",
          updatedAt: now,
        };

        const cleanExisting = sanitizeForFirestore({ ...existing, updatedAt: undefined, lastModifiedBy: undefined, version: undefined });
        const cleanUpdated = sanitizeForFirestore({ ...updatedRecord, updatedAt: undefined, lastModifiedBy: undefined, version: undefined });
        const hasDifferences = JSON.stringify(cleanExisting) !== JSON.stringify(cleanUpdated);
        if (hasDifferences) {
          docsToWrite.push(updatedRecord);
          existingById.set(id, updatedRecord);
          updatedCount++;
        }
      } else {
        const newRecord: ClanMemberRecord = {
          id,
          recordId: id,
          clanMemberNumber: getVal("clanMemberNumber", "clan_member_number", "Member Number"),
          firstName,
          middleName,
          lastName,
          sex: getVal("sex", "gender", "Sex") || "Not Recorded",
          branchType: branchType || "heritage",
          honorific: getVal("honorific", "title", "Title / Honorific"),
          dob: getVal("dob", "date_of_birth", "Date of Birth"),
          placeOfBirth: getVal("placeOfBirth", "place_of_birth", "Place of Birth"),
          birthPeriod: getVal("birthPeriod", "birth_period", "Historical Age"),
          deceased: raw.deceased === true || String(raw.deceased).toLowerCase() === "true" || raw.deceased === 1 || String(raw.deceased).toLowerCase() === "deceased",
          dod: getVal("dod", "date_of_death", "Date of Death"),
          ageCategory: getVal("ageCategory", "age_category"),
          deathAge: getVal("deathAge", "death_age", "Age at Death"),
          causeOfDeath: getVal("causeOfDeath", "cause_of_death", "Cause of Death"),
          fatherId: getVal("fatherId", "father_id", "Father Profile"),
          motherId: getVal("motherId", "mother_id", "Mother Profile"),
          spouseId: getVal("spouseId", "spouse_id", "Spouse Profile"),
          siblingIds,
          maritalStatus: getVal("maritalStatus", "marital_status", "Marital Status"),
          education: getVal("education", "education_level", "Education Level"),
          course: getVal("course", "course_area_of_study", "Course / Area of Study"),
          employment: getVal("employment", "employment_status", "Employment Status"),
          occupation: getVal("occupation", "profession", "Occupation / Profession"),
          organization: getVal("organization", "employer", "Organisation / Employer"),
          religion: getVal("religion", "religious_affiliation", "Religious Affiliation"),
          denomination: getVal("denomination", "Denomination / Tradition"),
          phone: getVal("phone", "mobile", "Telephone"),
          whatsapp: getVal("whatsapp", "WhatsApp"),
          email: getVal("email", "Email Address"),
          location: getVal("location", "address", "Current Location"),
          photoFile: getVal("photoFile"),
          narrative: getVal("narrative", "bio", "Historical Location"),
          photo: getVal("storedPhoto", "photo"),
          storedPhoto: getVal("storedPhoto", "photo"),
          version: 1,
          active: true,
          deleted: false,
          deletedAt: null,
          createdBy: userEmail || "csv_importer",
          lastModifiedBy: userEmail || "csv_importer",
          createdAt: now,
          updatedAt: now,
        };
        docsToWrite.push(newRecord);
        existingById.set(id, newRecord);
        addedCount++;
      }
    }

    console.log("[importMembersBatch] Total docsToWrite:", docsToWrite.length, "addedCount:", addedCount, "updatedCount:", updatedCount);
    const BATCH_SIZE = 400;
    for (let i = 0; i < docsToWrite.length; i += BATCH_SIZE) {
      const chunk = docsToWrite.slice(i, i + BATCH_SIZE);
      console.log(`[importMembersBatch] Writing batch chunk of ${chunk.length} docs to Firestore...`);
      const batch = writeBatch(firestoreDb);
      for (const rec of chunk) {
        const ref = doc(firestoreDb, "members", rec.id);
        batch.set(ref, sanitizeForFirestore(rec), { merge: true });
      }
      await batch.commit();
      console.log(`[importMembersBatch] Batch chunk commit successful.`);
    }

    if (addedCount > 0 || updatedCount > 0) {
      await dbEngine.addAuditLog({
        id: "log-" + Date.now() + "-" + crypto.randomBytes(3).toString("hex"),
        eventType: "GENEALOGY_CSV_IMPORT",
        action: `CSV Import committed to Cloud Firestore: ${addedCount} added, ${updatedCount} updated`,
        actorEmail: userEmail || "csv_importer",
        timestamp: now,
        details: JSON.stringify({ added: addedCount, updated: updatedCount, totalProcessed: membersList.length }),
      });
    }

    const allActive = await dbEngine.getMembers(false);
    return {
      added: addedCount,
      updated: updatedCount,
      count: allActive.length,
      members: allActive,
    };
  },

  // Soft-delete to Recycle Bin
  softDeleteMember: async (id: string, userEmail: string): Promise<ClanMemberRecord> => {
    const memberRef = doc(firestoreDb, "members", id);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) {
      throw new Error(`Member with ID "${id}" not found.`);
    }

    const current = snap.data() as ClanMemberRecord;
    const now = new Date().toISOString();
    const currentVersion = typeof current.version === "number" ? current.version : 1;

    const softDeletedRecord: ClanMemberRecord = {
      ...current,
      deleted: true,
      active: false,
      deletedAt: now,
      version: currentVersion + 1,
      lastModifiedBy: userEmail || "system",
      updatedAt: now,
    };

    await setDoc(memberRef, softDeletedRecord);

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "GENEALOGY_SOFT_DELETE",
      action: `Moved member to Recycle Bin: ${current.firstName} ${current.lastName} (${id})`,
      actorEmail: userEmail,
      targetId: id,
      timestamp: now,
    });

    return softDeletedRecord;
  },

  // Restore from Recycle Bin
  restoreMember: async (id: string, userEmail: string): Promise<ClanMemberRecord> => {
    const memberRef = doc(firestoreDb, "members", id);
    const snap = await getDoc(memberRef);
    if (!snap.exists()) {
      throw new Error(`Member with ID "${id}" not found.`);
    }

    const current = snap.data() as ClanMemberRecord;
    const now = new Date().toISOString();
    const currentVersion = typeof current.version === "number" ? current.version : 1;

    const restoredRecord: ClanMemberRecord = {
      ...current,
      deleted: false,
      active: true,
      deletedAt: null,
      version: currentVersion + 1,
      lastModifiedBy: userEmail || "system",
      updatedAt: now,
    };

    await setDoc(memberRef, restoredRecord);

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "GENEALOGY_RESTORE",
      action: `Restored member from Recycle Bin: ${current.firstName} ${current.lastName} (${id})`,
      actorEmail: userEmail,
      targetId: id,
      timestamp: now,
    });

    return restoredRecord;
  },

  // Permanent Delete (Administrator Only)
  permanentDeleteMember: async (id: string, userEmail: string): Promise<boolean> => {
    const memberRef = doc(firestoreDb, "members", id);
    const snap = await getDoc(memberRef);
    const data = snap.exists() ? snap.data() : null;
    const memberName = data ? `${data.firstName} ${data.lastName}` : id;

    await deleteDoc(memberRef);

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "GENEALOGY_PERMANENT_DELETE",
      action: `Permanently deleted member record: ${memberName} (${id})`,
      actorEmail: userEmail,
      targetId: id,
      timestamp: new Date().toISOString(),
    });

    return true;
  },

  // User Profile & RBAC Management
  getUser: async (uid: string): Promise<AppUserProfile | null> => {
    if (!uid) return null;
    const userRef = doc(firestoreDb, "users", uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    return snap.data() as AppUserProfile;
  },

  getUserByEmail: async (email: string): Promise<AppUserProfile | null> => {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    const q = query(collection(firestoreDb, "users"), where("email", "==", cleanEmail), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data() as AppUserProfile;
  },

  getUsers: async (): Promise<AppUserProfile[]> => {
    const snap = await getDocs(collection(firestoreDb, "users"));
    const list: AppUserProfile[] = [];
    snap.forEach((d) => {
      const data = d.data() as AppUserProfile;
      if (data && data.uid) {
        list.push(data);
      }
    });
    return list;
  },

  saveUser: async (userData: AppUserProfile): Promise<AppUserProfile> => {
    const ref = doc(firestoreDb, "users", userData.uid);
    await setDoc(ref, userData, { merge: true });
    return userData;
  },

  updateUserApprovalAndRole: async (
    targetUid: string,
    role: "admin" | "viewer",
    approved: boolean,
    adminEmail: string
  ): Promise<AppUserProfile> => {
    const userRef = doc(firestoreDb, "users", targetUid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      throw new Error(`User profile not found for UID "${targetUid}"`);
    }

    const current = snap.data() as AppUserProfile;
    const updated: AppUserProfile = {
      ...current,
      role,
      approved,
      active: approved,
    };

    await setDoc(userRef, updated);

    await dbEngine.addAuditLog({
      id: "log-" + Date.now(),
      eventType: "USER_PERMISSION_CHANGE",
      action: `Administrator ${adminEmail} updated user ${current.email}: role=${role}, approved=${approved}`,
      actorEmail: adminEmail,
      targetId: targetUid,
      timestamp: new Date().toISOString(),
    });

    return updated;
  },

  // Immutable Activity Logs
  addAuditLog: async (entry: ActivityLogEntry): Promise<void> => {
    try {
      const logRef = doc(firestoreDb, "ActivityLogs", entry.id);
      await setDoc(logRef, entry);
    } catch (err) {
      console.warn("[ActivityLogs] Failed to write audit log:", err);
    }
  },

  getAuditLogs: async (maxCount = 50): Promise<ActivityLogEntry[]> => {
    try {
      const q = query(collection(firestoreDb, "ActivityLogs"), limit(maxCount));
      const snap = await getDocs(q);
      const list: ActivityLogEntry[] = [];
      snap.forEach((d) => list.push(d.data() as ActivityLogEntry));
      list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      return list;
    } catch {
      return [];
    }
  },

  // Operational metrics
  getStats: async () => {
    const members = await dbEngine.getMembers(true);
    const active = members.filter((m) => !m.deleted);
    const recycle = members.filter((m) => m.deleted);
    const users = await dbEngine.getUsers();

    return {
      totalRecords: active.length,
      recycleBinCount: recycle.length,
      totalUsers: users.length,
      approvedUsers: users.filter((u) => u.approved).length,
      database: "Cloud Firestore Enterprise (Verified Native Project)",
      databaseId: firebaseAppletConfig.firestoreDatabaseId,
      projectId: firebaseAppletConfig.projectId,
      timestamp: new Date().toISOString(),
    };
  },
};
