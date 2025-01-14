const jwt = require('jsonwebtoken');
const User = require('../models/User');

const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    // Check if the user is an admin
    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = user;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(403).json({ error: 'Invalid admin token' });
  }
};

module.exports = adminAuth;
