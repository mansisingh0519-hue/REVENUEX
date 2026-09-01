const RecoveryEvent = require("../models/RecoveryEvent");

const getAuditLogs = async (req, res) => {
  try {
    // =========================================================
    // FETCH RECOVERY EVENTS
    // =========================================================

    const events = await RecoveryEvent.find({})
      .populate(
        "transactionId",
        "amount status razorpayPaymentId simulation retryCount recoveryStatus recoveredAmount lastRecoveryAction lastRecoveryAt email method failureCode failureReason"
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // =========================================================
    // NORMALIZE EVENTS INTO AUDIT RECORDS
    // =========================================================

    const logs = events.map((event) => {
      const details = event.details || {};
      const transaction = event.transactionId || {};

      let action = event.eventType;

      // -------------------------------------------------------
      // POLICY STAGE
      // -------------------------------------------------------

      if (event.stage === "POLICY_CHECKED") {
        action =
          event.decision === "ALLOW"
            ? "RECOVERY_ALLOWED"
            : "RECOVERY_BLOCKED";
      }

      // -------------------------------------------------------
      // EXECUTION STAGE
      // -------------------------------------------------------

      if (event.stage === "EXECUTED") {
        action = details.success
          ? "RECOVERY_EXECUTED"
          : "RECOVERY_FAILED";
      }

      // -------------------------------------------------------
      // COMPLETION STAGE
      // -------------------------------------------------------

      if (event.stage === "COMPLETED") {
        switch (details.recoveryStatus) {
          case "RECOVERED":
            action = "RECOVERY_COMPLETED";
            break;

          case "ESCALATED":
            action = "RECOVERY_ESCALATED";
            break;

          case "STOPPED":
            action = "RECOVERY_STOPPED";
            break;

          case "FAILED":
            action = "RECOVERY_FAILED";
            break;

          default:
            action = "RECOVERY_COMPLETED";
        }
      }

      // =======================================================
      // HUMAN-READABLE REASON
      // =======================================================

      const reason =
        details.reason ||
        details.message ||
        details.diagnosis ||
        details.policyReason ||
        "Recovery event recorded.";

      // =======================================================
      // RECOVERY INTELLIGENCE
      // =======================================================

      const recoveryScore =
        details.score ??
        details.recoveryScore ??
        null;

      const riskLevel =
        details.riskLevel ??
        null;

      const recommendedAction =
        details.recommendedAction ??
        details.action ??
        null;

      const aiConfidence =
        details.confidence ??
        null;

      // =======================================================
      // POLICY INTELLIGENCE
      // =======================================================

      const policyAllowed =
        typeof details.allowed === "boolean"
          ? details.allowed
          : event.decision === "ALLOW"
            ? true
            : event.stage === "POLICY_CHECKED"
              ? false
              : null;

      const policyDecision =
        event.decision ||
        details.decision ||
        null;

      const blockReasons =
        Array.isArray(details.blockReasons)
          ? details.blockReasons
          : [];

      const violations =
        Array.isArray(details.violations)
          ? details.violations
          : [];

      const checks =
        Array.isArray(details.checks)
          ? details.checks
          : [];

      // =======================================================
      // EXECUTION INTELLIGENCE
      // =======================================================

      const executionSuccess =
        typeof details.success === "boolean"
          ? details.success
          : null;

      const recoveryStatus =
        details.recoveryStatus ||
        transaction.recoveryStatus ||
        null;

      const recoveredAmount =
        details.recoveredAmount ??
        transaction.recoveredAmount ??
        0;

      const retryCount =
        details.retryCount ??
        transaction.retryCount ??
        0;

      const recoveryAction =
        details.action ||
        details.recommendedAction ||
        transaction.lastRecoveryAction ||
        null;

      // =======================================================
      // RETURN NORMALIZED AUDIT EVENT
      // =======================================================

      return {
        _id: event._id,
        createdAt: event.createdAt,

        // Core audit information
        action,
        reason,
        actor:
          details.provider ||
          "RECOVERY_AGENT",

        stage: event.stage,
        eventType: event.eventType,
        decision: event.decision || null,

        // Transaction
        transactionId: transaction,
        simulation: transaction.simulation === true,

        // Recovery intelligence
        recoveryScore,
        riskLevel,
        recommendedAction,
        aiConfidence,

        // Policy
        policy: {
          allowed: policyAllowed,
          decision: policyDecision,
          action:
            details.action ||
            recommendedAction ||
            null,
          blockReasons,
          violations,
          checks,
        },

        // Execution
        execution: {
          success: executionSuccess,
          action: recoveryAction,
          recoveryStatus,
          recoveredAmount,
          retryCount,
        },

        // Original event payload
        details,
      };
    });

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      source: "recovery_events",

      count: logs.length,

      logs,
    });
  } catch (error) {
    console.error("Audit log error:", error);

    return res.status(500).json({
      success: false,

      message: "Unable to fetch audit logs",

      error: error.message,
    });
  }
};

module.exports = {
  getAuditLogs,
};