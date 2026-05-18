import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: any, operationType: OperationType | string, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || false,
      isAnonymous: auth.currentUser?.isAnonymous || false,
    },
    operationType,
    path
  };
  
  if ((error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) && auth.currentUser) {
    console.error('🔥 CRITICAL SECURITY ERROR: ', JSON.stringify(errInfo));
  } else if (error?.code === 'permission-denied' || error?.message?.includes('insufficient permissions')) {
    // Expected on logout, just log info
    console.info('Firestore Permission Denied (Signed Out): ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

export function sanitizeData(data: any): any {
  if (data === null || data === undefined) return null;
  
  if (Array.isArray(data)) {
    return data.map(v => sanitizeData(v));
  }
  
  if (typeof data === 'object') {
    const sanitized: any = {};
    Object.keys(data).forEach(key => {
      const value = sanitizeData(data[key]);
      if (value !== undefined) {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }
  
  return data;
}
