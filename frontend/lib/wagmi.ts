import { http } from 'wagmi'
import { createConfig } from '@privy-io/wagmi'
import { bscTestnet, bsc } from 'viem/chains'
import { defineChain } from 'viem'

// ─── opBNB Chain (for future migration) ──────────────────────────────────────

export const opBNBTestnet = defineChain({
  id: 5611,
  name: 'opBNB Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://opbnb-testnet-rpc.bnbchain.org'] },
    public:  { http: ['https://opbnb-testnet-rpc.bnbchain.org'] },
  },
  blockExplorers: {
    default: { name: 'opBNB Testnet Explorer', url: 'https://testnet.opbnbscan.com' },
  },
  testnet: true,
})

// ─── Wagmi Config (via @privy-io/wagmi) ───────────────────────────────────────
// Privy manages connectors — no explicit connectors array needed here.

export const wagmiConfig = createConfig({
  chains: [bscTestnet, bsc, opBNBTestnet],
  transports: {
    [bscTestnet.id]:   http('https://data-seed-prebsc-1-s1.binance.org:8545'),
    [bsc.id]:          http('https://bsc-dataseed.binance.org'),
    [opBNBTestnet.id]: http('https://opbnb-testnet-rpc.bnbchain.org'),
  },
})

export { bscTestnet, bsc }
