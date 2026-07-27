import express from 'express';
import { searchItems } from '../controllers/searchController.js';

const router = express.Router();

// GET /api/search
router.get('/', searchItems);

export default router;