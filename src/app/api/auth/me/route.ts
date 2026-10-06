import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

export async function GET() {
  if (process.env.STATIC_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return NextResponse.json({ user: null });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.userId },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ user });
}
