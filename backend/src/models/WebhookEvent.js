const mongoose = require("mongoose");

const webhookEventSchema =
  new mongoose.Schema(
    {
      eventId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      event: {
        type: String,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "RECEIVED",
          "PROCESSED",
          "IGNORED",
          "FAILED",
        ],
        default: "RECEIVED",
      },

      razorpayPaymentId: {
        type: String,
        default: null,
      },

      razorpayOrderId: {
        type: String,
        default: null,
      },

      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
        default: null,
      },

      error: {
        type: String,
        default: null,
      },

      receivedAt: {
        type: Date,
        default: Date.now,
      },

      processedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "WebhookEvent",
    webhookEventSchema
  );