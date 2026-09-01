const AuditLog = require("../models/AuditLog");
const Transaction = require("../models/Transaction");

// ========================================
// EXECUTE BOUNDED RECOVERY ACTION
// ========================================
//
// SAFETY MODEL:
//
// AI recommends.
// Policy authorizes.
// Recovery engine executes.
//
// IMPORTANT:
// Execution is claimed atomically so that
// concurrent webhook/manual requests cannot
// execute the same recovery twice.
//
// ========================================

const executeRecoveryAction = async ({
  transaction,
  aiDecision,
  policy,
}) => {
  const action =
    aiDecision?.recommendedAction;

  // ========================================
  // HARD SAFETY GATE
  // ========================================

  if (!policy || !policy.allowed) {
    transaction.lastRecoveryAction =
      action || "BLOCK";

    transaction.lastRecoveryAt =
      new Date();

    transaction.recoveredAmount =
      transaction.recoveredAmount || 0;

    if (action === "REVIEW") {
      transaction.recoveryStatus =
        "ESCALATED";
    } else {
      transaction.recoveryStatus =
        "STOPPED";
    }

    await transaction.save();

    await AuditLog.create({
      transactionId:
        transaction._id,

      action:
        "RECOVERY_BLOCKED",

      actor:
        "POLICY_ENGINE",

      decision:
        "BLOCK",

      reason:
        policy.reason,

      details: {
        simulated:
          transaction.simulation === true,

        aiAction:
          action,

        recoveryStatus:
          transaction.recoveryStatus,

        blockReasons:
          policy.blockReasons || [],

        violations:
          policy.violations || [],
      },
    });

    return {
      success: false,

      status: "BLOCKED",

      message:
        action === "REVIEW"
          ? "Recovery blocked and escalated for review."
          : action === "STOP"
          ? "Recovery blocked and stopped by policy."
          : "Recovery action blocked by policy.",

      recoveredAmount: 0,

      recoveryStatus:
        transaction.recoveryStatus,
    };
  }

  // ========================================
  // HARD PAYMENT STATE CHECK
  // ========================================

  if (
    transaction.status !== "failed"
  ) {
    return {
      success: false,

      status: "BLOCKED",

      message:
        "Payment is no longer in a failed state.",

      recoveredAmount: 0,

      recoveryStatus:
        transaction.recoveryStatus ||
        "STOPPED",
    };
  }

  // ========================================
  // ONLY RETRY IS EXECUTABLE
  // ========================================

  if (action !== "RETRY") {
    transaction.lastRecoveryAction =
      action || "UNKNOWN";

    transaction.lastRecoveryAt =
      new Date();

    transaction.recoveryStatus =
      action === "REVIEW"
        ? "ESCALATED"
        : "STOPPED";

    transaction.recoveredAmount =
      transaction.recoveredAmount || 0;

    await transaction.save();

    await AuditLog.create({
      transactionId:
        transaction._id,

      action:
        "RECOVERY_REQUIRES_REVIEW",

      actor:
        "RECOVERY_ENGINE",

      decision:
        "BLOCK",

      reason:
        `Recovery action ${
          action || "UNKNOWN"
        } is not automatically executable.`,

      details: {
        simulated:
          transaction.simulation === true,

        action:
          action || "UNKNOWN",
      },
    });

    return {
      success: false,

      status: "BLOCKED",

      message:
        action === "REVIEW"
          ? "Recovery requires human review."
          : "Recovery action stopped.",

      recoveredAmount: 0,

      recoveryStatus:
        transaction.recoveryStatus,
    };
  }

  // ========================================
  // ATOMIC EXECUTION CLAIM
  // ========================================
  //
  // This is the important idempotency guard.
  //
  // We only claim the transaction when:
  //
  // 1. It is still failed
  // 2. It has not already recovered
  // 3. It has not already entered an execution state
  //
  // MongoDB performs this atomically.
  //
  // ========================================

  const claimedTransaction =
    await Transaction.findOneAndUpdate(
      {
        _id: transaction._id,

        status: "failed",

        recoveryStatus: {
          $nin: [
            "RECOVERED",
            "ATTEMPTED",
          ],
        },
      },
      {
        $set: {
          recoveryStatus:
            "ATTEMPTED",

          lastRecoveryAction:
            "RETRY",

          lastRecoveryAt:
            new Date(),
        },

        $inc: {
          retryCount: 1,
        },
      },
      {
        new: true,
      }
    );

  // ========================================
  // TRANSACTION WAS ALREADY CLAIMED
  // ========================================

  if (!claimedTransaction) {
    const latestTransaction =
      await Transaction.findById(
        transaction._id
      );

    if (
      latestTransaction?.recoveryStatus ===
      "RECOVERED"
    ) {
      return {
        success: false,

        status:
          "ALREADY_RECOVERED",

        message:
          "Recovery has already been completed for this transaction.",

        recoveredAmount:
          latestTransaction.recoveredAmount ||
          0,

        recoveryStatus:
          latestTransaction.recoveryStatus,
      };
    }

    if (
      latestTransaction?.recoveryStatus ===
      "ATTEMPTED"
    ) {
      return {
        success: false,

        status:
          "ALREADY_ATTEMPTED",

        message:
          "Recovery is already being processed for this transaction.",

        recoveredAmount:
          latestTransaction.recoveredAmount ||
          0,

        recoveryStatus:
          latestTransaction.recoveryStatus,
      };
    }

    return {
      success: false,

      status:
        "BLOCKED",

      message:
        "Recovery could not be claimed safely.",

      recoveredAmount: 0,

      recoveryStatus:
        latestTransaction?.recoveryStatus ||
        "STOPPED",
    };
  }

  // ========================================
  // USE ATOMICALLY CLAIMED TRANSACTION
  // ========================================

  const currentRetryCount =
    claimedTransaction.retryCount;

  // ========================================
  // SYNTHETIC SIMULATION
  // ========================================

  if (
    claimedTransaction.simulation === true
  ) {
    claimedTransaction.recoveryStatus =
      "RECOVERED";

    claimedTransaction.recoveredAmount =
      claimedTransaction.amount;

    await claimedTransaction.save();

    await AuditLog.create({
      transactionId:
        claimedTransaction._id,

      action:
        "RETRY_PAYMENT",

      actor:
        "RECOVERY_ENGINE",

      decision:
        "SUCCESS",

      reason:
        "Simulated retry succeeded.",

      details: {
        retryCount:
          currentRetryCount,

        amount:
          claimedTransaction.amount,

        simulated: true,
      },
    });

    return {
      success: true,

      status:
        "RECOVERED",

      message:
        "Simulated retry succeeded.",

      recoveredAmount:
        claimedTransaction.amount,

      recoveryStatus:
        claimedTransaction.recoveryStatus,

      retryCount:
        currentRetryCount,
    };
  }

  // ========================================
  // LIVE PAYMENT SAFETY
  // ========================================
  //
  // Real payment retry remains disabled.
  //
  // REVENUEX demonstrates:
  //
  // detection
  // intelligence
  // authorization
  // bounded execution
  // auditability
  //
  // without automatically moving real money.
  //
  // ========================================

  claimedTransaction.recoveryStatus =
    "FAILED";

  claimedTransaction.recoveredAmount =
    0;

  await claimedTransaction.save();

  await AuditLog.create({
    transactionId:
      claimedTransaction._id,

    action:
      "RETRY_PAYMENT",

    actor:
      "RECOVERY_ENGINE",

    decision:
      "FAILED",

    reason:
      "Live payment retry is disabled in the current demo environment.",

    details: {
      retryCount:
        currentRetryCount,

      amount:
        claimedTransaction.amount,

      simulated: false,
    },
  });

  return {
    success: false,

    status:
      "FAILED",

    message:
      "Live payment retry is disabled in the current demo environment.",

    recoveredAmount: 0,

    recoveryStatus:
      claimedTransaction.recoveryStatus,

    retryCount:
      currentRetryCount,
  };
};

module.exports = {
  executeRecoveryAction,
};