import React, { createContext, useContext } from 'react';
import { useInstallPrompt as useInstallPromptHook } from '../../hooks/useInstallPrompt';

const InstallContext = createContext<ReturnType<typeof useInstallPromptHook> | null>(null);

export function InstallProvider({ children }: { children: React.ReactNode }) {
  const installData = useInstallPromptHook();
  
  return (
    <InstallContext.Provider value={installData}>
      {children}
    </InstallContext.Provider>
  );
}

export function useInstall() {
  const context = useContext(InstallContext);
  if (!context) {
    throw new Error('useInstall must be used within an InstallProvider');
  }
  return context;
}
