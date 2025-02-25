import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import LoadBalancerStatus from '@/components/monitoring/LoadBalancerStatus.vue';
import { useLoadBalancerStore } from '@/store/loadBalancer';

// Mock Chart.js to avoid canvas rendering issues
jest.mock('chart.js', () => ({
  Chart: jest.fn(),
  registerables: []
}));

describe('LoadBalancerStatus.vue', () => {
  const createWrapper = () => {
    return mount(LoadBalancerStatus, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: jest.fn,
            initialState: {
              loadBalancer: {
                metrics: {
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
                  ],
                  requestRate: 50
                }
              }
            }
          })
        ],
        stubs: {
          Chart: true,
          Card: true,
          DataTable: true,
          Column: true,
          ProgressBar: true
        }
      }
    });
  };

  it('renders the component with initial metrics', () => {
    const wrapper = createWrapper();
    expect(wrapper.find('.load-balancer-status').exists()).toBe(true);
    expect(wrapper.find('.status-grid').exists()).toBe(true);
  });

  it('displays correct worker metrics', () => {
    const wrapper = createWrapper();
    const store = useLoadBalancerStore();
    
    const activeWorkersValue = wrapper.find('.status-value').text();
    expect(activeWorkersValue).toBe('5');
    
    const workerUtilization = (store.metrics.activeWorkers / store.metrics.maxWorkers) * 100;
    expect(workerUtilization).toBe(50);
  });

  it('formats time values correctly', async () => {
    const wrapper = createWrapper();
    const store = useLoadBalancerStore();
    
    // Test milliseconds format
    store.metrics.avgResponseTime = 150;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.formatTime(150)).toBe('150ms');
    
    // Test seconds format
    store.metrics.avgResponseTime = 1500;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.formatTime(1500)).toBe('1.50s');
  });

  it('formats percentage values correctly', () => {
    const wrapper = createWrapper();
    const store = useLoadBalancerStore();
    
    store.metrics.errorRate = 0.025;
    expect(wrapper.vm.formatPercentage(0.025)).toBe('2.5%');
  });

  it('updates metrics periodically', async () => {
    jest.useFakeTimers();
    const wrapper = createWrapper();
    const store = useLoadBalancerStore();
    
    // Mock store action
    store.fetchMetrics = jest.fn().mockResolvedValue({
      activeWorkers: 6,
      maxWorkers: 10,
      totalRequests: 1100
    });

    // Fast-forward 5 seconds
    jest.advanceTimersByTime(5000);
    await wrapper.vm.$nextTick();

    expect(store.fetchMetrics).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('handles error states gracefully', async () => {
    const wrapper = createWrapper();
    const store = useLoadBalancerStore();
    
    // Mock failed metrics fetch
    store.fetchMetrics = jest.fn().mockRejectedValue(new Error('Network error'));
    
    // Trigger metrics update
    await wrapper.vm.updateMetrics();
    
    // Verify error handling (implement based on your error handling UI)
    expect(wrapper.vm.error).toBeTruthy();
  });

  // Clean up
  afterEach(() => {
    jest.clearAllMocks();
  });
});
