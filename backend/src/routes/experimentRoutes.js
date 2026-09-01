const express = require("express");

const {
  runExperiment,
  getLatestExperiment,
} = require(
  "../controllers/experimentController"
);

const router = express.Router();

// ========================================
// RUN EXPERIMENT
// ========================================

router.post(
  "/run",
  runExperiment
);

// ========================================
// GET LATEST EXPERIMENT
// ========================================

router.get(
  "/latest",
  getLatestExperiment
);

module.exports = router;