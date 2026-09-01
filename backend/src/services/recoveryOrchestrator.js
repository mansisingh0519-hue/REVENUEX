const Transaction =
  require("../models/Transaction");

const RecoveryEvent =
  require("../models/RecoveryEvent");

const {
  calculateRecoveryScore,
} = require("./recoveryService");

const {
  analyzePaymentWithAI,
} = require("./aiService");

const {
  evaluateRecoveryPolicy,
} = require("./policyService");

const {
  executeRecoveryAction,
} = require("./recoveryActionService");

// ========================================
// BUILD CUSTOMER CONTEXT
// ========================================

const buildCustomerStats = async (
  transaction
) => {
  if (!transaction.email) {
    return {
      email: null,
      totalTransactions: 0,
      successfulPayments: 0,
      failedPayments: 0,
      totalSuccessfulRevenue: 0,
      failureRate: 0,
    };
  }

  const isSimulation =
    transaction.simulation === true;

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
        total + (item.amount || 0),
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
    email:
      transaction.email,

    totalTransactions,

    successfulPayments:
      successfulPayments.length,

    failedPayments:
      failedPayments.length,

    totalSuccessfulRevenue,

    failureRate,

    simulation:
      isSimulation,
  };
};

// ========================================
// RUN RECOVERY ORCHESTRATION
// ========================================

const runRecoveryOrchestration =
  async (transactionId) => {
    // ======================================
    // FIND TRANSACTION
    // ======================================

    const transaction =
      await Transaction.findById(
        transactionId
      );

    if (!transaction) {
      throw new Error(
        "Transaction not found"
      );
    }

    // ======================================
    // VALIDATE PAYMENT STATE
    // ======================================

    if (
      transaction.status !==
      "failed"
    ) {
      throw new Error(
        "Recovery orchestration requires a failed payment"
      );
    }

    // ======================================
    // EARLY TERMINAL / IN-FLIGHT GUARD
    // ======================================
    //
    // Avoid running AI/policy analysis again
    // when recovery has already completed or
    // another execution is already underway.
    //
    // ======================================

    if (
      transaction.recoveryStatus ===
      "RECOVERED"
    ) {
      return {
        transaction: {
          id:
            transaction._id,

          amount:
            transaction.amount,

          paymentId:
            transaction.razorpayPaymentId,

          retryCount:
            transaction.retryCount || 0,

          recoveryStatus:
            transaction.recoveryStatus,

          recoveredAmount:
            transaction.recoveredAmount || 0,

          simulation:
            transaction.simulation === true,
        },

        customer: null,

        recovery: null,

        aiDecision: null,

        policy: {
          allowed: false,
          decision: "BLOCK",
          action: "STOP",
          checks: [],
          violations: [],
          blockReasons: [
            "Recovery has already been completed.",
          ],
          reason:
            "Duplicate recovery request ignored.",
        },

        execution: {
          success: false,
          status:
            "ALREADY_RECOVERED",
          message:
            "Recovery has already been completed for this transaction.",
          recoveredAmount:
            transaction.recoveredAmount || 0,
          recoveryStatus:
            transaction.recoveryStatus,
        },
      };
    }

    if (
      transaction.recoveryStatus ===
      "ATTEMPTED"
    ) {
      return {
        transaction: {
          id:
            transaction._id,

          amount:
            transaction.amount,

          paymentId:
            transaction.razorpayPaymentId,

          retryCount:
            transaction.retryCount || 0,

          recoveryStatus:
            transaction.recoveryStatus,

          recoveredAmount:
            transaction.recoveredAmount || 0,

          simulation:
            transaction.simulation === true,
        },

        customer: null,

        recovery: null,

        aiDecision: null,

        policy: {
          allowed: false,
          decision: "BLOCK",
          action: "STOP",
          checks: [],
          violations: [],
          blockReasons: [
            "Recovery is already being processed.",
          ],
          reason:
            "Concurrent recovery request ignored.",
        },

        execution: {
          success: false,
          status:
            "ALREADY_ATTEMPTED",
          message:
            "Recovery is already being processed for this transaction.",
          recoveredAmount:
            transaction.recoveredAmount || 0,
          recoveryStatus:
            transaction.recoveryStatus,
        },
      };
    }

    // ======================================
    // RECOVERY STARTED EVENT
    // ======================================

    await RecoveryEvent.create({
      transactionId:
        transaction._id,

      eventType:
        "RECOVERY_STARTED",

      stage:
        "DETECTED",

      decision: null,

      details: {
        amount:
          transaction.amount,

        paymentId:
          transaction.razorpayPaymentId,

        simulation:
          transaction.simulation === true,
      },
    });

    // ======================================
    // CUSTOMER CONTEXT
    // ======================================

    const customerStats =
      await buildCustomerStats(
        transaction
      );

    console.log(
      "Customer recovery context:",
      {
        email:
          customerStats.email,

        totalTransactions:
          customerStats.totalTransactions,

        successfulPayments:
          customerStats.successfulPayments,

        failedPayments:
          customerStats.failedPayments,

        failureRate:
          customerStats.failureRate,

        simulation:
          customerStats.simulation,
      }
    );

    // ======================================
    // RECOVERY SCORE
    // ======================================

    const recovery =
      calculateRecoveryScore(
        transaction,
        customerStats
      );

    // ======================================
    // ANALYSIS EVENT
    // ======================================

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
        score:
          recovery.score,

        riskLevel:
          recovery.riskLevel,

        recommendedAction:
          recovery.recommendedAction,

        reasons:
          recovery.reasons,

        factors:
          recovery.factors,

        customerStats,
      },
    });

    // ======================================
    // AI CONTEXT
    // ======================================

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

    // ======================================
    // AI
    // ======================================

    const aiDecision =
      await analyzePaymentWithAI(
        context
      );

    // ======================================
    // POLICY
    // ======================================

    const policy =
      evaluateRecoveryPolicy({
        transaction,
        aiDecision,
      });

    // ======================================
    // POLICY EVENT
    // ======================================

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
        aiAction:
          aiDecision.recommendedAction,

        allowed:
          policy.allowed,

        violations:
          policy.violations,

        blockReasons:
          policy.blockReasons,

        checks:
          policy.checks,
      },
    });

    // ======================================
    // EXECUTE BOUNDED ACTION
    // ======================================

    const execution =
      await executeRecoveryAction({
        transaction,
        aiDecision,
        policy,
      });

    // ======================================
    // FINAL EVENT
    // ======================================

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
        action:
          aiDecision.recommendedAction,

        recoveredAmount:
          execution.recoveredAmount || 0,

        success:
          execution.success,

        message:
          execution.message,

        recoveryStatus:
          execution.recoveryStatus,

        retryCount:
          execution.retryCount ??
          transaction.retryCount ??
          0,
      },
    });

    // ======================================
    // RETURN COMPLETE RESULT
    // ======================================

    return {
      transaction: {
        id:
          transaction._id,

        amount:
          transaction.amount,

        paymentId:
          transaction.razorpayPaymentId,

        retryCount:
          execution.retryCount ??
          transaction.retryCount ??
          0,

        recoveryStatus:
          execution.recoveryStatus ||
          transaction.recoveryStatus,

        recoveredAmount:
          execution.recoveredAmount ||
          transaction.recoveredAmount ||
          0,

        simulation:
          transaction.simulation === true,
      },

      customer:
        customerStats,

      recovery,

      aiDecision,

      policy,

      execution,
    };
  };

module.exports = {
  runRecoveryOrchestration,
};