const mongoose = require("mongoose");   

const paymentSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["card", "cash_on_delivery", "bank_transfer"], required: true },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    transactionId: String, // if provided by payment gateway
    createdAt: { type: Date, default: Date.now }
  });
  
  export default mongoose.model("Payment", paymentSchema);
  