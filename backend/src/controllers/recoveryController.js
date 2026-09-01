const Transaction = require("../models/Transaction");
const RecoveryEvent = require("../models/RecoveryEvent");

const {
  calculateRecoveryScore,
} = require("../services/recoveryService");

const {
  analyzePaymentWithAI,
} = require("../services/aiService");

const {
  evaluateRecoveryPolicy,
} = require("../services/policyService");

const {
  executeRecoveryAction,
} = require("../services/recoveryActionService");

// ========================================
// BUILD CUSTOMER STATS
// ========================================

const buildCustomerStats = async (transaction) => {
  const isSimulation =
    transaction.simulation === true;

  if (!transaction.email) {
    return {
      email: null,
      totalTransactions: 0,
      successfulPayments: 0,
      failedPayments: 0,
      totalSuccessfulRevenue: 0,
      failureRate: 0,
      simulation: isSimulation,
    };
  }

  const customerTransactions =
    await Transaction.find({
      email: transaction.email,
      simulation: isSimulation,
    }).sort({
      createdAt: -1,
    });

  const successfulPayments =
    customerTransactions.filter(
      (item) =>
        item.status === "captured"
    );

  const failedPayments =
    customerTransactions.filter(
      (item) =>
        item.status === "failed"
    );

  const totalTransactions =
    customerTransactions.length;

  const totalSuccessfulRevenue =
    successfulPayments.reduce(
      (total, item) =>
        total +
        Number(item.amount || 0),
      0
    );

  const failureRate =
    totalTransactions > 0
      ? Number(
          (
            (failedPayments.length /
              totalTransactions) *
            100
          ).toFixed(2)
        )
      : 0;

  return {
    email: transaction.email,

    totalTransactions,

    successfulPayments:
      successfulPayments.length,

    failedPayments:
      failedPayments.length,

    totalSuccessfulRevenue,

    failureRate,

    simulation: isSimulation,
  };
};

// ========================================
// BUILD RECOVERY ANALYSIS
// ========================================

const buildRecoveryAnalysis =
  async (transaction) => {
    const customerStats =
      await buildCustomerStats(
        transaction
      );

    const recovery =
      calculateRecoveryScore(
        transaction,
        customerStats
      );

    const context = {
      payment: {
        amount:
          transaction.amount,

        currency:
          transaction.currency,

        method:
          transaction.method,

        failureReason:
          transaction.failureReason,

        failureCode:
          transaction.failureCode,

        retryCount:
          transaction.retryCount || 0,
      },

      customer:
        customerStats,

      recovery: {
        score:
          recovery.score,

        riskLevel:
          recovery.riskLevel,

        deterministicRecommendation:
          recovery.recommendedAction,
      },
    };

    const aiDecision =
      await analyzePaymentWithAI(
        context
      );

    const policy =
      evaluateRecoveryPolicy({
        transaction,
        aiDecision,
      });

    return {
      customerStats,
      recovery,
      context,
      aiDecision,
      policy,
    };
  };

// ========================================
// RECORD ANALYSIS EVENTS
// ========================================
//
// These events are intentionally created during
// ANALYZE, not only during EXECUTE.
//
// This gives REVENUEX a persistent decision trail
// even when policy blocks the recovery.
//

const recordAnalysisEvents = async ({
  transaction,
  recovery,
  aiDecision,
  policy,
}) => {
  // ----------------------------------------
  // ANALYZED
  // ----------------------------------------

  await RecoveryEvent.create({
    transactionId:
      transaction._id,

    eventType:
      "RECOVERY_DECISION",

    stage:
      "ANALYZED",

    decision:
      recovery.recommendedAction,

    details: {
      simulated:
        transaction.simulation === true,

      recoveryScore:
        recovery.score,

      riskLevel:
        recovery.riskLevel,

      recommendedAction:
        recovery.recommendedAction,

      reasons:
        recovery.reasons || [],

      factors:
        recovery.factors || {},
    },
  });

  // ----------------------------------------
  // AI DECISION
  // ----------------------------------------

  await RecoveryEvent.create({
    transactionId:
      transaction._id,

    eventType:
      "RECOVERY_DECISION",

    stage:
      "DECIDED",

    decision:
      aiDecision.recommendedAction,

    details: {
      diagnosis:
        aiDecision.diagnosis,

      reason:
        aiDecision.reason,

      confidence:
        aiDecision.confidence,

      provider:
        aiDecision.provider,

      simulated:
        transaction.simulation === true,
    },
  });

  // ----------------------------------------
  // POLICY DECISION
  // ----------------------------------------

  await RecoveryEvent.create({
    transactionId:
      transaction._id,

    eventType:
      "RECOVERY_DECISION",

    stage:
      "POLICY_CHECKED",

    decision:
      policy.decision,

    details: {
      allowed:
        policy.allowed,

      action:
        policy.action,

      reason:
        policy.reason,

      blockReasons:
        policy.blockReasons || [],

      violations:
        policy.violations || [],

      checks:
        policy.checks || [],

      simulated:
        transaction.simulation === true,
    },
  });
};

// ========================================
// ANALYZE PAYMENT RECOVERY
// ========================================

