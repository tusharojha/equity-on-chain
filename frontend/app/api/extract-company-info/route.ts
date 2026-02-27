import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are a financial analyst assistant. You will be given a company document (pitch deck, whitepaper, business plan, or any company description).
Extract structured information and return ONLY a valid JSON object — no markdown, no explanation, just the JSON.

Return this exact shape:
{
  "aiSummary": "2-3 sentence overview of what the company does and its value proposition",
  "industry": "single industry label e.g. Fintech, SaaS, Logistics, Healthcare, Real Estate, etc.",
  "businessModel": "1-2 sentences describing how the company makes money",
  "keyHighlights": ["up to 5 short bullet points of key strengths or milestones"],
  "riskFactors": ["up to 3 short risk factors"],
  "teamInfo": "brief description of the founding team if mentioned, else empty string"
}

If a field cannot be determined from the document, use an empty string or empty array.`

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdfjs-dist (bundled inside pdf-parse v2) accesses `DOMMatrix` at module evaluation
  // time, which doesn't exist in Node.js. Polyfill it before the first require() call.
  if (typeof (globalThis as Record<string, unknown>).DOMMatrix === 'undefined') {
    // @ts-expect-error — minimal stub; full geometry transforms are not needed for text extraction
    globalThis.DOMMatrix = class DOMMatrix {}
  }
  // Lazy require — must NOT be at module top-level or Turbopack evaluates it on startup.
  // pdf-parse v2 API: new PDFParse({ data: buffer }).getText()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse') as {
    PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> }
  }
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  return result.text
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const text = formData.get('text') as string | null

    let documentContent = ''

    if (file) {
      if (file.type === 'application/pdf') {
        const bytes = await file.arrayBuffer()
        documentContent = await extractPdfText(Buffer.from(bytes))
      } else {
        documentContent = await file.text()
      }
    } else if (text) {
      documentContent = text
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }

    if (!documentContent.trim()) {
      return NextResponse.json({ error: 'Could not extract text from document' }, { status: 400 })
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Here is the company document:\n\n${documentContent.slice(0, 12000)}`,
        },
      ],
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const raw = response.choices[0]?.message?.content ?? '{}'
    return NextResponse.json(JSON.parse(raw))
  } catch (e) {
    console.error('extract-company-info error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
