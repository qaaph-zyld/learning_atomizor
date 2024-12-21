<template>
  <div class="batch-processor">
    <div class="processor-header">
      <h3>Batch Processing</h3>
      <div class="header-actions">
        <Button
          label="Process Selected"
          icon="pi pi-play"
          :disabled="!hasSelectedItems"
          @click="processBatch"
        />
        <Button
          label="Cancel Selected"
          icon="pi pi-times"
          class="p-button-danger"
          :disabled="!hasSelectedItems"
          @click="cancelSelected"
        />
      </div>
    </div>

    <DataTable
      v-model:selection="selectedItems"
      :value="queueItems"
      dataKey="_id"
      :loading="loading"
      class="p-datatable-lg"
    >
      <template #empty>No items in queue</template>
      <template #loading>Loading queue items...</template>

      <Column selectionMode="multiple" headerStyle="width: 3rem"></Column>

      <Column field="contentId.title" header="Content">
        <template #body="slotProps">
          {{ slotProps.data.contentId?.title || 'Unknown Content' }}
        </template>
      </Column>

      <Column field="status" header="Status">
        <template #body="slotProps">
          <Tag
            :value="slotProps.data.status"
            :severity="getStatusSeverity(slotProps.data.status)"
          />
        </template>
      </Column>

      <Column field="priority" header="Priority">
        <template #body="slotProps">
          <Rating
            v-model="slotProps.data.priority"
            :readonly="true"
            :cancel="false"
          />
        </template>
      </Column>

      <Column field="attempts" header="Attempts">
        <template #body="slotProps">
          <div class="attempts-info">
            {{ slotProps.data.attempts }}/{{ slotProps.data.maxAttempts }}
            <i
              v-if="slotProps.data.error"
              class="pi pi-exclamation-circle"
              v-tooltip.top="slotProps.data.error.message"
            />
          </div>
        </template>
      </Column>

      <Column field="processingTime" header="Processing Time">
        <template #body="slotProps">
          {{ formatDuration(slotProps.data.processingTime) }}
        </template>
      </Column>

      <Column :exportable="false" style="min-width: 8rem">
        <template #body="slotProps">
          <div class="action-buttons">
            <Button
              icon="pi pi-refresh"
              class="p-button-rounded p-button-text"
              v-if="canRetry(slotProps.data)"
              @click="retryItem(slotProps.data)"
              tooltip="Retry"
            />
            <Button
              icon="pi pi-times"
              class="p-button-rounded p-button-text p-button-danger"
              v-if="canCancel(slotProps.data)"
              @click="cancelItem(slotProps.data)"
              tooltip="Cancel"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Queue Metrics -->
    <div class="queue-metrics">
      <div class="metric-card">
        <span class="metric-label">Active Jobs</span>
        <span class="metric-value">{{ metrics.activeJobs }}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Processed</span>
        <span class="metric-value">{{ metrics.processed }}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Failed</span>
        <span class="metric-value">{{ metrics.failed }}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Avg. Processing Time</span>
        <span class="metric-value">{{ formatDuration(metrics.averageProcessingTime) }}</span>
      </div>
    </div>

    <!-- Status Updates -->
    <div v-if="processingUpdates.length > 0" class="status-updates">
      <h4>Recent Updates</h4>
      <Timeline :value="processingUpdates">
        <template #content="slotProps">
          <div class="status-update">
            <small class="update-time">{{ formatTime(slotProps.item.timestamp) }}</small>
            <span :class="['update-message', slotProps.item.severity]">
              {{ slotProps.item.message }}
            </span>
          </div>
        </template>
      </Timeline>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex';
import { useToast } from 'primevue/usetoast';

