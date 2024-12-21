const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendInvitationEmail(invitation) {
    const workspace = await invitation.populate('workspace invitedBy');
    
    const inviteUrl = `${process.env.CLIENT_URL}/invitations/${invitation.token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join ${workspace.name}</h2>
        
        <p>${invitation.invitedBy.name} has invited you to join their workspace on Learning Atomizer.</p>
        
        ${invitation.metadata.message ? `
          <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">
            <p><strong>Message from ${invitation.invitedBy.name}:</strong></p>
            <p>${invitation.metadata.message}</p>
          </div>
        ` : ''}
        
        <p>You'll be joining as a ${invitation.role}.</p>
        
        <div style="margin: 30px 0;">
          <a href="${inviteUrl}" style="
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
          ">
            Accept Invitation
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          This invitation will expire in 7 days. If you don't want to join this workspace,
          you can safely ignore this email.
        </p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          Learning Atomizer - Transform your content into bite-sized learning modules
        </p>
      </div>
    `;

    const text = `
      You've been invited to join ${workspace.name}
      
      ${invitation.invitedBy.name} has invited you to join their workspace on Learning Atomizer.
      
      ${invitation.metadata.message ? `
        Message from ${invitation.invitedBy.name}:
        ${invitation.metadata.message}
      ` : ''}
      
      You'll be joining as a ${invitation.role}.
      
      Accept the invitation here: ${inviteUrl}
      
      This invitation will expire in 7 days. If you don't want to join this workspace,
      you can safely ignore this email.
      
      Learning Atomizer - Transform your content into bite-sized learning modules
    `;

    const mailOptions = {
      from: `"Learning Atomizer" <${process.env.SMTP_FROM}>`,
      to: invitation.email,
      subject: `Join ${workspace.name} on Learning Atomizer`,
      text,
      html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Invitation email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(user) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Learning Atomizer!</h2>
        
        <p>Hi ${user.name},</p>
        
        <p>Thank you for joining Learning Atomizer. We're excited to help you transform
        your content into engaging learning modules.</p>
        
        <p>Here are some things you can do to get started:</p>
        
        <ul>
          <li>Create your first workspace</li>
          <li>Upload content to analyze</li>
          <li>Invite team members to collaborate</li>
        </ul>
        
        <div style="margin: 30px 0;">
          <a href="${process.env.CLIENT_URL}" style="
            background-color: #4CAF50;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 4px;
            display: inline-block;
          ">
            Get Started
          </a>
        </div>
        
        <p>If you have any questions, feel free to reach out to our support team.</p>
        
        <p>Best regards,<br>The Learning Atomizer Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          Learning Atomizer - Transform your content into bite-sized learning modules
        </p>
      </div>
    `;

    const text = `
      Welcome to Learning Atomizer!
      
      Hi ${user.name},
      
      Thank you for joining Learning Atomizer. We're excited to help you transform
      your content into engaging learning modules.
      
      Here are some things you can do to get started:
      - Create your first workspace
      - Upload content to analyze
      - Invite team members to collaborate
      
      Get started here: ${process.env.CLIENT_URL}
      
      If you have any questions, feel free to reach out to our support team.
      
      Best regards,
      The Learning Atomizer Team
      
      Learning Atomizer - Transform your content into bite-sized learning modules
    `;

    const mailOptions = {
      from: `"Learning Atomizer" <${process.env.SMTP_FROM}>`,
      to: user.email,
      subject: 'Welcome to Learning Atomizer',
      text,
      html
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();
