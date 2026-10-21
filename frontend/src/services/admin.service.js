import api from './api';

export const adminService = {
  // Stats
  getStats: () => api.get('/admin/stats').then(r => r.data),

  // Branches
  getBranches: () => api.get('/admin/branches').then(r => r.data),
  addBranch: (data) => api.post('/admin/branches', data).then(r => r.data),
  updateBranch: (id, data) => api.put(`/admin/branches/${id}`, data).then(r => r.data),
  deleteBranch: (id) => api.delete(`/admin/branches/${id}`).then(r => r.data),

  // Users
  getUsers: () => api.get('/admin/users').then(r => r.data),
  addUser: (data) => api.post('/admin/users', data).then(r => r.data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data).then(r => r.data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`).then(r => r.data),

  // Branch data
  getBranchSales: (branchId, params) => api.get(`/admin/branches/${branchId}/sales`, { params }).then(r => r.data),
  getBranchTreasury: (branchId) => api.get(`/admin/branches/${branchId}/treasury`).then(r => r.data),
  getBranchCustomers: (branchId, params) => api.get(`/admin/branches/${branchId}/customers`, { params }).then(r => r.data),
  getBranchPurchases: (branchId, params) => api.get(`/admin/branches/${branchId}/purchases`, { params }).then(r => r.data),
  getBranchExpenses: (branchId, params) => api.get(`/admin/branches/${branchId}/expenses`, { params }).then(r => r.data),
  getBranchInventory: (branchId) => api.get(`/admin/branches/${branchId}/inventory`).then(r => r.data),
};
