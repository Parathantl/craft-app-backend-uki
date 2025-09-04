const express = require('express');
const bcrypt = require('bcrypt');
const { generateToken } = require('../utils/jwt');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Token = require('../models/Token');
const sendEmail = require('../utils/sendEmail');
const router = express.Router();

// Register user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, phone, address } = req.body;

    // Validate input
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role === 'admin') {
      return res.status(403).json({ error: 'Cannot register as admin' });
    }

    if (role !== 'creator' && role !== 'user') {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      address,
      isActive: false
    });

    await user.save();

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    await Token.create({
      userId: user._id,
      token: verificationToken,
      type: 'email_verification',
      expiresAt: expiresAt
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail(
      email,
      'Verify Your Email - Craft Marketplace',
      `Please verify your email by clicking this link: ${verificationUrl}`
    );

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account not activated. Please verify your email.' });
    }

    // Generate token
    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const tokenDoc = await Token.findOne({ 
      token, 
      type: 'email_verification',
      expiresAt: { $gt: new Date() } // Check if token hasn't expired
    });
    
    if (!tokenDoc) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already verified
    if (user.isActive) {
      await Token.findByIdAndDelete(tokenDoc._id);
      return res.json({ message: 'Email already verified. You can log in.' });
    }

    user.isActive = true;
    await user.save();

    await Token.findByIdAndDelete(tokenDoc._id);

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (address) updates.address = address;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isActive) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Delete any existing verification tokens for this user
    await Token.deleteMany({ userId: user._id, type: 'email_verification' });

    // Generate new verification token
    const verificationToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    await Token.create({
      userId: user._id,
      token: verificationToken,
      type: 'email_verification',
      expiresAt: expiresAt
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail(
      email,
      'Verify Your Email - Craft Marketplace',
      `Please verify your email by clicking this link: ${verificationUrl}`
    );

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const user = await User.findById(req.user._id);
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedNewPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If that email exists, a reset link has been sent' });

    // Delete existing reset tokens
    await Token.deleteMany({ userId: user._id, type: 'password_reset' });

    // Create reset token (1 hour expiry)
    const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await Token.create({
      userId: user._id,
      token: resetToken,
      type: 'password_reset',
      expiresAt
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail(
      user.email,
      'Reset Your Password - Craft Marketplace',
      `You requested to reset your password. Click this link to proceed: ${resetUrl}`
    );

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });

    const tokenDoc = await Token.findOne({
      token,
      type: 'password_reset',
      expiresAt: { $gt: new Date() }
    });

    if (!tokenDoc) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const user = await User.findById(tokenDoc.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const hashed = await bcrypt.hash(newPassword, 12);
    user.password = hashed;
    await user.save();

    await Token.findByIdAndDelete(tokenDoc._id);

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
