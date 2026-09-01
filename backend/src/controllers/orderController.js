const razorpay = require("../config/razorpay");
const Transaction = require("../models/Transaction");

const createOrder = async (req, res) => {
  try {
const {amount,customer,} = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(
      options
    );

    // Save order in MongoDB
    const transaction =
  await Transaction.create({
    razorpayOrderId: order.id,
    amount: amount,
    currency: "INR",
    status: "created",

    email:
      customer?.email || null,

    contact:
      customer?.contact || null,
  });

    console.log(
      "Transaction saved:",
      transaction._id
    );

    return res.status(200).json({
      success: true,
      order: order
    });

  } catch (error) {

    console.error(
      "Order creation error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create order"
    });
  }
};

module.exports = {
  createOrder
};