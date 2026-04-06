const express = require("express");
const router = express.Router();
const {
  getRecords,
  getRecordById,
  createRecord,
  updateRecord,
  deleteRecord,
} = require("../controllers/records.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");

// All record routes require authentication
router.use(authenticate);

// GET /api/records         — viewer, analyst, admin
router.get("/", allowRoles("viewer", "analyst", "admin"), getRecords);

// GET /api/records/:id     — viewer, analyst, admin
router.get("/:id", allowRoles("viewer", "analyst", "admin"), getRecordById);

// POST /api/records        — admin only
router.post("/", allowRoles("admin"), createRecord);

// PUT /api/records/:id     — admin only
router.put("/:id", allowRoles("admin"), updateRecord);

// DELETE /api/records/:id  — admin only (soft delete)
router.delete("/:id", allowRoles("admin"), deleteRecord);

module.exports = router;
