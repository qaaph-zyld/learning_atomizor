import { defineStore } from 'pinia';
import axios from 'axios';

const API_BASE_URL = process.env.VUE_APP_API_URL || 'http://localhost:3000';

export const useLoadBalancerStore = defineStore('loadBalancer', {
  state: () => ({
    metrics: {
      activeWorkers: 0,
      maxWorkers: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      errorRate: 0,
      workers: [],
      requestRate: 0
    },
    error: null,
    loading: false
  }),

  actions: {
    async fetchMetrics() {
      try {
        this.loading = true;
        this.error = null;
        
        const response = await axios.get(`${API_BASE_URL}/metrics`);
        this.metrics = response.data;
        
        // Calculate error rate
        if (this.metrics.totalRequests > 0) {
          const totalErrors = this.metrics.workers.reduce((sum, worker) => sum + worker.errorCount, 0);
          this.metrics.errorRate = totalErrors / this.metrics.totalRequests;
        }

        // Calculate request rate (requests per second)
        const now = Date.now();
        if (this.lastUpdate) {
          const timeDiff = (now - this.lastUpdate) / 1000;
          const requestDiff = this.metrics.totalRequests - this.lastTotalRequests;
          this.metrics.requestRate = requestDiff / timeDiff;
        }
        this.lastUpdate = now;
        this.lastTotalRequests = this.metrics.totalRequests;

        return this.metrics;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async checkHealth() {
      try {
        const response = await axios.get(`${API_BASE_URL}/health`);
        return response.data;
      } catch (error) {
        this.error = error.message;
        throw error;
      }
    },

    async runLoadTest(duration = 5000) {
      try {
        const startTime = Date.now();
        const requests = [];
        
        while (Date.now() - startTime < duration) {
          requests.push(axios.get(`${API_BASE_URL}/load-test`));
        }
        
        await Promise.all(requests);
        await this.fetchMetrics();
      } catch (error) {
        this.error = error.message;
        throw error;
      }
    }
  }
});
