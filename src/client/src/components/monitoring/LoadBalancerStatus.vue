<template>
  <Card class="load-balancer-status">
    <template #title>
      <div class="card-title">
        <i class="pi pi-server"></i>
        Load Balancer Status
      </div>
    </template>
    <template #content>
      <div class="status-grid">
        <div class="status-item">
          <div class="status-label">Active Workers</div>
          <div class="status-value">{{ metrics.activeWorkers }}</div>
          <ProgressBar :value="(metrics.activeWorkers / metrics.maxWorkers) * 100" />
        </div>
        
        <div class="status-item">
          <div class="status-label">Total Requests</div>
          <div class="status-value">{{ metrics.totalRequests }}</div>
        </div>
        
        <div class="status-item">
          <div class="status-label">Average Response Time</div>
          <div class="status-value">{{ formatTime(metrics.avgResponseTime) }}</div>
        </div>
        
        <div class="status-item">
          <div class="status-label">Error Rate</div>
          <div class="status-value">{{ formatPercentage(metrics.errorRate) }}</div>
        </div>
      </div>

      <div class="workers-table">
        <DataTable :value="metrics.workers" :paginator="true" :rows="5">
          <Column field="id" header="Worker ID"></Column>
          <Column field="status" header="Status">
            <template #body="slotProps">
              <span :class="['status-badge', slotProps.data.status]">
                {{ slotProps.data.status }}
              </span>
            </template>
          </Column>
          <Column field="requestCount" header="Requests"></Column>
          <Column field="errorCount" header="Errors"></Column>
          <Column field="avgResponseTime" header="Avg. Response">
            <template #body="slotProps">
              {{ formatTime(slotProps.data.avgResponseTime) }}
            </template>
          </Column>
        </DataTable>
      </div>

      <div class="performance-chart">
        <Chart type="line" :data="chartData" :options="chartOptions" />
      </div>
    </template>
  </Card>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { useLoadBalancerStore } from '@/store/loadBalancer';

export default {
  name: 'LoadBalancerStatus',
  
  setup() {
    const store = useLoadBalancerStore();
    const updateInterval = ref(null);
    const metrics = ref({
      activeWorkers: 0,
      maxWorkers: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      errorRate: 0,
      workers: []
    });

    const chartData = ref({
      labels: [],
      datasets: [
        {
          label: 'Response Time (ms)',
          data: [],
          borderColor: '#2196F3',
          tension: 0.4
        },
        {
          label: 'Requests/s',
          data: [],
          borderColor: '#4CAF50',
          tension: 0.4
        }
      ]
    });

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };

    const updateMetrics = async () => {
      const data = await store.fetchMetrics();
      metrics.value = data;
      
      // Update chart data
      const now = new Date().toLocaleTimeString();
      chartData.value.labels.push(now);
      chartData.value.datasets[0].data.push(data.avgResponseTime);
      chartData.value.datasets[1].data.push(data.requestRate);
      
      // Keep last 10 data points
      if (chartData.value.labels.length > 10) {
        chartData.value.labels.shift();
        chartData.value.datasets.forEach(dataset => dataset.data.shift());
      }
    };

    const formatTime = (ms) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    const formatPercentage = (value) => {
      return `${(value * 100).toFixed(1)}%`;
    };

    onMounted(() => {
      updateMetrics();
      updateInterval.value = setInterval(updateMetrics, 5000);
    });

    onUnmounted(() => {
      if (updateInterval.value) {
        clearInterval(updateInterval.value);
      }
    });

    return {
      metrics,
      chartData,
      chartOptions,
      formatTime,
      formatPercentage
    };
  }
};
</script>

<style lang="scss" scoped>
.load-balancer-status {
  .card-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    
    i {
      font-size: 1.2rem;
    }
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .status-item {
    padding: 1rem;
    background: var(--surface-card);
    border-radius: var(--border-radius);
    box-shadow: var(--card-shadow);

    .status-label {
      color: var(--text-color-secondary);
      margin-bottom: 0.5rem;
    }

    .status-value {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
  }

  .workers-table {
    margin: 1.5rem 0;

    .status-badge {
      padding: 0.25rem 0.5rem;
      border-radius: var(--border-radius);
      font-size: 0.875rem;
      
      &.online {
        background: var(--green-100);
        color: var(--green-900);
      }
      
      &.offline {
        background: var(--red-100);
        color: var(--red-900);
      }
      
      &.starting {
        background: var(--yellow-100);
        color: var(--yellow-900);
      }
    }
  }

  .performance-chart {
    height: 300px;
    margin-top: 1.5rem;
  }
}
</style>
