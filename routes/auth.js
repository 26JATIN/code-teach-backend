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

    // Store user data temporarily
    const hashedPassword = await bcrypt.hash(password, 10);
    req.app.locals.tempUserData = {
      email,
      password: hashedPassword,
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

    // Create verified user
    const user = await User.create({
      email: userData.email,
      password: userData.password,
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
    console.log('Login attempt for:', email);

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Generated token for user:', user._id);

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
    res.status(500).json({ error: 'Error signing in' });
  }
});

module.exports = router;
