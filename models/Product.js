const mongoose = require("mongoose");   

const productSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    stock: { type: Number, required: true }, // in-stock / out-stock
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Seller/Creator
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  });
  
  module.exports = mongoose.model("Product", productSchema);
