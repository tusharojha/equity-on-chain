'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import { useMemo, useState, useEffect, useRef } from 'react'
import { formatUnits } from 'viem'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS } from '@/lib/contracts'
import { formatBNB, formatToken, formatAddress, getTokenPrice } from '@/lib/utils'
import { CircuitBreakerBadge } from '@/components/CircuitBreakerBadge'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CompanyProfile {
  industry?: string
  aiSummary?: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
}

type SortBy = 'newest' | 'price-asc' | 'price-desc' | 'liquidity'
type PoolRange = 'all' | 'micro' | 'small' | 'mid' | 'large'
type StatusFilter = 'all' | 'active' | 'halted'
type ViewMode = 'grid' | 'list'

interface ProcessedToken {
  address: `0x${string}`
  name: string
  symbol: string
  totalSupply: bigint
  maxSupply: bigint
  equityReserve: bigint
  bnbReserve: bigint
  circuitBroken: boolean
  haltedUntilBlock: bigint
  kycRequired: boolean
  limitOwnership: boolean
  upperCircuitPct: number
  // profile data (merged later)
  industry?: string
  aiSummary?: string
  description?: string
  website?: string
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function BNBChainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#F3BA2F" />
      <path d="M10 4.8L11.6 7L10 9.2L8.4 7Z" fill="white" />
      <path d="M10 10.8L11.6 13L10 15.2L8.4 13Z" fill="white" />
      <path d="M4.8 10L7 8.4L9.2 10L7 11.6Z" fill="white" />
      <path d="M10.8 10L13 8.4L15.2 10L13 11.6Z" fill="white" />
      <path d="M10 7.5L12 9.7L10 11.9L8 9.7Z" fill="white" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function SlidersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  )
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ─── Pool size helpers ────────────────────────────────────────────────────────

const POOL_RANGES: { id: PoolRange; label: string; sub: string }[] = [
  { id: 'all',   label: 'Any size',      sub: '' },
  { id: 'micro', label: '< 0.1 BNB',    sub: 'Micro' },
  { id: 'small', label: '0.1 – 1 BNB',  sub: 'Small' },
  { id: 'mid',   label: '1 – 10 BNB',   sub: 'Medium' },
  { id: 'large', label: '> 10 BNB',     sub: 'Large' },
]

function bnbInRange(bnbReserve: bigint, range: PoolRange): boolean {
  const bnb = Number(formatUnits(bnbReserve, 18))
  switch (range) {
    case 'all':   return true
    case 'micro': return bnb < 0.1
    case 'small': return bnb >= 0.1 && bnb < 1
    case 'mid':   return bnb >= 1 && bnb < 10
    case 'large': return bnb >= 10
  }
}

// ─── Filter section (collapsible) ────────────────────────────────────────────

function FilterSection({
  title, count, defaultOpen = true, children,
}: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left mb-0"
      >
        <span className="text-sm font-semibold text-gray-800">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 text-xs font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}

// ─── Checkbox item ────────────────────────────────────────────────────────────

function CheckItem({
  label, count, checked, onChange,
}: {
  label: string; count?: number; checked: boolean; onChange: () => void
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          checked
            ? 'bg-brand-500 border-brand-500'
            : 'border-gray-300 group-hover:border-brand-400'
        }`}
      >
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span className={`text-sm flex-1 ${checked ? 'text-brand-700 font-medium' : 'text-gray-600 group-hover:text-gray-900'}`}>
        {label}
      </span>
      {count !== undefined && (
        <span className="text-xs text-gray-400 tabular-nums">{count}</span>
      )}
    </label>
  )
}

// ─── Radio item ───────────────────────────────────────────────────────────────

function RadioItem({
  label, sub, selected, onClick,
}: {
  label: string; sub?: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2.5 group`}
    >
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
        selected ? 'border-brand-500' : 'border-gray-300 group-hover:border-brand-400'
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-brand-500" />}
      </div>
      <span className={`text-sm ${selected ? 'text-brand-700 font-medium' : 'text-gray-600 group-hover:text-gray-900'}`}>
        {label}
        {sub && <span className="text-gray-400 font-normal ml-1">· {sub}</span>}
      </span>
    </button>
  )
}

