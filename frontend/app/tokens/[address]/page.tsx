'use client'

import { use, useEffect, useState } from 'react'
import { useAccount, useReadContracts, useReadContract, useBlockNumber } from 'wagmi'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS } from '@/lib/contracts'
import { formatBNB, formatToken, formatAddress, getTokenPrice } from '@/lib/utils'
import { TradePanel } from '@/components/TradePanel'
import { LiquidityPanel } from '@/components/LiquidityPanel'
import { CircuitBreakerBadge } from '@/components/CircuitBreakerBadge'
import { PriceChart } from '@/components/PriceChart'
import Link from 'next/link'

interface Props {
  params: Promise<{ address: string }>
}

interface CompanyProfile {
  tokenAddress: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  linkedin?: string
  aiSummary?: string
  industry?: string
  businessModel?: string
  keyHighlights?: string[]
  riskFactors?: string[]
  teamInfo?: string
  documentName?: string
  createdAt?: string
}

// ─── Social link helpers ─────────────────────────────────────────────────────

function SocialLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  const url = href.startsWith('http') ? href : `https://${href}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
    >
      {icon}
      <span className="truncate max-w-[120px]">{label}</span>
    </a>
  )
}

const TwitterIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)
const TelegramIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.16 13.26 4.2 12.36c-.657-.204-.67-.657.136-.975l10.26-3.957c.546-.197 1.022.13.844.793z" />
  </svg>
)
const DiscordIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.06.11 18.083.127 18.1a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
)
const LinkedInIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)
const GlobeIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)

// ─── Company Profile Panel (collapsible) ─────────────────────────────────────

function CompanyProfilePanel({ profile }: { profile: CompanyProfile }) {
  const [expanded, setExpanded] = useState(false)
  const hasSocials = profile.website || profile.twitter || profile.telegram || profile.discord || profile.linkedin
  const hasExtras = profile.businessModel || (profile.keyHighlights && profile.keyHighlights.length > 0) || (profile.riskFactors && profile.riskFactors.length > 0) || profile.teamInfo

  // Show only summary + AI summary in collapsed state; description alone counts as main content
  const mainText = profile.aiSummary ?? profile.description
  if (!mainText && !hasSocials && !profile.industry) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">About</h3>
        {profile.industry && (
          <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
            {profile.industry}
          </span>
        )}
      </div>

      {/* Always show: primary description or AI summary (one of them, not both) */}
      {mainText && (
        <p className="text-gray-600 text-sm leading-relaxed mb-3 line-clamp-3">
          {mainText}
        </p>
      )}

      {/* Social links always visible */}
      {hasSocials && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {profile.website && (
            <SocialLink href={profile.website} label={profile.website.replace(/^https?:\/\//, '')} icon={<GlobeIcon />} />
          )}
          {profile.twitter && (
            <SocialLink href={profile.twitter.startsWith('http') ? profile.twitter : `https://twitter.com/${profile.twitter.replace('@', '')}`} label={profile.twitter} icon={<TwitterIcon />} />
          )}
          {profile.telegram && (
            <SocialLink href={profile.telegram.startsWith('http') ? profile.telegram : `https://${profile.telegram}`} label={profile.telegram} icon={<TelegramIcon />} />
          )}
          {profile.discord && (
            <SocialLink href={profile.discord.startsWith('http') ? profile.discord : `https://${profile.discord}`} label="Discord" icon={<DiscordIcon />} />
          )}
          {profile.linkedin && (
            <SocialLink href={profile.linkedin.startsWith('http') ? profile.linkedin : `https://${profile.linkedin}`} label="LinkedIn" icon={<LinkedInIcon />} />
          )}
        </div>
      )}

      {/* Expandable extra details */}
      {hasExtras && (
        <>
          {expanded && (
            <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
              {profile.businessModel && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Business Model</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{profile.businessModel}</p>
                </div>
              )}
              {profile.keyHighlights && profile.keyHighlights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Key Highlights</p>
                  <ul className="space-y-1">
                    {profile.keyHighlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-brand-500 flex-shrink-0 mt-0.5">✓</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.riskFactors && profile.riskFactors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Risk Factors</p>
                  <ul className="space-y-1">
                    {profile.riskFactors.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.teamInfo && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Team</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{profile.teamInfo}</p>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            {expanded ? 'Show less ↑' : 'Show more ↓'}
          </button>
        </>
      )}

      {profile.documentName && expanded && (
        <p className="text-[10px] text-gray-400 pt-2 mt-2 border-t border-gray-100">
          Based on: {profile.documentName}
        </p>
      )}
    </div>
  )
}

// ─── Regulations Summary Strip ────────────────────────────────────────────────

function RegulationsSummaryStrip({ config }: { config: { upperCircuitPct: number; lowerCircuitPct: number; kycRequired: boolean; limitOwnership: boolean; maxOwnershipPct: number } }) {
  const pills = [
    {
      label: `Circuit Breaker: ${config.upperCircuitPct > 0 ? `±${Math.max(config.upperCircuitPct, config.lowerCircuitPct)}%` : 'Off'}`,
      active: config.upperCircuitPct > 0,
      style: config.upperCircuitPct > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200',
      dot: config.upperCircuitPct > 0 ? 'bg-amber-400' : 'bg-gray-300',
    },
    {
      label: `KYC: ${config.kycRequired ? 'Required' : 'Open'}`,
      active: config.kycRequired,
      style: config.kycRequired ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200',
      dot: config.kycRequired ? 'bg-blue-400' : 'bg-gray-300',
    },
    {
      label: `Ownership Cap: ${config.limitOwnership ? `${config.maxOwnershipPct}% max` : 'None'}`,
      active: config.limitOwnership,
      style: config.limitOwnership ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-100 text-gray-500 border-gray-200',
      dot: config.limitOwnership ? 'bg-purple-400' : 'bg-gray-300',
    },
    {
      label: 'Fee Tiers: 0.02–0.45%',
      active: true,
      style: 'bg-brand-50 text-brand-700 border-brand-200',
      dot: 'bg-brand-500',
    },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">Regulations</span>
        {pills.map((p) => (
          <span key={p.label} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${p.style}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Token Page ───────────────────────────────────────────────────────────────

export default function TokenPage({ params }: Props) {
  const { address: tokenAddress } = use(params)
  const addr = tokenAddress as `0x${string}`
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [activePanel, setActivePanel] = useState<'trade' | 'liquidity'>('trade')
  const [chartRefreshKey, setChartRefreshKey] = useState(0)

  const { address: userAddress, isConnected } = useAccount()
  const { data: currentBlock } = useBlockNumber({ watch: true })

  useEffect(() => {
    fetch(`/api/company-profile?address=${addr}`)
      .then((r) => r.json())
      .then((d) => { if (d) setProfile(d) })
      .catch(() => { })
  }, [addr])

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'name' },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'symbol' },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'totalSupply' },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'maxSupply' },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'owner' },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'config' },
      {
        address: CONTRACTS.EQUITY_EXCHANGE,
        abi: EQUITY_EXCHANGE_ABI,
        functionName: 'getPool',
        args: [addr],
      },
    ],
    allowFailure: true,
  })

  // User's balance
  const { data: userBalance } = useReadContract({
    address: addr,
    abi: EQUITY_TOKEN_ABI,
    functionName: 'balanceOf',
    args: [userAddress ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!userAddress },
  })

  const name = data?.[0]?.result as string | undefined
  const symbol = data?.[1]?.result as string | undefined
  const totalSupply = data?.[2]?.result as bigint | undefined
  const maxSupply = data?.[3]?.result as bigint | undefined
  const owner = data?.[4]?.result as string | undefined
  const config = data?.[5]?.result as readonly [number, number, bigint, boolean, number, boolean, string] | undefined
  const poolRaw = data?.[6]?.result as readonly [bigint, bigint, bigint, boolean, bigint, bigint] | undefined

  const pool = {
    equityReserve: poolRaw?.[0] ?? 0n,
    bnbReserve: poolRaw?.[1] ?? 0n,
    totalLPShares: poolRaw?.[2] ?? 0n,
    circuitBroken: poolRaw?.[3] ?? false,
    haltedUntilBlock: poolRaw?.[4] ?? 0n,
    protocolFees: poolRaw?.[5] ?? 0n,
  }

  const price = getTokenPrice(pool.bnbReserve, pool.equityReserve)

  const mintedPct = maxSupply && totalSupply && maxSupply > 0n
    ? Math.min(100, (Number(totalSupply) / Number(maxSupply)) * 100)
    : 0

  // User holding %
  const userHoldingPct = totalSupply && totalSupply > 0n && userBalance
    ? ((Number(userBalance) / Number(totalSupply)) * 100)
    : 0

  // Only show circuit breaker alert if halt is still active (not just storage stale)
  const haltExpired = pool.circuitBroken && currentBlock != null && pool.haltedUntilBlock > 0n && currentBlock >= pool.haltedUntilBlock
  const effectiveCircuitBroken = pool.circuitBroken && !haltExpired

  // Structured config for RegulationsPanel
  const regulationsConfig = config
    ? {
      upperCircuitPct: config[0],
      lowerCircuitPct: config[1],
      circuitHaltBlocks: config[2],
      limitOwnership: config[3],
      maxOwnershipPct: config[4],
      kycRequired: config[5],
    }
    : null

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-4 bg-gray-200 rounded w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          <div className="lg:col-span-2 h-96 bg-gray-100 rounded-2xl" />
          <div className="h-96 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/" className="hover:text-gray-700 transition-colors">Market</Link>
        <span>/</span>
        <span className="text-gray-700">{symbol}</span>
      </div>

      {/* Token header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center font-bold text-brand-600 text-sm flex-shrink-0">
            {symbol?.slice(0, 3) ?? '?'}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
              {profile?.industry && (
                <span className="text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                  {profile.industry}
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-0.5">
              {symbol} · <span className="font-mono">{formatAddress(addr)}</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">
            {price} <span className="text-gray-400 text-base font-normal">BNB</span>
          </p>
          <p className="text-gray-400 text-xs mt-0.5">per token</p>
        </div>
      </div>

      {/* Circuit breaker alert — only when actively halted */}
      {effectiveCircuitBroken && (
        <div className="mb-5">
          <CircuitBreakerBadge circuitBroken={pool.circuitBroken} haltedUntilBlock={pool.haltedUntilBlock} />
        </div>
      )}

      {/* Regulations summary strip — visible to all visitors immediately */}
      {regulationsConfig && <RegulationsSummaryStrip config={regulationsConfig} />}

      {/* Pool stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'BNB Reserve', value: `${formatBNB(pool.bnbReserve)} BNB` },
          { label: 'Token Reserve', value: `${formatToken(pool.equityReserve)} ${symbol}` },
          { label: 'LP Shares', value: formatToken(pool.totalLPShares) },
          { label: 'Protocol Fees', value: `${formatBNB(pool.protocolFees)} BNB` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">{label}</p>
            <p className="text-gray-900 font-semibold text-sm">{value}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: chart + trade/LP tabs */}
        <div className="lg:col-span-2 space-y-5">
          {/* Price chart — refreshes after every confirmed trade */}
          <PriceChart tokenAddress={addr} refreshKey={chartRefreshKey} />

          {/* Trade / Liquidity tab switcher */}
          <div>
            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              <button
                onClick={() => setActivePanel('trade')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activePanel === 'trade'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Trade
              </button>
              <button
                onClick={() => setActivePanel('liquidity')}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activePanel === 'liquidity'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Liquidity
              </button>
            </div>
            {activePanel === 'trade'
              ? <TradePanel
                tokenAddress={addr}
                symbol={symbol ?? ''}
                pool={pool}
                onTradeConfirmed={() => setChartRefreshKey((k) => k + 1)}
              />
              : <LiquidityPanel tokenAddress={addr} symbol={symbol ?? ''} pool={pool} />
            }
          </div>
        </div>

        {/* Right: info sidebar — regulations FIRST */}
        <div className="space-y-4">
          {/* ② Your Holdings */}
          {isConnected && userAddress && (
            <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4 text-sm">Your Holdings</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Balance</span>
                  <span className="text-gray-900 font-medium">
                    {formatToken(userBalance ?? 0n)} {symbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Ownership %</span>
                  <span className={`font-bold ${userHoldingPct > 0 ? 'text-brand-600' : 'text-gray-400'}`}>
                    {userHoldingPct > 0 ? `${userHoldingPct.toFixed(4)}%` : '—'}
                  </span>
                </div>
                {userBalance && userBalance > 0n && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">BNB value</span>
                    <span className="text-gray-700">
                      ≈ {pool.equityReserve > 0n
                        ? formatBNB((userBalance * pool.bnbReserve) / pool.equityReserve)
                        : '0'} BNB
                    </span>
                  </div>
                )}
                {userHoldingPct > 0 && totalSupply && totalSupply > 0n && (
                  <div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full bg-brand-500 rounded-full"
                        style={{ width: `${Math.min(100, userHoldingPct)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">of total supply</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ③ Company profile */}
          {profile && <CompanyProfilePanel profile={profile} />}

          {/* ④ Supply */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 text-sm">Supply</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Circulating</span>
                <span className="text-gray-900 font-medium">{formatToken(totalSupply ?? 0n)} {symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Max Supply</span>
                <span className="text-gray-900 font-medium">{formatToken(maxSupply ?? 0n)} {symbol}</span>
              </div>
              {mintedPct > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Minted</span>
                    <span>{mintedPct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${mintedPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ⑤ Founder */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Founder</h3>
            <p className="text-gray-500 text-xs font-mono break-all">{owner ?? '—'}</p>
            {owner && (
              <a
                href={`https://testnet.bscscan.com/address/${owner}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-600 hover:text-brand-700 mt-2 inline-flex items-center gap-1"
              >
                View on Explorer ↗
              </a>
            )}
          </div>

          {/* ⑥ Fee schedule */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 text-sm">Fee Schedule</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-700 text-sm">Short-term sell</p>
                  <p className="text-gray-400 text-xs">Held &lt; 6 months</p>
                </div>
                <span className="text-amber-500 font-bold">0.45%</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-700 text-sm">Long-term sell</p>
                  <p className="text-gray-400 text-xs">Held ≥ 6 months</p>
                </div>
                <span className="text-brand-600 font-bold">0.02%</span>
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">LP share of fee</span>
                  <span className="text-gray-600">80%</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Protocol share</span>
                  <span className="text-gray-600">20%</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
