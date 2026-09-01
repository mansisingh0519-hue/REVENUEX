const MAX_RETRIES = 3;
const MAX_AUTO_RECOVERY_AMOUNT = 5000;

// ========================================
// RECOVERY POLICY ENGINE
// ========================================

const evaluateRecoveryPolicy = ({
  transaction,
  aiDecision,
}) => {
  const checks = [];
  const violations = [];
  const blockReasons = [];

  const retryCount =
    transaction.retryCount || 0;

  const amount =
    transaction.amount || 0;

  const action =
    aiDecision?.recommendedAction;

  // ========================================
  // CHECK 1: PAYMENT MUST BE FAILED
  // ========================================

  const paymentFailed =
    transaction.status === "failed";

  checks.push({
    rule: "payment_failed",
    passed: paymentFailed,
  });

  if (!paymentFailed) {
    violations.push(
      "Payment is not in failed state."
    );

    blockReasons.push(
      "Only failed payments can enter recovery."
    );
  }

  // ========================================
  // CHECK 2: RETRY LIMIT
  // ========================================

  const retryLimitPassed =
    retryCount < MAX_RETRIES;

  checks.push({
    rule: "retry_limit",
    passed: retryLimitPassed,
    retryCount,
    maximumRetries: MAX_RETRIES,
  });

  // ========================================
  // CHECK 3: AMOUNT LIMIT
  // ========================================

  const amountLimitPassed =
    amount <=
    MAX_AUTO_RECOVERY_AMOUNT;

  checks.push({
    rule: "amount_limit",
    passed: amountLimitPassed,
    amount,
    maximumAmount:
      MAX_AUTO_RECOVERY_AMOUNT,
  });

  // ========================================
  // AI DECISION GATE
  // ========================================

  if (!action) {
    violations.push(
      "AI did not provide a recovery action."
    );

    blockReasons.push(
      "Missing AI recovery decision."
    );
  }

  // REVIEW MUST ALWAYS REQUIRE HUMAN REVIEW
  if (action === "REVIEW") {
    blockReasons.push(
      "AI recommended REVIEW."
    );
  }

  // STOP MUST NEVER EXECUTE
  if (action === "STOP") {
    blockReasons.push(
      "AI recommended STOP."
    );
  }

  // ========================================
  // RETRY SAFETY RULES
  // ========================================

  if (action === "RETRY") {
    if (!retryLimitPassed) {
      violations.push(
        "Retry limit exceeded."
      );

      blockReasons.push(
        "Maximum retry limit reached."
      );
    }

    if (!amountLimitPassed) {
      violations.push(
        "Payment amount exceeds automatic recovery limit."
      );

      blockReasons.push(
        "Payment amount exceeds auto-recovery limit."
      );
    }
  }

  // ========================================
  // FINAL DECISION
  // ========================================

  const allowed =
    action === "RETRY" &&
    paymentFailed &&
    retryLimitPassed &&
    amountLimitPassed &&
    blockReasons.length === 0 &&
    violations.length === 0;

  const decision = allowed
    ? "ALLOW"
    : "BLOCK";

  // ========================================
  // RESPONSE
  // ========================================

  return {
    allowed,

    decision,

    action,

    checks,

    violations,

    blockReasons,

    reason: allowed
      ? "Recovery action passed all policy checks."
      : "Recovery action was blocked by the recovery policy.",
  };
};

module.exports = {
  evaluateRecoveryPolicy,
};