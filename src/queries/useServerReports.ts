import { useQuery } from '@tanstack/react-query';
import { getContainer } from '../app/container';
import { SERVER_REPORTS_KEY } from './queryClient';

/** The Review list: fetched from the server (never read back from local state). */
export const useServerReports = () => {
  return useQuery({
    queryKey: [...SERVER_REPORTS_KEY],
    queryFn: () => getContainer().reviewApi.listReports(50),
  });
};
