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
  },

  // ── Sections (أقسام المخزن) ──
  getSections: async (params) => {
    const { data } = await api.get('/inventory/sections', { params });
    return data;
  },

  getSectionById: async (id) => {
    const { data } = await api.get(`/inventory/sections/${id}`);
    return data;
  },

  createSection: async (sectionData) => {
    const { data } = await api.post('/inventory/sections', sectionData);
    return data;
  },

  updateSection: async (id, sectionData) => {
    const { data } = await api.put(`/inventory/sections/${id}`, sectionData);
    return data;
  },

  deleteSection: async (id) => {
    const { data } = await api.delete(`/inventory/sections/${id}`);
    return data;
  },

  assignItemToSection: async (payload) => {
    const { data } = await api.post('/inventory/sections/assign', payload);
    return data;
  },

  getSectionsWithItems: async () => {
    const { data } = await api.get('/inventory/sections/with-items');
    return data;
  },

  addSectionWeight: async (id, payload) => {
    const { data } = await api.post(`/inventory/sections/${id}/add-weight`, payload);
    return data;
  }
};
