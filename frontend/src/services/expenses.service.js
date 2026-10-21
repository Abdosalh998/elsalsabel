import api from './api';

export const expensesService = {
  getExpenses: async (params) => {
    const { data } = await api.get('/expenses', { params });
    return data;
  },

  addExpense: async (expenseData) => {
    const { data } = await api.post('/expenses', expenseData);
    return data;
  },

  updateExpense: async (id, expenseData) => {
    const { data } = await api.put(`/expenses/${id}`, expenseData);
    return data;
  },

  deleteExpense: async (id) => {
    const { data } = await api.delete(`/expenses/${id}`);
    return data;
  },

  getUniqueValues: async () => {
    const { data } = await api.get('/expenses/unique');
    return data;
  }
};
