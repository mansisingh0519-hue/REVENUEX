const mongoose = require("mongoose");

// =========================================================
// EXPERIMENT RUN SCHEMA
// =========================================================

const experimentRunSchema =
  new mongoose.Schema(
    {
      // -----------------------------------------------------
      // RUN IDENTITY
      // -----------------------------------------------------

      runId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      benchmarkType: {
        type: String,
        default:
          "CONTROLLED_SYNTHETIC",
      },

      note: {
        type: String,
        default:
          "Controlled synthetic benchmark.",
      },

      // -----------------------------------------------------
      // CORE METRICS
      // -----------------------------------------------------

      totalCases: {
        type: Number,
        required: true,
      },

      totalAtRisk: {
        type: Number,
        default: 0,
      },

      eligibleRevenue: {
        type: Number,
        default: 0,
      },

      totalRecovered: {
        type: Number,
        default: 0,
      },

      recoveryRate: {
        type: Number,
        default: 0,
      },

      eligibleRecoveryRate: {
        type: Number,
        default: 0,
      },

      // -----------------------------------------------------
      // EXECUTION METRICS
      // -----------------------------------------------------

      recoveryAttempts: {
        type: Number,
        default: 0,
      },

      successfulRecoveries: {
        type: Number,
        default: 0,
      },

      failedRecoveries: {
        type: Number,
        default: 0,
      },

      blockedActions: {
        type: Number,
        default: 0,
      },

      blockedRate: {
        type: Number,
        default: 0,
      },

      escalatedActions: {
        type: Number,
        default: 0,
      },

      stoppedActions: {
        type: Number,
        default: 0,
      },

      // -----------------------------------------------------
      // POLICY SAFETY
      // -----------------------------------------------------

      policyViolations: {
        type: Number,
        default: 0,
      },

      policySafetyRate: {
        type: Number,
        default: 100,
      },

      // -----------------------------------------------------
      // DECISION EVALUATION
      // -----------------------------------------------------

      correctDecisions: {
        type: Number,
        default: 0,
      },

      incorrectDecisions: {
        type: Number,
        default: 0,
      },

      decisionAgreement: {
        type: Number,
        default: 0,
      },

      // -----------------------------------------------------
      // ACTION DISTRIBUTION
      // -----------------------------------------------------

      expectedActionSummary: {
        type:
          mongoose.Schema.Types.Mixed,

        default: {
          RETRY: 0,
          REVIEW: 0,
          STOP: 0,
        },
      },

      actionSummary: {
        type:
          mongoose.Schema.Types.Mixed,

        default: {
          RETRY: 0,
          REVIEW: 0,
          STOP: 0,
        },
      },

      // -----------------------------------------------------
      // POLICY DISTRIBUTION
      // -----------------------------------------------------

      policySummary: {
        type:
          mongoose.Schema.Types.Mixed,

        default: {
          ALLOW: 0,
          BLOCK: 0,
        },
      },

      // -----------------------------------------------------
      // SCENARIO BREAKDOWN
      // -----------------------------------------------------

      scenarioSummary: {
        type:
          mongoose.Schema.Types.Mixed,

        default: {},
      },

      // -----------------------------------------------------
      // INDIVIDUAL CASE RESULTS
      // -----------------------------------------------------
      //
      // Mixed keeps the benchmark flexible while we iterate
      // on the exact result structure.
      //

      results: {
        type:
          mongoose.Schema.Types.Mixed,

        default: [],
      },

      // -----------------------------------------------------
      // COMPLETION
      // -----------------------------------------------------

      completedAt: {
        type: Date,
        default: Date.now,
      },
    },

    {
      timestamps: true,
    }
  );

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.model(
    "ExperimentRun",
    experimentRunSchema
  );