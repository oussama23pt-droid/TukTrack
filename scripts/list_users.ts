import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
    initializeApp({
        projectId: "tuktrack-19377",
    });
}

const auth = getAuth();

async function run() {
    console.log("Listing users...");
    try {
        const list = await auth.listUsers(100);
        console.log(`Found ${list.users.length} users`);
        list.users.forEach(u => {
            console.log(`UID: ${u.uid} | EMAIL: ${u.email} | NAME: ${u.displayName}`);
        });
    } catch (e: any) {
        console.error("Auth list fail:", e.message);
    }
}

run().catch(console.error);
