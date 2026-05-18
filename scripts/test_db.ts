import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({
        projectId: "tuktrack-19377",
    });
}

async function run() {
    const db1 = getFirestore();
    const db2 = getFirestore("ai-studio-0eae0393-9377-476d-bb10-e5059265bcb8");
    
    console.log("Testing db1 (default)...");
    try {
        const s1 = await db1.collection("users").limit(1).get();
        console.log("db1 success, count:", s1.size);
    } catch(e: any) { console.log("db1 fail:", e.message); }

    console.log("Testing db2 (named)...");
    try {
        const s2 = await db2.collection("users").limit(1).get();
        console.log("db2 success, count:", s2.size);
    } catch(e: any) { console.log("db2 fail:", e.message); }
}
run().catch(console.error);
