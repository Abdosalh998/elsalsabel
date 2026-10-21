const express = require('express');
const router = express.Router();
const { authenticate, authorizeAdmin } = require('../../middleware/auth');
const {
  getBranches, addBranch, updateBranch, deleteBranch,
  getUsers, addUser, updateUser, deleteUser,
  getAdminStats,
  getBranchSales, getBranchTreasury, getBranchCustomers,
  getBranchPurchases, getBranchExpenses, getBranchInventory,
} = require('./admin.controller');

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorizeAdmin);

// Stats
router.get('/stats', getAdminStats);

// Branches
router.get('/branches', getBranches);
router.post('/branches', addBranch);
router.put('/branches/:id', updateBranch);
router.delete('/branches/:id', deleteBranch);

// Users
router.get('/users', getUsers);
router.post('/users', addUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Branch-level data (admin view)
router.get('/branches/:branchId/sales', getBranchSales);
router.get('/branches/:branchId/treasury', getBranchTreasury);
router.get('/branches/:branchId/customers', getBranchCustomers);
router.get('/branches/:branchId/purchases', getBranchPurchases);
router.get('/branches/:branchId/expenses', getBranchExpenses);
router.get('/branches/:branchId/inventory', getBranchInventory);

module.exports = router;
