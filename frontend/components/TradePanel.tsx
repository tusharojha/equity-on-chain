'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBlockNumber, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS, CHAIN_CONSTANTS, EXPLORER_URL } from '@/lib/contracts'
import {
  parseBNB, parseToken, formatBNB, formatToken,
  getBuyQuote, getSellQuote, getPriceImpact,
  isShortTermHolder, mapContractError,
} from '@/lib/utils'
import { CircuitBreakerBadge } from './CircuitBreakerBadge'

interface Props {
  tokenAddress: `0x${string}`
  symbol: string
  pool: { equityReserve: bigint; bnbReserve: bigint; circuitBroken: boolean; haltedUntilBlock: bigint }
  onTradeConfirmed?: () => void
}

type Tab = 'buy' | 'sell'

export function TradePanel({ tokenAddress, symbol, pool, onTradeConfirmed }: Props) {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState('1')
  const [txError, setTxError] = useState('')
  const [lastTxType, setLastTxType] = useState<'approve' | 'trade' | null>(null)
  // Captures computed price at the moment the trade button is clicked (pre-tx)
  const pendingPriceRef = useRef<{ price: number; type: Tab } | null>(null)

  const { data: currentBlock } = useBlockNumber({ watch: true })
  const { data: bnbBalance } = useBalance({ address })

  const { data: tokenData, refetch: refetchToken } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'balanceOf', args: [address ?? '0x0'] },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'allowance', args: [address ?? '0x0', CONTRACTS.EQUITY_EXCHANGE] },
    ],
    query: { enabled: !!address },
  })
  const tokenBalance = (tokenData?.[0]?.result as bigint | undefined) ?? 0n
  const allowance    = (tokenData?.[1]?.result as bigint | undefined) ?? 0n

  const { data: holdRecord } = useReadContract({
    address: CONTRACTS.EQUITY_EXCHANGE,
    abi: EQUITY_EXCHANGE_ABI,
    functionName: 'getHoldRecord',
    args: [tokenAddress, address ?? '0x0'],
    query: { enabled: !!address && tab === 'sell' },
  })
  const weightedBlockSum = (holdRecord as [bigint, bigint] | undefined)?.[0] ?? 0n
  const holdAmount       = (holdRecord as [bigint, bigint] | undefined)?.[1] ?? 0n

  const shortTerm = useMemo(() => {
    if (!currentBlock) return true
    return isShortTermHolder(weightedBlockSum, holdAmount, currentBlock)
  }, [weightedBlockSum, holdAmount, currentBlock])

  // Effective circuit breaker: broken in storage but halt period may have expired
  const haltExpired = pool.circuitBroken && currentBlock != null && pool.haltedUntilBlock > 0n && currentBlock >= pool.haltedUntilBlock
  const effectiveCircuitBroken = pool.circuitBroken && !haltExpired

  const feeBps = shortTerm ? CHAIN_CONSTANTS.SHORT_TERM_FEE_BPS : CHAIN_CONSTANTS.LONG_TERM_FEE_BPS

  const amountBig = useMemo(() => {
    try { return tab === 'buy' ? parseBNB(amount) : parseToken(amount) }
    catch { return 0n }
  }, [amount, tab])

  const quote = useMemo(() => {
    if (tab === 'buy') {
      return { out: getBuyQuote(amountBig, pool.bnbReserve, pool.equityReserve), fee: 0n }
    } else {
      const { bnbOut, fee } = getSellQuote(amountBig, pool.equityReserve, pool.bnbReserve, feeBps)
      return { out: bnbOut, fee }
    }
  }, [amountBig, tab, pool, feeBps])

  const priceImpact = useMemo(() => {
    const reserveIn = tab === 'buy' ? pool.bnbReserve : pool.equityReserve
    return getPriceImpact(amountBig, reserveIn)
  }, [amountBig, tab, pool])

  const slippagePct = parseFloat(slippage || '1') / 100
  const minOut = quote.out === 0n ? 0n : (quote.out * BigInt(Math.floor((1 - slippagePct) * 10_000))) / 10_000n

  const needsApproval = tab === 'sell' && amountBig > 0n && allowance < amountBig

  const { writeContract, data: txHash, isPending: isSigning, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const loading = isSigning || isConfirming

  // Auto-refetch token data (balance + allowance) whenever a tx confirms.
  // If it was a trade (not approval), record the price and notify parent to refresh chart.
  useEffect(() => {
    if (!isSuccess) return
    refetchToken()
    if (lastTxType === 'trade' && pendingPriceRef.current) {
      const { price, type } = pendingPriceRef.current
      pendingPriceRef.current = null
      fetch('/api/trade-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenAddress,
          block: Number(currentBlock ?? 0n),
          price,
          type,
        }),
      }).catch(() => {})
      onTradeConfirmed?.()
    }
  }, [isSuccess])

  const handleTrade = async () => {
    setTxError('')
    try {
      if (tab === 'buy') {
        // Price = BNB paid / tokens received (use quote estimate)
        if (quote.out > 0n) {
          pendingPriceRef.current = { price: Number(amountBig) / Number(quote.out), type: 'buy' }
        }
        setLastTxType('trade')
        writeContract({
          address: CONTRACTS.EQUITY_EXCHANGE,
          abi: EQUITY_EXCHANGE_ABI,
          functionName: 'buyTokens',
          args: [tokenAddress, minOut],
          value: amountBig,
        })
      } else {
        if (needsApproval) {
          setLastTxType('approve')
          writeContract({
            address: tokenAddress,
            abi: EQUITY_TOKEN_ABI,
            functionName: 'approve',
            args: [CONTRACTS.EQUITY_EXCHANGE, amountBig],
          })
        } else {
          // Price = gross BNB (before fee) / tokens sold
          if (amountBig > 0n) {
            pendingPriceRef.current = { price: Number(quote.out + quote.fee) / Number(amountBig), type: 'sell' }
          }
          setLastTxType('trade')
          writeContract({
            address: CONTRACTS.EQUITY_EXCHANGE,
            abi: EQUITY_EXCHANGE_ABI,
            functionName: 'sellTokens',
            args: [tokenAddress, amountBig, minOut],
          })
        }
      }
    } catch (e: unknown) {
      setTxError(mapContractError(e as Error))
    }
  }

  const handleSuccess = () => {
    setAmount('')
    setTxError('')
    setLastTxType(null)
    reset()
    refetchToken()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-gray-900">Trade</h2>
        <CircuitBreakerBadge circuitBroken={pool.circuitBroken} haltedUntilBlock={pool.haltedUntilBlock} />
      </div>

      {/* Buy / Sell tab */}
      <div className="flex rounded-lg bg-gray-100 p-1 mb-5">
        {(['buy', 'sell'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setAmount(''); setTxError(''); reset() }}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
              tab === t
                ? t === 'buy'
                  ? 'bg-green-500 text-white shadow-sm'
                  : 'bg-red-500 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-gray-500 font-medium">
            {tab === 'buy' ? 'You pay (BNB)' : `You sell (${symbol})`}
          </label>
          <button
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            onClick={() => {
              if (tab === 'buy' && bnbBalance) {
                setAmount(formatUnits(bnbBalance.value, 18).replace(/\.?0+$/, ''))
              } else {
                setAmount(formatUnits(tokenBalance, 18).replace(/\.?0+$/, ''))
              }
            }}
          >
            Max
          </button>
        </div>
        <div className="relative">
          <input
            type="number"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setTxError('') }}
            className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-lg placeholder-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">
            {tab === 'buy' ? 'BNB' : symbol}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Balance:{' '}
          {tab === 'buy'
            ? `${formatBNB(bnbBalance?.value ?? 0n)} BNB`
            : `${formatToken(tokenBalance)} ${symbol}${pool.equityReserve > 0n && tokenBalance > 0n ? ` ≈ ${formatBNB((tokenBalance * pool.bnbReserve) / pool.equityReserve)} BNB` : ''}`}
        </p>
      </div>

      {/* Quote */}
      {amountBig > 0n && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">You receive</span>
            <span className="text-gray-900 font-semibold">
              {tab === 'buy'
                ? `${formatToken(quote.out)} ${symbol}`
                : `${formatBNB(quote.out)} BNB`}
            </span>
          </div>
          {tab === 'sell' && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">Fee tier</span>
                <span className={shortTerm ? 'text-amber-600 font-medium' : 'text-brand-600 font-medium'}>
                  {shortTerm ? 'Short-term (0.45%)' : 'Long-term (0.02%)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Fee</span>
                <span className="text-gray-600">{formatBNB(quote.fee)} BNB</span>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Price impact</span>
            <span className={parseFloat(priceImpact) > 10 ? 'text-red-500 font-medium' : parseFloat(priceImpact) > 5 ? 'text-amber-500 font-medium' : 'text-gray-600'}>
              {priceImpact}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Min. received</span>
            <span className="text-gray-600">
              {tab === 'buy'
                ? `${formatToken(minOut)} ${symbol}`
                : `${formatBNB(minOut)} BNB`}
            </span>
          </div>
        </div>
      )}

      {/* Slippage */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400 font-medium">Slippage</span>
        {['0.5', '1', '2'].map((s) => (
          <button
            key={s}
            onClick={() => setSlippage(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
              slippage === s
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            {s}%
          </button>
        ))}
        <input
          type="number"
          placeholder="custom"
          value={!['0.5', '1', '2'].includes(slippage) ? slippage : ''}
          onChange={(e) => setSlippage(e.target.value)}
          className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:border-brand-400"
        />
      </div>

      {/* Error */}
      {txError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
          {txError}
        </div>
      )}

      {/* Success */}
      {isSuccess && (
        <div className={`border rounded-xl px-4 py-3 mb-4 text-sm space-y-2 ${lastTxType === 'approve' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
          <div className={`flex items-center justify-between font-medium ${lastTxType === 'approve' ? 'text-blue-700' : 'text-green-700'}`}>
            <span>{lastTxType === 'approve' ? `${symbol} approved! Click "Sell Tokens" to continue.` : 'Transaction confirmed!'}</span>
            <button onClick={handleSuccess} className="underline text-xs opacity-70">Dismiss</button>
          </div>
          {txHash && (
            <a
              href={`${EXPLORER_URL}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              View on BSCScan ↗
            </a>
          )}
        </div>
      )}

      {/* CTA */}
      {!isConnected ? (
        <p className="text-center text-gray-400 text-sm py-2">Connect wallet to trade</p>
      ) : effectiveCircuitBroken ? (
        <button disabled className="w-full py-3 rounded-xl bg-red-50 border border-red-200 text-red-600 font-medium cursor-not-allowed text-sm">
          Circuit Breaker Active — Trading Paused
        </button>
      ) : (
        <button
          onClick={handleTrade}
          disabled={loading || amountBig === 0n}
          className={`w-full py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm ${
            tab === 'buy'
              ? 'bg-green-500 hover:bg-green-600 shadow-green-200'
              : 'bg-red-500 hover:bg-red-600 shadow-red-200'
          }`}
        >
          {loading
            ? isConfirming ? 'Confirming…' : 'Signing…'
            : needsApproval
              ? `Approve ${symbol}`
              : tab === 'buy' ? 'Buy Tokens' : 'Sell Tokens'}
        </button>
      )}
    </div>
  )
}
