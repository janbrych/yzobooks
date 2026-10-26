import { NextResponse } from 'next/server';
import type { Worker } from 'tesseract.js';
import { getCurrentUser } from '@/lib/auth';
import { resolveBookFromText } from '@/lib/scanner';

export const dynamic = 'force-static';

// Reuse one Tesseract worker across requests in this server process instead
// of spinning up (and tearing down) a fresh one — with its language model —
// on every single recognize call. Falls back to re-creating it if a prior
// init attempt failed.
let serverWorkerPromise: Promise<Worker> | null = null;

async function getServerOcrWorker(): Promise<Worker> {
  if (!serverWorkerPromise) {
    serverWorkerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('ces+eng');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })().catch((err) => {
      serverWorkerPromise = null;
      throw err;
    });
  }
  return serverWorkerPromise;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  try {
    const { image, query: textQuery } = await req.json();

    let extractedText = '';

    if (textQuery) {
      extractedText = textQuery;
    } else if (image) {
      try {
        const worker = await getServerOcrWorker();
        const ret = await worker.recognize(image);
        extractedText = ret.data.text;
      } catch (ocrErr) {
        console.error('Tesseract OCR error:', ocrErr);
      }
    }

    if (!extractedText && !image) {
      return NextResponse.json({ error: 'Nebyla poskytnuta žádná data k vyhodnocení.' }, { status: 400 });
    }

    const { result, confident, rawText } = await resolveBookFromText(extractedText, image);

    return NextResponse.json({ result, confident, rawText });
  } catch (error) {
    console.error('Book recognize error:', error);
    return NextResponse.json({ error: 'Chyba při vyhodnocování knihy.' }, { status: 500 });
  }
}
