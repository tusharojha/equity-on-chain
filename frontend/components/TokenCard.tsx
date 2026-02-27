'use client'

import Link from 'next/link'
import { useReadContracts } from 'wagmi'
import { useEffect, useState } from 'react'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS } from '@/lib/contracts'
import { formatBNB, formatToken, formatAddress, getTokenPrice } from '@/lib/utils'
import { CircuitBreakerBadge } from './CircuitBreakerBadge'

function BNBChainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#F3BA2F" />
      {/* BNB Chain diamond pattern */}
      <path d="M10 4.8L11.6 7L10 9.2L8.4 7Z" fill="white" />
      <path d="M10 10.8L11.6 13L10 15.2L8.4 13Z" fill="white" />
      <path d="M4.8 10L7 8.4L9.2 10L7 11.6Z" fill="white" />
      <path d="M10.8 10L13 8.4L15.2 10L13 11.6Z" fill="white" />
      <path d="M10 7.5L12 9.7L10 11.9L8 9.7Z" fill="white" />
    </svg>
  )
}

interface Props {
  tokenAddress: `0x${string}`
}

interface CompanyProfile {
  aiSummary?: string
  industry?: string
  description?: string
  website?: string
}

export function TokenCard({ tokenAddress }: Props) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null)

  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'name' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'symbol' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'totalSupply' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'maxSupply' },
      {
        address: CONTRACTS.EQUITY_EXCHANGE,
        abi: EQUITY_EXCHANGE_ABI,
        functionName: 'getPool',
        args: [tokenAddress],
      },
    ],
    allowFailure: true,
  })

  useEffect(() => {
    fetch(`/api/company-profile?address=${tokenAddress}`)
      .then((r) => r.json())
      .then((d) => { if (d) setProfile(d) })
      .catch(() => {})
  }, [tokenAddress])

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 animate-pulse shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100" />
          <div className="flex-1">
            <div className="h-4 bg-gray-100 rounded w-28 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-6 bg-gray-100 rounded w-20" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-full mb-2" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    )
  }

  const name         = data?.[0]?.result as string | undefined
  const symbol       = data?.[1]?.result as string | undefined
  const totalSupply  = data?.[2]?.result as bigint | undefined
  const maxSupply    = data?.[3]?.result as bigint | undefined
  const pool         = data?.[4]?.result as [bigint, bigint, bigint, boolean, bigint, bigint] | undefined

  const equityReserve    = pool?.[0] ?? 0n
  const bnbReserve       = pool?.[1] ?? 0n
  const circuitBroken    = pool?.[3] ?? false
  const haltedUntilBlock = pool?.[4] ?? 0n
  const price            = getTokenPrice(bnbReserve, equityReserve)

  const mintedPct = maxSupply && totalSupply && maxSupply > 0n
    ? Math.min(100, (Number(totalSupply) / Number(maxSupply)) * 100)
    : 0

  return (
    <Link href={`/tokens/${tokenAddress}`} className="block group">
      <div className="bg-white border border-gray-200 hover:border-brand-300 hover:shadow-md rounded-2xl p-5 transition-all h-full flex flex-col shadow-sm">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Token avatar with BNB chain badge */}
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center font-bold text-brand-600 text-xs">
              {symbol?.slice(0, 3) ?? '?'}
            </div>
            <BNBChainIcon className="absolute -bottom-1 -right-1 w-4 h-4 shadow-sm rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight">{name ?? 'Loading…'}</h3>
              {profile?.industry && (
                <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full leading-none font-medium">
                  {profile.industry}
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs font-mono mt-0.5">{symbol} · {formatAddress(tokenAddress)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-gray-900">{price}</p>
            <p className="text-gray-400 text-[10px]">BNB/token</p>
          </div>
        </div>

        {/* AI summary */}
        {(profile?.aiSummary || profile?.description) && (
          <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2">
            {profile.aiSummary ?? profile.description}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 text-[10px] mb-0.5">Pool BNB</p>
            <p className="text-gray-900 font-semibold">{formatBNB(bnbReserve)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 text-[10px] mb-0.5">Pool Tokens</p>
            <p className="text-gray-900 font-semibold">{formatToken(equityReserve)}</p>
          </div>
        </div>

        {/* Mint progress */}
        {mintedPct > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>Supply minted</span>
              <span>{mintedPct.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${mintedPct}%` }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <CircuitBreakerBadge circuitBroken={circuitBroken} haltedUntilBlock={haltedUntilBlock} />
          <span className="text-brand-600 text-xs font-semibold group-hover:text-brand-700 transition-colors">
            Trade →
          </span>
        </div>
      </div>
    </Link>
  )
}
