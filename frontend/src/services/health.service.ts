import { apiClient } from './api';
import { GearCategoryItem, HealthStatus } from '../types';

export const systemService = {
  async getHealth(): Promise<HealthStatus> {
    const { data } = await apiClient.get('/health');
    return data.data;
  },

  async getGearCategories(): Promise<GearCategoryItem[]> {
    const { data } = await apiClient.get('/gear/categories');
    return data.data;
  },
};
