import api from './api';

export const customerService = {
  getCustomers: async (params) => {
    const { data } = await api.get('/customers', { params });
    return data;
  },

  addCustomer: async (customerData) => {
    const { data } = await api.post('/customers', customerData);
    return data;
  },

  updateCustomer: async (id, customerData) => {
    const { data } = await api.put(`/customers/${id}`, customerData);
    return data;
  },

  deleteCustomer: async (id) => {
    const { data } = await api.delete(`/customers/${id}`);
    return data;
  },

  getUniqueValues: async () => {
    const { data } = await api.get('/customers/unique');
    return data;
  },

  getOutstandingInvoices: async (customerId) => {
    const { data } = await api.get(`/customers/${customerId}/outstanding`);
    return data;
  }
};

