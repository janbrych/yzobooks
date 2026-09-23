import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET all books for current logged in user
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const status = searchParams.get('status');

  const whereClause: any = {
    userId: user.userId,
  };

  if (status && status !== 'ALL') {
    whereClause.status = status;
  }

  if (search) {
    whereClause.OR = [
      { title: { contains: search } },
      { author: { contains: search } },
      { genre: { contains: search } },
      { isbn: { contains: search } },
    ];
  }

  const books = await prisma.book.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ books });
}

// POST create a new book
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Neautorizovaný přístup.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, author, genre, pageCount, isbn, description, coverUrl, status, rating } = body;

    if (!title) {
      return NextResponse.json({ error: 'Název knihy je povinný.' }, { status: 400 });
    }

    const book = await prisma.book.create({
      data: {
        title,
        author: author || null,
        genre: genre || null,
        pageCount: pageCount ? parseInt(String(pageCount), 10) : null,
        isbn: isbn || null,
        description: description || null,
        coverUrl: coverUrl || null,
        status: status || 'UNREAD',
        rating: rating ? parseInt(String(rating), 10) : null,
        userId: user.userId,
      },
    });

    return NextResponse.json({ book });
  } catch (error) {
    console.error('Create book error:', error);
    return NextResponse.json({ error: 'Chyba při ukládání knihy.' }, { status: 500 });
  }
}
