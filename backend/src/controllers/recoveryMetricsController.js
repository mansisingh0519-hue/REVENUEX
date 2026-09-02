const Transaction = require("../models/Transaction");
const AuditLog = require("../models/AuditLog");

const getRecoveryMetrics = async (req, res) => {
  try {
    /*
    =========================================================
    RECOVERY DASHBOARD — LIVE PAYMENTS ONLY
    =========================================================

    The main Payment Monitor is a live operational view.

    Simulation transactions are intentionally excluded here
    because Scenario Lab / Benchmark have their own metrics.

    This keeps:
      Transactions
      Recovery Attempts
      Recovered
      Stopped
      Escalated
      At-Risk Revenue
      Recovered Revenue

    internally consistent with the live transaction list.
    */

    const recoveryFilter = {
      simulation: false,
    };

    /*
    =========================================================
    FAILED PAYMENTS
    =========================================================
    */

    const failedPayments =
      await Transaction.countDocuments({
        ...recoveryFilter,
        status: "failed",
      });

    /*
    =========================================================
    RECOVERY ATTEMPTS
    =========================================================

    An attempt means the recovery engine has actually entered
    an execution state.

    ATTEMPTED
    RECOVERED
    FAILED

    are counted as attempts.

    STOPPED and ESCALATED are intentionally kept separate.
    */

    const recoveryAttempts =
      await Transaction.countDocuments({
        ...recoveryFilter,
        recoveryStatus: {
          $in: [
            "ATTEMPTED",
            "RECOVERED",
            "FAILED",
          ],
        },
      });

    /*
    =========================================================
    RECOVERED
    =========================================================
    */

    const recoveredTransactions =
      await Transaction.countDocuments({
        ...recoveryFilter,
        recoveryStatus: "RECOVERED",
      });

    /*
    =========================================================
    STOPPED
    =========================================================
    */

    const stoppedTransactions =
      await Transaction.countDocuments({
        ...recoveryFilter,
        recoveryStatus: "STOPPED",
      });

    /*
    =========================================================
    ESCALATED
    =========================================================
    */

    const escalatedTransactions =
      await Transaction.countDocuments({
        ...recoveryFilter,
        recoveryStatus: "ESCALATED",
      });

    /*
    =========================================================
    FAILED RECOVERY
    =========================================================
    */

    const failedRecoveryAttempts =
      await Transaction.countDocuments({
        ...recoveryFilter,
        recoveryStatus: "FAILED",
      });

    /*
    =========================================================
    RECOVERED REVENUE
    =========================================================
    */

    const recoveredRevenueResult =
      await Transaction.aggregate([
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

    /*
    =========================================================
    AT-RISK REVENUE
    =========================================================

    Only failed live payments that have NOT been recovered
    remain at risk.

    A recovered payment is no longer counted as at risk.
    */

    const atRiskRevenueResult =
      await Transaction.aggregate([
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

    /*
    =========================================================
    TOTALS
    =========================================================
    */

    const totalRecovered =
      recoveredRevenueResult.length > 0
        ? recoveredRevenueResult[0].totalRecovered
        : 0;

    const totalAtRisk =
      atRiskRevenueResult.length > 0
        ? atRiskRevenueResult[0].totalAtRisk
        : 0;

    /*
    =========================================================
    RECOVERY RATE
    =========================================================

    Recovery Rate =
      Recovered Revenue /
      (Recovered Revenue + Remaining At-Risk Revenue)
    */

    const recoveryRate =
      totalAtRisk + totalRecovered > 0
        ? Number(
            (
              (totalRecovered /
                (totalAtRisk +
                  totalRecovered)) *
              100
            ).toFixed(2)
          )
        : 0;

    /*
    =========================================================
    LIVE AUDIT LOGS
    =========================================================

    Only audit records belonging to live transactions are
    included in the Payment Monitor.
    */

    const liveTransactionIds =
      await Transaction.distinct("_id", {
        simulation: false,
      });

    const totalAuditLogs =
      await AuditLog.countDocuments({
        transactionId: {
          $in: liveTransactionIds,
        },
      });

    /*
    =========================================================
    RESPONSE
    =========================================================
    */

    return res.status(200).json({
      success: true,

      source: "recovery_dashboard",

      scope: "live",

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
      message:
        "Unable to calculate recovery metrics",
    });
  }
};

module.exports = {
  getRecoveryMetrics,
};