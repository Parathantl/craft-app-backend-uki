const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');
const Product = require('../models/Product');
const Category = require('../models/Category');
const router = express.Router();

// Get all products (public)
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      minPrice, 
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { isActive: true };
    
    // Category filter
    if (category) {
      query.category = category;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('creator', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product (public)
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name')
      .populate('creator', 'name email phone');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (!product.isActive) {
      return res.status(404).json({ error: 'Product not available' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product (creators only)
router.post('/', authenticateToken, authorizeRoles('creator', 'admin'), upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, stock, category } = req.body;

    if (!title || !price || !stock || !category) {
      return res.status(400).json({ error: 'Title, price, stock, and category are required' });
    }

    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const product = new Product({
      title,
      description,
      price: parseFloat(price),
      stock: parseInt(stock),
      images,
      category,
      creator: req.user._id
    });

    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name')
      .populate('creator', 'name');

    res.status(201).json(populatedProduct);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (creator or admin)
router.put('/:id', authenticateToken, authorizeRoles('creator', 'admin'), upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, stock, category } = req.body;
    const productId = req.params.id;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user is authorized to update this product
    if (req.user.role !== 'admin' && product.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    const updates = {};
    if (title) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (price) updates.price = parseFloat(price);
    if (stock !== undefined) updates.stock = parseInt(stock);
    if (category) updates.category = category;

    // Handle image uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `/uploads/${file.filename}`);
      updates.images = newImages;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updates,
      { new: true, runValidators: true }
    ).populate('category', 'name').populate('creator', 'name');

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (creator or admin)
router.delete('/:id', authenticateToken, authorizeRoles('creator', 'admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user is authorized to delete this product
    if (req.user.role !== 'admin' && product.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get creator's products
router.get('/creator/my-products', authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const products = await Product.find({ creator: req.user._id })
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Product.countDocuments({ creator: req.user._id });

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get creator products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Toggle product status (active/inactive)
router.patch('/:id/toggle-status', authenticateToken, authorizeRoles('creator', 'admin'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user is authorized
    if (req.user.role !== 'admin' && product.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    product.isActive = !product.isActive;
    await product.save();

    res.json({ 
      message: `Product ${product.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: product.isActive 
    });
  } catch (error) {
    console.error('Toggle product status error:', error);
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

module.exports = router;
