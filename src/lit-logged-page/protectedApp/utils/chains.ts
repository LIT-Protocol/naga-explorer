import { ChainConfig } from '../types';

// ====================
// Configuration constants
// ====================
export const SUPPORTED_CHAIN_ID = 2888; // Naga chain ID (legacy reference)
const CUSTOM_CHAINS_STORAGE_KEY = 'chains.custom.v1';

// Default chain definitions (previously SUPPORTED_CHAINS)
export const DEFAULT_CHAINS: Record<string, ChainConfig> = {
  // local: {
  //   id: 31337,
  //   name: "Local Development Chain",
  //   symbol: "ETH",
  //   rpcUrl: "http://127.0.0.1:8545",
  //   explorerUrl: "#", // No explorer for local chain
  //   litIdentifier: "local",
  //   testnet: true,
  // },
  yellowstone: {
    id: 175188,
    name: "Chronicle Yellowstone",
    symbol: "tstLPX",
    rpcUrl: "https://yellowstone-rpc.litprotocol.com/",
    explorerUrl: "https://yellowstone-explorer.litprotocol.com/",
    litIdentifier: "yellowstone",
    testnet: true,
  },
  ethereum: {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    rpcUrl: "https://eth.llamarpc.com",
    explorerUrl: "https://etherscan.io/",
    litIdentifier: "ethereum",
    testnet: false,
  },
  sepolia: {
    id: 11155111,
    name: "Sepolia Testnet",
    symbol: "ETH",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    explorerUrl: "https://sepolia.etherscan.io/",
    litIdentifier: "sepolia",
    testnet: true,
  },
  polygon: {
    id: 137,
    name: "Polygon",
    symbol: "MATIC",
    rpcUrl: "https://polygon-bor-rpc.publicnode.com",
    explorerUrl: "https://polygonscan.com/",
    litIdentifier: "polygon",
    testnet: false,
  },
  arbitrum: {
    id: 42161,
    name: "Arbitrum",
    symbol: "AETH",
    rpcUrl: "https://arbitrum-one-rpc.publicnode.com",
    explorerUrl: "https://arbiscan.io/",
    litIdentifier: "arbitrum",
    testnet: false,
  },
  base: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    rpcUrl: "https://base-rpc.publicnode.com",
    explorerUrl: "https://basescan.org/",
    litIdentifier: "base",
    testnet: false,
  },
  optimism: {
    id: 10,
    name: "Optimism",
    symbol: "ETH",
    rpcUrl: "https://optimism-rpc.publicnode.com",
    explorerUrl: "https://optimistic.etherscan.io/",
    litIdentifier: "optimism",
    testnet: false,
  },
} as const;

// Back-compat export: keep the original name for existing imports
export const SUPPORTED_CHAINS: Record<string, ChainConfig> = DEFAULT_CHAINS;

// ====================
// Validation helpers
// ====================
function isValidUrl(url: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a candidate ChainConfig.
 */
export function validateChainConfig(cfg: ChainConfig, _allChainsById?: Map<number, string>): { ok: true } | { ok: false; error: string } {
  if (!cfg) return { ok: false, error: 'Missing chain config' };
  if (!Number.isInteger(cfg.id) || cfg.id <= 0) return { ok: false, error: 'id must be a positive integer' };
  if (!cfg.name || cfg.name.trim().length === 0) return { ok: false, error: 'name is required' };
  if (!cfg.symbol || cfg.symbol.trim().length === 0) return { ok: false, error: 'symbol is required' };
  if (!cfg.rpcUrl || !isValidUrl(cfg.rpcUrl)) return { ok: false, error: 'rpcUrl must be a valid URL' };
  if (cfg.explorerUrl && !isValidUrl(cfg.explorerUrl)) return { ok: false, error: 'explorerUrl must be a valid URL if provided' };
  if (typeof cfg.testnet !== 'boolean') return { ok: false, error: 'testnet must be a boolean' };
  if (!cfg.litIdentifier || cfg.litIdentifier.trim().length === 0) return { ok: false, error: 'litIdentifier is required' };

  // Duplicate ids are allowed to support multiple RPC endpoints per chain id

  return { ok: true };
}

// ====================
// Storage helpers
// ====================
export function loadCustomChains(): Record<string, ChainConfig> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CUSTOM_CHAINS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, ChainConfig>;
  } catch {
    return {};
  }
}

export function saveCustomChains(chains: Record<string, ChainConfig>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CUSTOM_CHAINS_STORAGE_KEY, JSON.stringify(chains));
  } catch {
    // ignore quota / serialisation errors
  }
}

export function getCustomChains(): Record<string, ChainConfig> {
  return loadCustomChains();
}

export function getAllChains(): Record<string, ChainConfig> {
  return { ...DEFAULT_CHAINS, ...getCustomChains() };
}

export function isCustomChain(slug: string): boolean {
  const custom = getCustomChains();
  return Object.prototype.hasOwnProperty.call(custom, slug);
}

export function addCustomChain(slug: string, cfg: ChainConfig): { ok: true } | { ok: false; error: string } {
  const existingCustom = getCustomChains();

  if (!slug || slug.trim().length === 0) return { ok: false, error: 'slug is required' };
  const safeSlug = slug.trim();
  if (Object.prototype.hasOwnProperty.call(DEFAULT_CHAINS, safeSlug)) {
    return { ok: false, error: 'Slug collides with a default chain' };
  }
  if (Object.prototype.hasOwnProperty.call(existingCustom, safeSlug)) {
    return { ok: false, error: 'Slug already exists' };
  }

  const valid = validateChainConfig(cfg);
  if (!('ok' in valid) || valid.ok !== true) return valid;

  const updated = { ...existingCustom, [safeSlug]: cfg } as Record<string, ChainConfig>;
  saveCustomChains(updated);
  return { ok: true };
}

export function removeCustomChain(slug: string): void {
  const existingCustom = getCustomChains();
  if (!Object.prototype.hasOwnProperty.call(existingCustom, slug)) return;
  const { [slug]: _removed, ...rest } = existingCustom;
  saveCustomChains(rest);
}