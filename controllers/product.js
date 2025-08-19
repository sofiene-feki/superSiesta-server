const Product = require("../models/product");
const slugify = require("slugify");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// helper to delete old files
const deleteFile = async (filePath) => {
  try {
    if (filePath)
      await fs.promises.unlink(path.join(__dirname, "..", filePath));
  } catch (err) {
    console.error("Error deleting file:", filePath, err.message);
  }
};

// CREATE PRODUCT
exports.create = async (req, res) => {
  try {
    const { body, files } = req;

    // parse JSON strings to objects
    ["colors", "sizes", "ficheTech"].forEach((key) => {
      if (body[key] && typeof body[key] === "string") {
        body[key] = JSON.parse(body[key]);
      }
    });

    // ensure sizes.price is a number
    if (Array.isArray(body.sizes)) {
      body.sizes = body.sizes.map((s) => ({
        ...s,
        price: Number(s.price) || 0,
      }));
    }

    // handle media files
    let media = [];
    if (files?.mediaFiles) {
      media = files.mediaFiles.map((f) => ({
        src: `/uploads/media/${f.filename}`,
        type: f.mimetype.startsWith("image") ? "image" : "video",
        alt: f.originalname,
      }));
    }

    const newProduct = new Product({
      ...body,
      slug: slugify(body.Title),
      media,
      Image: files?.imageFile
        ? `/uploads/images/${files.imageFile[0].filename}`
        : "",
      pdf: files?.pdf ? `/uploads/pdfs/${files.pdf[0].filename}` : "",
      video: files?.video ? `/uploads/videos/${files.video[0].filename}` : "",
    });

    const saved = await newProduct.save();
    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

// READ PRODUCT
exports.read = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// UPDATE PRODUCT
exports.update = async (req, res) => {
  try {
    const { body, files } = req;
    console.log("👉 Update hit:", req.params.slug);
    console.log("📦 Received files:", files);
    console.log("📦 Received body (raw):", body);

    const existing = await Product.findOne({ slug: req.params.slug });
    if (!existing) return res.status(404).json({ error: "Product not found" });

    // -------------------------
    // Parse JSON fields safely
    // -------------------------
    const parseJSONSafely = (value, key) => {
      if (!value) return [];
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          console.log(`✅ Parsed ${key}:`, parsed);
          return parsed;
        } catch (err) {
          console.warn(`⚠️ Failed to parse ${key}, got raw string:`, value);
          return [];
        }
      }
      return value; // already object/array
    };

    body.colors = parseJSONSafely(body.colors, "colors");
    body.sizes = parseJSONSafely(body.sizes, "sizes");
    body.existingMediaIds = parseJSONSafely(
      body.existingMediaIds,
      "existingMediaIds"
    );

    // Convert size prices to numbers
    if (Array.isArray(body.sizes)) {
      body.sizes = body.sizes.map((s) => ({
        ...s,
        price: Number(s.price) || 0,
      }));
    }

    // -------------------------
    // Handle media deletion / addition
    // -------------------------
    console.log("📌 Existing media IDs from client:", body.existingMediaIds);
    console.log("📌 Existing media in DB before update:", existing.media);

    let updatedMedia = (existing.media || []).filter((m) =>
      body.existingMediaIds.includes(m._id.toString())
    );

    const mediaToDelete = (existing.media || []).filter(
      (m) => !body.existingMediaIds.includes(m._id.toString())
    );

    for (let m of mediaToDelete) {
      if (m.src) {
        console.log("🗑️ Deleting media file:", m.src);
        await deleteFile(m.src); // implement deleteFile to remove file from disk
      }
    }

    // Append newly uploaded media
    if (files?.mediaFiles) {
      const newMedia = files.mediaFiles.map((f) => ({
        src: `/uploads/media/${f.filename}`,
        type: f.mimetype.startsWith("image") ? "image" : "video",
        alt: f.originalname,
      }));
      console.log("🆕 New media to append:", newMedia);
      updatedMedia.push(...newMedia);
    }

    body.media = updatedMedia;
    console.log("✅ Final media array to save:", updatedMedia);

    // -------------------------
    // Handle single uploads
    // -------------------------
    if (files?.imageFile) {
      if (existing.Image) await deleteFile(existing.Image);
      body.Image = `/uploads/images/${files.imageFile[0].filename}`;
    }
    if (files?.pdf) {
      if (existing.pdf) await deleteFile(existing.pdf);
      body.pdf = `/uploads/pdfs/${files.pdf[0].filename}`;
    }
    if (files?.video) {
      if (existing.video) await deleteFile(existing.video);
      body.video = `/uploads/videos/${files.video[0].filename}`;
    }

    if (body.Title) body.slug = slugify(body.Title);

    // -------------------------
    // Update in DB
    // -------------------------
    const updated = await Product.findOneAndUpdate(
      { slug: req.params.slug },
      body,
      { new: true, runValidators: true }
    );

    console.log("✅ Product successfully updated:", updated);
    res.json(updated);
  } catch (err) {
    console.error("❌ Update failed:", err);
    res.status(400).json({ error: err.message });
  }
};

// DELETE PRODUCT
exports.remove = async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({ slug: req.params.slug });
    if (!deleted) return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Deleted successfully", product: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LIST PRODUCTS with filters/pagination
exports.list = async (req, res) => {
  try {
    let { page = 1, itemsPerPage = 10, filters = {}, sort = "new" } = req.body;
    page = parseInt(page);
    itemsPerPage = parseInt(itemsPerPage);
    const skip = (page - 1) * itemsPerPage;

    let sortCriteria = sort === "best" ? { sold: -1 } : { createdAt: -1 };

    const query = {};
    if (filters.category) query.Category = { $in: filters.category };
    if (filters.color) query["colors.value"] = { $in: filters.color };
    if (filters.brand) query.Brand = { $in: filters.brand };

    const products = await Product.find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(itemsPerPage);
    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / itemsPerPage),
      total,
      currentPage: page,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
