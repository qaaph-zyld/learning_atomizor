import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue')
  },
  {
    path: '/atomize',
    name: 'AtomizeContent',
    component: () => import('../views/AtomizeContent.vue')
  },
  {
    path: '/library',
    name: 'ContentLibrary',
    component: () => import('../views/ContentLibrary.vue')
  },
  {
    path: '/analytics',
    name: 'Analytics',
    component: () => import('../views/Analytics.vue')
  }
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
});

export default router;
