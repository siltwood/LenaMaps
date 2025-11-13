/**
 * Email service using PurelyMail SMTP via nodemailer
 *
 * Handles password reset emails and other transactional emails
 */

const nodemailer = require('nodemailer');
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  FRONTEND_URL,
  NODE_ENV
} = require('../config/env');

// Create reusable transporter
let transporter = null;

function getTransporter() {
  if (!transporter) {
    // Check if SMTP is configured
    if (!SMTP_USER || !SMTP_PASS) {
      console.warn('⚠️  SMTP credentials not configured. Emails will not be sent.');
      return null;
    }

    transporter = nodemailer.createTransporter({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  return transporter;
}

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetToken - Password reset token
 * @returns {Promise<object>} Email send result
 */
async function sendPasswordResetEmail(to, resetToken) {
  const transporter = getTransporter();

  if (!transporter) {
    // In development, log the reset link instead of sending email
    if (NODE_ENV === 'development') {
      const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
      console.log('\n📧 Password Reset Email (Dev Mode):');
      console.log(`To: ${to}`);
      console.log(`Reset Link: ${resetLink}`);
      console.log('Copy this link to reset your password\n');
      return { messageId: 'dev-mode-no-email' };
    }

    throw new Error('Email service not configured');
  }

  const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: SMTP_FROM,
    to: to,
    subject: 'Reset Your LenaMaps Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 32px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 32px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }
          .content {
            margin-bottom: 32px;
          }
          .button {
            display: inline-block;
            background: #2563eb;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 32px;
            border-radius: 6px;
            font-weight: 600;
            text-align: center;
          }
          .button:hover {
            background: #1d4ed8;
          }
          .footer {
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
          }
          .link {
            color: #2563eb;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗺️ LenaMaps</h1>
          </div>

          <div class="content">
            <h2>Reset Your Password</h2>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>

            <p style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" class="button">Reset Password</a>
            </p>

            <p>Or copy and paste this link into your browser:</p>
            <p class="link">${resetLink}</p>

            <p style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
              <strong>Note:</strong> This link will expire in 1 hour for security reasons.
            </p>

            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>

          <div class="footer">
            <p>LenaMaps - Plan Your Journey</p>
            <p style="font-size: 12px; color: #9ca3af;">
              This is an automated email. Please do not reply.
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Reset Your LenaMaps Password

We received a request to reset your password. Visit the link below to create a new password:

${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email.

---
LenaMaps - Plan Your Journey
    `.trim()
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️  Password reset email sent to ${to}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}

/**
 * Send welcome email (optional - for future use)
 * @param {string} to - Recipient email address
 * @param {string} name - User's name
 * @returns {Promise<object>} Email send result
 */
async function sendWelcomeEmail(to, name) {
  const transporter = getTransporter();

  if (!transporter) {
    if (NODE_ENV === 'development') {
      console.log(`\n📧 Welcome Email (Dev Mode) to ${to}\n`);
      return { messageId: 'dev-mode-no-email' };
    }
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: SMTP_FROM,
    to: to,
    subject: 'Welcome to LenaMaps!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 32px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 32px;
          }
          .header h1 {
            color: #2563eb;
            margin: 0;
            font-size: 28px;
          }
          .button {
            display: inline-block;
            background: #2563eb;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 32px;
            border-radius: 6px;
            font-weight: 600;
          }
          .footer {
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e5e7eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🗺️ Welcome to LenaMaps!</h1>
          </div>

          <div class="content">
            <p>Hi ${name || 'there'},</p>

            <p>Thanks for signing up! You can now:</p>
            <ul>
              <li>Create up to 10 routes per day</li>
              <li>Save your favorite routes</li>
              <li>Plan multi-stop journeys</li>
            </ul>

            <p style="text-align: center; margin: 32px 0;">
              <a href="${FRONTEND_URL}" class="button">Start Planning</a>
            </p>

            <p>Need unlimited routes? Upgrade to Pro for just $7/month!</p>
          </div>

          <div class="footer">
            <p>Happy mapping!</p>
            <p>The LenaMaps Team</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️  Welcome email sent to ${to}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    // Don't throw error - welcome email is not critical
    return null;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
