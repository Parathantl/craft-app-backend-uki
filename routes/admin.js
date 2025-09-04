const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Category = require('../models/Category');
const router = express.Router();

// Dashboard statistics
router.get('/dashboard', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // User statistics
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalCreators = await User.countDocuments({ role: 'creator' });
    const activeUsers = await User.countDocuments({ isActive: true });
    const inactiveUsers = await User.countDocuments({ isActive: false });

    // Product statistics
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ isActive: true });
    const inactiveProducts = await Product.countDocuments({ isActive: false });
    const lowStockProducts = await Product.countDocuments({ stock: { $lt: 10 } });

    // Order statistics
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const confirmedOrders = await Order.countDocuments({ status: 'confirmed' });
    const shippedOrders = await Order.countDocuments({ status: 'shipped' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });

    // Revenue statistics
    const totalRevenue = await Payment.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const monthlyRevenue = await Payment.aggregate([
      { $match: { status: 'paid' } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$amount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ]);

    // Recent activities
    const recentOrders = await Order.find()
      .populate('user', 'name email')
      .populate('products.product', 'title')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentProducts = await Product.find()
      .populate('creator', 'name')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      users: {
        total: totalUsers,
        creators: totalCreators,
        active: activeUsers,
        inactive: inactiveUsers
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts,
        lowStock: lowStockProducts
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        confirmed: confirmedOrders,
        shipped: shippedOrders,
        delivered: deliveredOrders
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        monthly: monthlyRevenue
      },
      recent: {
        orders: recentOrders,
        products: recentProducts
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// User management
router.get('/users', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, role, search, isActive } = req.query;

    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Toggle user status
router.patch('/users/:id/toggle-status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Update user status
router.patch('/users/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Delete user
router.delete('/users/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has products or orders
    const userProducts = await Product.countDocuments({ creator: user._id });
    const userOrders = await Order.countDocuments({ user: user._id });

    if (userProducts > 0 || userOrders > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete user with existing products or orders' 
      });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Product management
router.get('/products', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, isActive } = req.query;

    const query = {};
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .populate('creator', 'name email')
      .populate('category', 'name')
      .sort({ createdAt: -1 })
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

// Update product status
router.patch('/products/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { isActive } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    product.isActive = isActive;
    await product.save();

    const updatedProduct = await Product.findById(product._id)
      .populate('creator', 'name')
      .populate('category', 'name');

    res.json({
      message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`,
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product status error:', error);
    res.status(500).json({ error: 'Failed to update product status' });
  }
});

// Category management
router.get('/categories', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/categories', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingCategory) {
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new Category({ name, description });
    await category.save();

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/categories/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name, description },
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/categories/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Check if category has products
    const productsInCategory = await Product.countDocuments({ category: category._id });
    if (productsInCategory > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete category with existing products' 
      });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Sales reports
router.get('/reports/sales', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const matchStage = { status: 'paid' };
    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    let groupStage;
    switch (groupBy) {
      case 'day':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          }
        };
        break;
      case 'month':
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          }
        };
        break;
      case 'year':
        groupStage = {
          _id: { year: { $year: '$createdAt' } }
        };
        break;
      default:
        groupStage = {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          }
        };
    }

    const salesReport = await Payment.aggregate([
      { $match: matchStage },
      { $group: { ...groupStage, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    res.json(salesReport);
  } catch (error) {
    console.error('Sales report error:', error);
    res.status(500).json({ error: 'Failed to generate sales report' });
  }
});

module.exports = router;
