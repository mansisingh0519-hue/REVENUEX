const Transaction = require("../models/Transaction");

const getCustomerHistory = async (
  req,
  res
) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message:
          "Customer email is required",
      });
    }

    // --------------------------------
    // LIVE TRANSACTIONS ONLY
    // --------------------------------

    const transactions =
      await Transaction.find({
        email,
        simulation: false,
      })
        .sort({
          createdAt: -1,
        })
        .limit(50);

    // --------------------------------
    // CUSTOMER STATISTICS
    // --------------------------------

    const totalTransactions =
      transactions.length;

    const successfulPayments =
      transactions.filter(
        (transaction) =>
          transaction.status ===
          "captured"
      );

    const failedPayments =
      transactions.filter(
        (transaction) =>
          transaction.status ===
          "failed"
      );

    const totalSuccessfulRevenue =
      successfulPayments.reduce(
        (total, transaction) =>
          total + transaction.amount,
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

    return res.status(200).json({
      success: true,

      customer: {
        email,

        totalTransactions,

        successfulPayments:
          successfulPayments.length,

        failedPayments:
          failedPayments.length,

        totalSuccessfulRevenue,

        failureRate,
      },

      transactions,
    });
  } catch (error) {
    console.error(
      "Customer history error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch customer history",
    });
  }
};

module.exports = {
  getCustomerHistory,
};