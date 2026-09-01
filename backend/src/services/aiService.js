const OpenAI = require("openai");

// =========================================================
// REVENUEX AI SERVICE
// =========================================================
//
// AI = ADVISORY ONLY
//
// AI analyzes:
//   payment context
//   customer history
//   recovery score
//
// AI recommends:
//   RETRY / REVIEW / STOP
//
// AI NEVER:
//   executes payments
//   changes transaction state
//   overrides policy
//
// Final authority:
//   deterministic policy engine
//
// =========================================================

const AI_MODEL =
  process.env.GROQ_MODEL ||
  "llama-3.3-70b-versatile";

const AI_TIMEOUT_MS = 8000;

const MAX_RETRIES = 3;
const MAX_AI_AMOUNT = 5000;

const VALID_ACTIONS = [
  "RETRY",
  "REVIEW",
  "STOP",
];

let client = null;

if (process.env.GROQ_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

// =========================================================
// HARD SAFETY OVERRIDE
// =========================================================
//
// This is NOT the final policy engine.
// It is an additional conservative guard around AI output.
//
// It can only make an AI recommendation MORE conservative.
// It can never turn STOP/REVIEW into RETRY.
//

const hardSafetyOverride = ({
  payment,
  customer,
}) => {
  const retryCount =
    Number(payment.retryCount) || 0;

  const amount =
    Number(payment.amount) || 0;

  const successfulPayments =
    Number(customer.successfulPayments) || 0;

  if (retryCount >= MAX_RETRIES) {
    return {
      forcedAction: "STOP",
      forcedReason:
        "Hard safety rule: maximum retry limit has been reached.",
    };
  }

  if (amount > MAX_AI_AMOUNT) {
    return {
      forcedAction: "STOP",
      forcedReason:
        "Hard safety rule: payment exceeds the automatic recovery amount ceiling.",
    };
  }

  if (
    payment.failureCode ===
    "REPEATED_FAILURE"
  ) {
    return {
      forcedAction: "STOP",
      forcedReason:
        "Hard safety rule: repeated payment failure indicates elevated recovery risk.",
    };
  }

  if (successfulPayments === 0) {
    return {
      forcedAction: "REVIEW",
      forcedReason:
        "Hard safety rule: customer has no prior successful payment history, so automatic retry requires review.",
    };
  }

  return {
    forcedAction: null,
    forcedReason: null,
  };
};

// =========================================================
// DETERMINISTIC FALLBACK
// =========================================================
//
// If Groq is unavailable, REVENUEX still works.
//
// The fallback never executes anything.
// It only produces an advisory decision that goes
// through the deterministic policy engine.
//

const localFallbackDecision = ({
  recovery,
}) => {
  const recommendedAction =
    VALID_ACTIONS.includes(
      recovery?.deterministicRecommendation
    )
      ? recovery.deterministicRecommendation
      : "REVIEW";

  return {
    diagnosis:
      "AI provider unavailable; decision generated from the deterministic recovery analysis.",

    recommendedAction,

    confidence: 0.6,

    reason:
      "Fallback decision based on recovery score, payment context and customer history.",

    provider: "local-fallback",
  };
};

// =========================================================
// BUILD AI PROMPT
// =========================================================

const buildPrompt = ({
  payment,
  customer,
  recovery,
}) => {
  return `
You are the AI payment recovery analyst inside REVENUEX.

Analyze ONE failed payment and recommend the safest next action.

You are an ADVISORY layer only.

You do NOT:
- execute payments
- modify transactions
- bypass safety rules
- authorize financial actions

A separate deterministic policy engine has final authority.

PAYMENT
Amount: ${payment.amount} ${payment.currency || "INR"}
Method: ${payment.method || "unknown"}
Failure reason: ${payment.failureReason || "unknown"}
Failure code: ${payment.failureCode || "unknown"}
Retry attempts: ${payment.retryCount || 0}

CUSTOMER HISTORY
Total transactions: ${customer.totalTransactions || 0}
Successful payments: ${customer.successfulPayments || 0}
Failed payments: ${customer.failedPayments || 0}
Historical failure rate: ${customer.failureRate || 0}%

RECOVERY ANALYSIS
Recovery score: ${recovery.score ?? "unknown"}
Risk level: ${recovery.riskLevel || "unknown"}

Use the evidence above to independently determine the safest action.

AVAILABLE ACTIONS

RETRY
Use when the payment appears reasonably recoverable and another attempt is appropriate.

REVIEW
Use when the situation is uncertain and human review is safer.

STOP
Use when another attempt appears unsafe, unlikely to succeed, or clearly outside safe recovery conditions.

Choose EXACTLY ONE action:

RETRY
REVIEW
STOP

Return ONLY valid JSON.

Required format:

{
  "diagnosis": "one short sentence explaining the likely failure situation",
  "recommendedAction": "RETRY",
  "confidence": 0.85,
  "reason": "one short sentence explaining why this action is appropriate"
}
`;
};

// =========================================================
// NORMALIZE AI OUTPUT
// =========================================================

const normalizeDecision = (parsed) => {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "AI returned an invalid response."
    );
  }

  const action =
    String(
      parsed.recommendedAction || ""
    )
      .trim()
      .toUpperCase();

  if (!VALID_ACTIONS.includes(action)) {
    throw new Error(
      `Model returned invalid action: ${action}`
    );
  }

  let confidence =
    Number(parsed.confidence);

  if (!Number.isFinite(confidence)) {
    confidence = 0.7;
  }

  confidence = Math.min(
    1,
    Math.max(0, confidence)
  );

  const diagnosis =
    typeof parsed.diagnosis === "string" &&
    parsed.diagnosis.trim()
      ? parsed.diagnosis.trim()
      : "No diagnosis returned.";

  const reason =
    typeof parsed.reason === "string" &&
    parsed.reason.trim()
      ? parsed.reason.trim()
      : "No recommendation reason returned.";

  return {
    diagnosis,
    recommendedAction: action,
    confidence,
    reason,
  };
};

