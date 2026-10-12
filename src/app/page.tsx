'use client';

import { AuthProvider } from '@/context/AuthContext';
import AppMain from '@/components/AppMain';

export default function Home() {
  return (
    <AuthProvider>
      <AppMain />
    </AuthProvider>
  );
}
