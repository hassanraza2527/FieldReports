import { useQuery } from '@tanstack/react-query';
import { getContainer } from '../app/container';
import { useAuthStore } from '../state/authStore';
import { SERVER_REPORTS_KEY } from './queryClient';

/** Keyed by the signed-in email so one user's list can never be shown to another. */
export const useServerReports = () => {
  const email = useAuthStore(s => s.email);
  return useQuery({
    queryKey: [...SERVER_REPORTS_KEY, email],
    queryFn: () => getContainer().reviewApi.listReports(50),
    enabled: !!email,
  });
};
