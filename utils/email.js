// utils/email.js
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const handlebars = require('handlebars');

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Email templates
const templates = {
  emailVerification: {
    subject: 'Verify your ResumeCraft AI account',
    template: 'emailVerification.hbs',
  },
  passwordReset: {
    subject: 'Reset your ResumeCraft AI password',
    template: 'passwordReset.hbs',
  },
  welcome: {
    subject: 'Welcome to ResumeCraft AI!',
    template: 'welcome.hbs',
  },
  subscriptionUpgrade: {
    subject: 'Your ResumeCraft AI subscription has been upgraded!',
    template: 'subscriptionUpgrade.hbs',
  },
  resumeShared: {
    subject: 'Someone shared a resume with you',
    template: 'resumeShared.hbs',
  },
};

const sendEmail = async ({ to, subject, template, data }) => {
  try {
    // Load template
    const templatePath = path.join(__dirname, '../templates/emails', templates[template].template);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    
    // Compile template
    const compiledTemplate = handlebars.compile(templateContent);
    const html = compiledTemplate({
      ...data,
      year: new Date().getFullYear(),
      companyName: 'ResumeCraft AI',
      supportEmail: 'support@resumecraft.ai',
      appUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"ResumeCraft AI" <${process.env.SMTP_USER}>`,
      to,
      subject: templates[template].subject || subject,
      html,
    });

    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

module.exports = sendEmail;