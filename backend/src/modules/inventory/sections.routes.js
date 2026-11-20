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
} = require('./sections.controller');
const { authenticate } = require('../../middleware/auth');

router.use(authenticate);

router.get('/with-items', getSectionsWithItems);
router.get('/', getSections);
router.get('/:id', getSectionById);
router.post('/', createSection);
router.put('/:id', updateSection);
router.delete('/:id', deleteSection);
router.post('/assign', assignItemToSection);

module.exports = router;
