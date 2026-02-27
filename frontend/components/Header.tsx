'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { useState, useRef, useEffect } from 'react'

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/companies', label: 'Companies' },
  { href: '/list', label: 'List Company' },
  { href: '/portfolio', label: 'Portfolio' },
]

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function WalletButton() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { address } = useAccount()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const copyAddress = () => {
    if (!address) return
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!ready) {
    return <div className="w-32 h-9 bg-gray-100 rounded-lg animate-pulse" />
  }

  if (authenticated && address) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
          <span className="text-sm text-gray-700 font-mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <ChevronIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs text-gray-400 mb-1">Connected wallet</p>
              <p className="text-xs text-gray-700 font-mono break-all">{address}</p>
            </div>

            <button
              onClick={copyAddress}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              {copied ? (
                <CheckIcon className="w-4 h-4 text-brand-500 flex-shrink-0" />
              ) : (
                <CopyIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <span className={`text-sm ${copied ? 'text-brand-600' : 'text-gray-700'}`}>
                {copied ? 'Copied!' : 'Copy address'}
              </span>
            </button>

            <Link
              href="/portfolio"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              <span className="text-sm text-gray-700">My Portfolio</span>
            </Link>

            <div className="border-t border-gray-100">
              <button
                onClick={() => { logout(); setOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-50 transition-colors text-left"
              >
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="text-sm text-red-500">Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={login}
      className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-brand-500/20"
    >
      Connect Wallet
    </button>
  )
}

export function Header() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center font-bold text-white text-xs tracking-tight shadow-sm shadow-brand-500/30">
            EOC
          </div>
          <span className="font-bold text-gray-900 hidden sm:block text-[15px]">EquityOnChain</span>
        </Link>

        {/* Nav — centered */}
        <nav className="flex items-center gap-1 flex-1 justify-center">
          {NAV.map(({ href, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-brand-50 text-brand-700 border border-brand-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Wallet — right-aligned */}
        <div className="flex-shrink-0">
          <WalletButton />
        </div>
      </div>
    </header>
  )
}
