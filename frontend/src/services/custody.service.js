import api from './api';

export const custodyService = {
  getCustodies: (params) => api.get('/custody', { params }).then((res) => res.data),
  getPersonsSummary: (params) => api.get('/custody/persons', { params }).then((res) => res.data),
  getPersonStatement: (personName) => api.get(`/custody/persons/${encodeURIComponent(personName)}/statement`).then((res) => res.data),
  getPersonBalance: (name) => api.get('/custody/person-balance', { params: { name } }).then((res) => res.data),
  addCustody: (data) => api.post('/custody', data).then((res) => res.data),
  updateCustody: (id, data) => api.put(`/custody/${id}`, data).then((res) => res.data),
  deleteCustody: (id) => api.delete(`/custody/${id}`).then((res) => res.data),
  deletePerson: (personName) => api.delete(`/custody/persons/${encodeURIComponent(personName)}`).then((res) => res.data),
  addDeduction: (data) => api.post('/custody/deduction', data).then((res) => res.data),
  addCustodyTransfer: (data) => api.post('/custody/transfer', data).then((res) => res.data),
  updateCustodyTransfer: (id, data) => api.put(`/custody/transfers/${id}`, data).then((res) => res.data),
  getCustodyTransfers: (params) => api.get('/custody/transfers', { params }).then((res) => res.data),
  deleteCustodyTransfer: (id) => api.delete(`/custody/transfers/${id}`).then((res) => res.data),
};

export default custodyService;

