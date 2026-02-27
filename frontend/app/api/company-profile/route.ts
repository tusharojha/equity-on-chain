import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'company-profiles.json')

export interface CompanyProfile {
  tokenAddress: string
  description?: string
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  linkedin?: string
  // AI-extracted fields
  aiSummary?: string
  industry?: string
  businessModel?: string
  keyHighlights?: string[]
  riskFactors?: string[]
  teamInfo?: string
  documentName?: string
  createdAt: string
  updatedAt: string
}

async function readDB(): Promise<Record<string, CompanyProfile>> {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeDB(data: Record<string, CompanyProfile>) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')?.toLowerCase()
  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 })
  }
  const db = await readDB()
  const profile = db[address]
  if (!profile) {
    return NextResponse.json(null)
  }
  return NextResponse.json(profile)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const address = body.tokenAddress?.toLowerCase()
    if (!address) {
      return NextResponse.json({ error: 'tokenAddress required' }, { status: 400 })
    }
    const db = await readDB()
    const existing = db[address]
    db[address] = {
      ...existing,
      ...body,
      tokenAddress: address,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await writeDB(db)
    return NextResponse.json(db[address])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
