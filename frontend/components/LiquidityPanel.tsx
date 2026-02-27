'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, CONTRACTS, EXPLORER_URL } from '@/lib/contracts'
import { parseBNB, parseToken, formatBNB, formatToken, mapContractError } from '@/lib/utils'

interface Props {
  tokenAddress: `0x${string}`
  symbol: string
  pool: { equityReserve: bigint; bnbReserve: bigint; totalLPShares: bigint; circuitBroken: boolean }
}

type Tab = 'add' | 'remove'

export function LiquidityPanel({ tokenAddress, symbol, pool }: Props) {
  const { address, isConnected } = useAccount()
  const [tab, setTab]           = useState<Tab>('add')
  const [bnbIn, setBnbIn]       = useState('')
  const [lpAmount, setLpAmount] = useState('')
  const [txError, setTxError]   = useState('')
  const [lastTxType, setLastTxType] = useState<'approve' | 'lp' | null>(null)

  const { data: bnbBalance } = useBalance({ address })

  const { data: accountData, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'balanceOf', args: [address ?? '0x0'] },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'allowance', args: [address ?? '0x0', CONTRACTS.EQUITY_EXCHANGE] },
      { address: CONTRACTS.EQUITY_EXCHANGE, abi: EQUITY_EXCHANGE_ABI, functionName: 'getLPShares', args: [tokenAddress, address ?? '0x0'] },
    ],
    query: { enabled: !!address },
  })

  const tokenBalance = (accountData?.[0]?.result as bigint | undefined) ?? 0n
  const allowance    = (accountData?.[1]?.result as bigint | undefined) ?? 0n
  const lpShares     = (accountData?.[2]?.result as bigint | undefined) ?? 0n

  const bnbBig = useMemo(() => parseBNB(bnbIn), [bnbIn])
  const equityNeeded = useMemo(() => {
    if (pool.bnbReserve === 0n || bnbBig === 0n) return 0n
    return (bnbBig * pool.equityReserve) / pool.bnbReserve
  }, [bnbBig, pool])

  const lpToReceive = useMemo(() => {
    if (pool.totalLPShares === 0n || pool.equityReserve === 0n || equityNeeded === 0n) return 0n
    return (equityNeeded * pool.totalLPShares) / pool.equityReserve
  }, [equityNeeded, pool])

  const lpBig = useMemo(() => parseToken(lpAmount), [lpAmount])
  const withdrawPreview = useMemo(() => {
    if (pool.totalLPShares === 0n || lpBig === 0n) return { equity: 0n, bnb: 0n }
    return {
      equity: (lpBig * pool.equityReserve) / pool.totalLPShares,
      bnb:    (lpBig * pool.bnbReserve)    / pool.totalLPShares,
    }
  }, [lpBig, pool])

  const needsApproval = tab === 'add' && equityNeeded > 0n && allowance < equityNeeded

  const { writeContract, data: txHash, isPending: isSigning, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const loading = isSigning || isConfirming

  // Auto-refetch after every confirmed tx (catches allowance update after approve)
  useEffect(() => {
    if (isSuccess) refetch()
  }, [isSuccess])

  const handleSubmit = () => {
    setTxError('')
    try {
      if (tab === 'add') {
        if (needsApproval) {
          setLastTxType('approve')
          writeContract({
            address: tokenAddress,
            abi: EQUITY_TOKEN_ABI,
            functionName: 'approve',
            args: [CONTRACTS.EQUITY_EXCHANGE, equityNeeded],
          })
        } else {
          setLastTxType('lp')
          writeContract({
            address: CONTRACTS.EQUITY_EXCHANGE,
            abi: EQUITY_EXCHANGE_ABI,
            functionName: 'addLiquidity',
            args: [tokenAddress, equityNeeded],
            value: bnbBig,
          })
        }
      } else {
        setLastTxType('lp')
        writeContract({
          address: CONTRACTS.EQUITY_EXCHANGE,
          abi: EQUITY_EXCHANGE_ABI,
          functionName: 'removeLiquidity',
          args: [tokenAddress, lpBig],
        })
      }
    } catch (e: unknown) {
      setTxError(mapContractError(e as Error))
    }
  }

  const handleSuccess = () => { setBnbIn(''); setLpAmount(''); setTxError(''); setLastTxType(null); reset(); refetch() }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900 mb-5">Liquidity</h2>

      {/* Add / Remove tabs */}
      <div className="flex rounded-lg bg-gray-100 p-1 mb-5">
        {(['add', 'remove'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setBnbIn(''); setLpAmount(''); setTxError(''); reset() }}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
          </button>
        ))}
      </div>

      {/* Your LP position */}
      <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-4 text-sm flex justify-between">
        <span className="text-gray-500">Your LP shares</span>
        <span className="text-gray-900 font-semibold">{formatToken(lpShares)}</span>
      </div>

      {tab === 'add' ? (
        <>
          <div className="mb-3">
            <label className="text-sm text-gray-500 font-medium mb-1.5 block">BNB to deposit</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={bnbIn}
                onChange={(e) => { setBnbIn(e.target.value); setTxError('') }}
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">BNB</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Balance: {formatBNB(bnbBalance?.value ?? 0n)} BNB</p>
          </div>

          {equityNeeded > 0n && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{symbol} required</span>
                <span className={equityNeeded > tokenBalance ? 'text-red-500 font-medium' : 'text-gray-900 font-medium'}>
                  {formatToken(equityNeeded)} {symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">LP shares received</span>
                <span className="text-gray-900">{formatToken(lpToReceive)}</span>
              </div>
              {equityNeeded > tokenBalance && (
                <p className="text-red-500 text-xs">Insufficient {symbol} balance</p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm text-gray-500 font-medium">LP shares to burn</label>
              <button
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                onClick={() => setLpAmount(formatUnits(lpShares, 18).replace(/\.?0+$/, ''))}
              >
                Max
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={lpAmount}
                onChange={(e) => { setLpAmount(e.target.value); setTxError('') }}
                className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-300 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">LP</span>
            </div>
          </div>

          {lpBig > 0n && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">You receive {symbol}</span>
                <span className="text-gray-900">{formatToken(withdrawPreview.equity)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">You receive BNB</span>
                <span className="text-gray-900">{formatBNB(withdrawPreview.bnb)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {txError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">
          {txError}
        </div>
      )}

      {isSuccess && (
        <div className={`border rounded-xl px-4 py-3 mb-4 text-sm space-y-2 ${lastTxType === 'approve' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
          <div className={`flex justify-between font-medium ${lastTxType === 'approve' ? 'text-blue-700' : 'text-green-700'}`}>
            <span>{lastTxType === 'approve' ? `${symbol} approved! Click "Add Liquidity" to continue.` : 'Transaction confirmed!'}</span>
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

      {!isConnected ? (
        <p className="text-center text-gray-400 text-sm py-2">Connect wallet to provide liquidity</p>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={loading || (tab === 'add' ? bnbBig === 0n : lpBig === 0n)}
          className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-brand-200"
        >
          {loading
            ? isConfirming ? 'Confirming…' : 'Signing…'
            : needsApproval
              ? `Approve ${symbol}`
              : tab === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
        </button>
      )}
    </div>
  )
}
