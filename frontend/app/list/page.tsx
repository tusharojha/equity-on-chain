'use client'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { parseUnits, parseEventLogs } from 'viem'
import { EQUITY_FACTORY_ABI, EQUITY_EXCHANGE_ABI, CONTRACTS, EXPLORER_URL } from '@/lib/contracts'
import { parseBNB, formatBNB, mapContractError } from '@/lib/utils'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TokenForm {
  name: string
  symbol: string
  maxSupply: string
  poolTokens: string
  founderTokens: string
  initialBnb: string
  upperCircuitPct: string
  lowerCircuitPct: string
  circuitHaltBlocks: string
  limitOwnership: boolean
  maxOwnershipPct: string
  kycRequired: boolean
  kycProvider: string
}

interface CompanyProfile {
  description: string
  website: string
  twitter: string
  telegram: string
  discord: string
  linkedin: string
  aiSummary?: string
  industry?: string
  businessModel?: string
  keyHighlights?: string[]
  riskFactors?: string[]
  teamInfo?: string
  documentName?: string
}

const DEFAULT_FORM: TokenForm = {
  name: '',
  symbol: '',
  maxSupply: '1000000',
  poolTokens: '100000',
  founderTokens: '200000',
  initialBnb: '0.1',
  upperCircuitPct: '10',
  lowerCircuitPct: '10',
  circuitHaltBlocks: '100',
  limitOwnership: false,
  maxOwnershipPct: '10',
  kycRequired: false,
  kycProvider: '0x0000000000000000000000000000000000000000',
}

const DEFAULT_PROFILE: CompanyProfile = {
  description: '',
  website: '',
  twitter: '',
  telegram: '',
  discord: '',
  linkedin: '',
}

type Step = 1 | 2 | 3 | 4 | 5

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold text-gray-900 text-lg mb-5">{children}</h2>
}

function FieldLabel({ children, optional }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-600 mb-1.5 font-medium">
      {children}
      {optional && <span className="text-xs text-gray-400 font-normal">(optional)</span>}
    </label>
  )
}

function Input({
  label, value, onChange, type = 'text', placeholder, hint, optional,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; hint?: string; optional?: boolean
}) {
  return (
    <div>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all text-sm"
      />
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  )
}

