const crypto = require("crypto");

const Transaction =
  require("../models/Transaction");

const WebhookEvent =
  require("../models/WebhookEvent");

const {
  runRecoveryOrchestration,
} = require("../services/recoveryOrchestrator");

// ========================================
// VERIFY WEBHOOK SIGNATURE
// ========================================

const verifyWebhookSignature = (
  rawBody,
  receivedSignature
) => {
  const secret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      "RAZORPAY_WEBHOOK_SECRET is not configured"
    );
  }

  if (!receivedSignature) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        secret
      )
      .update(rawBody)
      .digest("hex");

  const receivedBuffer =
    Buffer.from(
      receivedSignature,
      "utf8"
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      "utf8"
    );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    expectedBuffer
  );
};

// ========================================
// FIND TRANSACTION
// ========================================

const findTransaction =
  async ({
    orderId,
    paymentId,
  }) => {
    if (orderId) {
      const transaction =
        await Transaction.findOne({
          razorpayOrderId:
            orderId,
        });

      if (transaction) {
        return transaction;
      }
    }

    if (paymentId) {
      const transaction =
        await Transaction.findOne({
          razorpayPaymentId:
            paymentId,
        });

      if (transaction) {
        return transaction;
      }
    }

    return null;
  };

// ========================================
// PROCESS PAYMENT EVENT
// ========================================

const processPaymentEvent =
  async ({
    event,
    payment,
    webhookEvent,
  }) => {
    if (!payment) {
      webhookEvent.status =
        "IGNORED";

      webhookEvent.error =
        "Payment entity missing from webhook payload";

      webhookEvent.processedAt =
        new Date();

      await webhookEvent.save();

      return;
    }

    const paymentId =
      payment.id || null;

    const orderId =
      payment.order_id || null;

    webhookEvent.razorpayPaymentId =
      paymentId;

    webhookEvent.razorpayOrderId =
      orderId;

    // --------------------------------
    // FIND TRANSACTION
    // --------------------------------

    const transaction =
      await findTransaction({
        orderId,
        paymentId,
      });

    if (!transaction) {
      webhookEvent.status =
        "IGNORED";

      webhookEvent.error =
        "Matching transaction not found";

      webhookEvent.processedAt =
        new Date();

      await webhookEvent.save();

      console.log(
        `Webhook ${event} received but matching transaction was not found.`
      );

      return;
    }

    webhookEvent.transactionId =
      transaction._id;

    // --------------------------------
    // COMMON DATA
    // --------------------------------

    if (paymentId) {
      transaction.razorpayPaymentId =
        paymentId;
    }

    if (payment.method) {
      transaction.method =
        payment.method;
    }

    if (payment.email) {
      transaction.email =
        payment.email;
    }

    if (payment.contact) {
      transaction.contact =
        payment.contact;
    }

    // ========================================
    // AUTHORIZED
    // ========================================

    if (
      event ===
      "payment.authorized"
    ) {
      if (
        transaction.status !==
        "captured"
      ) {
        transaction.status =
          "authorized";
      }

      transaction.failureReason =
        null;

      transaction.failureCode =
        null;
    }

    // ========================================
    // CAPTURED
    // ========================================

    else if (
      event ===
      "payment.captured"
    ) {
      transaction.status =
        "captured";

      transaction.failureReason =
        null;

      transaction.failureCode =
        null;
    }

    // ========================================
    // FAILED
    // ========================================

    else if (
      event ===
      "payment.failed"
    ) {
      if (
        transaction.status !==
        "captured"
      ) {
        transaction.status =
          "failed";

        transaction.failureCode =
          payment.error_code ||
          null;

        transaction.failureReason =
          payment.error_reason ||
          payment.error_description ||
          "payment_failed";
      }
    }

    // ========================================
    // UNKNOWN
    // ========================================

    else {
      webhookEvent.status =
        "IGNORED";

      webhookEvent.error =
        `Unsupported event: ${event}`;

      webhookEvent.processedAt =
        new Date();

      await webhookEvent.save();

      return;
    }

    await transaction.save();

    // ========================================
    // WEBHOOK EVENT STORED
    // ========================================

    webhookEvent.status =
      "PROCESSED";

    webhookEvent.processedAt =
      new Date();

    await webhookEvent.save();

    console.log(
      `Processed Razorpay webhook: ${event}`
    );

    console.log(
      `Transaction: ${transaction._id}`
    );

    // ========================================
    // START RECOVERY PIPELINE
    // ========================================

    if (
      event ===
        "payment.failed" &&
      transaction.status ===
        "failed"
    ) {
      try {
        console.log(
          "Starting REVENUEX recovery orchestration..."
        );

        const recoveryResult =
          await runRecoveryOrchestration(
            transaction._id
          );

        console.log(
          "Recovery orchestration completed:",
          recoveryResult.execution
        );

        return recoveryResult;
      } catch (recoveryError) {
        console.error(
          "Recovery orchestration failed:",
          recoveryError
        );

        // Webhook itself was successfully
        // received and processed, even if
        // downstream recovery encountered
        // an error.
      }
    }

    return null;
  };

