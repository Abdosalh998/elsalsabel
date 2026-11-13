import api from './api';

export const reportsService = {
  getComprehensiveReport: async (params) => {
    const { data } = await api.get('/reports/comprehensive', { params });
    return data;
  },

  getSalesReport: async (params) => {
    const { data } = await api.get('/reports/sales', { params });
    return data;
  },

  getPurchasesReport: async (params) => {
    const { data } = await api.get('/reports/purchases', { params });
    return data;
  },

  getInventoryReport: async (params) => {
    const { data } = await api.get('/reports/inventory', { params });
    return data;
  },

  getTreasuryReport: async (params) => {
    const { data } = await api.get('/reports/treasury', { params });
    return data;
  },

  getExpensesReport: async (params) => {
    const { data } = await api.get('/reports/expenses', { params });
    return data;
  },

  getCustomersReport: async (params) => {
    const { data } = await api.get('/reports/customers', { params });
    return data;
  },

  getColoringReport: async (params) => {
    const { data } = await api.get('/reports/coloring', { params });
    return data;
  },

  getCustodyReport: async (params) => {
    const { data } = await api.get('/reports/custody', { params });
    return data;
  }
};

export default reportsService;
