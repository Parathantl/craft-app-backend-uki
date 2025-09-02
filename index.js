const dotenv = require("dotenv");
dotenv.config();

const express = require('express');
const mongoose = require('mongoose');
const Category = require('./models/Category');
const User = require('./models/User');
const bcrypt = require('bcrypt');
const sendEmail = require('./utils/sendEmail');
const Token = require("./models/Token");
const { generateToken } = require("./utils/jwt");

const app = express();

app.use(express.json());

mongoose.connect('mongodb://localhost:27017/marketplace', {}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
});

app.get('/', (req, res) => {
    res.send('Welcome to the Craft Marketplace API');
});

app.get('/api/categories', async (req, res) => { 
    console.log("Fetching categories...");
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { name, description } = req.body;
    try {
        const newCategory = new Category({ name, description });
        await newCategory.save();
        res.status(201).json(newCategory);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    try {
        const updatedCategory = await Category.findByIdAndUpdate(id, { name, description });
        if (!updatedCategory) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(updatedCategory);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deletedCategory = await Category.findByIdAndDelete(id);
        if (!deletedCategory) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json({ message: 'Category deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/auth/register', async(req, res) => {
    const { name, email, password, role } = req.body;

    if (role === 'admin') {
        return res.status(403).json({ error: 'Cannot register as admin' });
    }

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (role !== 'creator' && role !== 'user') {
        return res.status(400).json({ error: 'Invalid role' });
    }

    const hashPassword = bcrypt.hashSync(password, 10);
    const user = await User.create({ name, email, password: hashPassword, role, isActive: false });
    
    const token = Math.random().toString(36).substring(2);
    await Token.create({ userId: user._id, token});

    await sendEmail(email, 'Verify your email', `Please verify your email by clicking the link. ${process.env.FRONTEND_URL}/verify/${token}`);

    // Send verification email logic here (omitted for brevity)
    res.status(201).json({ message: 'User registered. Please verify your email.' });
});

app.post('/api/auth/login', async(req, res) => {
    const { email, password } = req.body;

    const userDetail = await User.findOne({ email });
    if (!userDetail) {
        return res.status(404).json({ error: 'User not found' });
    }

    const isPasswordValid = bcrypt.compareSync(password, userDetail.password);

    if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!userDetail.isActive) {
        return res.status(403).json({ error: 'Account not activated. Please verify your email.' });
    }

    // Generate JWT token logic here (omitted for brevity)
    const token = generateToken(userDetail);
    res.status(200).json({ token  });
});

app.get('/api/verify/:token', async (req, res) => {
    const { token } = req.params;

    const tokenDetail = await Token.findOne({ token });

    if (!tokenDetail) {
        return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const userDetail = await User.findById(tokenDetail.userId);

    if (!userDetail) {
        return res.status(404).json({ error: 'User not found' });
    }

    userDetail.isActive = true;

    await userDetail.save();

    await tokenDetail.deleteOne();

    res.status(200).json({ message: 'Email verified successfully. You can now log in.' });
});

const PORT = 4000;

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
