<template>
  <div class="content-library">
    <div class="library-header">
      <h2>Content Library</h2>
      <div class="header-actions">
        <span class="p-input-icon-left search-box">
          <i class="pi pi-search" />
          <InputText v-model="filters.global" placeholder="Search content..." />
        </span>
        <Button 
          label="Filter" 
          icon="pi pi-filter" 
          @click="showFilterDialog = true"
          class="p-button-outlined"
        />
      </div>
    </div>

    <DataTable
      :value="contents"
      :paginator="true"
      :rows="10"
      :filters="filters"
      :loading="loading"
      :globalFilterFields="['title', 'summary', 'keywords']"
      filterDisplay="menu"
      class="p-datatable-lg"
    >
      <template #empty>No content found</template>
      <template #loading>Loading content...</template>

      <Column field="title" header="Title" sortable>
        <template #body="slotProps">
          <div class="content-title" @click="viewContent(slotProps.data)">
            {{ slotProps.data.title }}
          </div>
        </template>
      </Column>

      <Column field="duration" header="Duration" sortable>
        <template #body="slotProps">
          {{ formatDuration(slotProps.data.duration) }}
        </template>
      </Column>

      <Column field="keywords" header="Keywords">
        <template #body="slotProps">
          <div class="keywords-container">
            <span v-for="keyword in slotProps.data.keywords.slice(0, 3)" 
                  :key="keyword" 
                  class="keyword-chip">
              {{ keyword }}
            </span>
            <span v-if="slotProps.data.keywords.length > 3" 
                  class="keyword-more">
              +{{ slotProps.data.keywords.length - 3 }}
            </span>
          </div>
        </template>
      </Column>

      <Column field="processingMetrics.accuracyScore" header="Accuracy" sortable>
        <template #body="slotProps">
          <ProgressBar 
            :value="slotProps.data.processingMetrics.accuracyScore * 100" 
            :showValue="true"
          />
        </template>
      </Column>

      <Column field="createdAt" header="Created" sortable>
        <template #body="slotProps">
          {{ formatDate(slotProps.data.createdAt) }}
        </template>
      </Column>

      <Column :exportable="false" style="min-width: 8rem">
        <template #body="slotProps">
          <div class="action-buttons">
            <Button 
              icon="pi pi-eye" 
              class="p-button-rounded p-button-text"
              @click="viewContent(slotProps.data)"
              tooltip="View"
            />
            <Button 
              icon="pi pi-download" 
              class="p-button-rounded p-button-text"
              @click="downloadContent(slotProps.data)"
              tooltip="Download"
            />
            <Button 
              icon="pi pi-trash" 
              class="p-button-rounded p-button-text p-button-danger"
              @click="confirmDelete(slotProps.data)"
              tooltip="Delete"
            />
          </div>
        </template>
      </Column>
    </DataTable>

    <!-- Content View Dialog -->
    <Dialog 
      v-model:visible="showContentDialog" 
      :header="selectedContent?.title || 'Content Details'"
      :modal="true"
      :style="{ width: '80vw' }"
      class="content-dialog"
    >
      <template v-if="selectedContent">
        <div class="content-details">
          <div class="metrics-bar">
            <div class="metric">
              <i class="pi pi-clock"></i>
              <span>{{ formatDuration(selectedContent.duration) }}</span>
            </div>
            <div class="metric">
              <i class="pi pi-check-circle"></i>
              <span>{{ formatPercentage(selectedContent.processingMetrics.accuracyScore) }}</span>
            </div>
            <div class="metric">
              <i class="pi pi-calendar"></i>
              <span>{{ formatDate(selectedContent.createdAt) }}</span>
            </div>
          </div>

          <div class="content-section">
            <h3>Summary</h3>
            <p>{{ selectedContent.summary }}</p>
          </div>

          <div class="content-section">
            <h3>Keywords</h3>
            <div class="keywords-full">
              <span v-for="keyword in selectedContent.keywords" 
                    :key="keyword" 
                    class="keyword-chip">
                {{ keyword }}
              </span>
            </div>
          </div>

          <div class="content-section">
            <h3>Original Content</h3>
            <div class="original-content">
              {{ selectedContent.originalContent }}
            </div>
          </div>
        </div>
      </template>
    </Dialog>

    <!-- Filter Dialog -->
    <Dialog 
      v-model:visible="showFilterDialog"
      header="Filter Content"
      :modal="true"
      :style="{ width: '30vw' }"
    >
      <div class="filter-form p-fluid">
        <div class="p-field">
          <label>Duration Range</label>
          <div class="p-inputgroup">
            <InputNumber 
              v-model="filterOptions.minDuration" 
              placeholder="Min (seconds)"
              :min="0"
            />
            <InputNumber 
              v-model="filterOptions.maxDuration" 
              placeholder="Max (seconds)"
              :min="0"
            />
          </div>
        </div>

        <div class="p-field">
          <label>Minimum Accuracy</label>
          <Slider 
            v-model="filterOptions.minAccuracy" 
            :step="5"
            :min="0"
            :max="100"
          />
          <small>{{ filterOptions.minAccuracy }}%</small>
        </div>

        <div class="p-field">
          <label>Date Range</label>
          <Calendar 
            v-model="filterOptions.dateRange"
            selectionMode="range"
            :showIcon="true"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Clear" @click="clearFilters" class="p-button-text" />
        <Button label="Apply" @click="applyFilters" />
      </template>
    </Dialog>

    <!-- Delete Confirmation -->
    <ConfirmDialog></ConfirmDialog>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';

