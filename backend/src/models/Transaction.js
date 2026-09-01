const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    status: {
      type: String,
      enum: [
        "created",
        "authorized",
        "captured",
        "failed",
      ],
      default: "created",
    },

    method: {
      type: String,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
    },

    failureCode: {
      type: String,
      default: null,
    },

    email: {
      type: String,
      default: null,
    },

    contact: {
      type: String,
      default: null,
    },

    // --------------------------------
    // DATA SOURCE
    // --------------------------------

    simulation: {
      type: Boolean,
      default: false,
      index: true,
    },

    // --------------------------------
    // RECOVERY
    // --------------------------------

    retryCount: {
      type: Number,
      default: 0,
    },

    lastRecoveryAction: {
      type: String,
      default: null,
    },

    lastRecoveryAt: {
      type: Date,
      default: null,
    },

    recoveryStatus: {
      type: String,
      enum: [
        "NOT_ATTEMPTED",
        "ATTEMPTED",
        "RECOVERED",
        "FAILED",
        "STOPPED",
        "ESCALATED",
      ],
      default: "NOT_ATTEMPTED",
    },

    recoveredAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Transaction",
  transactionSchema
);