import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

// PUT update a book
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { title, author, genre, publisher, publishedYear, edition, pageCount, isbn, description, coverUrl, status, rating } = body;

    // Verify ownership
    const existing = await prisma.book.findFirst({
      where: { id, userId: user.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Kniha nenalezena.' }, { status: 404 });
    }

    const updated = await prisma.book.update({
      where: { id },
      data: {
        title,
        author: author || null,
        genre: genre || null,
        publisher: publisher || null,
        publishedYear: publishedYear || null,
        edition: edition || null,
        pageCount: pageCount ? parseInt(String(pageCount), 10) : null,
        isbn: isbn || null,
        description: description || null,
        coverUrl: coverUrl || null,
        status: status || 'UNREAD',
        rating: rating ? parseInt(String(rating), 10) : null,
      },
    });

    return NextResponse.json({ book: updated });
  } catch (error) {
    console.error('Update book error:', error);
    return NextResponse.json({ error: 'Chyba při úpravě knihy.' }, { status: 500 });
  }
}

// DELETE a book
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await prisma.book.findFirst({
      where: { id, userId: user.userId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Kniha nenalezena.' }, { status: 404 });
    }

    await prisma.book.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete book error:', error);
    return NextResponse.json({ error: 'Chyba při mazání knihy.' }, { status: 500 });
  }
}
