const mongoose = require("mongoose");   

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // can be null for anonymous
    products: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, required: true }
      }
    ],
    totalAmount: { type: Number, required: true },
    status: { 
      type: String, 
      enum: ["pending", "confirmed", "shipped", "delivered", "cancelled", "returned"], 
      default: "pending" 
    },
    shippingAddress: { type: String, required: true },
    trackingInfo: {
      provider: String,
      trackingNumber: String,
      status: String
    }, // optional: delivery company updates
    createdAt: { type: Date, default: Date.now }
  });
  
  export default mongoose.model("Order", orderSchema);
  