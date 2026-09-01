const express = require("express");

const router = express.Router();

const {
  analyzePaymentRecovery,
} = require("../controllers/recoveryController");

// GET /api/recovery/:transactionId
router.get(
  "/:transactionId",
  analyzePaymentRecovery
);

module.exports = router;