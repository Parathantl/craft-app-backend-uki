const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true },
    type: { type: String, required: true, enum: ['email_verification', 'password_reset'] },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Index for automatic cleanup of expired tokens
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Token", tokenSchema);
