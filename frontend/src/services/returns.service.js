import api from './api';

export const returnsService = {
  getReturns: async (params) => {
    const { data } = await api.get('/returns', { params });
    return data;
  },

  getUniqueValues: async () => {
    const { data } = await api.get('/returns/unique-values');
    return data;
  },

  getReturnById: async (id) => {
    const { data } = await api.get(`/returns/${id}`);
    return data;
  },

  addReturn: async (returnData) => {
    const { data } = await api.post('/returns', returnData);
    return data;
  },

  deleteReturn: async (id) => {
    const { data } = await api.delete(`/returns/${id}`);
    return data;
  }
};
