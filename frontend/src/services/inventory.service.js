import api from './api';

export const inventoryService = {
  getInventory: async (params) => {
    const { data } = await api.get('/inventory', { params });
    return data;
  },

  addInventory: async (inventoryData) => {
    const { data } = await api.post('/inventory', inventoryData);
    return data;
  },

  updateInventory: async (id, inventoryData) => {
    const { data } = await api.put(`/inventory/${id}`, inventoryData);
    return data;
  },

  deleteInventory: async (id) => {
    const { data } = await api.delete(`/inventory/${id}`);
    return data;
  },

  getUniqueValues: async (params) => {
    const { data } = await api.get('/inventory/unique', { params });
    return data;
  },

  getInventorySupplies: async (params) => {
    const { data } = await api.get('/inventory/supplies', { params });
    return data;
  },

  getGroupedInventory: async () => {
    const { data } = await api.get('/inventory/grouped');
    return data;
  }
};
