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

interface RegItem {
  id: string
  label: string
  value: string
  status: 'active' | 'inactive' | 'info'
  explanation: string
  impact: string
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function RegulationsPanel({ config }: { config: Config }) {
  const [open, setOpen] = useState<string | null>(null)

  const items: RegItem[] = [
    {
      id: 'upper-circuit',
      label: 'Upper Circuit Breaker',
      value: config.upperCircuitPct > 0 ? `+${config.upperCircuitPct}% limit` : 'Disabled',
      status: config.upperCircuitPct > 0 ? 'active' : 'inactive',
      explanation:
        'Trading is automatically halted when the token price rises more than this percentage within a 24-hour window. This prevents runaway pump-and-dump activity.',
      impact:
        config.upperCircuitPct > 0
          ? `If price rises ${config.upperCircuitPct}% in any 24-hour window, trading pauses for ${config.circuitHaltBlocks.toString()} blocks (~${Math.round(Number(config.circuitHaltBlocks) * 3 / 60)} min on BSC).`
          : 'No upper price limit is enforced. Price can rise freely without an automatic halt.',
    },
    {
      id: 'lower-circuit',
      label: 'Lower Circuit Breaker',
      value: config.lowerCircuitPct > 0 ? `-${config.lowerCircuitPct}% floor` : 'Disabled',
      status: config.lowerCircuitPct > 0 ? 'active' : 'inactive',
      explanation:
        'Trading halts if the price drops more than this percentage in a 24-hour window. Protects investors from panic-sell cascades.',
      impact:
        config.lowerCircuitPct > 0
          ? `If price drops ${config.lowerCircuitPct}% in any 24-hour window, trading pauses for ${config.circuitHaltBlocks.toString()} blocks.`
          : 'No lower price limit. Price can fall freely without a halt.',
    },
    {
      id: 'kyc',
      label: 'KYC Verification',
      value: config.kycRequired ? 'Required' : 'Not required',
      status: config.kycRequired ? 'active' : 'info',
      explanation:
        'KYC (Know Your Customer) restricts trading to verified wallets approved by the designated KYC registry. The founder sets the KYC provider at launch.',
      impact: config.kycRequired
        ? 'Your wallet must be KYC-verified to buy or receive this token. Contact the issuer if you need verification.'
        : 'Anyone can trade this token without identity verification.',
    },
    {
      id: 'ownership-cap',
      label: 'Ownership Cap',
      value: config.limitOwnership ? `Max ${config.maxOwnershipPct}% per wallet` : 'No cap',
      status: config.limitOwnership ? 'active' : 'info',
      explanation:
        'Limits the maximum percentage of total supply any single wallet can hold. Prevents whale concentration and promotes distributed ownership.',
      impact: config.limitOwnership
        ? `No single wallet can hold more than ${config.maxOwnershipPct}% of the total token supply. Buying beyond this limit will fail.`
        : 'Any wallet can accumulate any amount of tokens — no per-wallet limit enforced.',
    },
    {
      id: 'fee-tiers',
      label: 'Fee Tiers',
      value: '0.02% – 0.45%',
      status: 'info',
      explanation:
        "Sell fees depend on how long you've held. Long-term holders (≥6 months) are rewarded with a significantly lower fee. 80% of all fees go to liquidity providers; 20% goes to the protocol.",
      impact:
        'Short-term (< 6 months): 0.45% fee on sells. Long-term (≥ 6 months): 0.02% fee on sells. This applies to every token on the platform equally.',
    },
  ]

  const statusStyles: Record<RegItem['status'], { dot: string; badge: string }> = {
    active: { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    inactive: { dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
    info: { dot: 'bg-brand-500', badge: 'bg-brand-50 text-brand-700 border-brand-200' },
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-1 text-sm">Regulations & Rules</h3>
      <p className="text-xs text-gray-400 mb-4">Click any rule to learn more</p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const isOpen = open === item.id
          const styles = statusStyles[item.status]
          return (
            <div key={item.id} className="rounded-lg border border-gray-200 overflow-hidden">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                onClick={() => setOpen(isOpen ? null : item.id)}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                <span className="text-gray-700 text-sm flex-1 font-medium">{item.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${styles.badge}`}>{item.value}</span>
                <ChevronDown open={isOpen} />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-0 bg-gray-50 border-t border-gray-200 space-y-2">
                  <p className="text-gray-600 text-xs leading-relaxed pt-2.5">{item.explanation}</p>
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                    <span className="text-gray-400 font-semibold uppercase tracking-wide text-[10px]">Impact: </span>
                    <span className="text-gray-700">{item.impact}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
