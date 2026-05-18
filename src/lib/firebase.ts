import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, doc, getDocFromServer } from 'firebase/firestore';

// Hardcoded config for production stability in Android WebView
const firebaseConfig = {
  projectId: "tuktrack-19377",
  appId: "1:215697767558:web:a6154216c6467dca2ca507",
  apiKey: "AIzaSyC4apmP6vU30HeEHz9wbOHF39x0JkWmrqs",
  authDomain: "tuktrack-19377.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-0eae0393-9377-476d-bb10-e5059265bcb8",
  storageBucket: "tuktrack-19377.firebasestorage.app",
  messagingSenderId: "215697767558",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore persistence safely
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence: Browser not supported');
    } else {
      console.error('Firestore persistence error:', err);
    }
  });
}

export async function testConnection() {
  console.log('[FIREBASE] Validating connection...');
  
  // Set a timeout for the connection test so we don't block the app indefinitely
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Connection test timeout')), 5000)
  );

  try {
    // Attempt to read a dummy document to verify connection with a 5s limit
    await Promise.race([
      getDocFromServer(doc(db, '_connection_test_', 'verifying')),
      timeoutPromise
    ]);
    console.log('[FIREBASE] Connection verified.');
  } catch (error: any) {
    if (error?.message?.includes('timeout')) {
      console.warn("[FIREBASE] Connection test timed out, proceeding anyway.");
    } else if (error?.message?.includes('the client is offline')) {
      console.warn("[FIREBASE] Offline mode active.");
    } else if (error?.code === 'auth/unauthorized-domain' || error?.message?.includes('unauthorized domain')) {
      console.error('[FIREBASE] Erro: Domínio não autorizado. Verifique as configurações do Firebase Console.');
      alert('ERRO DE DOMÍNIO: Este domínio precisa de ser adicionado aos "Domínios Autorizados" nas definições de Autenticação do Firebase.');
    } else if (error?.code === 'permission-denied') {
      console.log('[FIREBASE] Connection verified (received expected permission-denied).');
    } else {
      console.error('[FIREBASE] Connection error:', error?.message || error);
    }
  }
}