export default {
  name: 'BatchProcessor',

  setup() {
    const store = useStore();
    const toast = useToast();
    
    const loading = ref(false);
    const queueItems = ref([]);
    const selectedItems = ref([]);
    const metrics = ref({
      activeJobs: 0,
      processed: 0,
      failed: 0,
      averageProcessingTime: 0
    });
    const processingUpdates = ref([]);
    let statusPollInterval = null;

    const hasSelectedItems = computed(() => selectedItems.value.length > 0);

    const getStatusSeverity = (status) => {
      const severities = {
        pending: 'info',
        processing: 'warning',
        completed: 'success',
        failed: 'danger'
      };
      return severities[status] || 'info';
    };

    const canRetry = (item) => {
      return item.status === 'failed' && item.attempts < item.maxAttempts;
    };

    const canCancel = (item) => {
      return item.status === 'pending';
    };

    const formatDuration = (ms) => {
      if (!ms) return '0s';
      
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      
      if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      }
      return `${seconds}s`;
    };

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString();
    };

    const addUpdate = (message, severity = 'info') => {
      processingUpdates.value.unshift({
        message,
        severity,
        timestamp: new Date()
      });

      // Keep only last 10 updates
      if (processingUpdates.value.length > 10) {
        processingUpdates.value.pop();
      }
    };

    const fetchQueueStatus = async () => {
      try {
        const response = await store.dispatch('fetchQueueStatus');
        queueItems.value = response.items;
        metrics.value = response.metrics;
      } catch (error) {
        console.error('Failed to fetch queue status:', error);
      }
    };

    const processBatch = async () => {
      try {
        const contentIds = selectedItems.value.map(item => item.contentId._id);
        
        await store.dispatch('processBatch', {
          contentIds,
          priority: 1
        });

        addUpdate(`Started processing ${contentIds.length} items`, 'success');
        selectedItems.value = [];
        
        await fetchQueueStatus();
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to process batch',
          life: 3000
        });
      }
    };

    const cancelSelected = async () => {
      try {
        const itemIds = selectedItems.value.map(item => item._id);
        
        await store.dispatch('cancelQueueItems', { itemIds });
        
        addUpdate(`Cancelled ${itemIds.length} items`, 'info');
        selectedItems.value = [];
        
        await fetchQueueStatus();
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to cancel items',
          life: 3000
        });
      }
    };

    const retryItem = async (item) => {
      try {
        await store.dispatch('retryQueueItem', { itemId: item._id });
        
        addUpdate(`Retrying processing for "${item.contentId?.title}"`, 'info');
        await fetchQueueStatus();
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to retry item',
          life: 3000
        });
      }
    };

    const cancelItem = async (item) => {
      try {
        await store.dispatch('cancelQueueItems', { itemIds: [item._id] });
        
        addUpdate(`Cancelled processing for "${item.contentId?.title}"`, 'info');
        await fetchQueueStatus();
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to cancel item',
          life: 3000
        });
      }
    };

    onMounted(() => {
      fetchQueueStatus();
      statusPollInterval = setInterval(fetchQueueStatus, 5000);
    });

    onUnmounted(() => {
      if (statusPollInterval) {
        clearInterval(statusPollInterval);
      }
    });

    return {
      loading,
      queueItems,
      selectedItems,
      metrics,
      processingUpdates,
      hasSelectedItems,
      getStatusSeverity,
      canRetry,
      canCancel,
      formatDuration,
      formatTime,
      processBatch,
      cancelSelected,
      retryItem,
      cancelItem
    };
  }
};
</script>

<style lang="scss" scoped>
.batch-processor {
  .processor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;

    .header-actions {
      display: flex;
      gap: 1rem;
    }
  }

  .queue-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin: 2rem 0;

    .metric-card {
      background: var(--surface-card);
      padding: 1rem;
      border-radius: 8px;
      text-align: center;

      .metric-label {
        display: block;
        color: var(--text-color-secondary);
        margin-bottom: 0.5rem;
      }

      .metric-value {
        font-size: 1.5rem;
        font-weight: bold;
        color: var(--primary-color);
      }
    }
  }

  .attempts-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    i {
      color: var(--yellow-500);
      cursor: help;
    }
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .status-updates {
    margin-top: 2rem;

    h4 {
      margin-bottom: 1rem;
    }

    .status-update {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      .update-time {
        color: var(--text-color-secondary);
      }

      .update-message {
        &.success { color: var(--green-500); }
        &.error { color: var(--red-500); }
        &.warning { color: var(--yellow-500); }
        &.info { color: var(--primary-color); }
      }
    }
  }
}</style>
