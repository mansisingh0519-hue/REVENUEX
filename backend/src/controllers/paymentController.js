const crypto = require("crypto");
const Razorpay = require("razorpay");
const Transaction = require("../models/Transaction");
const RecoveryEvent = require("../models/RecoveryEvent");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/*
=========================================================
VERIFY SUCCESSFUL PAYMENT
=========================================================
*/

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification data",
      });
    }

    const transaction = await Transaction.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const body =
      razorpay_order_id +
      "|" +
      razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(body)
      .digest("hex");

    const isValid =
      expectedSignature === razorpay_signature;

    if (!isValid) {
      /*
       * Do NOT treat an invalid signature as a genuine
       * payment failure. It is a verification/security
       * failure, not evidence that the payment failed.
       */

      return res.status(400).json({
        success: false,
        verified: false,
        message: "Payment signature verification failed",
      });
    }

    transaction.razorpayPaymentId =
      razorpay_payment_id;

    transaction.status = "captured";

    await transaction.save();

    return res.status(200).json({
      success: true,
      verified: true,
      message: "Payment verified successfully",
      payment: {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
      },
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


/*
=========================================================
RECORD FAILED PAYMENT
=========================================================
*/

const recordPaymentFailure = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      error_code,
      error_description,
      error_reason,
      error_source,
      error_step,
    } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({
        success: false,
        message: "Razorpay order ID is required",
      });
    }

    const transaction = await Transaction.findOne({
      razorpayOrderId: razorpay_order_id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    /*
     * Store the failure immediately.
     * This ensures the transaction remains useful even
     * if Razorpay enrichment fails.
     */

    transaction.razorpayPaymentId =
      razorpay_payment_id || null;

    transaction.status = "failed";

    transaction.failureCode =
      error_code || null;

    transaction.failureReason =
      error_reason ||
      error_description ||
      "payment_failed";


    /*
     * Enrich the failure with Razorpay payment details.
     */

    if (razorpay_payment_id) {
      try {
        const payment =
          await razorpay.payments.fetch(
            razorpay_payment_id
          );

        transaction.method =
          payment.method || null;

        transaction.email =
          payment.email || null;

        transaction.contact =
          payment.contact || null;

        transaction.failureCode =
          payment.error_code ||
          error_code ||
          null;

        transaction.failureReason =
          payment.error_reason ||
          error_reason ||
          payment.error_description ||
          error_description ||
          "payment_failed";

        console.log(
          "Detailed Razorpay payment fetched:",
          {
            id: payment.id,
            method: payment.method,
            error_code: payment.error_code,
            error_description:
              payment.error_description,
            error_source:
              payment.error_source,
            error_step:
              payment.error_step,
            error_reason:
              payment.error_reason,
          }
        );
      } catch (razorpayError) {
        console.error(
          "Could not fetch detailed Razorpay payment:",
          razorpayError.message
        );

        /*
         * Failure recording still succeeds because the
         * Checkout payload already gave us enough data.
         */
      }
    }

    await transaction.save();


    /*
     * =====================================================
     * RECOVERY ENGINE: DETECT PAYMENT FAILURE
     * =====================================================
     *
     * This is the first event in the autonomous recovery
     * lifecycle.
     *
     * DETECTED
     *    ↓
     * ANALYZED
     *    ↓
     * DECIDED
     *    ↓
     * POLICY_CHECKED
     *    ↓
     * EXECUTED
     *    ↓
     * COMPLETED
     *
     * The AI does NOT execute anything here.
     * This only records that a recoverable payment failure
     * has entered the recovery system.
     */

    try {
      await RecoveryEvent.create({
        transactionId: transaction._id,
        eventType: "PAYMENT_FAILED",
        stage: "DETECTED",
        decision: null,
        details: {
          source: "payment_failure",
          simulation:
            transaction.simulation === true,

          amount: transaction.amount,
          currency: transaction.currency,

          paymentMethod:
            transaction.method || null,

          failureCode:
            transaction.failureCode || null,

          failureReason:
            transaction.failureReason || null,

          errorSource:
            error_source || null,

          errorStep:
            error_step || null,

          razorpayPaymentId:
            transaction.razorpayPaymentId || null,

          detectedAt: new Date(),
        },
      });

      console.log(
        "Recovery detection event created:",
        transaction._id
      );
    } catch (recoveryEventError) {
      /*
       * Do not reject an already-recorded payment failure
       * because the audit/recovery event failed.
       *
       * The transaction is still safely stored and can be
       * analyzed manually through the recovery endpoint.
       */

      console.error(
        "Could not create recovery detection event:",
        recoveryEventError.message
      );
    }


    console.log(
      "Payment failure recorded:",
      transaction._id
    );

    return res.status(200).json({
      success: true,
      message: "Payment failure recorded",
      recoveryDetected: true,
      transaction,
    });
  } catch (error) {
    console.error(
      "Failure recording error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to record payment failure",
    });
  }
};


module.exports = {
  verifyPayment,
  recordPaymentFailure,
};