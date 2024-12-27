const express = require('express');
const router = express.Router();
const User = require('../models/User');
const EmailVerification = require('../models/EmailVerification');
const { sendVerificationEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Signup route
router.post('/signup', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Save OTP and email to verification collection
    await EmailVerification.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    });

    // Send verification email
    await sendVerificationEmail(email, otp);

    // Store user data temporarily - store plain password
    req.app.locals.tempUserData = {
      email,
      password, // Store plain password, will hash during user creation
      username
    };

    res.status(200).json({ 
      message: 'Verification code sent to email',
      email 
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Error in signup process' });
  }
});

// Verify OTP route
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const verification = await EmailVerification.findOne({
      email,
      otp,
      expiresAt: { $gt: new Date() }
    });

    if (!verification) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Get temporary user data
    const userData = req.app.locals.tempUserData;
    if (!userData || userData.email !== email) {
      return res.status(400).json({ message: 'Invalid verification attempt' });
    }

    // Create user - Password will be hashed by the pre-save middleware
    const user = await User.create({
      email: userData.email,
      password: userData.password, // Plain password - will be hashed by pre-save middleware
      username: userData.username,
      isEmailVerified: true
    });

    // Clean up
    delete req.app.locals.tempUserData;
    await EmailVerification.deleteOne({ _id: verification._id });

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        username: user.username
      }
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Error in verification process' });
  }
});

// Resend OTP route
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Generate new OTP
    const otp = generateOTP();
    
    // Update or create new verification
    await EmailVerification.findOneAndUpdate(
      { email },
      {
        otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      },
      { upsert: true }
    );

    // Send new verification email
    await sendVerificationEmail(email, otp);

    res.status(200).json({ 
      message: 'New verification code sent',
      email 
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Error resending verification code' });
  }
});

// Signin route
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    console.log('Login attempt for email:', email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Add debug logging
    console.log('Stored password hash:', user.password);
    console.log('Attempting password comparison...');

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Modify forgot password route to use OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Generate OTP for password reset
    const otp = generateOTP();
    
    // Save OTP and email to verification collection with password reset flag
    await EmailVerification.create({
      email,
      otp,
      isPasswordReset: true,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    });

    // Send OTP email
    await sendVerificationEmail(email, otp, 'reset_password');

    res.json({ 
      message: 'Password reset code sent to your email',
      email 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing request' });
  }
});

// Modify reset password route to use OTP verification
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    // Verify OTP
    const verification = await EmailVerification.findOne({
      email,
      otp,
      isPasswordReset: true,
      expiresAt: { $gt: new Date() }
    });

    if (!verification) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    // Find and update user password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    await user.save();

    // Clean up verification
    await EmailVerification.deleteOne({ _id: verification._id });

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// Add verify reset OTP route
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    const verification = await EmailVerification.findOne({
      email,
      otp,
      isPasswordReset: true,
      expiresAt: { $gt: new Date() }
    });

    if (!verification) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    res.json({ message: 'Reset code verified' });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    res.status(500).json({ message: 'Error verifying reset code' });
  }
});

module.exports = router;
