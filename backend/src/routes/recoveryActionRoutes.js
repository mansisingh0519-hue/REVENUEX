const express = require("express");

const router = express.Router();

const {
  executeRecovery,
} = require("../controllers/recoveryController");

// POST /api/recovery-actions/:transactionId/execute
router.post(
  "/:transactionId/execute",
  executeRecovery
);

module.exports = router;