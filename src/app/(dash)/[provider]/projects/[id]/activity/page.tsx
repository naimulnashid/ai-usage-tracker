'use client';

import { useParams } from 'next/navigation';
import { ActivityHistoryPage } from '@/components/ActivityHistoryPage';
import { decodeParam } from '@/lib/format';

/** One project's heat map, over its full history. See ActivityHistoryPage. */
export default function ProjectActivityPage() {
  const params = useParams<{ id: string }>();
  return <ActivityHistoryPage projectId={decodeParam(String(params?.id ?? ''))} />;
}
