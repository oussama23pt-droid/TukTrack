import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
    initializeApp({
        projectId: "tuktrack-19377",
    });
}

const auth = getAuth();
const db = getFirestore("ai-studio-0eae0393-9377-476d-bb10-e5059265bcb8");

async function findBilel() {
    console.log("Searching by common patterns...");
    const patterns = [
        "bileltuktuk@gmail.com",
        "bileltuktuk@outlook.com",
        "bileltuktuk@hotmail.com",
        "bilel@tuktuk.com"
    ];

    for (const email of patterns) {
        try {
            const user = await auth.getUserByEmail(email);
            if (user) {
                console.log("Found user by email!", user.uid, user.email);
                return user.uid;
            }
        } catch (e: any) {
            // ignore not found
        }
    }
    
    console.log("No user found by simple patterns.");
    return null;
}

async function run() {
    const uid = await findBilel();
    if (uid) {
        console.log("Updating user:", uid);
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);
        
        const update = {
          subscriptionStatus: "active",
          planId: "starter",
          vehicleSlots: 3,
          currentPeriodEnd: periodEnd.toISOString(),
          isPro: true,
          updatedAt: new Date()
        };

        // If DB write fails, we know it's a permission issue
        try {
            await db.collection("users").doc(uid).set(update, { merge: true });
            console.log("DB update success!");
        } catch (e: any) {
            console.error("DB update fail:", e.message);
        }
    }
}

run().catch(console.error);
