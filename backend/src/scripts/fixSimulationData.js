const mongoose = require("mongoose");
require("dotenv").config();

const Transaction = require("../models/Transaction");
const AuditLog = require("../models/AuditLog");

const fixSimulationData = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log(
      "Connected to MongoDB."
    );

    // ========================================
    // MARK OLD EXPERIMENT TRANSACTIONS
    // ========================================

    const experimentResult =
      await Transaction.updateMany(
        {
          $or: [
            {
              razorpayOrderId: {
                $regex: /^EXP_/,
              },
            },
            {
              razorpayPaymentId: {
                $regex: /^EXP_/,
              },
            },
          ],
        },
        {
          $set: {
            simulation: true,
          },
        }
      );

    console.log(
      "Experiment transactions updated:",
      experimentResult.modifiedCount
    );

    // ========================================
    // MARK OLD SCENARIO TRANSACTIONS
    // ========================================

    const scenarioResult =
      await Transaction.updateMany(
        {
          $or: [
            {
              razorpayOrderId: {
                $regex: /^SIM_/,
              },
            },
            {
              razorpayPaymentId: {
                $regex: /^SIM_/,
              },
            },
          ],
        },
        {
          $set: {
            simulation: true,
          },
        }
      );

    console.log(
      "Scenario transactions updated:",
      scenarioResult.modifiedCount
    );

    // ========================================
    // MARK BATCH AUDIT LOGS AS SIMULATED
    // ========================================

    const auditResult =
      await AuditLog.updateMany(
        {
          action: {
            $regex: /^BATCH_/,
          },
        },
        {
          $set: {
            "details.simulated": true,
          },
        }
      );

    console.log(
      "Batch audit logs updated:",
      auditResult.modifiedCount
    );

    console.log(
      "Simulation data migration completed."
    );
  } catch (error) {
    console.error(
      "Simulation migration failed:",
      error
    );
  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed."
    );
  }
};

fixSimulationData();