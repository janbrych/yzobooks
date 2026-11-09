import type { Metadata } from 'next';
import { LocationsScreen } from '@/components/LocationsScreen';

export const metadata: Metadata = {
  title: 'Regály a police · Knihovna',
};

export default function RegalyPage() {
  return <LocationsScreen />;
}
