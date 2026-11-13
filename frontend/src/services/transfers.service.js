import api from './api';

export const transfersService = {
  getTransfers: async (params) => {
    const { data } = await api.get('/transfers', { params });
    return data;
  },

  getTransferById: async (id) => {
    const { data } = await api.get(`/transfers/${id}`);
    return data;
  },

  getAvailableBranches: async () => {
    const { data } = await api.get('/transfers/available-branches');
    return data;
  },

  getAvailableInventory: async () => {
    const { data } = await api.get('/transfers/available-inventory');
    return data;
  },

  createTransfer: async (transferData) => {
    const { data } = await api.post('/transfers', transferData);
    return data;
  },

  confirmTransfer: async (id) => {
    const { data } = await api.post(`/transfers/${id}/confirm`);
    return data;
  },

  rejectTransfer: async (id, reason) => {
    const { data } = await api.post(`/transfers/${id}/reject`, { reason });
    return data;
  },

  cancelTransfer: async (id) => {
    const { data } = await api.post(`/transfers/${id}/cancel`);
    return data;
  },

  deleteTransfer: async (id) => {
    const { data } = await api.delete(`/transfers/${id}`);
    return data;
  }
};
