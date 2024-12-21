const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Invitation = require('../models/Invitation');
const { sendInvitationEmail } = require('../services/EmailService');

// List pending invitations for current user
router.get('/pending', auth, async (req, res) => {
  try {
    const invitations = await Invitation.findPendingByEmail(req.user.email)
      .populate('workspace')
      .populate('invitedBy', 'name email');

    res.json(invitations);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get invitation by token
router.get('/token/:token', async (req, res) => {
  try {
    const invitation = await Invitation.findByToken(req.params.token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    res.json(invitation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Accept invitation
router.post('/accept/:token', auth, async (req, res) => {
  try {
    const invitation = await Invitation.findByToken(req.params.token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Verify email matches
    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    const workspace = await invitation.accept(req.user);

    res.json({
      message: 'Invitation accepted successfully',
      workspace
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Decline invitation
router.post('/decline/:token', auth, async (req, res) => {
  try {
    const invitation = await Invitation.findByToken(req.params.token);

    if (!invitation) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    // Verify email matches
    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    await invitation.decline();

    res.json({
      message: 'Invitation declined successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Resend invitation
router.post('/resend/:id', auth, async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id)
      .populate('workspace')
      .populate('invitedBy');

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if user can resend
    const workspace = invitation.workspace;
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Reset invitation
    invitation.token = undefined; // Will generate new token
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    invitation.status = 'pending';
    
    await invitation.save();
    await sendInvitationEmail(invitation);

    res.json({
      message: 'Invitation resent successfully',
      invitation
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Cancel invitation
router.delete('/:id', auth, async (req, res) => {
  try {
    const invitation = await Invitation.findById(req.params.id)
      .populate('workspace');

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if user can cancel
    const workspace = invitation.workspace;
    const member = workspace.members.find(m => 
      m.user.toString() === req.user._id.toString()
    );
    
    if (workspace.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await invitation.remove();

    res.json({
      message: 'Invitation cancelled successfully'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
