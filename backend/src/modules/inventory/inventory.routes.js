const express = require('express');
const router = express.Router();
const { getInventory, addInventory, updateInventory, deleteInventory, getUniqueValues } = require('./inventory.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/unique', getUniqueValues);
router.get('/', getInventory);
router.post('/', addInventory);
router.put('/:id', updateInventory);
router.delete('/:id', deleteInventory);

module.exports = router;
