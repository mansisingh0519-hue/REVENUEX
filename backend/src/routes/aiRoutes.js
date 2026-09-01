const express = require("express");

const {
  analyzeWithAI,
} = require("../controllers/aiController");

const router = express.Router();

router.get(
  "/:transactionId",
  analyzeWithAI
);

module.exports = router;