import { dbEngine } from "./server/db";

async function runTest() {
  try {
    console.log("Fetching members from Firestore via dbEngine...");
    const members = await dbEngine.getMembers(false);
    console.log(`Success! Total active members in Firestore: ${members.length}`);
    if (members.length > 0) {
      console.log("First 3 members:", members.slice(0, 3).map(m => `${m.id}: ${m.firstName} ${m.lastName}`));
    }
  } catch (e) {
    console.error("Error fetching members:", e);
  }
}

runTest();
