const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendVerificationEmail = async (email, otp, type = 'verify_email') => {
  try {
    let subject = 'Verify Your Email';
    let text = `Your verification code is: ${otp}`;

    if (type === 'reset_password') {
      subject = 'Reset Your Password';
      text = `Your password reset code is: ${otp}`;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text
    });

  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = { sendVerificationEmail };
