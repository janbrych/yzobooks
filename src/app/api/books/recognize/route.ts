import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { resolveBookFromText } from '@/lib/scanner';

export const dynamic = 'force-static';

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
        const createWorker = (await import('tesseract.js')).createWorker;
        const worker = await createWorker('ces+eng');
        const ret = await worker.recognize(image);
        extractedText = ret.data.text;
        await worker.terminate();
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
