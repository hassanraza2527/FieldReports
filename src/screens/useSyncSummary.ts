import { useMemo } from 'react';
import { summarizeSync } from '../domain/syncSummary';
import { useQueueStore } from '../state/queueStore';

export const useSyncSummary = () => {
  const reports = useQueueStore(s => s.reports);
  const online = useQueueStore(s => s.online);
  const authPaused = useQueueStore(s => s.authPaused);
  const activeReportId = useQueueStore(s => s.activeReportId);
  return useMemo(() => summarizeSync({ reports, online, authPaused, activeReportId }), [reports, online, authPaused, activeReportId]);
};
