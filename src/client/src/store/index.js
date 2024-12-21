import { createStore } from 'vuex';
import axios from 'axios';

const API_URL = process.env.VUE_APP_API_URL || 'http://localhost:3000/api';

export default createStore({
  state: {
    atomizedContents: [],
    currentContent: null,
    loading: false,
    error: null,
    metrics: {
      totalContents: 0,
      averageProcessingTime: 0,
      averageAccuracy: 0
    },
    analytics: {
      trends: [],
      distribution: [],
      detailed: []
    }
  },

  getters: {
    getAtomizedContents: state => state.atomizedContents,
    getCurrentContent: state => state.currentContent,
    getMetrics: state => state.metrics,
    getAnalytics: state => state.analytics,
    isLoading: state => state.loading,
    getError: state => state.error
  },

  mutations: {
    SET_ATOMIZED_CONTENTS(state, contents) {
      state.atomizedContents = contents;
    },
    SET_CURRENT_CONTENT(state, content) {
      state.currentContent = content;
    },
    SET_LOADING(state, loading) {
      state.loading = loading;
    },
    SET_ERROR(state, error) {
      state.error = error;
    },
    SET_METRICS(state, metrics) {
      state.metrics = metrics;
    },
    SET_ANALYTICS_TRENDS(state, trends) {
      state.analytics.trends = trends;
    },
    SET_ANALYTICS_DISTRIBUTION(state, distribution) {
      state.analytics.distribution = distribution;
    },
    SET_ANALYTICS_DETAILED(state, detailed) {
      state.analytics.detailed = detailed;
    }
  },

  actions: {
    async atomizeContent({ commit }, content) {
      try {
        commit('SET_LOADING', true);
        commit('SET_ERROR', null);
        
        const response = await axios.post(`${API_URL}/content/atomize`, { content });
        commit('SET_CURRENT_CONTENT', response.data);
        
        return response.data;
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Failed to atomize content');
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },

    async fetchAtomizedContents({ commit }, { page = 1, limit = 10 } = {}) {
      try {
        commit('SET_LOADING', true);
        commit('SET_ERROR', null);
        
        const response = await axios.get(`${API_URL}/content`, { params: { page, limit } });
        commit('SET_ATOMIZED_CONTENTS', response.data.contents);
        
        return response.data;
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Failed to fetch contents');
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },

    async fetchContentById({ commit }, id) {
      try {
        commit('SET_LOADING', true);
        commit('SET_ERROR', null);
        
        const response = await axios.get(`${API_URL}/content/${id}`);
        commit('SET_CURRENT_CONTENT', response.data);
        
        return response.data;
      } catch (error) {
        commit('SET_ERROR', error.response?.data?.error || 'Failed to fetch content');
        throw error;
      } finally {
        commit('SET_LOADING', false);
      }
    },

    async updateMetrics({ commit }) {
      try {
        const response = await axios.get(`${API_URL}/analytics/metrics`);
        commit('SET_METRICS', response.data);
        return response.data;
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      }
    },

    async fetchAnalyticsTrends({ commit }, { startDate, endDate } = {}) {
      try {
        const response = await axios.get(`${API_URL}/analytics/trends`, {
          params: { startDate, endDate }
        });
        commit('SET_ANALYTICS_TRENDS', response.data);
        return response.data;
      } catch (error) {
        console.error('Failed to fetch trends:', error);
        throw error;
      }
    },

    async fetchAnalyticsDistribution({ commit }) {
      try {
        const response = await axios.get(`${API_URL}/analytics/distribution`);
        commit('SET_ANALYTICS_DISTRIBUTION', response.data);
        return response.data;
      } catch (error) {
        console.error('Failed to fetch distribution:', error);
        throw error;
      }
    },

    async fetchDetailedAnalytics({ commit }, { startDate, endDate, page, limit } = {}) {
      try {
        const response = await axios.get(`${API_URL}/analytics/detailed`, {
          params: { startDate, endDate, page, limit }
        });
        commit('SET_ANALYTICS_DETAILED', response.data);
        return response.data;
      } catch (error) {
        console.error('Failed to fetch detailed analytics:', error);
        throw error;
      }
    }
  }
});