function Textarea({
  label, value, onChange, placeholder, hint, optional,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string; optional?: boolean
}) {
  return (
    <div>
      <FieldLabel optional={optional}>{label}</FieldLabel>
      <textarea
        rows={4}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all text-sm resize-none"
      />
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-brand-500' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function ListPage() {
  const { login } = usePrivy()
  const { address, isConnected } = useAccount()
  const { data: bnbBalance } = useBalance({ address })

  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<TokenForm>(DEFAULT_FORM)
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_PROFILE)
  const [txError, setTxError] = useState('')

  // Document upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')

  const { data: listingFee } = useReadContract({
    address: CONTRACTS.EQUITY_EXCHANGE,
    abi: EQUITY_EXCHANGE_ABI,
    functionName: 'listingFee',
  })

  const fee = listingFee ?? 0n
  const initialBnbWei = parseBNB(form.initialBnb)
  const totalBnb = fee + initialBnbWei

  const { writeContract, data: txHash, isPending: isSigning, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash })
  const loading = isSigning || isConfirming

  // Parse the deployed token address from the EquityCreated event log
  const newTokenAddress = (() => {
    if (!receipt) return null
    try {
      const logs = parseEventLogs({ abi: EQUITY_FACTORY_ABI, logs: receipt.logs, eventName: 'EquityCreated' })
      return (logs[0]?.args as { token?: `0x${string}` } | undefined)?.token ?? null
    } catch {
      return null
    }
  })()

  // Save profile exactly once when the transaction is confirmed and token address is known
  const profileSavedRef = useRef(false)
  useEffect(() => {
    if (isSuccess && newTokenAddress && !profileSavedRef.current && (profile.description || profile.aiSummary)) {
      profileSavedRef.current = true
      fetch('/api/company-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, tokenAddress: newTokenAddress }),
      }).catch(() => {})
    }
  }, [isSuccess, newTokenAddress, profile])

  const updateForm = (field: keyof TokenForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))
  const updateProfile = (field: keyof CompanyProfile, value: string) =>
    setProfile((prev) => ({ ...prev, [field]: value }))

  // ── AI document extraction ──────────────────────────────────────────────
  const handleExtract = async () => {
    if (!uploadedFile) return
    setExtracting(true)
    setExtractError('')
    try {
      const fd = new FormData()
      fd.append('file', uploadedFile)
      const res = await fetch('/api/extract-company-info', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setProfile((prev) => ({
        ...prev,
        description: prev.description || data.aiSummary || prev.description,
        aiSummary: data.aiSummary ?? prev.aiSummary,
        industry: data.industry ?? prev.industry,
        businessModel: data.businessModel ?? prev.businessModel,
        keyHighlights: data.keyHighlights ?? prev.keyHighlights,
        riskFactors: data.riskFactors ?? prev.riskFactors,
        teamInfo: data.teamInfo ?? prev.teamInfo,
        documentName: uploadedFile.name,
      }))
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  // ── Submit transaction ──────────────────────────────────────────────────
  const handleSubmit = () => {
    setTxError('')
    try {
      const cfg = {
        upperCircuitPct: Number(form.upperCircuitPct),
        lowerCircuitPct: Number(form.lowerCircuitPct),
        circuitHaltBlocks: BigInt(form.circuitHaltBlocks),
        limitOwnership: form.limitOwnership,
        maxOwnershipPct: Number(form.maxOwnershipPct),
        kycRequired: form.kycRequired,
        kycProvider: (form.kycProvider || '0x0000000000000000000000000000000000000000') as `0x${string}`,
      }
      writeContract({
        address: CONTRACTS.EQUITY_FACTORY,
        abi: EQUITY_FACTORY_ABI,
        functionName: 'create',
        args: [
          form.name,
          form.symbol.toUpperCase(),
          parseUnits(form.maxSupply, 18),
          parseUnits(form.poolTokens, 18),
          parseUnits(form.founderTokens, 18),
          cfg,
        ],
        value: totalBnb,
      })
    } catch (e: unknown) {
      setTxError(mapContractError(e as Error))
    }
  }

  const STEPS = ['Token Details', 'Tokenomics', 'Rules', 'Company Profile', 'Review']

  // ── Not connected ───────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="text-5xl mb-6">🏢</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">List Your Company</h1>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">
          Connect your wallet to tokenise your company and raise capital on-chain.
        </p>
        <button
          onClick={login}
          className="px-7 py-3.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl transition-all shadow-sm shadow-brand-500/20"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Token Listed!</h2>
        <p className="text-gray-600 mb-1">
          <strong className="text-gray-900">{form.name} ({form.symbol.toUpperCase()})</strong> is now live.
        </p>
        {newTokenAddress && (
          <p className="text-gray-400 text-xs mb-2 font-mono">
            Token: {newTokenAddress}
          </p>
        )}
        {txHash && (
          <a
            href={`${EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mb-8"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View transaction on BSCScan ↗
          </a>
        )}
        <div className="flex gap-3 justify-center">
          <Link href={newTokenAddress ? `/tokens/${newTokenAddress}` : '/'} className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm shadow-sm">
            {newTokenAddress ? 'View Token' : 'View Market'}
          </Link>
          <button
            onClick={() => { reset(); setForm(DEFAULT_FORM); setProfile(DEFAULT_PROFILE); setStep(1) }}
            className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm"
          >
            List Another
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">List Your Company</h1>
        <p className="text-gray-500 text-sm">Create an equity token and start raising capital on-chain.</p>
      </div>

      {/* Step progress */}
      <div className="flex items-center mb-8 gap-1">
        {STEPS.map((label, idx) => {
          const s = (idx + 1) as Step
          const done = step > s
          const active = step === s
          return (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  done
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : active
                      ? 'border-brand-500 text-brand-600 bg-brand-50'
                      : 'border-gray-300 text-gray-400'
                }`}>
                  {done ? '✓' : s}
                </div>
                <span className={`text-xs font-medium hidden lg:block whitespace-nowrap ${
                  active ? 'text-gray-900' : done ? 'text-gray-500' : 'text-gray-400'
                }`}>{label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1.5 transition-colors ${step > s ? 'bg-brand-500' : 'bg-gray-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-5 shadow-sm">

        {/* Step 1: Token Details */}
        {step === 1 && (
          <div className="space-y-5">
            <SectionTitle>Token Details</SectionTitle>
            <Input label="Company Name" value={form.name} onChange={(v) => updateForm('name', v)} placeholder="Acme Corp" />
            <Input label="Token Symbol" value={form.symbol} onChange={(v) => updateForm('symbol', v)} placeholder="ACME" hint="2–6 characters, uppercase. Cannot be changed." />
            <Input label="Max Supply (tokens)" value={form.maxSupply} onChange={(v) => updateForm('maxSupply', v)} type="number" placeholder="1000000" hint="Total tokens that can ever exist. Cannot be changed." />
          </div>
        )}

        {/* Step 2: Tokenomics */}
        {step === 2 && (
          <div className="space-y-5">
            <SectionTitle>Tokenomics</SectionTitle>
            <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 text-sm text-brand-700">
              Pool + Founder tokens must be ≤ Max Supply (<strong>{Number(form.maxSupply).toLocaleString()}</strong>)
            </div>
            <Input label="Pool Tokens" value={form.poolTokens} onChange={(v) => updateForm('poolTokens', v)} type="number" placeholder="100000" hint="Tokens seeded into the AMM pool for trading" />
            <Input label="Founder Tokens" value={form.founderTokens} onChange={(v) => updateForm('founderTokens', v)} type="number" placeholder="200000" hint="Tokens sent directly to your wallet" />
            <Input label="Initial BNB (pool liquidity)" value={form.initialBnb} onChange={(v) => updateForm('initialBnb', v)} type="number" placeholder="0.1" hint="BNB you deposit to seed the pool — this sets the initial token price." />
            {Number(form.poolTokens) + Number(form.founderTokens) > Number(form.maxSupply) && (
              <p className="text-red-500 text-sm">⚠ Pool + Founder tokens exceed Max Supply</p>
            )}
            {Number(form.poolTokens) > 0 && Number(form.initialBnb) > 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm">
                <p className="text-gray-500 text-xs mb-1">Initial token price</p>
                <p className="text-gray-900 font-semibold">
                  {(Number(form.initialBnb) / Number(form.poolTokens)).toFixed(8)} BNB/token
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Trading Rules */}
        {step === 3 && (
          <div className="space-y-5">
            <SectionTitle>Trading Rules</SectionTitle>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Circuit Breakers</p>
              <p className="text-xs text-gray-400 mb-3">Auto-halt trading when price swings beyond your limits.</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Upper limit %" value={form.upperCircuitPct} onChange={(v) => updateForm('upperCircuitPct', v)} type="number" placeholder="10" />
                <Input label="Lower limit %" value={form.lowerCircuitPct} onChange={(v) => updateForm('lowerCircuitPct', v)} type="number" placeholder="10" />
              </div>
              <div className="mt-3">
                <Input label="Halt Duration (blocks)" value={form.circuitHaltBlocks} onChange={(v) => updateForm('circuitHaltBlocks', v)} type="number" placeholder="100" hint="BSC ≈ 3 sec/block. 100 blocks ≈ 5 min." />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Ownership Controls</p>
              <Toggle
                label="Limit max ownership per wallet"
                checked={form.limitOwnership}
                onChange={(v) => updateForm('limitOwnership', v)}
                hint="Prevents any single wallet from accumulating too much"
              />
              {form.limitOwnership && (
                <Input label="Max ownership %" value={form.maxOwnershipPct} onChange={(v) => updateForm('maxOwnershipPct', v)} type="number" placeholder="10" />
              )}
            </div>

            <div className="border-t border-gray-200 pt-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">KYC</p>
              <Toggle
                label="Require KYC to trade"
                checked={form.kycRequired}
                onChange={(v) => updateForm('kycRequired', v)}
                hint="Only verified wallets can buy or receive tokens"
              />
              {form.kycRequired && (
                <Input label="KYC Registry address" value={form.kycProvider} onChange={(v) => updateForm('kycProvider', v)} placeholder="0x…" hint="Contract implementing IKYCRegistry" />
              )}
            </div>
          </div>
        )}

        {/* Step 4: Company Profile */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <SectionTitle>Company Profile</SectionTitle>
              <p className="text-xs text-gray-400 -mt-3 mb-5">
                Optional but recommended — shown to investors on your token page.
              </p>
            </div>

            <Textarea
              label="Company Description"
              value={profile.description}
              onChange={(v) => updateProfile('description', v)}
              placeholder="Describe what your company does, its mission, and value proposition…"
              optional
            />

            {/* Social links */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Social & Web</p>
              <div className="space-y-3">
                <Input label="Website" value={profile.website} onChange={(v) => updateProfile('website', v)} placeholder="https://yourcompany.com" optional />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Twitter / X" value={profile.twitter} onChange={(v) => updateProfile('twitter', v)} placeholder="@handle" optional />
                  <Input label="LinkedIn" value={profile.linkedin} onChange={(v) => updateProfile('linkedin', v)} placeholder="linkedin.com/company/…" optional />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Telegram" value={profile.telegram} onChange={(v) => updateProfile('telegram', v)} placeholder="t.me/…" optional />
                  <Input label="Discord" value={profile.discord} onChange={(v) => updateProfile('discord', v)} placeholder="discord.gg/…" optional />
                </div>
              </div>
            </div>

            {/* Document upload + AI */}
            <div className="border-t border-gray-200 pt-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">AI Company Analysis</p>
              <p className="text-xs text-gray-400 mb-4">
                Upload a pitch deck, whitepaper, or business plan — AI will extract key info automatically.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) { setUploadedFile(f); setExtractError('') }
                }}
              />

              {!uploadedFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-300 hover:border-brand-400 rounded-xl p-8 text-center transition-all group"
                >
                  <div className="text-3xl mb-2">📄</div>
                  <p className="text-gray-500 group-hover:text-gray-700 text-sm font-medium">Click to upload document</p>
                  <p className="text-gray-400 text-xs mt-1">PDF, TXT, MD, DOC — max 10 MB</p>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium truncate">{uploadedFile.name}</p>
                      <p className="text-xs text-gray-400">{(uploadedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                      className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={extracting}
                    className="w-full py-3 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {extracting ? (
                      <>
                        <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                        Analysing with AI…
                      </>
                    ) : (
                      <>✨ Extract Info with AI</>
                    )}
                  </button>

                  {extractError && (
                    <p className="text-red-500 text-xs">{extractError}</p>
                  )}
                </div>
              )}

              {/* AI extracted results */}
              {profile.aiSummary && (
                <div className="mt-4 bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-brand-600 text-xs font-semibold uppercase tracking-wider">
                    <span>✨</span> AI Extracted
                  </div>
                  {profile.industry && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Industry</p>
                      <span className="text-xs bg-brand-100 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                        {profile.industry}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Summary</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{profile.aiSummary}</p>
                  </div>
                  {profile.businessModel && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Business Model</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{profile.businessModel}</p>
                    </div>
                  )}
                  {profile.keyHighlights && profile.keyHighlights.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Key Highlights</p>
                      <ul className="space-y-1">
                        {profile.keyHighlights.map((h, i) => (
                          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span> {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 italic">You can edit this info after listing.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-5">
            <SectionTitle>Review & Deploy</SectionTitle>
            <div className="space-y-0 text-sm border border-gray-200 rounded-xl overflow-hidden">
              {[
                ['Token', `${form.name} (${form.symbol.toUpperCase()})`],
                ['Max Supply', `${Number(form.maxSupply).toLocaleString()} tokens`],
                ['Pool Tokens', `${Number(form.poolTokens).toLocaleString()} tokens`],
                ['Founder Tokens', `${Number(form.founderTokens).toLocaleString()} tokens`],
                ['Initial BNB', `${form.initialBnb} BNB`],
                ['Circuit Breaker', `+${form.upperCircuitPct}%/−${form.lowerCircuitPct}%, halt ${form.circuitHaltBlocks} blocks`],
                ['Ownership Cap', form.limitOwnership ? `${form.maxOwnershipPct}% max/wallet` : 'None'],
                ['KYC', form.kycRequired ? 'Required' : 'Open trading'],
                ...(profile.description ? [['Company desc', '✓ Added']] : []),
                ...(profile.aiSummary ? [['AI analysis', `✓ ${profile.industry ?? 'Done'}`]] : []),
                ...(profile.website ? [['Website', profile.website]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-4 py-2.5 border-b border-gray-100 last:border-0 odd:bg-gray-50">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-900 font-medium text-right max-w-[60%] truncate">{v}</span>
                </div>
              ))}
            </div>

            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 text-sm space-y-2">
              <p className="text-brand-700 font-semibold text-xs uppercase tracking-wider">Transaction Cost</p>
              <div className="flex justify-between">
                <span className="text-gray-600">Listing fee</span>
                <span className="text-gray-900">{formatBNB(fee)} BNB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Initial liquidity</span>
                <span className="text-gray-900">{form.initialBnb} BNB</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-brand-200 pt-2">
                <span className="text-gray-900">Total</span>
                <span className="text-brand-600 text-base">{formatBNB(totalBnb)} BNB</span>
              </div>
              <p className="text-gray-500 text-xs">
                Your balance: {formatBNB(bnbBalance?.value ?? 0n)} BNB
                {(bnbBalance?.value ?? 0n) < totalBnb && (
                  <span className="text-red-500 ml-2">⚠ Insufficient balance</span>
                )}
              </p>
            </div>

            {txError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {txError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="px-5 py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm shadow-sm"
          >
            ← Back
          </button>
        )}

        {step < 5 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={
              (step === 1 && (!form.name || !form.symbol)) ||
              (step === 2 && (Number(form.poolTokens) + Number(form.founderTokens) > Number(form.maxSupply)))
            }
            className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all shadow-sm"
          >
            {step === 4 ? 'Review →' : 'Continue →'}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading || (bnbBalance?.value ?? 0n) < totalBnb}
            className="flex-1 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isConfirming ? 'Deploying…' : 'Confirm in wallet…'}
              </>
            ) : (
              'Deploy & List Token'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
