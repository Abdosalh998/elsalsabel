import api from './api';

export const salesService = {
  getSales: async (params) => {
    const { data } = await api.get('/sales', { params });
    return data;
  },

  addSale: async (saleData) => {
    const { data } = await api.post('/sales', saleData);
    return data;
  },

  updateSale: async (id, saleData) => {
    const { data } = await api.put(`/sales/${id}`, saleData);
    return data;
  },

  deleteSale: async (id) => {
    const { data } = await api.delete(`/sales/${id}`);
    return data;
  }
};
