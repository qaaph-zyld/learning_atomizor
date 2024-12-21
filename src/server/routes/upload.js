const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { auth } = require('../middleware/auth');
const Content = require('../models/Content');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Upload single file
router.post('/file', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('No file uploaded');
    }

    // Create content record
    const content = new Content({
      title: path.parse(req.file.originalname).name,
      filePath: req.file.path,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user._id,
      status: 'pending'
    });

    await content.save();

    res.status(201).json({
      fileId: content._id,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      await fs.unlink(req.file.path).catch(console.error);
    }
    
    res.status(400).json({
      error: error.message || 'Failed to upload file'
    });
  }
});

// Get upload status
router.get('/status/:fileId', auth, async (req, res) => {
  try {
    const content = await Content.findById(req.params.fileId);
    
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (content.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      status: content.status,
      progress: content.processingProgress,
      error: content.processingError
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || 'Failed to get upload status'
    });
  }
});

// Delete uploaded file
router.delete('/file/:fileId', auth, async (req, res) => {
  try {
    const content = await Content.findById(req.params.fileId);
    
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (content.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete file from storage
    if (content.filePath) {
      await fs.unlink(content.filePath).catch(console.error);
    }

    // Delete content record
    await content.deleteOne();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(400).json({
      error: error.message || 'Failed to delete file'
    });
  }
});

module.exports = router;
