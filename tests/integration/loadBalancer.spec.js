import axios from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { useLoadBalancerStore } from '@/store/loadBalancer';

// Mock axios
jest.mock('axios');

describe('LoadBalancer Store Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    jest.clearAllMocks();
  });

  describe('Metrics Fetching', () => {
    it('successfully fetches metrics from the API', async () => {
      const mockMetrics = {
        activeWorkers: 5,
        maxWorkers: 10,
        totalRequests: 1000,
        avgResponseTime: 150,
        errorRate: 0.02,
        workers: [
          {
            id: 'worker-1',
            status: 'online',
            requestCount: 200,
            errorCount: 4,
            avgResponseTime: 145
          }
        ]
      };

      axios.get.mockResolvedValueOnce({ data: mockMetrics });

      const store = useLoadBalancerStore();
      await store.fetchMetrics();

      expect(store.metrics).toEqual(mockMetrics);
      expect(store.error).toBeNull();
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/metrics'));
    });

    it('handles API errors appropriately', async () => {
      const error = new Error('Network error');
      axios.get.mockRejectedValueOnce(error);

      const store = useLoadBalancerStore();
      await expect(store.fetchMetrics()).rejects.toThrow('Network error');
      
      expect(store.error).toBe(error.message);
    });
  });

  describe('Health Check', () => {
    it('successfully checks system health', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        details: {
          redis: {
            status: 'connected',
            latency: 5
          },
          workers: {
            active: 5,
            total: 10
          }
        }
      };

      axios.get.mockResolvedValueOnce({ data: mockHealth });

      const store = useLoadBalancerStore();
      const health = await store.checkHealth();

      expect(health).toEqual(mockHealth);
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/health'));
    });
  });

  describe('Load Testing', () => {
    it('successfully runs a load test', async () => {
      // Mock successful load test requests
      axios.get.mockResolvedValue({ data: { success: true } });

      const store = useLoadBalancerStore();
      await store.runLoadTest(1000); // 1 second test

      // Verify multiple requests were made
      expect(axios.get).toHaveBeenCalledTimes(expect.any(Number));
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/load-test'));
    });

    it('handles load test failures gracefully', async () => {
      axios.get.mockRejectedValue(new Error('Load test failed'));

      const store = useLoadBalancerStore();
      await expect(store.runLoadTest(1000)).rejects.toThrow('Load test failed');
    });
  });

  describe('Real-time Updates', () => {
    it('calculates request rate correctly', async () => {
      const initialMetrics = {
        totalRequests: 1000,
        // ... other metrics
      };

      const updatedMetrics = {
        totalRequests: 1100,
        // ... other metrics
      };

      // First call
      axios.get.mockResolvedValueOnce({ data: initialMetrics });
      const store = useLoadBalancerStore();
      await store.fetchMetrics();

      // Simulate time passing
      jest.advanceTimersByTime(1000);

      // Second call
      axios.get.mockResolvedValueOnce({ data: updatedMetrics });
      await store.fetchMetrics();

      // Request rate should be (1100 - 1000) / 1 = 100 requests per second
      expect(store.metrics.requestRate).toBeCloseTo(100);
    });
  });
});