const analyzePaymentRecovery =
  async (req, res) => {
    try {
      const {
        transactionId,
      } = req.params;

      const transaction =
        await Transaction.findById(
          transactionId
        );

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction not found",
        });
      }

      if (
        transaction.status !==
        "failed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Recovery analysis is only available for failed payments",
        });
      }

      const {
        customerStats,
        recovery,
        context,
        aiDecision,
        policy,
      } =
        await buildRecoveryAnalysis(
          transaction
        );

      // ======================================
      // PERSIST DECISION TRAIL
      // ======================================

      await recordAnalysisEvents({
        transaction,
        recovery,
        aiDecision,
        policy,
      });

      return res.status(200).json({
        success: true,

        transaction: {
          id:
            transaction._id,

          razorpayPaymentId:
            transaction.razorpayPaymentId,

          razorpayOrderId:
            transaction.razorpayOrderId,

          amount:
            transaction.amount,

          currency:
            transaction.currency,

          method:
            transaction.method,

          status:
            transaction.status,

          failureReason:
            transaction.failureReason,

          failureCode:
            transaction.failureCode,

          retryCount:
            transaction.retryCount || 0,

          email:
            transaction.email,

          simulation:
            transaction.simulation ===
            true,

          recoveryStatus:
            transaction.recoveryStatus ||
            "NOT_ATTEMPTED",
        },

        customer:
          customerStats,

        context,

        recovery,

        aiDecision,

        policy,
      });
    } catch (error) {
      console.error(
        "Recovery analysis error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to analyze payment recovery",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

// ========================================
// EXECUTE RECOVERY
// ========================================

const executeRecovery =
  async (req, res) => {
    try {
      const {
        transactionId,
      } = req.params;

      const transaction =
        await Transaction.findById(
          transactionId
        );

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message:
            "Transaction not found",
        });
      }

      if (
        transaction.status !==
        "failed"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Recovery is only available for failed payments",
        });
      }

      // ----------------------------------------
      // PREVENT DUPLICATE RECOVERY
      // ----------------------------------------

      if (
        transaction.recoveryStatus ===
        "RECOVERED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Recovery has already been completed for this transaction.",
        });
      }

      if (
        transaction.recoveryStatus ===
        "STOPPED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Recovery has been stopped for this transaction.",
        });
      }

      // ----------------------------------------
      // BUILD FRESH ANALYSIS
      // ----------------------------------------

      const {
        recovery,
        aiDecision,
        policy,
      } =
        await buildRecoveryAnalysis(
          transaction
        );

      // ----------------------------------------
      // RECORD START
      // ----------------------------------------

      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "RECOVERY_STARTED",

        stage:
          "DETECTED",

        decision:
          aiDecision.recommendedAction,

        details: {
          simulated:
            transaction.simulation ===
            true,

          recoveryScore:
            recovery.score,

          riskLevel:
            recovery.riskLevel,

          aiDecision:
            aiDecision.recommendedAction,

          confidence:
            aiDecision.confidence,
        },
      });

      // ----------------------------------------
      // RECORD AI DECISION
      // ----------------------------------------

      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "RECOVERY_DECISION",

        stage:
          "DECIDED",

        decision:
          aiDecision.recommendedAction,

        details: {
          diagnosis:
            aiDecision.diagnosis,

          reason:
            aiDecision.reason,

          confidence:
            aiDecision.confidence,

          provider:
            aiDecision.provider,
        },
      });

      // ----------------------------------------
      // RECORD POLICY DECISION
      // ----------------------------------------

      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "RECOVERY_DECISION",

        stage:
          "POLICY_CHECKED",

        decision:
          policy.decision,

        details: {
          allowed:
            policy.allowed,

          action:
            policy.action,

          reason:
            policy.reason,

          blockReasons:
            policy.blockReasons || [],

          violations:
            policy.violations || [],

          checks:
            policy.checks || [],
        },
      });

      // ----------------------------------------
      // EXECUTE BOUNDED RECOVERY ACTION
      // ----------------------------------------

      const execution =
        await executeRecoveryAction({
          transaction,
          aiDecision,
          policy,
        });

      // ----------------------------------------
      // SAVE TRANSACTION
      // ----------------------------------------

      await transaction.save();

      // ----------------------------------------
      // EXECUTION EVENT
      // ----------------------------------------

      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "RECOVERY_COMPLETED",

        stage:
          "EXECUTED",

        decision:
          execution.status,

        details: {
          success:
            execution.success,

          message:
            execution.message,

          recoveredAmount:
            execution.recoveredAmount ||
            0,

          recoveryStatus:
            transaction.recoveryStatus,

          retryCount:
            transaction.retryCount ||
            0,

          simulated:
            transaction.simulation ===
            true,

          action:
            aiDecision.recommendedAction,

          provider:
            aiDecision.provider,
        },
      });

      // ----------------------------------------
      // COMPLETED EVENT
      // ----------------------------------------

      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "RECOVERY_COMPLETED",

        stage:
          "COMPLETED",

        decision:
          execution.status,

        details: {
          success:
            execution.success,

          recoveredAmount:
            execution.recoveredAmount ||
            0,

          recoveryStatus:
            transaction.recoveryStatus,

          retryCount:
            transaction.retryCount ||
            0,

          simulated:
            transaction.simulation ===
            true,

          action:
            aiDecision.recommendedAction,
        },
      });

      // ----------------------------------------
      // RESPONSE
      // ----------------------------------------

      return res.status(200).json({
        success: true,

        transaction: {
          id:
            transaction._id,

          amount:
            transaction.amount,

          retryCount:
            transaction.retryCount ||
            0,

          recoveryStatus:
            transaction.recoveryStatus ||
            "NOT_ATTEMPTED",

          recoveredAmount:
            transaction.recoveredAmount ||
            0,
        },

        recovery,

        aiDecision,

        policy,

        execution,
      });
    } catch (error) {
      console.error(
        "Recovery execution error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to execute recovery",

        error:
          process.env.NODE_ENV ===
          "development"
            ? error.message
            : undefined,
      });
    }
  };

// ========================================
// EXPORT
// ========================================

module.exports = {
  analyzePaymentRecovery,
  executeRecovery,
};