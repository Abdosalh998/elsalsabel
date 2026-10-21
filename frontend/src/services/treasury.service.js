import api from './api';

export const treasuryService = {
  getTreasury: async (params) => {
    const { data } = await api.get('/treasury', { params });
    return data;
  },

  addTreasury: async (treasuryData) => {
    const { data } = await api.post('/treasury', treasuryData);
    return data;
  },

  updateTreasury: async (id, treasuryData) => {
    const { data } = await api.put(`/treasury/${id}`, treasuryData);
    return data;
  },

  deleteTreasury: async (id) => {
    const { data } = await api.delete(`/treasury/${id}`);
    return data;
  },

  getPaymentTypes: async () => {
    const { data } = await api.get('/treasury/payment-types');
    return data;
  },

  addPaymentType: async (name) => {
    const { data } = await api.post('/treasury/payment-types', { name });
    return data;
  }
};
