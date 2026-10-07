import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function POST() {
  const response = NextResponse.json({ message: 'Odhlášení úspěšné.' });
  response.cookies.set('token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/',
  });
  return response;
}
