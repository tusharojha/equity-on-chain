'use client'

import { useState, useEffect, useCallback } from 'react'

interface TradePoint {
  block: number
  price: number
  type: 'buy' | 'sell'
}

interface Props {
  tokenAddress: `0x${string}`
  // Optional: bump this to force a re-fetch (e.g. after a trade confirms)
  refreshKey?: number
}

const VW = 560
const VH = 150
const PAD = { top: 10, right: 12, bottom: 26, left: 60 }
const CW = VW - PAD.left - PAD.right
const CH = VH - PAD.top - PAD.bottom

function toX(block: number, firstBlock: number, blockRange: number): number {
  return PAD.left + ((block - firstBlock) / blockRange) * CW
}
function toY(price: number, minP: number, range: number): number {
  return PAD.top + (1 - (price - minP) / range) * CH
}

export function PriceChart({ tokenAddress, refreshKey }: Props) {
  const [points, setPoints] = useState<TradePoint[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/trade-events?token=${tokenAddress}`)
      if (!res.ok) throw new Error('fetch failed')
      const data: TradePoint[] = await res.json()
      setPoints(data)
    } catch {
      // silently keep stale data — chart just won't update
    } finally {
      setLoading(false)
    }
  }, [tokenAddress])

  // Fetch on mount and whenever refreshKey changes (parent signals a new trade)
  useEffect(() => {
    setLoading(true)
    load()
  }, [load, refreshKey])

  // Passive background poll every 20 s so chart stays live without a refresh
  useEffect(() => {
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="h-4 bg-gray-100 rounded w-28 mb-3 animate-pulse" />
        <div className="h-36 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }

  if (points.length < 2) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 text-sm mb-2">Price History</h3>
        <div className="h-36 flex flex-col items-center justify-center gap-1 border border-dashed border-gray-200 rounded-lg px-4">
          <p className="text-gray-400 text-sm">No trades recorded yet</p>
          <p className="text-gray-300 text-xs">Chart appears after 2 trades are made on this platform</p>
        </div>
      </div>
    )
  }

  const prices = points.map((p) => p.price)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const range = maxP - minP || maxP * 0.05 || 1e-9

  const firstBlock = points[0].block
  const lastBlock = points[points.length - 1].block
  const blockRange = lastBlock - firstBlock || 1

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.block, firstBlock, blockRange).toFixed(1)},${toY(p.price, minP, range).toFixed(1)}`)
    .join(' ')
  const fillD = `${pathD} L${toX(lastBlock, firstBlock, blockRange).toFixed(1)},${(PAD.top + CH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + CH).toFixed(1)} Z`

  const current = prices[prices.length - 1]
  const first = prices[0]
  const pct = ((current - first) / first) * 100
  const up = pct >= 0
  const color = up ? '#00b386' : '#ef4444'

  const yLabels = [0, 0.5, 1].map((f) => ({
    y: PAD.top + f * CH,
    val: maxP - f * range,
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Price History</h3>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${up ? 'text-brand-600' : 'text-red-500'}`}>
            {up ? '+' : ''}{pct.toFixed(2)}%
          </span>
          <span className="text-xs text-gray-400">{points.length} trade{points.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${tokenAddress.slice(2, 10)}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines + Y labels */}
        {yLabels.map(({ y, val }) => (
          <g key={y}>
            <line x1={PAD.left} x2={VW - PAD.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PAD.left - 5} y={y + 3.5} textAnchor="end" fontSize="8" fill="#9ca3af">
              {val < 0.0001 ? val.toExponential(2) : val.toFixed(6)}
            </text>
          </g>
        ))}

        {/* Fill area */}
        <path d={fillD} fill={`url(#grad-${tokenAddress.slice(2, 10)})`} />

        {/* Price line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Last point dot */}
        {(() => {
          const last = points[points.length - 1]
          return (
            <circle
              cx={toX(last.block, firstBlock, blockRange)}
              cy={toY(last.price, minP, range)}
              r="3"
              fill={color}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          )
        })()}

        {/* X-axis labels */}
        {[0, 1].map((f) => (
          <text
            key={f}
            x={PAD.left + f * CW}
            y={VH - 6}
            textAnchor={f === 0 ? 'start' : 'end'}
            fontSize="8"
            fill="#6b7280"
          >
            #{(firstBlock + f * blockRange).toLocaleString()}
          </text>
        ))}
      </svg>

      <p className="text-xs text-gray-400 mt-1">recorded via platform trades</p>
    </div>
  )
}
