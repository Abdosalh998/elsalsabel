import api from './api';

export const purchasesService = {
  getPurchases: async (params) => {
    const { data } = await api.get('/purchases', { params });
    return data;
  },

  addPurchase: async (purchaseData) => {
    const { data } = await api.post('/purchases', purchaseData);
    return data;
  },

  updatePurchase: async (id, purchaseData) => {
    const { data } = await api.put(`/purchases/${id}`, purchaseData);
    return data;
  },

  updatePurchasePrice: async (id, price_per_ton) => {
    const { data } = await api.patch(`/purchases/${id}/price`, { price_per_ton });
    return data;
  },

  transferToInventory: async (id) => {
    const { data } = await api.post(`/purchases/${id}/transfer`);
    return data;
  },

  deletePurchase: async (id) => {
    const { data } = await api.delete(`/purchases/${id}`);
    return data;
  },

  getUniqueValues: async () => {
    const { data } = await api.get('/purchases/unique');
    return data;
  },
};
