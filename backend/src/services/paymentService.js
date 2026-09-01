const razorpay = require("../config/razorpay");

const createOrder = async (amount) => {
    const options = {
        amount: amount * 100,
        currency: "INR",
        receipt: `receipt_${Date.now()}`
    };

    return await razorpay.orders.create(options);
};

module.exports = {
    createOrder
};