<template>
  <div class="atomize-content">
    <h2>Atomize Content</h2>
    
    <div class="content-input p-fluid">
      <Card>
        <template #title>Input Content</template>
        <template #content>
          <div class="p-field">
            <label for="content">Paste your content here</label>
            <Textarea
              id="content"
              v-model="content"
              rows="10"
              :disabled="loading"
              placeholder="Enter your long-form content here..."
            />
          </div>
          <div class="button-container">
            <Button
              label="Atomize"
              icon="pi pi-bolt"
              @click="handleAtomize"
              :loading="loading"
              :disabled="!content"
            />
          </div>
        </template>
      </Card>
    </div>

    <div v-if="atomizedContent" class="atomized-result">
      <Card>
        <template #title>Atomized Content</template>
        <template #content>
          <div class="result-metrics">
            <div class="metric">
              <i class="pi pi-clock"></i>
              <span>Duration: {{ formatDuration(atomizedContent.duration) }}</span>
            </div>
            <div class="metric">
              <i class="pi pi-percentage"></i>
              <span>Accuracy: {{ formatAccuracy(atomizedContent.processingMetrics.accuracyScore) }}</span>
            </div>
            <div class="metric">
              <i class="pi pi-server"></i>
              <span>Memory Usage: {{ formatMemory(atomizedContent.processingMetrics.memoryUsage) }}</span>
            </div>
          </div>

          <div class="result-content">
            <h3>Title</h3>
            <p>{{ atomizedContent.title }}</p>

            <h3>Summary</h3>
            <p>{{ atomizedContent.summary }}</p>

            <h3>Keywords</h3>
            <div class="keywords">
              <span v-for="keyword in atomizedContent.keywords" :key="keyword" class="keyword-chip">
                {{ keyword }}
              </span>
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import { useStore } from 'vuex';
import { useToast } from 'primevue/usetoast';

export default {
  name: 'AtomizeContent',
  
  setup() {
    const store = useStore();
    const toast = useToast();
    const content = ref('');
    const atomizedContent = ref(null);
    const loading = ref(false);

    const handleAtomize = async () => {
      if (!content.value) return;

      try {
        loading.value = true;
        const result = await store.dispatch('atomizeContent', content.value);
        atomizedContent.value = result;
        
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Content successfully atomized!',
          life: 3000
        });
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to atomize content',
          life: 5000
        });
      } finally {
        loading.value = false;
      }
    };

    const formatDuration = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const formatAccuracy = (score) => `${(score * 100).toFixed(1)}%`;
    
    const formatMemory = (mb) => `${mb.toFixed(1)} MB`;

    return {
      content,
      atomizedContent,
      loading,
      handleAtomize,
      formatDuration,
      formatAccuracy,
      formatMemory
    };
  }
};
</script>

<style lang="scss" scoped>
.atomize-content {
  max-width: 800px;
  margin: 0 auto;

  h2 {
    margin-bottom: 2rem;
    color: var(--primary-color);
  }
}

.content-input {
  margin-bottom: 2rem;

  .button-container {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
  }
}

.atomized-result {
  .result-metrics {
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

  .result-content {
    h3 {
      color: var(--primary-color);
      margin: 1.5rem 0 0.5rem;
    }

    .keywords {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;

      .keyword-chip {
        background: var(--primary-50);
        color: var(--primary-700);
        padding: 0.5rem 1rem;
        border-radius: 16px;
        font-size: 0.9rem;
      }
    }
  }
}
</style>
