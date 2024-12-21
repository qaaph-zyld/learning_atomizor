<template>
  <div class="dashboard">
    <h2>Dashboard</h2>

    <div class="metrics-grid">
      <Card class="metric-card">
        <template #title>
          <i class="pi pi-file"></i> Total Content
        </template>
        <template #content>
          <div class="metric-value">{{ metrics.totalContents }}</div>
          <div class="metric-label">Atomized Documents</div>
        </template>
      </Card>

      <Card class="metric-card">
        <template #title>
          <i class="pi pi-clock"></i> Processing Speed
        </template>
        <template #content>
          <div class="metric-value">{{ formatTime(metrics.averageProcessingTime) }}</div>
          <div class="metric-label">Average Processing Time</div>
        </template>
      </Card>

      <Card class="metric-card">
        <template #title>
          <i class="pi pi-check-circle"></i> Accuracy
        </template>
        <template #content>
          <div class="metric-value">{{ formatPercentage(metrics.averageAccuracy) }}</div>
          <div class="metric-label">Average Accuracy Score</div>
        </template>
      </Card>
    </div>

    <div class="performance-charts">
      <Card class="chart-card">
        <template #title>Processing Performance</template>
        <template #content>
          <Chart type="line" :data="processingChart.data" :options="processingChart.options" />
        </template>
      </Card>

      <Card class="chart-card">
        <template #title>Content Distribution</template>
        <template #content>
          <Chart type="doughnut" :data="distributionChart.data" :options="distributionChart.options" />
        </template>
      </Card>
    </div>

    <Card class="recent-content">
      <template #title>Recent Content</template>
      <template #content>
        <DataTable :value="recentContent" :rows="5" :paginator="true">
          <Column field="title" header="Title"></Column>
          <Column field="duration" header="Duration">
            <template #body="slotProps">
              {{ formatTime(slotProps.data.duration) }}
            </template>
          </Column>
          <Column field="processingMetrics.accuracyScore" header="Accuracy">
            <template #body="slotProps">
              {{ formatPercentage(slotProps.data.processingMetrics.accuracyScore) }}
            </template>
          </Column>
          <Column field="createdAt" header="Created">
            <template #body="slotProps">
              {{ formatDate(slotProps.data.createdAt) }}
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>
  </div>
</template>

<script>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';

export default {
  name: 'Dashboard',

  setup() {
    const store = useStore();
    const metrics = ref({
      totalContents: 0,
      averageProcessingTime: 0,
      averageAccuracy: 0
    });
    const recentContent = ref([]);

    const processingChart = computed(() => ({
      data: {
        labels: ['Last 7 Days'],
        datasets: [
          {
            label: 'Processing Time',
            data: [300, 280, 250, 260, 270, 240, 230],
            borderColor: '#2196F3',
            tension: 0.4
          },
          {
            label: 'Memory Usage',
            data: [50, 45, 48, 46, 47, 45, 44],
            borderColor: '#4CAF50',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    }));

    const distributionChart = computed(() => ({
      data: {
        labels: ['< 1 min', '1-2 min', '2-3 min'],
        datasets: [
          {
            data: [30, 50, 20],
            backgroundColor: ['#2196F3', '#4CAF50', '#FFC107']
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    }));

    const fetchDashboardData = async () => {
      try {
        await store.dispatch('updateMetrics');
        metrics.value = store.getters.getMetrics;
        
        const response = await store.dispatch('fetchAtomizedContents', { limit: 5 });
        recentContent.value = response.contents;
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };

    const formatTime = (ms) => {
      const seconds = ms / 1000;
      return seconds < 60 
        ? `${seconds.toFixed(1)}s`
        : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    };

    const formatPercentage = (value) => `${(value * 100).toFixed(1)}%`;

    const formatDate = (date) => new Date(date).toLocaleDateString();

    onMounted(() => {
      fetchDashboardData();
    });

    return {
      metrics,
      recentContent,
      processingChart,
      distributionChart,
      formatTime,
      formatPercentage,
      formatDate
    };
  }
};
</script>

<style lang="scss" scoped>
.dashboard {
  h2 {
    margin-bottom: 2rem;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;

    .metric-card {
      :deep(.p-card-title) {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.2rem;

        i {
          color: var(--primary-color);
        }
      }

      .metric-value {
        font-size: 2rem;
        font-weight: bold;
        color: var(--primary-color);
        margin-bottom: 0.5rem;
      }

      .metric-label {
        color: var(--text-color-secondary);
        font-size: 0.9rem;
      }
    }
  }

  .performance-charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;

    .chart-card {
      :deep(.p-card-content) {
        height: 300px;
      }
    }
  }

  .recent-content {
    :deep(.p-datatable) {
      .p-datatable-header {
        background: transparent;
        border: none;
        padding: 0;
      }
    }
  }
}

@media (max-width: 768px) {
  .performance-charts {
    grid-template-columns: 1fr !important;
  }
}</style>
