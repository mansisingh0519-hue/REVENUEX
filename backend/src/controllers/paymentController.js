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
RAZORPAY PAYMENT ENRICHMENT
=========================================================

Keeps transaction payment details consistent across:

1. Successful payments
2. Failed payments with payment ID
3. Failed payments where Razorpay provides the payment
   through the order's payment list
=========================================================
*/

const enrichTransactionFromPayment = (
  transaction,
  payment
) => {
  if (!payment) {
    return;
  }

  if (payment.id) {
    transaction.razorpayPaymentId =
      payment.id;
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

  if (payment.error_code) {
    transaction.failureCode =
      payment.error_code;
  }

  if (
    payment.error_reason ||
    payment.error_description
  ) {
    transaction.failureReason =
      payment.error_reason ||
      payment.error_description;
  }
};

/*
=========================================================
FIND PAYMENT FOR ORDER
=========================================================

Used when the checkout failure event does not provide a
payment ID.

Razorpay can expose payments associated with an order,
which lets us recover the payment method instead of
leaving the transaction permanently incomplete.
=========================================================
*/

const findPaymentForOrder = async (
  orderId
) => {
  try {
    const response =
      await razorpay.orders.fetchPayments(
        orderId
      );

    const payments =
      response?.items || [];

    if (!payments.length) {
      return null;
    }

    /*
     * Prefer a failed payment because this helper is
     * primarily used by the failure flow.
     */

    const failedPayment =
      payments.find(
        (payment) =>
          payment.status === "failed"
      );

    if (failedPayment) {
      return failedPayment;
    }

    /*
     * Otherwise return the newest payment.
     */

    return payments[0];
  } catch (error) {
    console.error(
      "Could not fetch payments for order:",
      error.message
    );

    return null;
  }
};

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
        message:
          "Missing payment verification data",
      });
    }

    const transaction =
      await Transaction.findOne({
        razorpayOrderId:
          razorpay_order_id,
      });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message:
          "Transaction not found",
      });
    }

    /*
     * =====================================================
     * VERIFY RAZORPAY SIGNATURE
     * =====================================================
     */

    const body =
      razorpay_order_id +
      "|" +
      razorpay_payment_id;

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_KEY_SECRET
        )
        .update(body)
        .digest("hex");

    const isValid =
      expectedSignature ===
      razorpay_signature;

    if (!isValid) {
      /*
       * An invalid signature is a security/verification
       * failure, NOT a payment failure.
       */

      return res.status(400).json({
        success: false,
        verified: false,
        message:
          "Payment signature verification failed",
      });
    }

    /*
     * =====================================================
     * FETCH ACTUAL RAZORPAY PAYMENT
     * =====================================================
     *
     * This is the important fix for the "Unknown" method
     * problem on successful payments.
     *
     * The checkout verification response contains the
     * payment ID, but the method lives on the Razorpay
     * payment entity.
     */

    let payment = null;

    try {
      payment =
        await razorpay.payments.fetch(
          razorpay_payment_id
        );

      console.log(
        "Successful Razorpay payment fetched:",
        {
          id: payment.id,
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
        }
      );
    } catch (razorpayError) {
      console.error(
        "Could not fetch successful Razorpay payment:",
        razorpayError.message
      );

      /*
       * Signature verification already succeeded.
       *
       * We still persist the payment itself. The method
       * simply remains unavailable if Razorpay enrichment
       * fails.
       */
    }

    /*
     * =====================================================
     * UPDATE TRANSACTION
     * =====================================================
     */

    transaction.razorpayPaymentId =
      razorpay_payment_id;

    transaction.status =
      "captured";

    if (payment) {
      enrichTransactionFromPayment(
        transaction,
        payment
      );
    }

    await transaction.save();

    return res.status(200).json({
      success: true,
      verified: true,
      message:
        "Payment verified successfully",

      payment: {
        payment_id:
          razorpay_payment_id,

        order_id:
          razorpay_order_id,

        method:
          transaction.method || null,
      },
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error",
    });
  }
};

/*
=========================================================
RECORD FAILED PAYMENT
=========================================================
*/

