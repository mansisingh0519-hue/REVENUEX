const express = require("express");

const {
  verifyPayment,
  recordPaymentFailure
} = require("../controllers/paymentController");

const router = express.Router();

router.post(
  "/verify",
  verifyPayment
);

router.post(
  "/failed",
  recordPaymentFailure
);

module.exports = router;