// ─── Filter sidebar content ───────────────────────────────────────────────────

interface FilterProps {
  industries: { name: string; count: number }[]
  selectedIndustries: Set<string>
  toggleIndustry: (i: string) => void
  selectedCompliance: Set<string>
  toggleCompliance: (c: string) => void
  poolRange: PoolRange
  setPoolRange: (r: PoolRange) => void
  statusFilter: StatusFilter
  setStatusFilter: (s: StatusFilter) => void
  profilesLoaded: boolean
}

function FilterContent({
  industries, selectedIndustries, toggleIndustry,
  selectedCompliance, toggleCompliance,
  poolRange, setPoolRange,
  statusFilter, setStatusFilter,
  profilesLoaded,
}: FilterProps) {
  const COMPLIANCE_OPTIONS = [
    { id: 'kyc',           label: 'KYC Required' },
    { id: 'no-kyc',        label: 'No KYC' },
    { id: 'ownership-cap', label: 'Ownership Cap' },
    { id: 'open',          label: 'Open Access' },
  ]
  const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
    { id: 'all',    label: 'All' },
    { id: 'active', label: 'Trading Active' },
    { id: 'halted', label: 'Circuit Breaker Active' },
  ]

  return (
    <>
      {/* Sector / Industry */}
      <FilterSection title="Sector" count={selectedIndustries.size}>
        {!profilesLoaded ? (
          <div className="space-y-2">
            {[80, 60, 72, 55].map((w) => (
              <div key={w} className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : industries.length === 0 ? (
          <p className="text-xs text-gray-400">No sector data yet</p>
        ) : (
          industries.map(({ name, count }) => (
            <CheckItem
              key={name}
              label={name}
              count={count}
              checked={selectedIndustries.has(name)}
              onChange={() => toggleIndustry(name)}
            />
          ))
        )}
      </FilterSection>

      {/* Investor Access */}
      <FilterSection title="Investor Access" count={selectedCompliance.size}>
        {COMPLIANCE_OPTIONS.map(({ id, label }) => (
          <CheckItem
            key={id}
            label={label}
            checked={selectedCompliance.has(id)}
            onChange={() => toggleCompliance(id)}
          />
        ))}
      </FilterSection>

      {/* Pool Liquidity */}
      <FilterSection title="Pool Liquidity">
        {POOL_RANGES.map(({ id, label, sub }) => (
          <RadioItem
            key={id}
            label={label}
            sub={sub}
            selected={poolRange === id}
            onClick={() => setPoolRange(id)}
          />
        ))}
      </FilterSection>

      {/* Market Status */}
      <FilterSection title="Market Status">
        {STATUS_OPTIONS.map(({ id, label }) => (
          <RadioItem
            key={id}
            label={label}
            selected={statusFilter === id}
            onClick={() => setStatusFilter(id)}
          />
        ))}
      </FilterSection>
    </>
  )
}

// ─── Active filter chips ──────────────────────────────────────────────────────

function ActiveFilters({
  selectedIndustries, toggleIndustry,
  selectedCompliance, toggleCompliance,
  poolRange, setPoolRange,
  statusFilter, setStatusFilter,
  onClearAll,
}: {
  selectedIndustries: Set<string>; toggleIndustry: (i: string) => void
  selectedCompliance: Set<string>; toggleCompliance: (c: string) => void
  poolRange: PoolRange; setPoolRange: (r: PoolRange) => void
  statusFilter: StatusFilter; setStatusFilter: (s: StatusFilter) => void
  onClearAll: () => void
}) {
  const chips: { label: string; onRemove: () => void }[] = [
    ...Array.from(selectedIndustries).map((i) => ({ label: i, onRemove: () => toggleIndustry(i) })),
    ...Array.from(selectedCompliance).map((c) => ({
      label: { kyc: 'KYC Required', 'no-kyc': 'No KYC', 'ownership-cap': 'Ownership Cap', 'open': 'Open Access' }[c] ?? c,
      onRemove: () => toggleCompliance(c),
    })),
    ...(poolRange !== 'all' ? [{ label: POOL_RANGES.find((r) => r.id === poolRange)?.label ?? '', onRemove: () => setPoolRange('all') }] : []),
    ...(statusFilter !== 'all' ? [{ label: statusFilter === 'active' ? 'Trading Active' : 'Circuit Breaker', onRemove: () => setStatusFilter('all') }] : []),
  ]

  if (chips.length === 0) return null

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <span className="text-xs text-gray-400 font-medium">Active:</span>
      {chips.map(({ label, onRemove }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-50 text-brand-700 border border-brand-200 rounded-full text-xs font-medium"
        >
          {label}
          <button onClick={onRemove} className="hover:text-brand-900 ml-0.5">
            <XIcon className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-gray-400 hover:text-gray-600 font-medium underline ml-1"
      >
        Clear all
      </button>
    </div>
  )
}

// ─── Grid card (enhanced TokenCard) ─────────────────────────────────────────

function GridCard({ token }: { token: ProcessedToken }) {
  const mintedPct = token.maxSupply > 0n
    ? Math.min(100, (Number(token.totalSupply) / Number(token.maxSupply)) * 100)
    : 0
  const price = getTokenPrice(token.bnbReserve, token.equityReserve)

  return (
    <Link href={`/tokens/${token.address}`} className="block group">
      <div className="bg-white border border-gray-200 hover:border-brand-300 hover:shadow-lg rounded-2xl p-5 transition-all h-full flex flex-col shadow-sm">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 border border-brand-100 flex items-center justify-center font-bold text-brand-700 text-xs">
              {token.symbol.slice(0, 3)}
            </div>
            <BNBChainIcon className="absolute -bottom-1 -right-1 w-4 h-4 shadow-sm rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{token.name}</h3>
              {token.industry && (
                <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full leading-none font-medium whitespace-nowrap">
                  {token.industry}
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs font-mono mt-0.5">{token.symbol} · {formatAddress(token.address)}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-bold text-gray-900 tabular-nums">{price}</p>
            <p className="text-gray-400 text-[10px]">BNB/token</p>
          </div>
        </div>

        {/* Summary */}
        {(token.aiSummary || token.description) && (
          <p className="text-gray-500 text-xs leading-relaxed mb-3 line-clamp-2">
            {token.aiSummary ?? token.description}
          </p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 text-[10px] mb-0.5">Pool BNB</p>
            <p className="text-gray-900 font-semibold tabular-nums">{formatBNB(token.bnbReserve)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-gray-400 text-[10px] mb-0.5">Pool Tokens</p>
            <p className="text-gray-900 font-semibold tabular-nums">{formatToken(token.equityReserve)}</p>
          </div>
        </div>

        {/* Compliance badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {token.kycRequired && (
            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">KYC</span>
          )}
          {token.limitOwnership && (
            <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-full font-medium">Cap</span>
          )}
          {token.upperCircuitPct > 0 && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full font-medium">±{token.upperCircuitPct}% CB</span>
          )}
        </div>

        {/* Minted progress */}
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
          <CircuitBreakerBadge circuitBroken={token.circuitBroken} haltedUntilBlock={token.haltedUntilBlock} />
          <span className="text-brand-600 text-xs font-semibold group-hover:text-brand-700 flex items-center gap-1">
            Trade <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

// ─── List card ────────────────────────────────────────────────────────────────

function ListCard({ token }: { token: ProcessedToken }) {
  const price = getTokenPrice(token.bnbReserve, token.equityReserve)
  const mintedPct = token.maxSupply > 0n
    ? Math.min(100, (Number(token.totalSupply) / Number(token.maxSupply)) * 100)
    : 0

  return (
    <Link href={`/tokens/${token.address}`} className="block group">
      <div className="bg-white border border-gray-200 hover:border-brand-300 hover:shadow-md rounded-2xl px-5 py-4 transition-all shadow-sm">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 border border-brand-100 flex items-center justify-center font-bold text-brand-700 text-sm">
              {token.symbol.slice(0, 3)}
            </div>
            <BNBChainIcon className="absolute -bottom-1 -right-1 w-4 h-4 shadow-sm rounded-full" />
          </div>

          {/* Name + tags */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="font-semibold text-gray-900 text-sm">{token.name}</span>
              <span className="text-gray-400 text-xs font-mono">{token.symbol}</span>
              {token.industry && (
                <span className="text-[10px] bg-brand-50 text-brand-700 border border-brand-100 px-1.5 py-0.5 rounded-full font-medium">
                  {token.industry}
                </span>
              )}
              {token.kycRequired && (
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">KYC</span>
              )}
              {token.limitOwnership && (
                <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded-full font-medium">Cap</span>
              )}
            </div>
            {(token.aiSummary || token.description) && (
              <p className="text-gray-500 text-xs leading-relaxed line-clamp-1">
                {token.aiSummary ?? token.description}
              </p>
            )}
            {!token.aiSummary && !token.description && (
              <p className="text-gray-400 text-xs font-mono">{formatAddress(token.address)}</p>
            )}
          </div>

          {/* Stats */}
          <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
            <div className="text-right">
              <p className="text-[10px] text-gray-400 mb-0.5">Price</p>
              <p className="text-sm font-bold text-gray-900 tabular-nums">{price} <span className="text-gray-400 font-normal text-xs">BNB</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 mb-0.5">Pool BNB</p>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatBNB(token.bnbReserve)}</p>
            </div>
            <div className="text-right w-24">
              <p className="text-[10px] text-gray-400 mb-1">Minted</p>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${mintedPct}%` }} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5 text-right">{mintedPct.toFixed(1)}%</p>
            </div>
          </div>

          {/* Status + CTA */}
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <CircuitBreakerBadge circuitBroken={token.circuitBroken} haltedUntilBlock={token.haltedUntilBlock} />
            <span className="text-brand-600 text-xs font-semibold group-hover:text-brand-700 flex items-center gap-0.5">
              Trade <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-gray-100" />
        <div className="flex-1">
          <div className="h-4 bg-gray-100 rounded w-28 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-16" />
        </div>
        <div className="h-5 bg-gray-100 rounded w-14" />
      </div>
      <div className="h-3 bg-gray-100 rounded w-full mb-2" />
      <div className="h-3 bg-gray-100 rounded w-3/4 mb-4" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 bg-gray-100 rounded-lg" />
        <div className="h-12 bg-gray-100 rounded-lg" />
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 animate-pulse shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-4 bg-gray-100 rounded w-40 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-64" />
        </div>
        <div className="hidden sm:flex gap-6">
          <div className="h-10 bg-gray-100 rounded w-20" />
          <div className="h-10 bg-gray-100 rounded w-20" />
        </div>
        <div className="h-6 bg-gray-100 rounded w-24 flex-shrink-0" />
      </div>
    </div>
  )
}

// ─── Main Companies Page ──────────────────────────────────────────────────────

export default function CompaniesPage() {
  const [search, setSearch]                     = useState('')
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set())
  const [selectedCompliance, setSelectedCompliance] = useState<Set<string>>(new Set())
  const [poolRange, setPoolRange]               = useState<PoolRange>('all')
  const [statusFilter, setStatusFilter]         = useState<StatusFilter>('all')
  const [sortBy, setSortBy]                     = useState<SortBy>('newest')
  const [viewMode, setViewMode]                 = useState<ViewMode>('grid')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [profiles, setProfiles]                 = useState<Map<string, CompanyProfile>>(new Map())
  const [profilesLoaded, setProfilesLoaded]     = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── On-chain data ────────────────────────────────────────────────────────

  const { data: countData, isLoading: countLoading } = useReadContract({
    address: CONTRACTS.EQUITY_EXCHANGE,
    abi: EQUITY_EXCHANGE_ABI,
    functionName: 'listedTokenCount',
  })
  const tokenCount = Number(countData ?? 0n)

  const { data: addressResults, isLoading: addressLoading } = useReadContracts({
    contracts: Array.from({ length: tokenCount }, (_, i) => ({
      address: CONTRACTS.EQUITY_EXCHANGE,
      abi: EQUITY_EXCHANGE_ABI,
      functionName: 'listedTokens' as const,
      args: [BigInt(i)] as [bigint],
    })),
    query: { enabled: tokenCount > 0 },
  })

  const addresses = useMemo(() =>
    (addressResults ?? [])
      .map((r) => r.result as `0x${string}` | undefined)
      .filter(Boolean) as `0x${string}`[],
    [addressResults]
  )

  // Batch-read 6 values per token: name, symbol, totalSupply, maxSupply, config, getPool
  const { data: tokenDataResults, isLoading: tokenDataLoading } = useReadContracts({
    contracts: addresses.flatMap((addr) => [
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'name'        as const },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'symbol'      as const },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'totalSupply' as const },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'maxSupply'   as const },
      { address: addr, abi: EQUITY_TOKEN_ABI, functionName: 'config'      as const },
      {
        address: CONTRACTS.EQUITY_EXCHANGE,
        abi: EQUITY_EXCHANGE_ABI,
        functionName: 'getPool' as const,
        args: [addr] as [`0x${string}`],
      },
    ]),
    allowFailure: true,
    query: { enabled: addresses.length > 0 },
  })

  // Build structured token objects from raw multicall results
  const tokens: ProcessedToken[] = useMemo(() => {
    if (!tokenDataResults || tokenDataResults.length === 0) return []
    return addresses.map((addr, i) => {
      const base = i * 6
      const name        = (tokenDataResults[base]?.result     as string | undefined) ?? addr.slice(0, 8)
      const symbol      = (tokenDataResults[base + 1]?.result as string | undefined) ?? '???'
      const totalSupply = (tokenDataResults[base + 2]?.result as bigint | undefined) ?? 0n
      const maxSupply   = (tokenDataResults[base + 3]?.result as bigint | undefined) ?? 0n
      const cfg         = tokenDataResults[base + 4]?.result as readonly [number, number, bigint, boolean, number, boolean, string] | undefined
      const pool        = tokenDataResults[base + 5]?.result as readonly [bigint, bigint, bigint, boolean, bigint, bigint] | undefined

      const profile = profiles.get(addr.toLowerCase())

      return {
        address: addr,
        name,
        symbol,
        totalSupply,
        maxSupply,
        equityReserve:    pool?.[0] ?? 0n,
        bnbReserve:       pool?.[1] ?? 0n,
        circuitBroken:    pool?.[3] ?? false,
        haltedUntilBlock: pool?.[4] ?? 0n,
        kycRequired:      cfg?.[5]  ?? false,
        limitOwnership:   cfg?.[3]  ?? false,
        upperCircuitPct:  cfg?.[0]  ?? 0,
        industry:    profile?.industry,
        aiSummary:   profile?.aiSummary,
        description: profile?.description,
        website:     profile?.website,
      }
    })
  }, [tokenDataResults, addresses, profiles])

  // ── Fetch profiles from API ──────────────────────────────────────────────

  useEffect(() => {
    if (addresses.length === 0) return
    setProfilesLoaded(false)
    Promise.all(
      addresses.map((addr) =>
        fetch(`/api/company-profile?address=${addr}`)
          .then((r) => r.json())
          .then((d) => [addr.toLowerCase(), d] as [string, CompanyProfile])
          .catch(() => [addr.toLowerCase(), null] as [string, null])
      )
    ).then((results) => {
      const map = new Map<string, CompanyProfile>()
      results.forEach(([addr, profile]) => {
        if (profile) map.set(addr, profile)
      })
      setProfiles(map)
      setProfilesLoaded(true)
    })
  }, [addresses.join(',')])

  // ── Derived: unique industries with counts ───────────────────────────────

  const industries = useMemo(() => {
    const counts = new Map<string, number>()
    tokens.forEach((t) => {
      if (t.industry) counts.set(t.industry, (counts.get(t.industry) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [tokens])

  // ── Filter + sort ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = tokens.filter((t) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.symbol.toLowerCase().includes(q) &&
          !(t.aiSummary ?? '').toLowerCase().includes(q) &&
          !(t.description ?? '').toLowerCase().includes(q) &&
          !(t.industry ?? '').toLowerCase().includes(q)
        ) return false
      }
      // Industry
      if (selectedIndustries.size > 0 && (!t.industry || !selectedIndustries.has(t.industry))) return false
      // Compliance
      if (selectedCompliance.size > 0) {
        const matches = Array.from(selectedCompliance).some((c) => {
          switch (c) {
            case 'kyc':           return t.kycRequired
            case 'no-kyc':        return !t.kycRequired
            case 'ownership-cap': return t.limitOwnership
            case 'open':          return !t.kycRequired && !t.limitOwnership
            default: return false
          }
        })
        if (!matches) return false
      }
      // Pool size
      if (!bnbInRange(t.bnbReserve, poolRange)) return false
      // Status
      if (statusFilter === 'active' && t.circuitBroken) return false
      if (statusFilter === 'halted' && !t.circuitBroken) return false
      return true
    })

    // Sort
    switch (sortBy) {
      case 'liquidity':
        result = [...result].sort((a, b) =>
          b.bnbReserve > a.bnbReserve ? 1 : b.bnbReserve < a.bnbReserve ? -1 : 0
        )
        break
      case 'price-desc':
        result = [...result].sort((a, b) => {
          const pa = a.equityReserve > 0n ? Number(a.bnbReserve) / Number(a.equityReserve) : 0
          const pb = b.equityReserve > 0n ? Number(b.bnbReserve) / Number(b.equityReserve) : 0
          return pb - pa
        })
        break
      case 'price-asc':
        result = [...result].sort((a, b) => {
          const pa = a.equityReserve > 0n ? Number(a.bnbReserve) / Number(a.equityReserve) : 0
          const pb = b.equityReserve > 0n ? Number(b.bnbReserve) / Number(b.equityReserve) : 0
          return pa - pb
        })
        break
      case 'newest':
      default:
        result = [...result].reverse()
    }
    return result
  }, [tokens, search, selectedIndustries, selectedCompliance, poolRange, statusFilter, sortBy])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleIndustry = (industry: string) =>
    setSelectedIndustries((prev) => {
      const next = new Set(prev)
      next.has(industry) ? next.delete(industry) : next.add(industry)
      return next
    })

  const toggleCompliance = (c: string) =>
    setSelectedCompliance((prev) => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })

  const clearAllFilters = () => {
    setSearch('')
    setSelectedIndustries(new Set())
    setSelectedCompliance(new Set())
    setPoolRange('all')
    setStatusFilter('all')
    searchRef.current && (searchRef.current.value = '')
  }

  const activeFilterCount =
    selectedIndustries.size +
    selectedCompliance.size +
    (poolRange !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0)

  const isLoading = countLoading || addressLoading || tokenDataLoading
  const isEmpty   = !isLoading && tokens.length === 0

  // ── Render ────────────────────────────────────────────────────────────────

  const filterProps: FilterProps = {
    industries, selectedIndustries, toggleIndustry,
    selectedCompliance, toggleCompliance,
    poolRange, setPoolRange,
    statusFilter, setStatusFilter,
    profilesLoaded,
  }

  return (
    <div className="min-h-screen">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
            <Link href="/" className="hover:text-gray-600 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">Companies</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">All Companies</h1>
              <p className="text-gray-500 text-sm flex items-center gap-2">
                <BNBChainIcon className="w-4 h-4 inline-block" />
                Tokenised equity on BNB Smart Chain
                {!isLoading && (
                  <span className="text-gray-300">·</span>
                )}
                {!isLoading && (
                  <span className="tabular-nums">{tokens.length} listed</span>
                )}
              </p>
            </div>
            <Link
              href="/list"
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-all shadow-sm shadow-brand-500/20"
            >
              <span className="text-base leading-none">+</span> List Your Company
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ── Search + controls row ──────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search by name, symbol, or industry…"
              defaultValue={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 shadow-sm"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="appearance-none bg-white border border-gray-200 rounded-xl pl-3.5 pr-8 py-2.5 text-sm text-gray-700 font-medium focus:outline-none focus:border-brand-400 shadow-sm cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="liquidity">Highest Liquidity</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="price-asc">Price: Low → High</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* View toggle */}
          <div className="hidden sm:flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <GridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden relative flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 shadow-sm"
          >
            <SlidersIcon className="w-4 h-4 text-gray-500" />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Layout: sidebar + results ──────────────────────────────── */}
        <div className="flex gap-6 items-start">

          {/* ── Desktop sidebar ──────────────────────────────────────── */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-24 bg-white border border-gray-200 rounded-2xl px-5 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Clear all ({activeFilterCount})
                  </button>
                )}
              </div>
              <FilterContent {...filterProps} />
            </div>
          </aside>

          {/* ── Results area ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {/* Active filter chips */}
            <ActiveFilters
              selectedIndustries={selectedIndustries} toggleIndustry={toggleIndustry}
              selectedCompliance={selectedCompliance} toggleCompliance={toggleCompliance}
              poolRange={poolRange} setPoolRange={setPoolRange}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              onClearAll={clearAllFilters}
            />

            {/* Result count */}
            {!isLoading && tokens.length > 0 && (
              <p className="text-sm text-gray-500 mb-4">
                Showing <span className="font-semibold text-gray-800">{filtered.length}</span>
                {' '}of <span className="font-semibold text-gray-800">{tokens.length}</span> compan{tokens.length === 1 ? 'y' : 'ies'}
              </p>
            )}

            {/* Loading skeletons */}
            {isLoading && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => <GridSkeleton key={i} />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <ListSkeleton key={i} />)}
                </div>
              )
            )}

            {/* Empty: no tokens listed at all */}
            {isEmpty && (
              <div className="border border-dashed border-gray-200 rounded-2xl py-20 text-center bg-white shadow-sm">
                <div className="text-4xl mb-4">🏢</div>
                <p className="text-gray-900 font-semibold text-lg mb-2">No companies listed yet</p>
                <p className="text-gray-500 text-sm mb-8 max-w-xs mx-auto">
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

            {/* Empty: filters too restrictive */}
            {!isLoading && tokens.length > 0 && filtered.length === 0 && (
              <div className="border border-dashed border-gray-200 rounded-2xl py-16 text-center bg-white shadow-sm">
                <div className="text-3xl mb-3">🔍</div>
                <p className="text-gray-900 font-semibold mb-2">No companies match your filters</p>
                <p className="text-gray-500 text-sm mb-5">Try adjusting or clearing some filters</p>
                <button
                  onClick={clearAllFilters}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-all"
                >
                  Clear all filters
                </button>
              </div>
            )}

            {/* Results */}
            {!isLoading && filtered.length > 0 && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtered.map((token) => <GridCard key={token.address} token={token} />)}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((token) => <ListCard key={token.address} token={token} />)}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile filter drawer ─────────────────────────────────────────── */}
      {mobileFiltersOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileFiltersOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl lg:hidden max-h-[85vh] flex flex-col">
            {/* Drawer handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="font-semibold text-gray-900">Filters</span>
              <div className="flex items-center gap-3">
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="text-sm text-brand-600 font-medium">
                    Clear all
                  </button>
                )}
                <button onClick={() => setMobileFiltersOpen(false)} className="p-1">
                  <XIcon className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            {/* Filter content */}
            <div className="overflow-y-auto flex-1 px-5">
              <FilterContent {...filterProps} />
            </div>
            {/* Apply button */}
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-sm"
              >
                Show {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
