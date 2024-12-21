const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const ExportService = require('../services/ExportService');

// Get supported export formats
router.get('/formats', auth, (req, res) => {
  res.json({
    formats: ExportService.supportedFormats
  });
});

// Export content
router.post('/', auth, async (req, res) => {
  try {
    const { contentIds, format, options } = req.body;
    
    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(400).json({ error: 'contentIds must be a non-empty array' });
    }

    if (!format) {
      return res.status(400).json({ error: 'format is required' });
    }

    const result = await ExportService.exportContent(contentIds, format, options);
    
    res.json({
      message: 'Export completed successfully',
      ...result
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || 'Export failed'
    });
  }
});

// Download exported file
router.get('/download/:filename', auth, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../exports', filename);
    
    // Check if file exists
    await fs.access(filePath);
    
    res.download(filePath);
  } catch (error) {
    res.status(404).json({
      error: 'Export file not found'
    });
  }
});

module.exports = router;
