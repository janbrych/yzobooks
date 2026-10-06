import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function POST() {
  if (process.env.STATIC_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return NextResponse.json({ message: 'Static export mode' });
  }

  const response = NextResponse.json({ message: 'Odhlášení úspěšné.' });
  response.cookies.set('token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
  return response;
}
