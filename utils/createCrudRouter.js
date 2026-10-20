const express = require("express");
const mongoose = require("mongoose");

const asyncHandler = require("./asyncHandler");

const createCrudRouter = (Model, options = {}) => {
  const router = express.Router();
  const defaultSort = options.defaultSort || { createdAt: -1 };
  const hiddenFields = options.hiddenFields || "";
  const beforeCreate = options.beforeCreate;
  const afterCreate = options.afterCreate;
  const beforeUpdate = options.beforeUpdate;
  const afterUpdate = options.afterUpdate;
  const beforeDelete = options.beforeDelete;
  const afterDelete = options.afterDelete;

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        Model.find({}).select(hiddenFields).sort(defaultSort).skip(skip).limit(limit),
        Model.countDocuments({}),
      ]);

      res.json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const createBody = beforeCreate ? await beforeCreate(req.body, req) : req.body;
      const item = await Model.create(createBody);
      if (afterCreate) {
        await afterCreate(item, req);
      }
      res.status(201).json(item);
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid record ID" });
      }

      const item = await Model.findById(req.params.id).select(hiddenFields);

      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }

      res.json(item);
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid record ID" });
      }

      const updateBody = beforeUpdate ? await beforeUpdate(req.body, req) : req.body;
      const previous = afterUpdate ? await Model.findById(req.params.id).select(hiddenFields) : null;
      const item = await Model.findByIdAndUpdate(req.params.id, updateBody, {
        new: true,
        runValidators: true,
      }).select(hiddenFields);

      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }

      if (afterUpdate) {
        await afterUpdate(item, previous, req);
      }
      res.json(item);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid record ID" });
      }

      if (beforeDelete) {
        await beforeDelete(req.params.id, req);
      }

      const item = await Model.findByIdAndDelete(req.params.id);

      if (!item) {
        return res.status(404).json({ message: "Record not found" });
      }

      if (afterDelete) {
        await afterDelete(item, req);
      }
      res.json({ message: "Record deleted" });
    }),
  );

  return router;
};

module.exports = createCrudRouter;
