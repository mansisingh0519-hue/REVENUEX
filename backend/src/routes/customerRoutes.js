const express = require("express");

const {
  getCustomerHistory,
} = require("../controllers/customerController");

const router = express.Router();

router.get(
  "/history",
  getCustomerHistory
);

module.exports = router;