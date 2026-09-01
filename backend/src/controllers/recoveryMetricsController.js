const Transaction = require("../models/Transaction");
const AuditLog = require("../models/AuditLog");

const getRecoveryMetrics = async (req, res) => {
  try {
    // =========================================================
    // RECOVERY DASHBOARD
    // Includes both live payments and controlled demo
    // simulation transactions.
    //
    // Analytics dashboard remains LIVE ONLY.
    // =========================================================

    const recoveryFilter = {};

    // =========================================================
    // FAILED PAYMENTS
    // =========================================================

    const failedPayments = await Transaction.countDocuments({
      ...recoveryFilter,
      status: "failed",
    });

    // =========================================================
    // RECOVERY ATTEMPTS
    // =========================================================

    const recoveryAttempts = await Transaction.countDocuments({
      ...recoveryFilter,
      recoveryStatus: {
        $in: ["ATTEMPTED", "RECOVERED", "FAILED"],
      },
    });

    // =========================================================
    // RECOVERED
    // =========================================================

    const recoveredTransactions = await Transaction.countDocuments({
      ...recoveryFilter,
      recoveryStatus: "RECOVERED",
    });

    // =========================================================
    // STOPPED
    // =========================================================

    const stoppedTransactions = await Transaction.countDocuments({
      ...recoveryFilter,
      recoveryStatus: "STOPPED",
    });

    // =========================================================
    // ESCALATED
    // =========================================================

    const escalatedTransactions = await Transaction.countDocuments({
      ...recoveryFilter,
      recoveryStatus: "ESCALATED",
    });

    // =========================================================
    // FAILED RECOVERY
    // =========================================================

    const failedRecoveryAttempts = await Transaction.countDocuments({
      ...recoveryFilter,
      recoveryStatus: "FAILED",
    });

    // =========================================================
    // RECOVERED REVENUE
    // =========================================================

    const recoveredRevenueResult = await Transaction.aggregate([
      {
        $match: {
          ...recoveryFilter,
          recoveryStatus: "RECOVERED",
        },
      },
      {
        $group: {
          _id: null,
          totalRecovered: {
            $sum: "$recoveredAmount",
          },
        },
      },
    ]);

    // =========================================================
    // AT-RISK REVENUE
    //
    // Only currently failed payments are considered at risk.
    // Recovered payments are no longer at risk.
    // =========================================================

    const atRiskRevenueResult = await Transaction.aggregate([
      {
        $match: {
          ...recoveryFilter,
          status: "failed",
          recoveryStatus: {
            $nin: ["RECOVERED"],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAtRisk: {
            $sum: "$amount",
          },
        },
      },
    ]);

    // =========================================================
    // TOTALS
    // =========================================================

    const totalRecovered =
      recoveredRevenueResult.length > 0
        ? recoveredRevenueResult[0].totalRecovered
        : 0;

    const totalAtRisk =
      atRiskRevenueResult.length > 0
        ? atRiskRevenueResult[0].totalAtRisk
        : 0;

    const recoveryRate =
      totalAtRisk + totalRecovered > 0
        ? Number(
            (
              (totalRecovered /
                (totalAtRisk + totalRecovered)) *
              100
            ).toFixed(2)
          )
        : 0;

    // =========================================================
    // AUDIT LOGS
    // =========================================================

    const transactionIds = await Transaction.distinct("_id");

    const totalAuditLogs = await AuditLog.countDocuments({
      transactionId: {
        $in: transactionIds,
      },
    });

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      source: "recovery_dashboard",

      metrics: {
        failedPayments,
        recoveryAttempts,
        recoveredTransactions,
        failedRecoveryAttempts,
        stoppedTransactions,
        escalatedTransactions,

        totalAtRisk,
        totalRecovered,
        recoveryRate,

        totalAuditLogs,
      },
    });
  } catch (error) {
    console.error(
      "Recovery metrics error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to calculate recovery metrics",
    });
  }
};

module.exports = {
  getRecoveryMetrics,
};