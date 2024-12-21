<template>
  <div class="analytics">
    <h2>Performance Analytics</h2>

    <div class="filters p-fluid">
      <Card>
        <template #content>
          <div class="filter-grid">
            <div class="p-field">
              <label>Date Range</label>
              <Calendar v-model="dateRange" selectionMode="range" :showIcon="true" />
            </div>
            <div class="p-field">
              <label>Metrics</label>
              <MultiSelect
                v-model="selectedMetrics"
                :options="availableMetrics"
                optionLabel="name"
                placeholder="Select metrics"
                display="chip"
              />
            </div>
            <div class="p-field">
              <label>&nbsp;</label>
              <Button label="Apply Filters" icon="pi pi-filter" @click="applyFilters" />
            </div>
          </div>
        </template>
      </Card>
    </div>

    <div class="performance-metrics">
      <Card>
        <template #title>Performance Trends</template>
        <template #content>
          <Chart type="line" :data="performanceData" :options="chartOptions" height="400px" />
        </template>
      </Card>
    </div>

    <div class="metrics-breakdown">
      <div class="grid">
        <div class="col-12 md:col-6">
          <Card>
            <template #title>Processing Time Distribution</template>
            <template #content>
              <Chart type="bar" :data="processingTimeData" :options="barOptions" height="300px" />
            </template>
          </Card>
        </div>
        <div class="col-12 md:col-6">
          <Card>
            <template #title>Memory Usage Analysis</template>
            <template #content>
              <Chart type="bar" :data="memoryUsageData" :options="barOptions" height="300px" />
            </template>
          </Card>
        </div>
      </div>
    </div>

    <div class="detailed-metrics">
      <Card>
        <template #title>Detailed Metrics</template>
        <template #content>
          <DataTable :value="detailedMetrics" :paginator="true" :rows="10"
                    :sortMode="'multiple'" :filters="filters">
            <Column field="timestamp" header="Timestamp" sortable>
              <template #body="slotProps">
                {{ formatDate(slotProps.data.timestamp) }}
              </template>
            </Column>
            <Column field="processingTime" header="Processing Time" sortable>
              <template #body="slotProps">
                {{ formatTime(slotProps.data.processingTime) }}
              </template>
            </Column>
            <Column field="memoryUsage" header="Memory Usage" sortable>
              <template #body="slotProps">
                {{ formatMemory(slotProps.data.memoryUsage) }}
              </template>
            </Column>
            <Column field="accuracy" header="Accuracy" sortable>
              <template #body="slotProps">
                <ProgressBar :value="slotProps.data.accuracy * 100" :showValue="true" />
              </template>
            </Column>
          </DataTable>
        </template>
      </Card>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'Analytics',

  setup() {
    const store = useStore();
    const dateRange = ref(null);
    const selectedMetrics = ref([]);
    const detailedMetrics = ref([]);
    const filters = ref({});

    const availableMetrics = [
      { name: 'Processing Time', code: 'time' },
      { name: 'Memory Usage', code: 'memory' },
      { name: 'Accuracy', code: 'accuracy' }
    ];

    // Sample data - replace with actual API data
    const performanceData = computed(() => ({
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Processing Time (ms)',
          data: [300, 280, 250, 260, 270, 240, 230],
          borderColor: '#2196F3',
          tension: 0.4
        },
        {
          label: 'Memory Usage (MB)',
          data: [50, 45, 48, 46, 47, 45, 44],
          borderColor: '#4CAF50',
          tension: 0.4
        }
      ]
    }));

    const processingTimeData = computed(() => ({
      labels: ['<100ms', '100-200ms', '200-300ms', '>300ms'],
      datasets: [{
        label: 'Number of Requests',
        data: [65, 59, 80, 81],
        backgroundColor: '#2196F3'
      }]
    }));

    const memoryUsageData = computed(() => ({
      labels: ['<50MB', '50-75MB', '75-100MB', '>100MB'],
      datasets: [{
        label: 'Number of Requests',
        data: [28, 48, 40, 19],
        backgroundColor: '#4CAF50'
      }]
    }));

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

    const barOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };

    const applyFilters = async () => {
      // Implement filter logic
      console.log('Applying filters:', { dateRange: dateRange.value, metrics: selectedMetrics.value });
    };

    const formatDate = (date) => new Date(date).toLocaleString();
    const formatTime = (ms) => `${ms}ms`;
    const formatMemory = (mb) => `${mb}MB`;

    onMounted(async () => {
      // Fetch initial analytics data
      try {
        const response = await store.dispatch('fetchAnalytics');
        detailedMetrics.value = response.metrics;
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      }
    });

    return {
      dateRange,
      selectedMetrics,
      availableMetrics,
      detailedMetrics,
      filters,
      performanceData,
      processingTimeData,
      memoryUsageData,
      chartOptions,
      barOptions,
      applyFilters,
      formatDate,
      formatTime,
      formatMemory
    };
  }
};
</script>

<style lang="scss" scoped>
.analytics {
  h2 {
    margin-bottom: 2rem;
  }

  .filters {
    margin-bottom: 2rem;

    .filter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      align-items: end;
    }
  }

  .performance-metrics {
    margin-bottom: 2rem;
  }

  .metrics-breakdown {
    margin-bottom: 2rem;

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 1.5rem;
    }
  }

  :deep(.p-progressbar) {
    height: 1rem;
  }
}

@media (max-width: 768px) {
  .filter-grid {
    grid-template-columns: 1fr !important;
  }

  .metrics-breakdown .grid {
    grid-template-columns: 1fr !important;
  }
}</style>
