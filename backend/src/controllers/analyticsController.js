const Transaction = require("../models/Transaction");

const getAnalyticsOverview = async (
  req,
  res
) => {
  try {
    // --------------------------------
    // LIVE TRANSACTIONS ONLY
    // --------------------------------

    const liveFilter = {
      simulation: false,
    };

    // --------------------------------
    // BASIC COUNTS
    // --------------------------------

    const totalTransactions =
      await Transaction.countDocuments(
        liveFilter
      );

    const successfulTransactions =
      await Transaction.countDocuments({
        ...liveFilter,
        status: "captured",
      });

    const failedTransactions =
      await Transaction.countDocuments({
        ...liveFilter,
        status: "failed",
      });

    // --------------------------------
    // SUCCESSFUL REVENUE
    // --------------------------------

    const revenueResult =
      await Transaction.aggregate([
        {
          $match: {
            ...liveFilter,
            status: "captured",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: "$amount",
            },
          },
        },
      ]);

    // --------------------------------
    // FAILED / AT-RISK REVENUE
    // --------------------------------

    const failedRevenueResult =
      await Transaction.aggregate([
        {
          $match: {
            ...liveFilter,
            status: "failed",
          },
        },
        {
          $group: {
            _id: null,
            totalFailedRevenue: {
              $sum: "$amount",
            },
          },
        },
      ]);

    // --------------------------------
    // FAILURE REASONS
    // --------------------------------

    const failureReasons =
      await Transaction.aggregate([
        {
          $match: {
            ...liveFilter,
            status: "failed",
            failureReason: {
              $ne: null,
            },
          },
        },
        {
          $group: {
            _id: "$failureReason",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            count: -1,
          },
        },
        {
          $limit: 5,
        },
      ]);

    // --------------------------------
    // VALUES
    // --------------------------------

    const totalRevenue =
      revenueResult.length > 0
        ? revenueResult[0].totalRevenue
        : 0;

    const failedRevenue =
      failedRevenueResult.length > 0
        ? failedRevenueResult[0]
            .totalFailedRevenue
        : 0;

    // --------------------------------
    // RATES
    // --------------------------------

    const successRate =
      totalTransactions > 0
        ? Number(
            (
              (successfulTransactions /
                totalTransactions) *
              100
            ).toFixed(2)
          )
        : 0;

    const failureRate =
      totalTransactions > 0
        ? Number(
            (
              (failedTransactions /
                totalTransactions) *
              100
            ).toFixed(2)
          )
        : 0;

    // --------------------------------
    // RESPONSE
    // --------------------------------

    return res.status(200).json({
      success: true,

      source: "live",

      analytics: {
        totalTransactions,

        successfulTransactions,

        failedTransactions,

        totalRevenue,

        failedRevenue,

        successRate,

        failureRate,

        failureReasons:
          failureReasons.map(
            (item) => ({
              reason: item._id,
              count: item.count,
            })
          ),
      },
    });
  } catch (error) {
    console.error(
      "Analytics error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to calculate analytics",
    });
  }
};

module.exports = {
  getAnalyticsOverview,
};