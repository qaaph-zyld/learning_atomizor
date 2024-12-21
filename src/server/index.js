require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer'); 
const contentRoutes = require('./routes/content');
const analyticsRoutes = require('./routes/analytics');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const queueRoutes = require('./routes/queue');
const exportRoutes = require('./routes/export');
const webhookRoutes = require('./routes/webhooks');
const workspaceRoutes = require('./routes/workspaces');
const invitationRoutes = require('./routes/invitations');
const auditRoutes = require('./routes/audit');
const { auth } = require('./middleware/auth');
const Role = require('./models/Role');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    // Create default roles
    await Role.createDefaultRoles();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/content', auth, contentRoutes);
app.use('/api/analytics', auth, analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/audit', auditRoutes);

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Learning Content Atomizer API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
