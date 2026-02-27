'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import { useMemo, useState } from 'react'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS } from '@/lib/contracts'
import { TokenCard } from '@/components/TokenCard'
import Link from 'next/link'

// ─── Feature pills ──────────────────────────────────────────────────────────

const FEATURES = [
  { icon: '⚡', label: 'AMM Trading', desc: 'Constant-product AMM — no order books, always liquid' },
  { icon: '🛡️', label: 'Circuit Breakers', desc: 'Auto-halt trading on extreme price moves' },
  { icon: '💧', label: 'LP Rewards', desc: '80% of sell fees go to liquidity providers' },
  { icon: '🪪', label: 'KYC Support', desc: 'Optional per-token investor verification' },
  { icon: '📈', label: 'Fee Tiers', desc: 'Long-term holders pay 0.02% vs 0.45% for short-term' },
  { icon: '🔒', label: 'Ownership Caps', desc: 'Prevent whale accumulation with per-wallet limits' },
]

type Filter = 'all' | 'kyc' | 'no-kyc' | 'ownership-cap' | 'open'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'kyc', label: 'KYC Required' },
  { id: 'no-kyc', label: 'No KYC' },
  { id: 'ownership-cap', label: 'Ownership Cap' },
  { id: 'open', label: 'Open Access' },
]

