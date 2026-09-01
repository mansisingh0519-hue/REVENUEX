const mongoose = require("mongoose");

const recoveryEventSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },

    eventType: {
      type: String,
      enum: [
        "PAYMENT_FAILED",
        "RECOVERY_STARTED",
        "RECOVERY_DECISION",
        "RECOVERY_COMPLETED",
      ],
      required: true,
    },

    stage: {
      type: String,
      enum: [
        "DETECTED",
        "ANALYZED",
        "DECIDED",
        "POLICY_CHECKED",
        "EXECUTED",
        "COMPLETED",
      ],
      required: true,
    },

    decision: {
      type: String,
      default: null,
    },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "RecoveryEvent",
  recoveryEventSchema
);