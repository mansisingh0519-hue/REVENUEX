const Transaction = require("../models/Transaction");

// =========================================================
// GET LIVE TRANSACTIONS
// =========================================================

const getTransactions = async (req, res) => {
  try {
    const limit =
      Math.min(
        Number(req.query.limit) || 50,
        100
      );

    const transactions =
      await Transaction.find({
        simulation: false,
      })
        .sort({
          createdAt: -1,
        })
        .limit(limit)
        .lean();

    // -------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------

    const summary = {
      total: transactions.length,

      captured: transactions.filter(
        (tx) =>
          tx.status === "captured"
      ).length,

      failed: transactions.filter(
        (tx) =>
          tx.status === "failed"
      ).length,

      recovering:
        transactions.filter(
          (tx) =>
            tx.recoveryStatus ===
              "ATTEMPTED"
        ).length,

      recovered:
        transactions.filter(
          (tx) =>
            tx.recoveryStatus ===
            "RECOVERED"
        ).length,

      escalated:
        transactions.filter(
          (tx) =>
            tx.recoveryStatus ===
            "ESCALATED"
        ).length,

      stopped:
        transactions.filter(
          (tx) =>
            tx.recoveryStatus ===
            "STOPPED"
        ).length,
    };

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    return res.status(200).json({
      success: true,

      source: "live",

      simulation: false,

      count:
        transactions.length,

      summary,

      transactions,
    });
  } catch (error) {
    console.error(
      "Transaction fetch error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to fetch transactions",

      error:
        error.message,
    });
  }
};

module.exports = {
  getTransactions,
};