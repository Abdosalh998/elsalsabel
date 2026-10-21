import api from './api';

export const balanceService = {
  getBalances: async (params) => {
    const { data } = await api.get('/balances', { params });
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
