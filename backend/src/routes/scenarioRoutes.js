const express = require("express");

const {
  createScenario,
} = require("../controllers/scenarioController");

const router = express.Router();

router.post(
  "/create",
  createScenario
);

module.exports = router;