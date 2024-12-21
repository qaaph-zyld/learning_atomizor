const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Workspace = require('../models/Workspace');
const Invitation = require('../models/Invitation');
const { sendInvitationEmail } = require('../services/EmailService');

// List user's workspaces
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.findByUser(req.user._id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    res.json(workspaces);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Create workspace
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, settings, tags, metadata } = req.body;

    const workspace = new Workspace({
      name,
      description,
      owner: req.user._id,
      settings,
      tags,
      metadata,
      members: [{
        user: req.user._id,
        role: 'admin',
        invitedBy: req.user._id
      }]
    });

    await workspace.save();

    res.status(201).json({
      message: 'Workspace created successfully',
      workspace
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get workspace details
router.get('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email')
      .populate('members.invitedBy', 'name email');

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user has access
    const isMember = workspace.members.some(m => 
      m.user._id.toString() === req.user._id.toString()
    );

    if (!isMember && workspace.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(workspace);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update workspace
router.patch('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user is admin or owner
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = req.body;
    const allowedUpdates = ['name', 'description', 'settings', 'tags', 'metadata'];
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        workspace[key] = updates[key];
      }
    });

    await workspace.save();
    await workspace.updateStatistics();

    res.json({
      message: 'Workspace updated successfully',
      workspace
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete workspace
router.delete('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Only owner can delete workspace
    if (workspace.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await workspace.remove();

    res.json({
      message: 'Workspace deleted successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Invite member
router.post('/:id/invite', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user can invite
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { email, role, message } = req.body;

    // Check if already a member
    const existingMember = workspace.members.find(m => m.user.email === email);
    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Check for pending invitation
    const pendingInvitation = await Invitation.findOne({
      workspace: workspace._id,
      email,
      status: 'pending'
    });

    if (pendingInvitation) {
      return res.status(400).json({ error: 'Invitation already sent' });
    }

    // Create invitation
    const invitation = new Invitation({
      workspace: workspace._id,
      email,
      role,
      invitedBy: req.user._id,
      metadata: { message }
    });

    await invitation.save();

    // Send invitation email
    await sendInvitationEmail(invitation);

    res.status(201).json({
      message: 'Invitation sent successfully',
      invitation
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update member role
router.patch('/:id/members/:userId', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user can update roles
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { role } = req.body;

    // Cannot change owner's role
    if (workspace.owner.toString() === req.params.userId) {
      return res.status(400).json({ error: 'Cannot change owner\'s role' });
    }

    await workspace.updateMemberRole(req.params.userId, role);

    res.json({
      message: 'Member role updated successfully',
      workspace
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Remove member
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user can remove members
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Cannot remove owner
    if (workspace.owner.toString() === req.params.userId) {
      return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }

    await workspace.removeMember(req.params.userId);

    res.json({
      message: 'Member removed successfully',
      workspace
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get workspace statistics
router.get('/:id/statistics', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user has access
    const isMember = workspace.members.some(m => 
      m.user.toString() === req.user._id.toString()
    );

    if (!isMember && workspace.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await workspace.updateStatistics();

    res.json(workspace.statistics);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
