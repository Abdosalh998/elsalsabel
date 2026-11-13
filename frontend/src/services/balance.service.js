import api from './api';

export const balanceService = {
  // Original flat list (kept for backward compat)
  getBalances: async (params) => {
    const { data } = await api.get('/balances', { params });
    return data;
  },

  // Phase 2: Customer Card View Summary
  getCustomerSummary: async (params = {}) => {
    const { data } = await api.get('/balances/customer-summary', { params });
    return data;
  },

  // Phase 2: Drill into a specific customer's transactions
  getCustomerTransactions: async (customerId, params = {}) => {
    const { data } = await api.get(`/balances/customer/${customerId}/transactions`, { params });
    return data;
  },

  addBalance: async (balanceData) => {
    const { data } = await api.post('/balances', balanceData);
    return data;
  },

  updateBalance: async (id, balanceData) => {
    const { data } = await api.put(`/balances/${id}`, balanceData);
    return data;
  },

  deleteBalance: async (id) => {
    const { data } = await api.delete(`/balances/${id}`);
    return data;
  }
};
