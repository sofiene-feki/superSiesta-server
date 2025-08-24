// server/models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customer: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        price: Number,
        quantity: Number,
        image: String,
        selectedSize: String,
        selectedColor: String,
      },
    ],
    paymentMethod: { type: String, enum: ["cod", "card"], default: "cod" },
    shipping: { type: Number, default: 0 },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["En attente", "Confirmée", "Expédiée", "Livrée", "Annulée"],
      default: "En attente",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
