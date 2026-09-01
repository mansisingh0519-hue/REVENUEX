const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },

    action: {
      type: String,
      required: true,
    },

    actor: {
      type: String,
      enum: [
        "SYSTEM",
        "AI_AGENT",
        "POLICY_ENGINE",
        "RECOVERY_ENGINE",
      ],
      required: true,
    },

    decision: {
      type: String,
      default: null,
    },

    reason: {
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

module.exports =
  mongoose.model(
    "AuditLog",
    auditLogSchema
  );