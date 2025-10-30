/**
 * useLitServiceSetup.ts
 *
 * React hook for setting up Lit Protocol services with proper configuration.
 * Handles network setup, auth manager creation, and storage plugin configuration.
 */

import React, { useState, useCallback, useRef } from "react";

type LitAuthModule = typeof import("@lit-protocol/auth");
type LitClientModule = typeof import("@lit-protocol/lit-client");
type LitNetworksModule = typeof import("@lit-protocol/networks");

// Configuration constants at the top
const DEFAULT_APP_NAME = "lit-auth-app";

let litAuthModulePromise: Promise<LitAuthModule> | null = null;
const loadLitAuthModule = () => {
  if (!litAuthModulePromise) {
    litAuthModulePromise = import("@lit-protocol/auth");
  }
  return litAuthModulePromise;
};

let litClientModulePromise: Promise<LitClientModule> | null = null;
const loadLitClientModule = () => {
  if (!litClientModulePromise) {
    litClientModulePromise = import("@lit-protocol/lit-client");
  }
  return litClientModulePromise;
};

let litNetworksModulePromise: Promise<LitNetworksModule> | null = null;
const loadLitNetworksModule = () => {
  if (!litNetworksModulePromise) {
    litNetworksModulePromise = import("@lit-protocol/networks");
  }
  return litNetworksModulePromise;
};

const NETWORK_NAME_MAP: Record<string, keyof LitNetworksModule> = {
  "naga-dev": "nagaDev",
  "naga-test": "nagaTest",
  naga: "nagaDev",
};

interface LitServiceSetupConfig {
  appName?: string;
  networkName?: string;
  network?: unknown;
  autoSetup?: boolean;
}

export interface LitServices {
  litClient: Awaited<
    ReturnType<LitClientModule["createLitClient"]>
  >;
  authManager: Awaited<
    ReturnType<LitAuthModule["createAuthManager"]>
  >;
}

interface UseLitServiceSetupReturn {
  services: LitServices | null;
  isInitializing: boolean;
  error: string | null;
  setupServices: () => Promise<LitServices>;
  clearServices: () => void;
  isReady: boolean;
}

/**
 * Hook for setting up Lit Protocol services
 *
 * @param config Configuration options for the setup
 * @returns Object containing services, setup state, and control functions
 */
export const useLitServiceSetup = (
  config: LitServiceSetupConfig = {}
): UseLitServiceSetupReturn => {
  const [services, setServices] = useState<LitServices | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if services are being initialized to prevent multiple calls
  const initializingRef = useRef(false);

  const setupServices = useCallback(async (): Promise<LitServices> => {
    // Prevent multiple simultaneous initialization attempts
    if (initializingRef.current) {
      throw new Error("Services are already being initialized");
    }

    try {
      initializingRef.current = true;
      setIsInitializing(true);
      setError(null);

      console.log("🚀 Starting Lit Protocol service setup...");

      if (!config.network && !config.networkName) {
        throw new Error(
          "No network provided. Pass 'network' (module) or 'networkName' to useLitServiceSetup."
        );
      }

      const [authModule, clientModule] = await Promise.all([
        loadLitAuthModule(),
        loadLitClientModule(),
      ]);

      let networkModule: any = config.network;
      if (!networkModule) {
        if (!config.networkName) {
          throw new Error(
            "No networkName provided. Pass 'networkName' to useLitServiceSetup."
          );
        }
        const networkKey = NETWORK_NAME_MAP[config.networkName];
        if (!networkKey) {
          throw new Error(
            `Unknown or unsupported networkName: ${String(config.networkName)}.`
          );
        }
        const networksModule = await loadLitNetworksModule();
        networkModule = (networksModule as any)[networkKey];
        if (!networkModule) {
          throw new Error(
            `Failed to load configuration for network: ${config.networkName}.`
          );
        }
      }

      console.log(`📡 Creating Lit Client for ${config.networkName}...`);
      const litClient = await clientModule.createLitClient({
        network: networkModule,
      });
      console.log("✅ Lit Client created successfully");

      if (!config.networkName) {
        throw new Error(
          "No networkName provided for storage configuration. Pass 'networkName' to useLitServiceSetup."
        );
      }

      console.log("🔐 Creating Auth Manager...");
      const authManager = authModule.createAuthManager({
        storage: authModule.storagePlugins.localStorage({
          appName: config.appName || DEFAULT_APP_NAME,
          networkName: config.networkName,
        }),
      });
      console.log("✅ Auth Manager created successfully");

      const newServices = { litClient, authManager };
      setServices(newServices);

      console.log(
        `🎉 All Lit Protocol services initialized successfully. Network: ${config.networkName}`
      );
      return newServices;
    } catch (err: any) {
      const errorMessage = `Failed to initialize Lit Protocol services: ${
        err.message || err
      }`;
      console.error("❌", errorMessage, err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsInitializing(false);
      initializingRef.current = false;
    }
  }, [config]);

  const clearServices = useCallback(() => {
    console.log("🧹 Clearing Lit Protocol services...");
    setServices(null);
    setError(null);
  }, []);

  // Auto-setup on mount if requested
  React.useEffect(() => {
    if (config.autoSetup && !services && !isInitializing) {
      setupServices().catch(console.error);
    }
  }, [config.autoSetup, services, isInitializing, setupServices]);

  return {
    services,
    isInitializing,
    error,
    setupServices,
    clearServices,
    isReady: !!(services?.litClient && services?.authManager),
  };
};