// ─── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl px-6 py-5 flex flex-col gap-1 shadow-sm">
      <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-gray-600 text-sm font-medium">{label}</p>
      {sub && <p className="text-gray-400 text-xs">{sub}</p>}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function HomePage() {
  const [filter, setFilter] = useState<Filter>('all')

  const { data: count, isLoading: countLoading } = useReadContract({
    address: CONTRACTS.EQUITY_EXCHANGE,
    abi: EQUITY_EXCHANGE_ABI,
    functionName: 'listedTokenCount',
  })

  const tokenCount = Number(count ?? 0n)

  const { data: tokenAddresses, isLoading: tokensLoading } = useReadContracts({
    contracts: Array.from({ length: tokenCount }, (_, i) => ({
      address: CONTRACTS.EQUITY_EXCHANGE,
      abi: EQUITY_EXCHANGE_ABI,
      functionName: 'listedTokens' as const,
      args: [BigInt(i)] as [bigint],
    })),
    query: { enabled: tokenCount > 0 },
  })

  const addresses = (tokenAddresses ?? [])
    .map((r) => r.result as `0x${string}` | undefined)
    .filter(Boolean) as `0x${string}`[]

  // Fetch configs for all tokens (for filtering)
  const { data: configResults } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: addr,
      abi: EQUITY_TOKEN_ABI,
      functionName: 'config' as const,
    })),
    query: { enabled: addresses.length > 0 && filter !== 'all' },
  })

  const filteredAddresses = useMemo(() => {
    if (filter === 'all' || !configResults) return addresses
    return addresses.filter((_, i) => {
      const cfg = configResults[i]?.result as readonly [number, number, bigint, boolean, number, boolean, string] | undefined
      if (!cfg) return true // keep if config not yet loaded
      const kycRequired = cfg[5]
      const limitOwnership = cfg[3]
      switch (filter) {
        case 'kyc': return kycRequired
        case 'no-kyc': return !kycRequired
        case 'ownership-cap': return limitOwnership
        case 'open': return !kycRequired && !limitOwnership
        default: return true
      }
    })
  }, [addresses, configResults, filter])

  const isLoading = countLoading || tokensLoading
  const isEmpty = !isLoading && addresses.length === 0

  return (
    <div className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20 px-4">
        {/* Subtle background accent */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center">
          {/* Network badge */}
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 shadow-sm text-gray-500 text-xs px-4 py-1.5 rounded-full mb-8 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live on BSC Testnet · Chain 97
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 mb-5 leading-tight tracking-tight">
            Invest in Real Companies
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-teal-500">
              On-Chain
            </span>
          </h1>

          <p className="text-gray-500 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            EquityOnChain is a decentralised equity market — founders tokenise
            their company and raise capital transparently; investors buy, sell,
            and earn LP rewards with stock-market mechanics built right into the
            protocol.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/list"
              className="w-full sm:w-auto px-7 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all text-[15px] shadow-lg shadow-brand-500/20"
            >
              List Your Company
            </Link>
            <Link
              href="/companies"
              className="w-full sm:w-auto px-7 py-3.5 bg-white hover:bg-gray-50 border border-gray-200 shadow-sm text-gray-700 font-semibold rounded-xl transition-all text-[15px]"
            >
              Browse Companies →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            value={isLoading ? '—' : tokenCount.toString()}
            label="Listed Companies"
            sub="Tokenised equity on-chain"
          />
          <StatCard
            value="BSC"
            label="Blockchain Network"
            sub="Binance Smart Chain Testnet"
          />
          <StatCard
            value="v1"
            label="Protocol Version"
            sub="Fully on-chain AMM"
          />
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Built for Real Equity Markets</h2>
          <p className="text-gray-500 text-sm">Mechanisms borrowed from regulated stock exchanges — enforced by smart contracts</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon, label, desc }) => (
            <div
              key={label}
              className="group bg-white hover:bg-gray-50 border border-gray-200 hover:border-brand-200 rounded-2xl p-5 transition-all shadow-sm hover:shadow-md"
            >
              <div className="text-2xl mb-3">{icon}</div>
              <p className="text-gray-900 font-semibold text-sm mb-1">{label}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Market ────────────────────────────────────────────────────── */}
      <section id="market" className="max-w-7xl mx-auto px-4 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Live Market</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {isLoading ? 'Loading…' : `${filteredAddresses.length} of ${addresses.length} compan${addresses.length === 1 ? 'y' : 'ies'}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/companies"
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              View all →
            </Link>
            <Link
              href="/list"
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors"
            >
              <span className="text-lg leading-none">+</span> List a company
            </Link>
          </div>
        </div>

        {/* Filter pills */}
        {addresses.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  filter === id
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:text-gray-900 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-28 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-16" />
                  </div>
                  <div className="h-6 bg-gray-200 rounded w-20" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        )}

        {isEmpty && (
          <div className="border border-dashed border-gray-200 rounded-2xl py-24 text-center bg-white shadow-sm">
            <div className="text-4xl mb-4">🏢</div>
            <p className="text-gray-900 font-semibold text-lg mb-2">No companies listed yet</p>
            <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
              Be the first founder to tokenise your company and raise capital on-chain.
            </p>
            <Link
              href="/list"
              className="inline-block px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-sm"
            >
              List Your Company
            </Link>
          </div>
        )}

        {!isLoading && filteredAddresses.length === 0 && addresses.length > 0 && (
          <div className="border border-dashed border-gray-200 rounded-2xl py-16 text-center bg-white shadow-sm">
            <p className="text-gray-500 mb-3">No companies match this filter</p>
            <button onClick={() => setFilter('all')} className="text-brand-600 text-sm hover:text-brand-700 font-medium">
              Clear filter
            </button>
          </div>
        )}

        {filteredAddresses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAddresses.map((addr) => (
              <TokenCard key={addr} tokenAddress={addr} />
            ))}
          </div>
        )}
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">How It Works</h2>
            <p className="text-gray-500 text-sm">Three roles, one transparent protocol</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Founders List',
                desc: 'Deploy an equity token with a custom name, supply, and trading rules — circuit breakers, KYC requirements, and ownership caps — all configured at launch.',
                accent: 'from-brand-500 to-teal-500',
                border: 'border-brand-200',
              },
              {
                step: '02',
                title: 'Investors Trade',
                desc: 'Buy and sell equity tokens through a constant-product AMM. Long-term holders (6+ months) pay just 0.02% on sells vs 0.45% for short-term traders.',
                accent: 'from-emerald-500 to-teal-500',
                border: 'border-emerald-200',
              },
              {
                step: '03',
                title: 'LPs Earn',
                desc: 'Provide BNB + tokens to earn LP shares. 80% of all sell fees are automatically distributed to liquidity providers — proportional to their share.',
                accent: 'from-amber-500 to-orange-500',
                border: 'border-amber-200',
              },
            ].map(({ step, title, desc, accent, border }) => (
              <div
                key={step}
                className={`bg-white border ${border} rounded-2xl p-7 relative overflow-hidden shadow-sm`}
              >
                <div className={`absolute top-0 right-0 text-7xl font-black opacity-[0.04] bg-gradient-to-br ${accent} bg-clip-text text-transparent pr-4 pt-2 select-none`}>
                  {step}
                </div>
                <div className={`text-xs font-bold bg-gradient-to-r ${accent} bg-clip-text text-transparent mb-3 uppercase tracking-widest`}>
                  Step {step}
                </div>
                <h3 className="text-gray-900 font-bold text-lg mb-3">{title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-brand-50 to-teal-50 border border-brand-200 rounded-3xl p-12 shadow-sm">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to tokenise your company?</h2>
          <p className="text-gray-600 mb-8 max-w-lg mx-auto">
            Launch in minutes. Set your tokenomics, configure trading rules, and let investors in from day one.
          </p>
          <Link
            href="/list"
            className="inline-block px-8 py-4 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-brand-500/20"
          >
            Get Started — It&apos;s Free
          </Link>
        </div>
      </section>
    </div>
  )
}
