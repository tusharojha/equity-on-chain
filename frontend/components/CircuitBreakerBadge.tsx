'use client'

import { useBlockNumber } from 'wagmi'

const BSC_BLOCK_SECS = 3 // BSC testnet ≈ 3 s/block

function secToHuman(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

interface Props {
  circuitBroken: boolean
  haltedUntilBlock: bigint
}

export function CircuitBreakerBadge({ circuitBroken, haltedUntilBlock }: Props) {
  const { data: currentBlock } = useBlockNumber({ watch: true })

  // Not broken at all
  if (!circuitBroken) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Trading Active
      </span>
    )
  }

  // circuitBroken = true from contract storage
  const blocksLeft = currentBlock != null
    ? haltedUntilBlock > currentBlock ? haltedUntilBlock - currentBlock : 0n
    : null

  const haltExpired = blocksLeft === 0n
  const secsLeft = blocksLeft != null && blocksLeft > 0n ? Number(blocksLeft) * BSC_BLOCK_SECS : null

  // Halt period has expired — trading is fully allowed again
  // (contract storage still says circuitBroken=true until 24h window resets naturally)
  if (haltExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Trading Active
      </span>
    )
  }

  // Still within halt period — show exact time + block
  return (
    <div className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        Circuit Breaker — Trading Paused
      </span>
      {secsLeft != null && (
        <span className="text-xs text-red-600 pl-1 font-medium">
          Resumes in ~{secToHuman(secsLeft)} · block #{haltedUntilBlock.toString()}
        </span>
      )}
    </div>
  )
}
