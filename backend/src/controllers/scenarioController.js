const Transaction = require("../models/Transaction");

// =========================================================
// CONTROLLED SCENARIO CONFIGURATION
// =========================================================

const SCENARIOS = {
  high_recovery: {
    email: "successful.customer@revenuex.test",
    contact: "+919999999999",
    amount: 500,
    method: "upi",
    failureCode: "TEMPORARY_FAILURE",
    failureReason: "payment_failed",
    retryCount: 0,
    description:
      "Established customer with strong successful payment history.",
  },

  medium_recovery: {
    email: "medium.customer@revenuex.test",
    contact: "+916666666666",
    amount: 2500,
    method: "card",
    failureCode: "TEMPORARY_FAILURE",
    failureReason: "payment_failed",
    retryCount: 1,
    description:
      "Customer with some successful history but meaningful recovery uncertainty.",
  },

  weak_customer: {
    email: "new.customer@revenuex.test",
    contact: "+917777777777",
    amount: 500,
    method: "netbanking",
    failureCode: "BAD_REQUEST_ERROR",
    failureReason: "payment_failed",
    retryCount: 0,
    description:
      "New customer with no successful payment history.",
  },

  high_risk: {
    email: "high.risk@revenuex.test",
    contact: "+918888888888",
    amount: 75000,
    method: "card",
    failureCode: "REPEATED_FAILURE",
    failureReason: "payment_failed",
    retryCount: 3,
    description:
      "High-value payment with repeated failures and exhausted retries.",
  },
};

// =========================================================
// ID GENERATOR
// =========================================================

const generateId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

// =========================================================
// CUSTOMER HISTORY GENERATOR
// =========================================================

const createHistory = ({
  email,
  contact,
  count,
  amount = 1000,
  method = "upi",
}) => {
  return Array.from({ length: count }, (_, index) => ({
    razorpayOrderId: generateId(
      `SIM_HISTORY_${index}`
    ),

    razorpayPaymentId: generateId(
      `SIM_HISTORY_PAY_${index}`
    ),

    amount,

    currency: "INR",

    status: "captured",

    method,

    failureReason: null,

    failureCode: null,

    email,

    contact,

    retryCount: 0,

    lastRecoveryAction: null,

    lastRecoveryAt: null,

    recoveryStatus: "NOT_ATTEMPTED",

    recoveredAmount: 0,

    simulation: true,
  }));
};

// =========================================================
// CURRENT FAILED PAYMENT
// =========================================================

const createFailedTransaction = ({
  scenario,
  config,
}) => ({
  razorpayOrderId: generateId(
    `SIM_ORDER_${scenario.toUpperCase()}`
  ),

  razorpayPaymentId: generateId(
    `SIM_PAY_${scenario.toUpperCase()}`
  ),

  amount: config.amount,

  currency: "INR",

  status: "failed",

  method: config.method,

  failureReason: config.failureReason,

  failureCode: config.failureCode,

  email: config.email,

  contact: config.contact,

  retryCount: config.retryCount,

  lastRecoveryAction: null,

  lastRecoveryAt: null,

  recoveryStatus: "NOT_ATTEMPTED",

  recoveredAmount: 0,

  simulation: true,
});

// =========================================================
// CREATE CONTROLLED SCENARIO
// =========================================================

const createScenario = async (req, res) => {
  try {
    const { scenario } = req.body;

    // -------------------------------------------------------
    // VALIDATE SCENARIO
    // -------------------------------------------------------

    const config = SCENARIOS[scenario];

    if (!config) {
      return res.status(400).json({
        success: false,

        message:
          "Invalid scenario. Use high_recovery, medium_recovery, weak_customer, or high_risk.",
      });
    }

    // -------------------------------------------------------
    // CREATE CUSTOMER HISTORY
    // -------------------------------------------------------

    let history = [];

    if (scenario === "high_recovery") {
      history = createHistory({
        email: config.email,
        contact: config.contact,
        count: 6,
        amount: 1000,
        method: "upi",
      });
    }

    // Medium recovery gets a smaller positive history.
    if (scenario === "medium_recovery") {
      history = createHistory({
        email: config.email,
        contact: config.contact,
        count: 3,
        amount: 1000,
        method: "card",
      });
    }

    // -------------------------------------------------------
    // SAVE HISTORY
    // -------------------------------------------------------

    if (history.length > 0) {
      await Transaction.insertMany(history);
    }

    // -------------------------------------------------------
    // CREATE CURRENT FAILED PAYMENT
    // -------------------------------------------------------

    const transactionData =
      createFailedTransaction({
        scenario,
        config,
      });

    const transaction =
      await Transaction.create(
        transactionData
      );

    // -------------------------------------------------------
    // LOG SCENARIO
    // -------------------------------------------------------

    console.log(
      "[Scenario Lab]",
      {
        scenario,

        transactionId:
          transaction._id,

        amount:
          transaction.amount,

        customer:
          transaction.email,

        historyCreated:
          history.length,

        simulation:
          transaction.simulation,
      }
    );

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        "Controlled recovery scenario created.",

      scenario,

      description:
        config.description,

      historyCreated:
        history.length,

      transaction,
    });
  } catch (error) {
    console.error(
      "Scenario creation error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to create scenario",

      error: error.message,
    });
  }
};

module.exports = {
  createScenario,
};