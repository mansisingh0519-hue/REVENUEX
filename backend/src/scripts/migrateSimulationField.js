const mongoose = require("mongoose");
require("dotenv").config();

const Transaction = require("../models/Transaction");

const migrate = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log(
      "Connected to MongoDB for migration."
    );

    const result =
      await Transaction.updateMany(
        {
          simulation: {
            $exists: false,
          },
        },
        {
          $set: {
            simulation: false,
          },
        }
      );

    console.log(
      `Migration completed. Updated ${result.modifiedCount} transactions.`
    );
  } catch (error) {
    console.error(
      "Migration failed:",
      error
    );
  } finally {
    await mongoose.disconnect();

    console.log(
      "MongoDB connection closed."
    );
  }
};

migrate();