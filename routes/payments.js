const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const crypto = require('crypto');

// PayHere webhook handler
router.post('/payhere-webhook', async (req, res) => {
  try {
    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig,
      custom_1, // Order ID
      custom_2  // User ID
    } = req.body;

    // Verify MD5 signature (PayHere security)
    const secret = process.env.PAYHERE_SECRET || 'CHANGE123'; // Replace with your PayHere secret
    const expectedMd5sig = crypto
      .createHash('md5')
      .update(merchant_id + order_id + payhere_amount + payhere_currency + status_code + secret)
      .digest('hex')
      .toUpperCase();

    if (md5sig !== expectedMd5sig) {
      console.error('PayHere webhook: Invalid MD5 signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Find the order
    const order = await Order.findById(custom_1);
    if (!order) {
      console.error('PayHere webhook: Order not found', custom_1);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Create payment record
    const payment = new Payment({
      orderId: order._id,
      userId: custom_2,
      paymentId: payment_id,
      amount: payhere_amount,
      currency: payhere_currency,
      status: status_code === '2' ? 'completed' : 'failed',
      paymentMethod: 'payhere',
      gateway: 'payhere',
      gatewayResponse: req.body
    });

    await payment.save();

    // Update order status
    if (status_code === '2') { // Success
      order.status = 'confirmed';
      order.paymentStatus = 'paid';
      order.paymentId = payment_id;
      await order.save();
      
      console.log('PayHere webhook: Payment successful for order', order._id);
    } else {
      order.status = 'payment_failed';
      order.paymentStatus = 'failed';
      await order.save();
      
      console.log('PayHere webhook: Payment failed for order', order._id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('PayHere webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Payment confirmation endpoint (for frontend)
router.post('/confirm', async (req, res) => {
  try {
    const { orderId, paymentId, status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (status === 'completed') {
      order.status = 'confirmed';
      order.paymentStatus = 'paid';
      order.paymentId = paymentId;
      await order.save();

      res.json({ 
        success: true, 
        order: order,
        message: 'Payment confirmed successfully' 
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Payment not completed' 
      });
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

// Get payment history for a user
router.get('/history', async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user._id })
      .populate('orderId')
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

module.exports = router;