// ========================================
// MAIN WEBHOOK HANDLER
// ========================================

const handleRazorpayWebhook =
  async (req, res) => {
    console.log("🔥 RAZORPAY WEBHOOK HIT");
    try {
      // --------------------------------
      // RAW BODY
      // --------------------------------

      const rawBody =
        Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              req.body || ""
            );

      // --------------------------------
      // SIGNATURE
      // --------------------------------

      const signature =
        req.headers[
          "x-razorpay-signature"
        ];

      const isValid =
        verifyWebhookSignature(
          rawBody,
          signature
        );

      if (!isValid) {
        console.error(
          "Invalid Razorpay webhook signature."
        );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid webhook signature",
          });
      }

      // --------------------------------
      // EVENT ID
      // --------------------------------

      const eventId =
        req.headers[
          "x-razorpay-event-id"
        ];

      if (!eventId) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Missing Razorpay event ID",
          });
      }

      // --------------------------------
      // DUPLICATE CHECK
      // --------------------------------

      const existingEvent =
        await WebhookEvent.findOne({
          eventId,
        });

      if (existingEvent) {
        console.log(
          `Duplicate webhook ignored: ${eventId}`
        );

        return res
          .status(200)
          .json({
            success: true,

            duplicate: true,

            message:
              "Webhook already processed",
          });
      }

      // --------------------------------
      // PARSE JSON
      // --------------------------------

      let payload;

      try {
        payload =
          JSON.parse(
            rawBody.toString(
              "utf8"
            )
          );
      } catch (error) {
        console.error(
          "Invalid webhook JSON:",
          error
        );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid webhook JSON",
          });
      }

      const event =
        payload.event;

      // --------------------------------
      // CREATE WEBHOOK RECORD
      // --------------------------------

      let webhookEvent;

      try {
        webhookEvent =
          await WebhookEvent.create({
            eventId,

            event:
              event ||
              "unknown",

            status:
              "RECEIVED",

            receivedAt:
              new Date(),
          });
      } catch (error) {
        if (
          error.code ===
          11000
        ) {
          return res
            .status(200)
            .json({
              success: true,
              duplicate: true,
              message:
                "Webhook already received",
            });
        }

        throw error;
      }

      // --------------------------------
      // PAYMENT ENTITY
      // --------------------------------

      const paymentEntity =
        payload?.payload?.payment
          ?.entity;

      // --------------------------------
      // PROCESS
      // --------------------------------

      const recoveryResult =
        await processPaymentEvent({
          event,
          payment:
            paymentEntity,
          webhookEvent,
        });

      // --------------------------------
      // RESPONSE
      // --------------------------------

      return res
        .status(200)
        .json({
          success: true,

          received: true,

          event,

          recoveryStarted:
            Boolean(
              recoveryResult
            ),

          recovery:
            recoveryResult
              ? {
                  status:
                    recoveryResult
                      .execution
                      ?.status,

                  action:
                    recoveryResult
                      .aiDecision
                      ?.recommendedAction,

                  recoveredAmount:
                    recoveryResult
                      .execution
                      ?.recoveredAmount ||
                    0,
                }
              : null,
        });
    } catch (error) {
      console.error(
        "Razorpay webhook error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Webhook processing failed",
        });
    }
  };



module.exports = {
  handleRazorpayWebhook,
};