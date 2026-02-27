'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig, bscTestnet } from '@/lib/wagmi'

const queryClient = new QueryClient()

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''

// Loading skeleton shown before providers are ready (server-side / first paint)
function AppShell() {
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center font-bold text-white animate-pulse text-xs">
          EOC
        </div>
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )
}

function Web3Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Don't render any children during SSR — all pages use wagmi hooks that need
  // providers to be initialized first. Show a loading shell instead.
  if (!mounted) return <AppShell />

  if (!PRIVY_APP_ID) {
    return (
      <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 max-w-md text-center shadow-sm">
          <p className="text-amber-700 font-medium mb-2">Privy App ID required</p>
          <p className="text-gray-600 text-sm">
            Add <code className="font-mono bg-gray-100 px-1 rounded">NEXT_PUBLIC_PRIVY_APP_ID</code> to{' '}
            <code className="font-mono bg-gray-100 px-1 rounded">.env.local</code> — get one free at{' '}
            <a href="https://dashboard.privy.io" target="_blank" rel="noreferrer" className="text-brand-600 underline">
              dashboard.privy.io
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email', 'google', 'apple'],
        defaultChain: bscTestnet,
        supportedChains: [bscTestnet],
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
          landingHeader: 'Connect to EquityOnChain',
          loginMessage: 'Sign in to buy, sell, and list equity tokens on-chain.',
          walletChainType: 'ethereum-only',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  return <Web3Providers>{children}</Web3Providers>
}
