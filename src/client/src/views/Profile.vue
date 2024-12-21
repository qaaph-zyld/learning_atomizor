<template>
  <div class="profile-page">
    <h2>User Profile</h2>

    <div class="profile-grid">
      <!-- Profile Information -->
      <Card class="profile-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-user"></i>
            Profile Information
          </div>
        </template>
        <template #content>
          <form @submit.prevent="updateProfile" class="p-fluid">
            <div class="p-field">
              <label for="name">Full Name</label>
              <InputText
                id="name"
                v-model="profileForm.name"
                :class="{ 'p-invalid': v$.profileForm.name.$invalid && submitted }"
                aria-describedby="name-error"
              />
              <small id="name-error" class="p-error" v-if="v$.profileForm.name.$invalid && submitted">
                {{ v$.profileForm.name.$errors[0].$message }}
              </small>
            </div>

            <div class="p-field">
              <label for="email">Email Address</label>
              <InputText
                id="email"
                v-model="profileForm.email"
                disabled
              />
              <small class="helper-text">Email cannot be changed</small>
            </div>

            <div class="form-actions">
              <Button
                type="submit"
                label="Save Changes"
                icon="pi pi-check"
                :loading="loading"
              />
            </div>
          </form>
        </template>
      </Card>

      <!-- Security Settings -->
      <Card class="profile-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-shield"></i>
            Security Settings
          </div>
        </template>
        <template #content>
          <form @submit.prevent="updatePassword" class="p-fluid">
            <div class="p-field">
              <label for="currentPassword">Current Password</label>
              <Password
                id="currentPassword"
                v-model="passwordForm.currentPassword"
                :feedback="false"
                toggleMask
                :class="{ 'p-invalid': v$.passwordForm.currentPassword.$invalid && submitted }"
              />
              <small class="p-error" v-if="v$.passwordForm.currentPassword.$invalid && submitted">
                {{ v$.passwordForm.currentPassword.$errors[0].$message }}
              </small>
            </div>

            <div class="p-field">
              <label for="newPassword">New Password</label>
              <Password
                id="newPassword"
                v-model="passwordForm.newPassword"
                :class="{ 'p-invalid': v$.passwordForm.newPassword.$invalid && submitted }"
                :mediumRegex="/^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})/"
                :strongRegex="/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/"
              />
              <small class="p-error" v-if="v$.passwordForm.newPassword.$invalid && submitted">
                {{ v$.passwordForm.newPassword.$errors[0].$message }}
              </small>
            </div>

            <div class="p-field">
              <label for="confirmPassword">Confirm New Password</label>
              <Password
                id="confirmPassword"
                v-model="passwordForm.confirmPassword"
                :feedback="false"
                toggleMask
                :class="{ 'p-invalid': v$.passwordForm.confirmPassword.$invalid && submitted }"
              />
              <small class="p-error" v-if="v$.passwordForm.confirmPassword.$invalid && submitted">
                {{ v$.passwordForm.confirmPassword.$errors[0].$message }}
              </small>
            </div>

            <div class="form-actions">
              <Button
                type="submit"
                label="Update Password"
                icon="pi pi-lock"
                :loading="loading"
              />
            </div>
          </form>
        </template>
      </Card>

      <!-- Usage Statistics -->
      <Card class="profile-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-chart-bar"></i>
            Usage Statistics
          </div>
        </template>
        <template #content>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ stats.totalContent }}</div>
              <div class="stat-label">Total Content</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ formatDate(stats.lastLogin) }}</div>
              <div class="stat-label">Last Login</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ stats.averageAccuracy }}%</div>
              <div class="stat-label">Average Accuracy</div>
            </div>
          </div>

          <div class="usage-chart">
            <Chart type="line" :data="usageData" :options="chartOptions" />
          </div>
        </template>
      </Card>

      <!-- Preferences -->
      <Card class="profile-card">
        <template #title>
          <div class="card-title">
            <i class="pi pi-cog"></i>
            Preferences
          </div>
        </template>
        <template #content>
          <div class="preferences-form p-fluid">
            <div class="p-field-checkbox">
              <Checkbox
                v-model="preferences.emailNotifications"
                :binary="true"
                inputId="emailNotifications"
              />
              <label for="emailNotifications">Email Notifications</label>
            </div>

            <div class="p-field">
              <label>Default Content Duration</label>
              <Dropdown
                v-model="preferences.defaultDuration"
                :options="durationOptions"
                optionLabel="label"
                optionValue="value"
                placeholder="Select Duration"
              />
            </div>

            <div class="p-field">
              <label>Theme</label>
              <SelectButton v-model="preferences.theme" :options="themeOptions" />
            </div>

            <div class="form-actions">
              <Button
                label="Save Preferences"
                icon="pi pi-save"
                @click="savePreferences"
                :loading="loading"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useToast } from 'primevue/usetoast';
import { useVuelidate } from '@vuelidate/core';
import { required, email, minLength, sameAs } from '@vuelidate/validators';