export default {
  name: 'ContentLibrary',

  setup() {
    const store = useStore();
    const confirm = useConfirm();
    const toast = useToast();

    const contents = ref([]);
    const loading = ref(false);
    const filters = ref({
      global: null
    });

    const showContentDialog = ref(false);
    const showFilterDialog = ref(false);
    const selectedContent = ref(null);

    const filterOptions = ref({
      minDuration: null,
      maxDuration: null,
      minAccuracy: 0,
      dateRange: null
    });

    const fetchContents = async () => {
      try {
        loading.value = true;
        const response = await store.dispatch('fetchAtomizedContents');
        contents.value = response.contents;
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to fetch content',
          life: 3000
        });
      } finally {
        loading.value = false;
      }
    };

    const viewContent = (content) => {
      selectedContent.value = content;
      showContentDialog.value = true;
    };

    const downloadContent = (content) => {
      // Implementation for content download
      const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${content.title}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    };

    const confirmDelete = (content) => {
      confirm.require({
        message: 'Are you sure you want to delete this content?',
        header: 'Delete Confirmation',
        icon: 'pi pi-exclamation-triangle',
        accept: () => deleteContent(content),
        reject: () => {}
      });
    };

    const deleteContent = async (content) => {
      try {
        await store.dispatch('deleteContent', content._id);
        await fetchContents();
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Content deleted successfully',
          life: 3000
        });
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to delete content',
          life: 3000
        });
      }
    };

    const formatDuration = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const formatPercentage = (value) => `${(value * 100).toFixed(1)}%`;
    
    const formatDate = (date) => new Date(date).toLocaleDateString();

    const applyFilters = () => {
      // Implementation for applying filters
      showFilterDialog.value = false;
    };

    const clearFilters = () => {
      filterOptions.value = {
        minDuration: null,
        maxDuration: null,
        minAccuracy: 0,
        dateRange: null
      };
    };

    onMounted(() => {
      fetchContents();
    });

    return {
      contents,
      loading,
      filters,
      showContentDialog,
      showFilterDialog,
      selectedContent,
      filterOptions,
      viewContent,
      downloadContent,
      confirmDelete,
      formatDuration,
      formatPercentage,
      formatDate,
      applyFilters,
      clearFilters
    };
  }
};
</script>

<style lang="scss" scoped>
.content-library {
  .library-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;

    .header-actions {
      display: flex;
      gap: 1rem;
      align-items: center;

      .search-box {
        width: 300px;
      }
    }
  }

  .content-title {
    color: var(--primary-color);
    cursor: pointer;
    
    &:hover {
      text-decoration: underline;
    }
  }

  .keywords-container {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;

    .keyword-chip {
      background: var(--primary-50);
      color: var(--primary-700);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.875rem;
    }

    .keyword-more {
      color: var(--text-color-secondary);
      font-size: 0.875rem;
    }
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
}

.content-dialog {
  .content-details {
    .metrics-bar {
      display: flex;
      gap: 2rem;
      margin-bottom: 2rem;
      padding: 1rem;
      background: var(--surface-50);
      border-radius: 8px;

      .metric {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        i {
          color: var(--primary-color);
        }
      }
    }

    .content-section {
      margin-bottom: 2rem;

      h3 {
        color: var(--primary-color);
        margin-bottom: 1rem;
      }

      .keywords-full {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;

        .keyword-chip {
          background: var(--primary-50);
          color: var(--primary-700);
          padding: 0.5rem 1rem;
          border-radius: 16px;
          font-size: 0.9rem;
        }
      }

      .original-content {
        background: var(--surface-50);
        padding: 1rem;
        border-radius: 8px;
        white-space: pre-wrap;
      }
    }
  }
}

.filter-form {
  .p-field {
    margin-bottom: 1.5rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
  }
}</style>
