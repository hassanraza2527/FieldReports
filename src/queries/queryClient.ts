import { QueryClient } from '@tanstack/react-query';

export const SERVER_REPORTS_KEY = ['serverReports'] as const;
/** TanStack Query holds SERVER state only (the Review list). The upload queue never goes through it. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000, networkMode: 'always' } },
});
