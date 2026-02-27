import { type NextRequest } from 'next/server'

// ─── In-memory trade event store ──────────────────────────────────────────────
// Survives across requests within the same Node.js process instance.
// Good enough for a testnet demo where all trades go through our UI.

type TradePoint = {
  block: number
  price: number   // BNB per token (float)
  type: 'buy' | 'sell'
}

// Module-level map: normalized token address → sorted trade points
const store = new Map<string, TradePoint[]>()

const MAX_POINTS_PER_TOKEN = 500

function key(token: string) {
  return token.toLowerCase()
}

function upsert(token: string, point: TradePoint) {
  const k = key(token)
  const list = store.get(k) ?? []
  list.push(point)
  list.sort((a, b) => a.block - b.block)
  if (list.length > MAX_POINTS_PER_TOKEN) {
    list.splice(0, list.length - MAX_POINTS_PER_TOKEN)
  }
  store.set(k, list)
}

// ─── GET /api/trade-events?token=0x... ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) return Response.json([])
  return Response.json(store.get(key(token)) ?? [])
}

// ─── POST /api/trade-events ───────────────────────────────────────────────────
// Body: { token: string, block: number, price: number, type: 'buy'|'sell' }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<TradePoint & { token: string }>
    const { token, block, price, type } = body

    if (
      typeof token !== 'string' || !token ||
      typeof block !== 'number' || !isFinite(block) ||
      typeof price !== 'number' || !isFinite(price) || price <= 0 ||
      (type !== 'buy' && type !== 'sell')
    ) {
      return Response.json({ error: 'invalid payload' }, { status: 400 })
    }

    upsert(token, { block: Math.round(block), price, type })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'parse error' }, { status: 400 })
  }
}
