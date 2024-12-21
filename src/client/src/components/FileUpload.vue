<template>
  <div class="file-upload">
    <FileUpload
      :multiple="true"
      accept=".pdf,.doc,.docx,.txt"
      :maxFileSize="10000000"
      @select="onSelect"
      @uploader="customUploader"
      @error="onError"
      :customUpload="true"
      :auto="true"
      chooseLabel="Choose Files"
      class="custom-upload"
    >
      <template #header="{ chooseCallback }">
        <div class="upload-header">
          <div class="upload-instructions">
            <i class="pi pi-upload"></i>
            <h3>Upload Learning Content</h3>
            <p>Drag and drop files here or click to browse</p>
            <small>Supported formats: PDF, DOC, DOCX, TXT (Max 10MB)</small>
          </div>
        </div>
      </template>

      <template #empty>
        <div class="upload-empty">
          <p>No files selected</p>
        </div>
      </template>

      <template #content="{ files, uploadedFiles, removeUploadedFileCallback, removeFileCallback }">
        <div class="upload-content">
          <!-- Files to Upload -->
          <div v-if="files.length > 0" class="upload-files">
            <h4>Files to Upload</h4>
            <div v-for="file in files" :key="file.name" class="file-item">
              <div class="file-info">
                <i :class="getFileIcon(file.type)"></i>
                <span class="file-name">{{ file.name }}</span>
                <span class="file-size">({{ formatSize(file.size) }})</span>
              </div>
              <Button
                icon="pi pi-times"
                class="p-button-rounded p-button-text p-button-danger"
                @click="() => removeFileCallback(file)"
                tooltip="Remove"
              />
            </div>
          </div>

          <!-- Uploaded Files -->
          <div v-if="uploadedFiles.length > 0" class="uploaded-files">
            <h4>Uploaded Files</h4>
            <div v-for="file in uploadedFiles" :key="file.name" class="file-item">
              <div class="file-info">
                <i :class="getFileIcon(file.type)"></i>
                <span class="file-name">{{ file.name }}</span>
                <div class="file-status">
                  <i class="pi pi-check-circle"></i>
                  <span>Uploaded successfully</span>
                </div>
              </div>
              <Button
                icon="pi pi-times"
                class="p-button-rounded p-button-text p-button-danger"
                @click="() => removeUploadedFileCallback(file)"
                tooltip="Remove"
              />
            </div>
          </div>
        </div>
      </template>
    </FileUpload>

    <!-- Processing Dialog -->
    <Dialog
      v-model:visible="showProcessingDialog"
      :modal="true"
      :closable="false"
      :style="{ width: '450px' }"
      header="Processing Files"
    >
      <div class="processing-content">
        <ProgressBar
          :value="processingProgress"
          :showValue="true"
        />
        <p>{{ processingStatus }}</p>
      </div>
    </Dialog>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useStore } from 'vuex';
import { useToast } from 'primevue/usetoast';

export default {
  name: 'FileUpload',

  setup() {
    const store = useStore();
    const toast = useToast();
    
    const showProcessingDialog = ref(false);
    const processingProgress = ref(0);
    const processingStatus = ref('');

    const customUploader = async (event) => {
      const files = event.files;
      
      try {
        showProcessingDialog.value = true;
        processingProgress.value = 0;
        processingStatus.value = 'Preparing files for upload...';

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const formData = new FormData();
          formData.append('file', file);

          // Upload file
          processingStatus.value = `Uploading ${file.name}...`;
          const uploadResult = await store.dispatch('uploadFile', formData);

          // Process content
          processingStatus.value = `Processing ${file.name}...`;
          await store.dispatch('processContent', {
            fileId: uploadResult.fileId,
            onProgress: (progress) => {
              processingProgress.value = progress;
            }
          });

          // Update progress
          processingProgress.value = ((i + 1) / files.length) * 100;
        }

        // Success notification
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: `${files.length} file(s) processed successfully`,
          life: 3000
        });

        // Clear upload
        event.clear();
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to process files',
          life: 3000
        });
      } finally {
        showProcessingDialog.value = false;
      }
    };

    const onSelect = (event) => {
      const { files } = event;
      const invalidFiles = files.filter(file => !isValidFile(file));
      
      if (invalidFiles.length > 0) {
        toast.add({
          severity: 'warn',
          summary: 'Invalid Files',
          detail: 'Some files were skipped due to unsupported format or size',
          life: 3000
        });
      }
    };

    const onError = (event) => {
      toast.add({
        severity: 'error',
        summary: 'Upload Error',
        detail: event.message || 'Failed to upload file',
        life: 3000
      });
    };

    const isValidFile = (file) => {
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      
      return validTypes.includes(file.type) && file.size <= 10000000;
    };

    const getFileIcon = (type) => {
      const icons = {
        'application/pdf': 'pi pi-file-pdf',
        'application/msword': 'pi pi-file-word',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'pi pi-file-word',
        'text/plain': 'pi pi-file'
      };
      
      return icons[type] || 'pi pi-file';
    };

    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
      showProcessingDialog,
      processingProgress,
      processingStatus,
      customUploader,
      onSelect,
      onError,
      getFileIcon,
      formatSize
    };
  }
};
</script>

<style lang="scss" scoped>
.file-upload {
  :deep(.p-fileupload) {
    .p-fileupload-buttonbar {
      display: none;
    }

    .p-fileupload-content {
      border: 2px dashed var(--surface-border);
      border-radius: 8px;
      background: var(--surface-50);
      transition: background-color 0.2s, border-color 0.2s;

      &:hover {
        background: var(--surface-100);
        border-color: var(--primary-color);
      }
    }
  }

  .upload-header {
    text-align: center;
    padding: 2rem;

    .upload-instructions {
      i {
        font-size: 3rem;
        color: var(--primary-color);
        margin-bottom: 1rem;
      }

      h3 {
        margin-bottom: 0.5rem;
        color: var(--text-color);
      }

      p {
        margin-bottom: 0.5rem;
        color: var(--text-color-secondary);
      }

      small {
        color: var(--text-color-secondary);
      }
    }
  }

  .upload-content {
    .upload-files,
    .uploaded-files {
      h4 {
        margin-bottom: 1rem;
        color: var(--text-color);
      }

      .file-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem;
        background: var(--surface-card);
        border-radius: 6px;
        margin-bottom: 0.5rem;

        .file-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;

          i {
            font-size: 1.25rem;
            color: var(--primary-color);
          }

          .file-name {
            font-weight: 500;
          }

          .file-size {
            color: var(--text-color-secondary);
          }

          .file-status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--green-500);

            i {
              color: var(--green-500);
              font-size: 1rem;
            }
          }
        }
      }
    }
  }

  .processing-content {
    text-align: center;
    padding: 1rem;

    .p-progressbar {
      margin-bottom: 1rem;
    }

    p {
      color: var(--text-color-secondary);
    }
  }
}
</style>
