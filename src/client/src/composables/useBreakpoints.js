import { ref, onMounted, onUnmounted } from 'vue';

const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1400
};

export function useBreakpoints() {
  const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 0);
  
  const updateWidth = () => {
    windowWidth.value = window.innerWidth;
  };
  
  onMounted(() => {
    window.addEventListener('resize', updateWidth);
    updateWidth();
  });
  
  onUnmounted(() => {
    window.removeEventListener('resize', updateWidth);
  });
  
  const isXs = () => windowWidth.value < breakpoints.sm;
  const isSm = () => windowWidth.value >= breakpoints.sm && windowWidth.value < breakpoints.md;
  const isMd = () => windowWidth.value >= breakpoints.md && windowWidth.value < breakpoints.lg;
  const isLg = () => windowWidth.value >= breakpoints.lg && windowWidth.value < breakpoints.xl;
  const isXl = () => windowWidth.value >= breakpoints.xl && windowWidth.value < breakpoints.xxl;
  const isXxl = () => windowWidth.value >= breakpoints.xxl;
  
  const isMobile = () => windowWidth.value < breakpoints.md;
  const isTablet = () => windowWidth.value >= breakpoints.md && windowWidth.value < breakpoints.lg;
  const isDesktop = () => windowWidth.value >= breakpoints.lg;
  
  const currentBreakpoint = () => {
    if (isXs()) return 'xs';
    if (isSm()) return 'sm';
    if (isMd()) return 'md';
    if (isLg()) return 'lg';
    if (isXl()) return 'xl';
    return 'xxl';
  };
  
  return {
    windowWidth,
    isXs,
    isSm,
    isMd,
    isLg,
    isXl,
    isXxl,
    isMobile,
    isTablet,
    isDesktop,
    currentBreakpoint,
    breakpoints
  };
}
