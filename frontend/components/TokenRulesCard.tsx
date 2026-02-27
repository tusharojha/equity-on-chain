'use client'

import { useState } from 'react'

interface Config {
  upperCircuitPct: number
  lowerCircuitPct: number
  circuitHaltBlocks: bigint
  limitOwnership: boolean
  maxOwnershipPct: number
  kycRequired: boolean
}

interface Props {
  config: Config
  symbol: string
}

interface Rule {
  icon: React.ReactNode
  title: string
  status: string
  statusStyle: string
  summary: string
  detail: string
}

const ShieldIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const CircuitIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const KycIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
    <polyline points="16 11 17.5 13 21 10" />
  </svg>
)

const CapIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

const FeeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export function TokenRulesCard({ config, symbol }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [openRule, setOpenRule] = useState<number | null>(null)

  const hasCircuit = config.upperCircuitPct > 0 || config.lowerCircuitPct > 0
  const haltMins = Math.round(Number(config.circuitHaltBlocks) * 3 / 60)

  const rules: Rule[] = [
    {
      icon: <CircuitIcon />,
      title: 'Circuit Breaker',
      status: hasCircuit ? `±${Math.max(config.upperCircuitPct, config.lowerCircuitPct)}% limit` : 'Off',
      statusStyle: hasCircuit
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-gray-100 text-gray-500 border-gray-200',
      summary: hasCircuit
        ? `Trading pauses if price moves more than ${Math.max(config.upperCircuitPct, config.lowerCircuitPct)}% in 24h`
        : 'No automatic trading halt — price can move freely',
      detail: hasCircuit
        ? `Upper limit: +${config.upperCircuitPct}% · Lower limit: -${config.lowerCircuitPct}%. When triggered, trading is paused for ${config.circuitHaltBlocks.toString()} blocks (~${haltMins > 0 ? `${haltMins} min` : `<1 min`} on BSC). This protects investors from sudden pump-and-dump events.`
        : 'This token has no circuit breaker. Price discovery is entirely market-driven with no automatic halts.',
    },
    {
      icon: <KycIcon />,
      title: 'KYC Verification',
      status: config.kycRequired ? 'Required' : 'Open',
      statusStyle: config.kycRequired
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : 'bg-gray-100 text-gray-500 border-gray-200',
      summary: config.kycRequired
        ? 'Only KYC-verified wallets can buy or receive this token'
        : 'Anyone can trade — no identity verification required',
      detail: config.kycRequired
        ? 'Your wallet must be approved by the issuer\'s KYC registry before you can buy or receive this token. This is common for regulated equity offerings. Contact the token issuer to get verified.'
        : 'This token is open to all — no wallet verification is needed. Anyone with a BSC wallet can buy, sell, or hold.',
    },
    {
      icon: <CapIcon />,
      title: 'Ownership Cap',
      status: config.limitOwnership ? `Max ${config.maxOwnershipPct}%` : 'None',
      statusStyle: config.limitOwnership
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-gray-100 text-gray-500 border-gray-200',
      summary: config.limitOwnership
        ? `No wallet can hold more than ${config.maxOwnershipPct}% of total ${symbol} supply`
        : 'No per-wallet holding limit — any amount can be accumulated',
      detail: config.limitOwnership
        ? `A single wallet cannot own more than ${config.maxOwnershipPct}% of the total ${symbol} supply. Purchases that would exceed this limit will be reverted. This rule prevents whale concentration and promotes distributed ownership.`
        : 'There is no limit on how much a single wallet can hold. This means a single investor could accumulate a large share of the token.',
    },
    {
      icon: <FeeIcon />,
      title: 'Sell Fee Tiers',
      status: '0.02% – 0.45%',
      statusStyle: 'bg-brand-50 text-brand-700 border-brand-200',
      summary: 'Long-term holders pay a 96% lower sell fee — hold ≥6 months for 0.02%',
      detail: 'Short-term (held < 6 months): 0.45% fee on every sell. Long-term (held ≥ 6 months): only 0.02%. 80% of all fees go to liquidity providers; 20% to the protocol. No fee on buys. This applies equally to all tokens on EquityOnChain.',
    },
  ]

  // Status dot for collapsed view
  const activePills = rules.filter((r) => r.status !== 'Off' && r.status !== 'None' && r.status !== 'Open')

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
            <ShieldIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Security Rules</p>
            <p className="text-xs text-gray-400">{activePills.length} protection{activePills.length !== 1 ? 's' : ''} active</p>
          </div>
        </div>
        <ChevronIcon open={expanded} />
      </button>

      {/* Collapsed pills preview */}
      {!expanded && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {rules.map((rule) => (
            <span
              key={rule.title}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${rule.statusStyle}`}
            >
              {rule.title.split(' ')[0]}: {rule.status}
            </span>
          ))}
        </div>
      )}

      {/* Expanded — detailed rule rows */}
      {expanded && (
        <div className="border-t border-gray-100">
          {rules.map((rule, i) => {
            const isOpen = openRule === i
            return (
              <div key={rule.title} className={`${i < rules.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <button
                  onClick={() => setOpenRule(isOpen ? null : i)}
                  className="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${rule.statusStyle}`}>
                    {rule.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-medium text-gray-900">{rule.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${rule.statusStyle}`}>
                        {rule.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{rule.summary}</p>
                  </div>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 pt-0 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-600 leading-relaxed pt-3">{rule.detail}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
