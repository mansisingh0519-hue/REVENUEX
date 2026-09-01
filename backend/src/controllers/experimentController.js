const ExperimentRun =
  require("../models/ExperimentRun");

const {
  runBatchExperiment,
} = require("../services/experimentService");

// =========================================================
// RUN EXPERIMENT
// =========================================================

const runExperiment = async (
  req,
  res
) => {
  try {
    const count =
      Number(req.body?.count) || 100;

    // -------------------------------------------------------
    // VALIDATE COUNT
    // -------------------------------------------------------

    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 500
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Count must be an integer between 1 and 500.",
      });
    }

    console.log(
      `[Experiment] Starting ${count}-case REVENUEX benchmark...`
    );

    // -------------------------------------------------------
    // RUN CONTROLLED BENCHMARK
    // -------------------------------------------------------

    const experiment =
      await runBatchExperiment({
        count,
      });

    // -------------------------------------------------------
    // GENERATE RUN ID
    // -------------------------------------------------------

    const runId =
      `RUN_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    // -------------------------------------------------------
    // SAVE BENCHMARK
    // -------------------------------------------------------

    const savedRun =
      await ExperimentRun.create({
        runId,

        benchmarkType:
          experiment.benchmarkType ||
          "CONTROLLED_SYNTHETIC",

        note:
          experiment.note ||
          "Controlled synthetic benchmark.",

        totalCases:
          experiment.totalCases,

        totalAtRisk:
          experiment.totalAtRisk,

        eligibleRevenue:
          experiment.eligibleRevenue,

        totalRecovered:
          experiment.totalRecovered,

        recoveryRate:
          experiment.recoveryRate,

        eligibleRecoveryRate:
          experiment.eligibleRecoveryRate,

        recoveryAttempts:
          experiment.recoveryAttempts,

        successfulRecoveries:
          experiment.successfulRecoveries,

        failedRecoveries:
          experiment.failedRecoveries,

        blockedActions:
          experiment.blockedActions,

        blockedRate:
          experiment.blockedRate,

        escalatedActions:
          experiment.escalatedActions,

        stoppedActions:
          experiment.stoppedActions,

        policyViolations:
          experiment.policyViolations,

        policySafetyRate:
          experiment.policySafetyRate,

        correctDecisions:
          experiment.correctDecisions,

        incorrectDecisions:
          experiment.incorrectDecisions,

        decisionAgreement:
          experiment.decisionAgreement,

        expectedActionSummary:
          experiment.expectedActionSummary,

        actionSummary:
          experiment.actionSummary,

        policySummary:
          experiment.policySummary,

        scenarioSummary:
          experiment.scenarioSummary,

        // Store individual case results when the schema
        // supports a Mixed/Array field.
        results:
          experiment.results,

        completedAt:
          new Date(),
      });

    console.log(
      "[Experiment] Completed:",
      runId
    );

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    return res.status(200).json({
      success: true,

      experiment: {
        ...experiment,

        runId:
          savedRun.runId,

        completedAt:
          savedRun.completedAt,
      },
    });
  } catch (error) {
    console.error(
      "[Experiment] Error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to run experiment",

      error:
        error.message,
    });
  }
};

// =========================================================
// GET LATEST EXPERIMENT
// =========================================================

const getLatestExperiment =
  async (req, res) => {
    try {
      const experiment =
        await ExperimentRun.findOne()
          .sort({
            createdAt: -1,
          })
          .lean();

      if (!experiment) {
        return res.status(404).json({
          success: false,

          message:
            "No experiment runs found",
        });
      }

      return res.status(200).json({
        success: true,

        experiment,
      });
    } catch (error) {
      console.error(
        "[Experiment] Latest run error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to fetch latest experiment",

        error:
          error.message,
      });
    }
  };

module.exports = {
  runExperiment,
  getLatestExperiment,
};