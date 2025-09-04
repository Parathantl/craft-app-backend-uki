const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const router = express.Router();

// Create order (authenticated user or guest)
router.post('/', async (req, res) => {
  try {
    const { 
      products, 
      shippingAddress, 
      customerName, 
      customerEmail, 
      customerPhone,
      totalAmount 
    } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products are required' });
    }

    if (!shippingAddress) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }

    // Validate products and check stock
    for (const item of products) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.product} not found` });
      }
      if (!product.isActive) {
        return res.status(400).json({ error: `Product ${product.title} is not available` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.title}` });
      }
    }

    // Create order
    const orderData = {
      products,
      totalAmount,
      shippingAddress,
      status: 'pending'
    };

    // Add user if authenticated
    if (req.user) {
      orderData.user = req.user._id;
    } else {
      // For guest orders, store customer info
      if (!customerName || !customerEmail || !customerPhone) {
        return res.status(400).json({ error: 'Customer information is required for guest orders' });
      }
      orderData.customerInfo = {
        name: customerName,
        email: customerEmail,
        phone: customerPhone
      };
    }

    const order = new Order(orderData);
    await order.save();

    // Update product stock
    for (const item of products) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity }
      });
    }

    // Create payment record
    const payment = new Payment({
      order: order._id,
      amount: totalAmount,
      method: 'pending',
      status: 'pending'
    });
    await payment.save();

    const populatedOrder = await Order.findById(order._id)
      .populate('products.product', 'title price images')
      .populate('user', 'name email');

    res.status(201).json({
      message: 'Order created successfully',
      order: populatedOrder,
      paymentId: payment._id
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get user's orders
router.get('/my-orders', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: req.user._id };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('products.product', 'title price images')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('products.product', 'title price images description')
      .populate('user', 'name email phone');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user is authorized to view this order
    if (req.user.role !== 'admin' && order.user && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Update order status (admin only)
router.patch('/:id/status', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.status = status;
    
    // Add tracking info if shipping
    if (status === 'shipped' && req.body.trackingInfo) {
      order.trackingInfo = req.body.trackingInfo;
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id)
      .populate('products.product', 'title price images')
      .populate('user', 'name email');

    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Cancel order (user or admin)
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user is authorized to cancel this order
    if (req.user.role !== 'admin' && order.user && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to cancel this order' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    if (order.status === 'delivered') {
      return res.status(400).json({ error: 'Cannot cancel delivered order' });
    }

    order.status = 'cancelled';
    await order.save();

    // Restore product stock if order was confirmed or shipped
    if (['confirmed', 'shipped'].includes(order.status)) {
      for (const item of order.products) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity }
        });
      }
    }

    res.json({ message: 'Order cancelled successfully' });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Get all orders (admin only)
router.get('/admin/all', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(query)
      .populate('products.product', 'title price')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get creator's orders
router.get('/creator/my-orders', authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    // Get products created by this creator
    const creatorProducts = await Product.find({ creator: req.user._id }).select('_id');
    const productIds = creatorProducts.map(p => p._id);

    const query = { 'products.product': { $in: productIds } };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('products.product', 'title price images')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get creator orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get creator's order statistics
router.get('/creator/stats', authenticateToken, authorizeRoles('creator'), async (req, res) => {
  try {
    // Get products created by this creator
    const creatorProducts = await Product.find({ creator: req.user._id }).select('_id');
    const productIds = creatorProducts.map(p => p._id);

    const query = { 'products.product': { $in: productIds } };

    const totalOrders = await Order.countDocuments(query);
    const pendingOrders = await Order.countDocuments({ ...query, status: 'pending' });
    const confirmedOrders = await Order.countDocuments({ ...query, status: 'confirmed' });
    const shippedOrders = await Order.countDocuments({ ...query, status: 'shipped' });
    const deliveredOrders = await Order.countDocuments({ ...query, status: 'delivered' });
    const cancelledOrders = await Order.countDocuments({ ...query, status: 'cancelled' });

    const totalRevenue = await Order.aggregate([
      { $match: { 'products.product': { $in: productIds }, status: { $in: ['delivered', 'shipped'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    console.error('Get creator stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

// Get order statistics (admin only)
router.get('/admin/stats', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const confirmedOrders = await Order.countDocuments({ status: 'confirmed' });
    const shippedOrders = await Order.countDocuments({ status: 'shipped' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });

    const totalRevenue = await Order.aggregate([
      { $match: { status: { $in: ['delivered', 'shipped'] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    res.json({
      totalOrders,
      pendingOrders,
      confirmedOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

module.exports = router;
