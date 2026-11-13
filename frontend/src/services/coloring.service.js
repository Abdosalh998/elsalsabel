import api from './api';

export const coloringService = {
  getOrders: (params) => api.get('/coloring', { params }).then((res) => res.data),
  getInventoryItems: () => api.get('/coloring/inventory-items').then((res) => res.data),
  addOrder: (data) => api.post('/coloring', data).then((res) => res.data),
  returnFromColoring: (id, data) => api.post(`/coloring/${id}/return`, data).then((res) => res.data),
  stockColoredProduct: (id, data) => api.post(`/coloring/${id}/stock`, data).then((res) => res.data),
  updateOrder: (id, data) => api.put(`/coloring/${id}`, data).then((res) => res.data),
  deleteOrder: (id) => api.delete(`/coloring/${id}`).then((res) => res.data),
};

export default coloringService;

