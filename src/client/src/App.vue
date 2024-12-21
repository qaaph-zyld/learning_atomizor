<template>
  <ResponsiveLayout>
    <!-- Navigation -->
    <template #navigation>
      <nav class="nav-links">
        <router-link to="/" class="nav-link">Home</router-link>
        <router-link to="/content" class="nav-link">Content</router-link>
        <router-link to="/search" class="nav-link">Search</router-link>
        <router-link to="/profile" class="nav-link">Profile</router-link>
      </nav>
    </template>

    <!-- Main Content -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>

    <!-- Footer -->
    <template #footer>
      <div class="footer-content">
        <p>&copy; {{ currentYear }} Learning Atomizer. All rights reserved.</p>
      </div>
    </template>

    <!-- Mobile Drawer -->
    <template #drawer>
      <div class="drawer-menu">
        <router-link to="/" class="drawer-link">Home</router-link>
        <router-link to="/content" class="drawer-link">Content</router-link>
        <router-link to="/search" class="drawer-link">Search</router-link>
        <router-link to="/profile" class="drawer-link">Profile</router-link>
      </div>
    </template>
  </ResponsiveLayout>
</template>

<script>
import { computed } from 'vue';
import ResponsiveLayout from '@/components/layout/ResponsiveLayout.vue';

export default {
  name: 'App',
  
  components: {
    ResponsiveLayout
  },
  
  setup() {
    const currentYear = computed(() => new Date().getFullYear());
    
    return {
      currentYear
    };
  }
};
</script>

<style lang="scss">
@import '@/styles/responsive.scss';

// Global styles
:root {
  // Colors
  --color-primary: #4a90e2;
  --color-secondary: #50e3c2;
  --color-success: #13ce66;
  --color-danger: #ff4949;
  --color-warning: #ffc82c;
  --color-info: #909399;
  
  --color-text: #2c3e50;
  --color-text-light: #909399;
  --color-background: #ffffff;
  --color-background-alt: #f8f9fa;
  --color-border: #dcdfe6;
  
  // Transitions
  --transition-fast: 0.15s ease-in-out;
  --transition-normal: 0.3s ease-in-out;
  --transition-slow: 0.5s ease-in-out;
  
  // Shadows
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  
  // Z-index layers
  --z-drawer: 1000;
  --z-header: 900;
  --z-overlay: 800;
}

// Reset
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--color-text);
  background-color: var(--color-background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

// Navigation styles
.nav-links {
  display: flex;
  gap: var(--space-md);
  
  @media (max-width: map-get($breakpoints, 'md')) {
    flex-direction: column;
    gap: var(--space-sm);
  }
}

.nav-link {
  color: var(--color-text);
  text-decoration: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: 4px;
  transition: background-color var(--transition-fast);
  
  &:hover,
  &.router-link-active {
    background-color: var(--color-background-alt);
  }
  
  @media (max-width: map-get($breakpoints, 'md')) {
    padding: var(--space-sm);
  }
}

// Drawer styles
.drawer-menu {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.drawer-link {
  color: var(--color-text);
  text-decoration: none;
  padding: var(--space-sm);
  border-radius: 4px;
  transition: background-color var(--transition-fast);
  
  &:hover,
  &.router-link-active {
    background-color: var(--color-background-alt);
  }
}

// Footer styles
.footer-content {
  text-align: center;
  color: var(--color-text-light);
}

// Transitions
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-normal);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
