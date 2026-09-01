const clampScore = (score) => {
  return Math.max(
    0,
    Math.min(100, Math.round(score))
  );
};

// =========================================================
// REVENUEX RECOVERY SCORING ENGINE
// =========================================================
//
// Deterministic recovery propensity model.
//
// Higher score = higher likelihood that recovery is
// appropriate and potentially successful.
//
// IMPORTANT:
// This score is NOT authorization.
//
// AI recommends.
// Policy authorizes.
// Recovery engine executes.
//
// =========================================================

const calculateRecoveryScore = (
  transaction,
  customerStats
) => {
  const amount =
    Number(transaction?.amount) || 0;

  const retryCount =
    Number(transaction?.retryCount) || 0;

  const successfulPayments =
    Number(
      customerStats?.successfulPayments
    ) || 0;

  const failedPayments =
    Number(
      customerStats?.failedPayments
    ) || 0;

  const totalTransactions =
    Number(
      customerStats?.totalTransactions
    ) || 0;

  const failureRate =
    Number(
      customerStats?.failureRate
    ) || 0;

  const failureCode =
    transaction?.failureCode || "";

  const method =
    transaction?.method || "";

  // =========================================================
  // HARD RISK CONDITIONS
  // =========================================================

  const criticalReasons = [];

  if (amount > 50000) {
    criticalReasons.push(
      "Payment amount is above the critical recovery threshold"
    );
  }

  if (retryCount >= 3) {
    criticalReasons.push(
      "Maximum retry threshold has been reached"
    );
  }

  if (
    failureCode ===
    "REPEATED_FAILURE"
  ) {
    criticalReasons.push(
      "Payment has a repeated failure pattern"
    );
  }

  if (criticalReasons.length > 0) {
    return {
      score: 10,

      riskLevel: "CRITICAL",

      recommendedAction: "STOP",

      reasons: criticalReasons,

      factors: {
        customerHistory: "HIGH_RISK",
        failurePattern: "HIGH_RISK",
        retryExposure:
          retryCount >= 3
            ? "EXHAUSTED"
            : "WITHIN_LIMIT",
        amountExposure:
          amount > 50000
            ? "CRITICAL"
            : "NORMAL",
        paymentMethod:
          method || "UNKNOWN",
      },
    };
  }

  // =========================================================
  // BASE SCORE
  // =========================================================

  let score = 40;

  const reasons = [];

  // =========================================================
  // CUSTOMER HISTORY
  // =========================================================

  if (successfulPayments >= 5) {
    score += 25;

    reasons.push(
      "Customer has strong successful payment history"
    );
  } else if (successfulPayments >= 3) {
    score += 15;

    reasons.push(
      "Customer has established successful payment history"
    );
  } else if (successfulPayments >= 1) {
    score += 5;

    reasons.push(
      "Customer has limited successful payment history"
    );
  } else {
    score -= 10;

    reasons.push(
      "Customer has no prior successful payment history"
    );
  }

  // =========================================================
  // FAILURE RATE
  // =========================================================

  if (
    failureRate < 20 &&
    successfulPayments > 0
  ) {
    score += 15;

    reasons.push(
      "Customer has a low historical failure rate"
    );
  } else if (
    failureRate < 40 &&
    successfulPayments > 0
  ) {
    score += 8;

    reasons.push(
      "Customer has a moderate historical failure rate"
    );
  } else if (failureRate >= 60) {
    score -= 15;

    reasons.push(
      "Customer has a high historical failure rate"
    );
  } else if (failureRate >= 40) {
    score -= 7;

    reasons.push(
      "Customer has an elevated historical failure rate"
    );
  }

  // =========================================================
  // FAILURE TYPE
  // =========================================================

  if (
    failureCode ===
    "TEMPORARY_FAILURE"
  ) {
    score += 15;

    reasons.push(
      "Failure pattern appears temporary"
    );
  } else if (
    failureCode ===
    "INSUFFICIENT_FUNDS"
  ) {
    score -= 10;

    reasons.push(
      "Failure may require customer action before retry"
    );
  } else if (
    failureCode ===
    "CARD_DECLINED"
  ) {
    score -= 8;

    reasons.push(
      "Payment method was explicitly declined"
    );
  } else if (
    failureCode ===
    "BANK_ERROR"
  ) {
    score -= 5;

    reasons.push(
      "Bank-side failure introduces recovery uncertainty"
    );
  } else if (
    failureCode
  ) {
    reasons.push(
      "Payment failure reason was considered in scoring"
    );
  }

  // =========================================================
  // RETRY EXPOSURE
  // =========================================================

  if (retryCount === 0) {
    score += 5;

    reasons.push(
      "No previous recovery retry has been attempted"
    );
  } else if (retryCount === 1) {
    score -= 3;

    reasons.push(
      "One previous retry has already been attempted"
    );
  } else if (retryCount === 2) {
    score -= 10;

    reasons.push(
      "Two previous retries increase recovery risk"
    );
  }

  // =========================================================
  // AMOUNT EXPOSURE
  // =========================================================

  if (amount <= 1000) {
    score += 5;

    reasons.push(
      "Payment amount has low financial exposure"
    );
  } else if (amount <= 5000) {
    reasons.push(
      "Payment amount is within the automatic recovery limit"
    );
  } else {
    score -= 10;

    reasons.push(
      "Payment amount increases financial exposure"
    );
  }

  // =========================================================
  // CUSTOMER SAMPLE SIZE
  // =========================================================

  if (totalTransactions <= 1) {
    score -= 10;

    reasons.push(
      "Customer history contains insufficient observations"
    );
  }

  // =========================================================
  // FINAL SCORE
  // =========================================================

  score = clampScore(score);

  // =========================================================
  // RISK CLASSIFICATION
  // =========================================================
  //
  // This represents recovery risk/propensity.
  //
  // HIGH score = favorable recovery conditions.
  // LOW score = weak recovery conditions.
  //

  let riskLevel;
  let recommendedAction;

  if (score >= 75) {
    riskLevel = "LOW";
    recommendedAction = "RETRY";
  } else if (score >= 50) {
    riskLevel = "MEDIUM";
    recommendedAction = "REVIEW";
  } else if (score >= 25) {
    riskLevel = "HIGH";
    recommendedAction = "REVIEW";
  } else {
    riskLevel = "CRITICAL";
    recommendedAction = "STOP";
  }

  // =========================================================
  // ADD EXPLICIT DECISION REASON
  // =========================================================

  if (recommendedAction === "RETRY") {
    reasons.push(
      "Recovery score supports a bounded automatic retry"
    );
  } else if (
    recommendedAction === "REVIEW"
  ) {
    reasons.push(
      "Recovery evidence is not strong enough for automatic execution"
    );
  } else {
    reasons.push(
      "Recovery conditions are too risky for further automatic attempts"
    );
  }

  return {
    score,

    riskLevel,

    recommendedAction,

    reasons,

    factors: {
      customerHistory:
        successfulPayments >= 5
          ? "STRONG"
          : successfulPayments >= 3
          ? "ESTABLISHED"
          : successfulPayments >= 1
          ? "LIMITED"
          : "NONE",

      failurePattern:
        failureCode ===
        "TEMPORARY_FAILURE"
          ? "TEMPORARY"
          : failureCode ===
            "REPEATED_FAILURE"
          ? "REPEATED"
          : "STANDARD",

      retryExposure:
        retryCount === 0
          ? "NONE"
          : retryCount === 1
          ? "LOW"
          : retryCount === 2
          ? "ELEVATED"
          : "EXHAUSTED",

      amountExposure:
        amount <= 1000
          ? "LOW"
          : amount <= 5000
          ? "MEDIUM"
          : amount <= 50000
          ? "HIGH"
          : "CRITICAL",

      paymentMethod:
        method || "UNKNOWN",

      historicalFailureRate:
        failureRate,
    },
  };
};

module.exports = {
  calculateRecoveryScore,
};