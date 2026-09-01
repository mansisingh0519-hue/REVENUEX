const express = require("express");

const {
  getRecoveryMetrics,
} = require(
  "../controllers/recoveryMetricsController"
);

const router = express.Router();

router.get(
  "/overview",
  getRecoveryMetrics
);

module.exports = router;