export default {
  name: 'Profile',

  setup() {
    const store = useStore();
    const toast = useToast();
    const loading = ref(false);
    const submitted = ref(false);

    const profileForm = reactive({
      name: '',
      email: ''
    });

    const passwordForm = reactive({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });

    const preferences = reactive({
      emailNotifications: true,
      defaultDuration: 120,
      theme: 'light'
    });

    const stats = reactive({
      totalContent: 0,
      lastLogin: null,
      averageAccuracy: 0
    });

    const rules = {
      profileForm: {
        name: { required },
        email: { required, email }
      },
      passwordForm: {
        currentPassword: { required },
        newPassword: { required, minLength: minLength(8) },
        confirmPassword: { required, sameAs: sameAs(passwordForm.newPassword) }
      }
    };

    const v$ = useVuelidate(rules, { profileForm, passwordForm });

    const durationOptions = [
      { label: '1 Minute', value: 60 },
      { label: '2 Minutes', value: 120 },
      { label: '3 Minutes', value: 180 }
    ];

    const themeOptions = ['light', 'dark'];

    const usageData = {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        {
          label: 'Content Created',
          data: [12, 15, 18, 14, 20, 16],
          borderColor: '#2196F3',
          tension: 0.4
        }
      ]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    };

    const updateProfile = async () => {
      submitted.value = true;
      const isValid = await v$.value.profileForm.$validate();
      
      if (!isValid) return;

      try {
        loading.value = true;
        await store.dispatch('updateProfile', {
          name: profileForm.name
        });
        
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Profile updated successfully',
          life: 3000
        });
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to update profile',
          life: 3000
        });
      } finally {
        loading.value = false;
      }
    };

    const updatePassword = async () => {
      submitted.value = true;
      const isValid = await v$.value.passwordForm.$validate();
      
      if (!isValid) return;

      try {
        loading.value = true;
        await store.dispatch('updatePassword', {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        });
        
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Password updated successfully',
          life: 3000
        });
        
        // Clear password form
        passwordForm.currentPassword = '';
        passwordForm.newPassword = '';
        passwordForm.confirmPassword = '';
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to update password',
          life: 3000
        });
      } finally {
        loading.value = false;
      }
    };

    const savePreferences = async () => {
      try {
        loading.value = true;
        await store.dispatch('updatePreferences', preferences);
        
        toast.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Preferences saved successfully',
          life: 3000
        });
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: error.message || 'Failed to save preferences',
          life: 3000
        });
      } finally {
        loading.value = false;
      }
    };

    const formatDate = (date) => {
      if (!date) return 'Never';
      return new Date(date).toLocaleDateString();
    };

    const loadUserData = async () => {
      try {
        const user = await store.dispatch('fetchUserProfile');
        profileForm.name = user.name;
        profileForm.email = user.email;
        preferences.emailNotifications = user.preferences?.emailNotifications ?? true;
        preferences.defaultDuration = user.preferences?.defaultDuration ?? 120;
        preferences.theme = user.preferences?.theme ?? 'light';
        
        // Load stats
        const userStats = await store.dispatch('fetchUserStats');
        stats.totalContent = userStats.totalContent;
        stats.lastLogin = userStats.lastLogin;
        stats.averageAccuracy = userStats.averageAccuracy;
      } catch (error) {
        console.error('Failed to load user data:', error);
      }
    };

    onMounted(() => {
      loadUserData();
    });

    return {
      profileForm,
      passwordForm,
      preferences,
      stats,
      loading,
      submitted,
      v$,
      durationOptions,
      themeOptions,
      usageData,
      chartOptions,
      updateProfile,
      updatePassword,
      savePreferences,
      formatDate
    };
  }
};
</script>

<style lang="scss" scoped>
.profile-page {
  h2 {
    margin-bottom: 2rem;
  }

  .profile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 2rem;
  }

  .profile-card {
    :deep(.p-card-title) {
      .card-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        i {
          color: var(--primary-color);
        }
      }
    }
  }

  .form-actions {
    margin-top: 2rem;
    display: flex;
    justify-content: flex-end;
  }

  .helper-text {
    color: var(--text-color-secondary);
    font-size: 0.875rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;

    .stat-item {
      text-align: center;
      padding: 1rem;
      background: var(--surface-50);
      border-radius: 8px;

      .stat-value {
        font-size: 1.5rem;
        font-weight: bold;
        color: var(--primary-color);
        margin-bottom: 0.5rem;
      }

      .stat-label {
        color: var(--text-color-secondary);
        font-size: 0.875rem;
      }
    }
  }

  .usage-chart {
    height: 300px;
  }

  .preferences-form {
    .p-field {
      margin-bottom: 1.5rem;
    }

    .p-field-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
  }
}

@media (max-width: 768px) {
  .profile-grid {
    grid-template-columns: 1fr !important;
  }

  .stats-grid {
    grid-template-columns: 1fr !important;
  }
}</style>
