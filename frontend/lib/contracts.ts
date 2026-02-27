import { parseAbi } from 'viem'

// ─── Contract Addresses ────────────────────────────────────────────────────
// Fill these after running: forge script script/Deploy.s.sol --broadcast
export const CONTRACTS = {
  KYC_REGISTRY:    (process.env.NEXT_PUBLIC_KYC_REGISTRY    ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
  EQUITY_EXCHANGE: (process.env.NEXT_PUBLIC_EQUITY_EXCHANGE  ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
  EQUITY_FACTORY:  (process.env.NEXT_PUBLIC_EQUITY_FACTORY   ?? '0x0000000000000000000000000000000000000000') as `0x${string}`,
} as const

// ─── Explorer ─────────────────────────────────────────────────────────────
export const EXPLORER_URL = 'https://testnet.bscscan.com'

// ─── Chain Constants ───────────────────────────────────────────────────────
export const CHAIN_CONSTANTS = {
  BLOCK_TIME_SECONDS: 3,
  WINDOW_BLOCKS: 28_800n,          // 24 h  (3 s/block on BSC Testnet: 86_400 / 3)
  SHORT_TERM_BLOCKS: 5_184_000n,   // 6 months (180 d × 86_400 s/d ÷ 3 s/block)
  SHORT_TERM_FEE_BPS: 45n,         // 0.45 %
  LONG_TERM_FEE_BPS: 2n,           // 0.02 %
  FEE_DENOM: 10_000n,
  LP_FEE_SHARE_BPS: 8_000n,        // 80 % of fee to LPs
} as const

// ─── ABIs ─────────────────────────────────────────────────────────────────

export const EQUITY_FACTORY_ABI = parseAbi([
  'function create(string name, string symbol, uint256 maxSupply, uint256 poolTokens, uint256 founderTokens, (uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider) cfg) payable returns (address)',
  'function exchange() view returns (address)',
  'function deployedTokens(uint256) view returns (address)',
  'function deployedTokenCount() view returns (uint256)',
  'function getTokensByFounder(address) view returns (address[])',
  'event EquityCreated(address indexed token, address indexed founder, string name, string symbol, uint256 maxSupply, uint256 founderTokens, uint256 poolTokens, uint256 initialBnb)',
])

export const EQUITY_EXCHANGE_ABI = parseAbi([
  // Listing
  'function listToken(address token, uint256 initialEquity) payable',
  'function listingFee() view returns (uint256)',
  // Liquidity
  'function addLiquidity(address token, uint256 equityDesired) payable',
  'function removeLiquidity(address token, uint256 lpShares)',
  'function getLPShares(address token, address provider) view returns (uint256)',
  // Trading
  'function buyTokens(address token, uint256 minEquityOut) payable',
  'function sellTokens(address token, uint256 equityIn, uint256 minBnbOut)',
  // Pool state
  'function getPool(address token) view returns (uint256 equityReserve, uint256 bnbReserve, uint256 totalLPShares, bool circuitBroken, uint256 haltedUntilBlock, uint256 protocolFeesAccrued)',
  'function getHoldRecord(address token, address holder) view returns (uint256 weightedBlockSum, uint256 totalAmount)',
  'function listedTokens(uint256) view returns (address)',
  'function listedTokenCount() view returns (uint256)',
  // Constants
  'function SHORT_TERM_BLOCKS() view returns (uint256)',
  'function WINDOW_BLOCKS() view returns (uint256)',
  'function SHORT_TERM_FEE_BPS() view returns (uint256)',
  'function LONG_TERM_FEE_BPS() view returns (uint256)',
  'function FEE_DENOM() view returns (uint256)',
  'function LP_FEE_SHARE_BPS() view returns (uint256)',
  'function treasury() view returns (address)',
  // Events
  'event TokenListed(address indexed token, uint256 initialEquity, uint256 initialBnb)',
  'event TokensBought(address indexed token, address indexed buyer, uint256 bnbIn, uint256 equityOut, uint256 fee)',
  'event TokensSold(address indexed token, address indexed seller, uint256 equityIn, uint256 bnbOut, uint256 fee)',
  'event CircuitBreaked(address indexed token, uint256 triggerBlock, uint256 resumeBlock, bool isUpper)',
  'event LiquidityAdded(address indexed token, address indexed provider, uint256 equityIn, uint256 bnbIn, uint256 lpSharesMinted)',
  'event LiquidityRemoved(address indexed token, address indexed provider, uint256 equityOut, uint256 bnbOut, uint256 lpSharesBurned)',
])

export const EQUITY_TOKEN_ABI = parseAbi([
  // ERC-20
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function maxSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  // Equity-specific
  'function owner() view returns (address)',
  'function config() view returns (uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider)',
  'function isWhitelistedExchange(address) view returns (bool)',
  // Owner-only mutations
  'function updateConfig((uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider) newCfg)',
  'function whitelistExchange(address exchange)',
  'function removeExchange(address exchange)',
  'function mint(address to, uint256 amount)',
  'function setKYCRegistry(address provider)',
  // KYC
  'function kycRegistry() view returns (address)',
])

export const KYC_REGISTRY_ABI = parseAbi([
  'function isVerified(address account) view returns (bool)',
  'function verify(address account)',
  'function verifyBatch(address[] accounts)',
  'function revoke(address account)',
  'function owner() view returns (address)',
  'event Verified(address indexed account)',
  'event Revoked(address indexed account)',
])
