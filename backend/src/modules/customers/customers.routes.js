const express = require('express');
const router = express.Router();
const { getCustomers, addCustomer, updateCustomer, deleteCustomer, getUniqueValues, getOutstandingInvoices } = require('./customers.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate); // Protect all routes

router.get('/unique', getUniqueValues);
router.get('/', getCustomers);
router.post('/', addCustomer);
router.put('/:id', updateCustomer);

// Only admins can delete system-level data as per requirements
router.delete('/:id', deleteCustomer);
router.get('/:id/outstanding', getOutstandingInvoices);

module.exports = router;
