import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: { id, userId: user.userId },
  });

  if (!book) {
    return NextResponse.json({ error: 'Kniha nenalezena.' }, { status: 404 });
  }

  return NextResponse.json({ book });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { title, author, genre, pageCount, isbn, description, coverUrl, status, rating } = body;

    const existingBook = await prisma.book.findFirst({
      where: { id, userId: user.userId },
    });

    if (!existingBook) {
      return NextResponse.json({ error: 'Kniha nenalezena.' }, { status: 404 });
    }

    const updatedBook = await prisma.book.update({
      where: { id },
      data: {
        title: title ?? existingBook.title,
        author: author ?? existingBook.author,
        genre: genre ?? existingBook.genre,
        pageCount: pageCount !== undefined ? (pageCount ? parseInt(String(pageCount), 10) : null) : existingBook.pageCount,
        isbn: isbn ?? existingBook.isbn,
        description: description ?? existingBook.description,
        coverUrl: coverUrl ?? existingBook.coverUrl,
        status: status ?? existingBook.status,
        rating: rating !== undefined ? (rating ? parseInt(String(rating), 10) : null) : existingBook.rating,
      },
    });

    return NextResponse.json({ book: updatedBook });
  } catch (error) {
    console.error('Update book error:', error);
    return NextResponse.json({ error: 'Chyba při aktualizaci knihy.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existingBook = await prisma.book.findFirst({
      where: { id, userId: user.userId },
    });

    if (!existingBook) {
      return NextResponse.json({ error: 'Kniha nenalezena.' }, { status: 404 });
    }

    await prisma.book.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Kniha byla úspěšně smazána.' });
  } catch (error) {
    console.error('Delete book error:', error);
    return NextResponse.json({ error: 'Chyba při mazání knihy.' }, { status: 500 });
  }
}
