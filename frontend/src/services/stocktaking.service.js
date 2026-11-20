import api from './api';

export const stocktakingService = {
  getStocktakes: async (params) => {
    const { data } = await api.get('/stocktaking', { params });
    return data;
  },

  getStocktakeById: async (id) => {
    const { data } = await api.get(`/stocktaking/${id}`);
    return data;
  },

  createStocktake: async (stocktakeData) => {
    const { data } = await api.post('/stocktaking', stocktakeData);
    return data;
  },

  updateStocktake: async (id, stocktakeData) => {
    const { data } = await api.put(`/stocktaking/${id}`, stocktakeData);
    return data;
  },

  saveCounts: async (id, items, markAsCompleted = false) => {
    const { data } = await api.put(`/stocktaking/${id}/counts`, {
      items,
      mark_as_completed: markAsCompleted
    });
    return data;
  },

  settleStocktake: async (id) => {
    const { data } = await api.post(`/stocktaking/${id}/settle`);
    return data;
  },

  deleteStocktake: async (id) => {
    const { data } = await api.delete(`/stocktaking/${id}`);
    return data;
  }
};
