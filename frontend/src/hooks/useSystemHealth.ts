import { useQuery } from '@tanstack/react-query';
import { systemService } from '../services/health.service';

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => systemService.getHealth(),
    retry: 1,
    refetchInterval: 30000,
  });
}

export function useGearCategories() {
  return useQuery({
    queryKey: ['gear-categories'],
    queryFn: () => systemService.getGearCategories(),
    retry: 1,
  });
}
