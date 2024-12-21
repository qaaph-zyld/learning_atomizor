<template>
  <div class="responsive-layout">
    <!-- Header -->
    <header class="header" :class="{ 'nav-open': isNavOpen }">
      <div class="container">
        <div class="header-content">
          <div class="logo">
            <img src="@/assets/logo.svg" alt="Learning Atomizer" />
          </div>
          
          <button class="nav-toggle" @click="toggleNav" aria-label="Toggle navigation">
            <span></span>
            <span></span>
            <span></span>
          </button>
          
          <nav class="nav-menu" :class="{ 'active': isNavOpen }">
            <slot name="navigation"></slot>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content" :class="{ 'nav-open': isNavOpen }">
      <div class="container">
        <slot></slot>
      </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <div class="container">
        <slot name="footer"></slot>
      </div>
    </footer>

    <!-- Mobile Drawer -->
    <div class="mobile-drawer" :class="{ 'active': isNavOpen }" @click="closeNav">
      <div class="drawer-content" @click.stop>
        <slot name="drawer"></slot>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useBreakpoints } from '@/composables/useBreakpoints';

export default {
  name: 'ResponsiveLayout',
  
  setup() {
    const isNavOpen = ref(false);
    const { isMobile } = useBreakpoints();
    
    const toggleNav = () => {
      isNavOpen.value = !isNavOpen.value;
      document.body.style.overflow = isNavOpen.value ? 'hidden' : '';
    };
    
    const closeNav = () => {
      isNavOpen.value = false;
      document.body.style.overflow = '';
    };
    
    const handleResize = () => {
      if (!isMobile.value && isNavOpen.value) {
        closeNav();
      }
    };
    
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isNavOpen.value) {
        closeNav();
      }
    };
    
    onMounted(() => {
      window.addEventListener('resize', handleResize);
      document.addEventListener('keydown', handleEscape);
    });
    
    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleEscape);
    });
    
    return {
      isNavOpen,
      toggleNav,
      closeNav
    };
  }
};
</script>

<style lang="scss" scoped>
@import '@/styles/responsive.scss';

.responsive-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: var(--color-background);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease-in-out;
  
  &.nav-open {
    @media (max-width: map-get($breakpoints, 'md')) {
      transform: translateX(var(--drawer-width, 280px));
    }
  }
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: var(--space-sm) 0;
}

.logo {
  height: 40px;
  
  img {
    height: 100%;
    width: auto;
  }
}

.nav-toggle {
  display: none;
  flex-direction: column;
  justify-content: space-between;
  width: 24px;
  height: 20px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  
  @media (max-width: map-get($breakpoints, 'md')) {
    display: flex;
  }
  
  span {
    display: block;
    width: 100%;
    height: 2px;
    background-color: var(--color-text);
    transition: transform 0.3s ease-in-out;
  }
  
  .nav-open & {
    span {
      &:first-child {
        transform: translateY(9px) rotate(45deg);
      }
      
      &:nth-child(2) {
        opacity: 0;
      }
      
      &:last-child {
        transform: translateY(-9px) rotate(-45deg);
      }
    }
  }
}

.main-content {
  flex: 1;
  padding: var(--space-lg) 0;
  transition: transform 0.3s ease-in-out;
  
  &.nav-open {
    @media (max-width: map-get($breakpoints, 'md')) {
      transform: translateX(var(--drawer-width, 280px));
    }
  }
}

.footer {
  background: var(--color-background-alt);
  padding: var(--space-lg) 0;
}

.mobile-drawer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease-in-out;
  
  &.active {
    opacity: 1;
    visibility: visible;
  }
  
  .drawer-content {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: var(--drawer-width, 280px);
    background: var(--color-background);
    transform: translateX(-100%);
    transition: transform 0.3s ease-in-out;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    
    .active & {
      transform: translateX(0);
    }
  }
}

// Responsive adjustments
@media (max-width: map-get($breakpoints, 'md')) {
  .nav-menu {
    display: none;
  }
}

@media (min-width: map-get($breakpoints, 'md')) {
  .mobile-drawer {
    display: none;
  }
}

// Touch device optimizations
@media (hover: none) and (pointer: coarse) {
  .nav-toggle {
    padding: var(--space-xs);
  }
  
  .drawer-content {
    -webkit-overflow-scrolling: touch;
  }
}
</style>