// =========================================================
// CALL GROQ
// =========================================================

const callAI = async (context) => {
  const prompt =
    buildPrompt(context);

  const response =
    await client.chat.completions.create(
      {
        model: AI_MODEL,

        messages: [
          {
            role: "system",
            content: `
You are a conservative payment recovery analyst.

Analyze failed payment context and recommend
the safest next action.

You are NOT an execution agent.

You MUST return exactly one JSON object.

No markdown.
No code fences.
No additional text.

Required fields:

{
  "diagnosis": "string",
  "recommendedAction": "RETRY | REVIEW | STOP",
  "confidence": 0.0,
  "reason": "string"
}

Rules:

1. recommendedAction MUST be exactly:
   RETRY, REVIEW, or STOP.

2. confidence MUST be between 0 and 1.

3. Never invent customer history.

4. Prefer REVIEW when evidence is uncertain.

5. Prefer STOP when recovery appears unsafe.

6. Never claim that a payment was successfully recovered.

7. Never claim to have executed a payment.

8. The deterministic policy engine has final authority.
`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.1,

        max_tokens: 300,
      },
      {
        timeout: AI_TIMEOUT_MS,
      }
    );

  const raw =
    response?.choices?.[0]?.message?.content ||
    "";

  if (!raw.trim()) {
    throw new Error(
      "AI returned an empty response."
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "AI returned invalid JSON."
    );
  }

  const normalized =
    normalizeDecision(parsed);

  return {
    ...normalized,

    provider:
      `groq:${AI_MODEL}`,
  };
};

// =========================================================
// PUBLIC ENTRY POINT
// =========================================================

const analyzePaymentWithAI = async (
  context
) => {
  const payment =
    context?.payment || {};

  const customer =
    context?.customer || {};

  const recovery =
    context?.recovery || {};

  let decision;

  // =======================================================
  // AI PROVIDER
  // =======================================================

  if (!client) {
    console.warn(
      "GROQ_API_KEY not configured — using local fallback."
    );

    decision =
      localFallbackDecision({
        recovery,
      });
  } else {
    try {
      decision =
        await callAI({
          payment,
          customer,
          recovery,
        });
    } catch (error) {
      console.error(
        "Groq AI call failed — using local fallback:",
        error.message
      );

      decision =
        localFallbackDecision({
          recovery,
        });
    }
  }

  // =======================================================
  // HARD SAFETY OVERRIDE
  // =======================================================

  const {
    forcedAction,
    forcedReason,
  } =
    hardSafetyOverride({
      payment,
      customer,
    });

  // STOP always wins.

  if (
    forcedAction === "STOP"
  ) {
    decision = {
      ...decision,

      recommendedAction: "STOP",

      confidence: Math.max(
        decision.confidence || 0,
        0.97
      ),

      reason:
        forcedReason,
    };
  }

  // REVIEW can override RETRY,
  // but never turns STOP into something less conservative.

  else if (
    forcedAction === "REVIEW" &&
    decision.recommendedAction ===
      "RETRY"
  ) {
    decision = {
      ...decision,

      recommendedAction: "REVIEW",

      confidence: Math.max(
        decision.confidence || 0,
        0.82
      ),

      reason:
        forcedReason,
    };
  }

  return decision;
};

module.exports = {
  analyzePaymentWithAI,
};