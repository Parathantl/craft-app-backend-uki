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
    // md5sig = MD5(merchant_id + order_id + amount + currency + status_code + MD5(merchant_secret).toUpperCase()).toUpperCase()
    const merchantSecret = process.env.PAYHERE_SECRET_KEY || '';
    const secretMd5Upper = crypto
      .createHash('md5')
      .update(merchantSecret)
      .digest('hex')
      .toUpperCase();

    const expectedMd5sig = crypto
      .createHash('md5')
      .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretMd5Upper}`)
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

    // Create payment record (match Payment schema)
    const payment = new Payment({
      order: order._id,
      amount: Number(payhere_amount),
      method: 'card',
      status: status_code === '2' ? 'paid' : 'failed',
      transactionId: payment_id
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

// Generate PayHere hash for Checkout/JS SDK
// Expects: { orderId, amount, currency }
// Returns: { hash }
router.post('/payhere-hash', async (req, res) => {
  try {
    const { orderId, amount, currency } = req.body;
    const merchantId = process.env.PAYHERE_MERCHANT_ID || process.env.VITE_PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_SECRET_KEY;

    if (!merchantId || !merchantSecret) {
      return res.status(500).json({ error: 'PayHere credentials not configured' });
    }

    if (!orderId || !amount || !currency) {
      return res.status(400).json({ error: 'orderId, amount, and currency are required' });
    }

    const amountStr = Number(amount).toFixed(2);
    const secretMd5 = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const raw = `${merchantId}${orderId}${amountStr}${currency}${secretMd5}`;
    const hash = crypto.createHash('md5').update(raw).digest('hex').toUpperCase();

    res.json({ hash, merchantId });
  } catch (error) {
    console.error('Generate PayHere hash error:', error);
    res.status(500).json({ error: 'Failed to generate hash' });
  }
});
