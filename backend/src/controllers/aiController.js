const Transaction =
  require("../models/Transaction");

const {
  calculateRecoveryScore,
} = require("../services/recoveryService");

const {
  analyzePaymentWithAI,
} = require("../services/aiService");

const {
  evaluateRecoveryPolicy,
} = require("../services/policyService");

// ========================================
// BUILD CUSTOMER CONTEXT
// ========================================

const buildCustomerStats = async (
  transaction
) => {
  // ----------------------------------------
  // No customer email
  // ----------------------------------------

  if (!transaction.email) {
    return {
      email: null,

      totalTransactions: 0,

      successfulPayments: 0,

      failedPayments: 0,

      totalSuccessfulRevenue: 0,

      failureRate: 0,

      simulation:
        transaction.simulation === true,
    };
  }

  // ----------------------------------------
  // CRITICAL:
  //
  // Simulation transactions search ONLY
  // simulation history.
  //
  // Live transactions search ONLY live
  // history.
  // ----------------------------------------

  const isSimulation =
    transaction.simulation === true;

  const customerTransactions =
    await Transaction.find({
      email: transaction.email,

      simulation: isSimulation,
    }).sort({
      createdAt: -1,
    });

  // ----------------------------------------
  // SUCCESSFUL PAYMENTS
  // ----------------------------------------

  const successfulPayments =
    customerTransactions.filter(
      (item) =>
        item.status === "captured"
    );

  // ----------------------------------------
  // FAILED PAYMENTS
  // ----------------------------------------

  const failedPayments =
    customerTransactions.filter(
      (item) =>
        item.status === "failed"
    );

  // ----------------------------------------
  // TOTAL TRANSACTIONS
  // ----------------------------------------

  const totalTransactions =
    customerTransactions.length;

  // ----------------------------------------
  // SUCCESSFUL REVENUE
  // ----------------------------------------

  const totalSuccessfulRevenue =
    successfulPayments.reduce(
      (total, item) =>
        total + (item.amount || 0),
      0
    );

  // ----------------------------------------
  // FAILURE RATE
  // ----------------------------------------

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

    simulation: isSimulation,
  };
};

// ========================================
// ANALYZE PAYMENT WITH AI
// ========================================

const analyzeWithAI = async (
  req,
  res
) => {
  try {
    const {
      transactionId,
    } = req.params;

    // ======================================
    // FIND TRANSACTION
    // ======================================

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

    // ======================================
    // PAYMENT MUST BE FAILED
    // ======================================

    if (
      transaction.status !==
      "failed"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Only failed payments can be analyzed for recovery",
      });
    }

    // ======================================
    // CUSTOMER CONTEXT
    // ======================================

    const customerStats =
      await buildCustomerStats(
        transaction
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
    // CONTEXT SENT TO AI
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
    // AI DECISION
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
    // RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      transaction: {
        id:
          transaction._id,

        razorpayPaymentId:
          transaction.razorpayPaymentId,

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

        recoveryStatus:
          transaction.recoveryStatus ||
          "NOT_ATTEMPTED",

        recoveredAmount:
          transaction.recoveredAmount || 0,

        simulation:
          transaction.simulation === true,
      },

      context: {
        payment:
          context.payment,

        customer:
          context.customer,

        recovery:
          context.recovery,
      },

      recovery,

      aiDecision,

      policy,
    });
  } catch (error) {
    console.error(
      "AI analysis error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to analyze payment with AI",
    });
  }
};

module.exports = {
  analyzeWithAI,
};