const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

require("dotenv").config();

// ========================================
// ROUTES
// ========================================

const orderRoutes =
  require("./routes/orderRoutes");

const paymentRoutes =
  require("./routes/paymentRoutes");

const analyticsRoutes =
  require("./routes/analyticsRoutes");

const transactionRoutes =
  require("./routes/transactionRoutes");

const customerRoutes =
  require("./routes/customerRoutes");

const recoveryRoutes =
  require("./routes/recoveryRoutes");

const aiRoutes =
  require("./routes/aiRoutes");

const recoveryActionRoutes =
  require("./routes/recoveryActionRoutes");

const recoveryMetricsRoutes =
  require("./routes/recoveryMetricsRoutes");

const auditRoutes =
  require("./routes/auditRoutes");

const scenarioRoutes =
  require("./routes/scenarioRoutes");

const experimentRoutes =
  require("./routes/experimentRoutes");

const webhookRoutes =
  require("./routes/webhookRoutes");

// ========================================
// APP
// ========================================

const app = express();

// ========================================
// CORS
// ========================================

app.use(cors());

// ========================================
// RAZORPAY WEBHOOK
// ========================================

/*
 * IMPORTANT:
 *
 * The webhook must receive the RAW
 * request body so the HMAC signature
 * can be verified correctly.
 *
 * This MUST be registered BEFORE
 * express.json().
 */

app.use(
  "/api/webhooks",
  express.raw({
    type: "application/json",
  }),
  webhookRoutes
);

// ========================================
// JSON FOR NORMAL APIs
// ========================================

app.use(
  express.json()
);

// ========================================
// NORMAL API ROUTES
// ========================================

app.use(
  "/api/orders",
  orderRoutes
);

app.use(
  "/api/payments",
  paymentRoutes
);

app.use(
  "/api/analytics",
  analyticsRoutes
);

app.use(
  "/api/transactions",
  transactionRoutes
);

app.use(
  "/api/customers",
  customerRoutes
);

app.use(
  "/api/recovery",
  recoveryRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/recovery-actions",
  recoveryActionRoutes
);

app.use(
  "/api/recovery-metrics",
  recoveryMetricsRoutes
);

app.use(
  "/api/audit",
  auditRoutes
);

app.use(
  "/api/scenarios",
  scenarioRoutes
);

app.use(
  "/api/experiments",
  experimentRoutes
);

// ========================================
// HEALTH CHECK
// ========================================

app.get(
  "/",
  (req, res) => {
    res.status(200).json({
      success: true,
      message:
        "REVENUEX backend is running",
    });
  }
);

// ========================================
// 404 HANDLER
// ========================================

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        "API endpoint not found",

      path:
        req.originalUrl,
    });
  }
);

// ========================================
// SERVER START
// ========================================

const PORT =
  process.env.PORT || 5000;

const startServer = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI
    );

    console.log(
      "MongoDB connected successfully"
    );

    app.listen(PORT, () => {
      console.log(
        `REVENUEX server running on port ${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  }
};

startServer();