
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
// EXECUTE RECOVERY
// ========================================

const executeRecovery = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // ========================================
    // FIND TRANSACTION
    // ========================================

    const transaction =
      await Transaction.findById(transactionId);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // ========================================
    // PAYMENT MUST BE FAILED
    // ========================================

    if (transaction.status !== "failed") {
      return res.status(400).json({
        success: false,
        message:
          "Recovery is only available for failed payments",
      });
    }

    // ========================================
    // CUSTOMER HISTORY
    // ========================================

    let customerStats = null;

    if (transaction.email) {
      const customerTransactions =
        await Transaction.find({
          email: transaction.email,
          simulation:
            transaction.simulation === true,
        });

      const successfulPayments =
        customerTransactions.filter(
          (item) => item.status === "captured"
        );

      const failedPayments =
        customerTransactions.filter(
          (item) => item.status === "failed"
        );

      customerStats = {
        email: transaction.email,

        totalTransactions:
          customerTransactions.length,

        successfulPayments:
          successfulPayments.length,

        failedPayments:
          failedPayments.length,

        totalSuccessfulRevenue:
          successfulPayments.reduce(
            (total, item) =>
              total + Number(item.amount || 0),
            0
          ),

        failureRate:
          customerTransactions.length > 0
            ? Number(
                (
                  (failedPayments.length /
                    customerTransactions.length) *
                  100
                ).toFixed(2)
              )
            : 0,
      };
    }

    // ========================================
    // RECOVERY SCORE
    // ========================================

    const recovery =
      calculateRecoveryScore(
        transaction,
        customerStats
      );

    // ========================================
    // AI CONTEXT
    // ========================================

    const context = {
      payment: {
        amount: transaction.amount,
        currency: transaction.currency,
        method: transaction.method,
        failureReason:
          transaction.failureReason,
        failureCode:
          transaction.failureCode,
        retryCount:
          transaction.retryCount || 0,
      },

      customer: customerStats,

      recovery: {
        score: recovery.score,
        riskLevel: recovery.riskLevel,
        deterministicRecommendation:
          recovery.recommendedAction,
      },
    };

    // ========================================
    // AI DECISION
    // ========================================

    const aiDecision =
      await analyzePaymentWithAI(context);

    // ========================================
    // POLICY ENGINE
    // ========================================

    const policy =
      evaluateRecoveryPolicy({
        transaction,
        aiDecision,
      });

    // ========================================
    // EVENT 1: RECOVERY STARTED
    // ========================================

    await RecoveryEvent.create({
      transactionId: transaction._id,

      eventType: "RECOVERY_STARTED",

      stage: "DETECTED",

      decision:
        aiDecision.recommendedAction,

      details: {
        simulated:
          transaction.simulation === true,

        amount: transaction.amount,

        recoveryScore:
          recovery.score,

        riskLevel:
          recovery.riskLevel,

        retryCount:
          transaction.retryCount || 0,
      },
    });

    // ========================================
    // EVENT 2: AI DECISION
    // ========================================

    await RecoveryEvent.create({
      transactionId: transaction._id,

      eventType: "RECOVERY_DECISION",

      stage: "DECIDED",

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

    // ========================================
    // EVENT 3: POLICY CHECK
    // ========================================

    await RecoveryEvent.create({
      transactionId: transaction._id,

      eventType: "RECOVERY_DECISION",

      stage: "POLICY_CHECKED",

      decision: policy.decision,

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
      },
    });

    // ========================================
    // EXECUTE BOUNDED ACTION
    // ========================================

    const execution =
      await executeRecoveryAction({
        transaction,
        aiDecision,
        policy,
      });

    // ========================================
    // EVENT 4: EXECUTION
    // ========================================

    await RecoveryEvent.create({
      transactionId: transaction._id,

      eventType: "RECOVERY_COMPLETED",

      stage: "EXECUTED",

      decision:
        execution.status,

      details: {
        success:
          execution.success,

        message:
          execution.message,

        recoveredAmount:
          Number(
            execution.recoveredAmount || 0
          ),

        recoveryStatus:
          transaction.recoveryStatus,

        retryCount:
          transaction.retryCount || 0,

        simulated:
          transaction.simulation === true,
      },
    });

    // ========================================
    // EVENT 5: COMPLETED
    // ========================================

    await RecoveryEvent.create({
      transactionId: transaction._id,

      eventType: "RECOVERY_COMPLETED",

      stage: "COMPLETED",

      decision:
        execution.status,

      details: {
        success:
          execution.success,

        recoveredAmount:
          Number(
            execution.recoveredAmount || 0
          ),

        recoveryStatus:
          transaction.recoveryStatus,

        retryCount:
          transaction.retryCount || 0,
      },
    });

    // ========================================
    // FINAL RESPONSE
    // ========================================

    return res.status(200).json({
      success: true,

      transaction: {
        id: transaction._id,

        amount:
          transaction.amount,

        retryCount:
          transaction.retryCount,

        recoveryStatus:
          transaction.recoveryStatus,

        recoveredAmount:
          transaction.recoveredAmount,
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
        error.message,
    });
  }
};

module.exports = {
  executeRecovery,
};

