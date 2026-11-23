import api from './api';

export const jardService = {
  getJardList: async (params) => {
    const { data } = await api.get('/jard', { params });
    return data;
  },

  getJardById: async (id) => {
    const { data } = await api.get(`/jard/${id}`);
    return data;
  },

  addJardItem: async (jardData) => {
    const { data } = await api.post('/jard', jardData);
    return data;
  },

  updateJardItem: async (id, jardData) => {
    const { data } = await api.put(`/jard/${id}`, jardData);
    return data;
  },

  deleteJardItem: async (id) => {
    const { data } = await api.delete(`/jard/${id}`);
    return data;
  },

  addMovement: async (movementData) => {
    const { data } = await api.post('/jard/movements', movementData);
    return data;
  },

  deleteMovement: async (id) => {
    const { data } = await api.delete(`/jard/movements/${id}`);
    return data;
  },

  getJardForPOS: async () => {
    const { data } = await api.get('/jard/pos');
    return data;
  },

  syncWithInventory: async () => {
    const { data } = await api.post('/jard/sync');
    return data;
  }
};

export default jardService;
