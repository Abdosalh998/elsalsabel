const express = require('express');
const router = express.Router();
const {
  getSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  assignItemToSection,
  getSectionsWithItems,
  addWeightToSection,
} = require('./sections.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/with-items', getSectionsWithItems);
router.get('/', getSections);
router.get('/:id', getSectionById);
router.post('/', createSection);
router.post('/:id/add-weight', addWeightToSection);
router.put('/:id', updateSection);
router.delete('/:id', deleteSection);
router.post('/assign', assignItemToSection);

module.exports = router;