const recordPaymentFailure = async (
  req,
  res
) => {
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
        message:
          "Razorpay order ID is required",
      });
    }

    const transaction =
      await Transaction.findOne({
        razorpayOrderId:
          razorpay_order_id,
      });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message:
          "Transaction not found",
      });
    }

    /*
     * =====================================================
     * STORE FAILURE IMMEDIATELY
     * =====================================================
     *
     * The payment failure must remain recorded even if
     * Razorpay enrichment fails.
     */

    transaction.razorpayPaymentId =
      razorpay_payment_id || null;

    transaction.status =
      "failed";

    transaction.failureCode =
      error_code || null;

    transaction.failureReason =
      error_reason ||
      error_description ||
      "payment_failed";

    /*
     * =====================================================
     * RAZORPAY PAYMENT ENRICHMENT
     * =====================================================
     */

    let payment = null;

    /*
     * First choice:
     * use the payment ID supplied by Razorpay.
     */

    if (razorpay_payment_id) {
      try {
        payment =
          await razorpay.payments.fetch(
            razorpay_payment_id
          );

        console.log(
          "Detailed Razorpay payment fetched:",
          {
            id: payment.id,
            method: payment.method,
            error_code:
              payment.error_code,
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
      }
    }

    /*
     * Second choice:
     * if no payment ID was supplied, ask Razorpay for
     * payments associated with the order.
     */

    if (!payment) {
      payment =
        await findPaymentForOrder(
          razorpay_order_id
        );
    }

    /*
     * Apply payment details if Razorpay returned one.
     */

    if (payment) {
      enrichTransactionFromPayment(
        transaction,
        payment
      );

      /*
       * Make sure the transaction remains marked failed.
       * Razorpay's payment entity is the source of truth
       * for payment metadata, but this endpoint represents
       * the failure event.
       */

      transaction.status =
        "failed";
    }

    /*
     * Preserve frontend failure information if the
     * Razorpay payment entity did not provide it.
     */

    transaction.failureCode =
      transaction.failureCode ||
      error_code ||
      null;

    transaction.failureReason =
      transaction.failureReason ||
      error_reason ||
      error_description ||
      "payment_failed";

    /*
     * =====================================================
     * SAVE TRANSACTION
     * =====================================================
     */

    await transaction.save();

    /*
     * =====================================================
     * RECOVERY ENGINE: DETECT PAYMENT FAILURE
     * =====================================================
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
     * AI does NOT execute anything here.
     */

    try {
      await RecoveryEvent.create({
        transactionId:
          transaction._id,

        eventType:
          "PAYMENT_FAILED",

        stage:
          "DETECTED",

        decision: null,

        details: {
          source:
            "payment_failure",

          simulation:
            transaction.simulation ===
            true,

          amount:
            transaction.amount,

          currency:
            transaction.currency,

          paymentMethod:
            transaction.method ||
            null,

          failureCode:
            transaction.failureCode ||
            null,

          failureReason:
            transaction.failureReason ||
            null,

          errorSource:
            error_source ||
            null,

          errorStep:
            error_step ||
            null,

          razorpayPaymentId:
            transaction.razorpayPaymentId ||
            null,

          detectedAt:
            new Date(),
        },
      });

      console.log(
        "Recovery detection event created:",
        transaction._id
      );
    } catch (
      recoveryEventError
    ) {
      /*
       * Do not reject an already-recorded payment
       * failure because an audit event failed.
       */

      console.error(
        "Could not create recovery detection event:",
        recoveryEventError.message
      );
    }

    /*
     * =====================================================
     * FINAL LOG
     * =====================================================
     */

    console.log(
      "Payment failure recorded:",
      {
        transactionId:
          transaction._id,

        paymentId:
          transaction.razorpayPaymentId,

        method:
          transaction.method,

        status:
          transaction.status,
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Payment failure recorded",

      recoveryDetected:
        true,

      transaction,
    });
  } catch (error) {
    console.error(
      "Failure recording error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to record payment failure",
    });
  }
};

module.exports = {
  verifyPayment,
  recordPaymentFailure,
};