const express = require("express");
const router = express.Router();
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
} = require("../controllers/users.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");

router.use(authenticate, allowRoles("admin"));

router.post("/", createUser);
router.get("/", getAllUsers);

// GET /api/users/:id
router.get("/:id", getUserById);

// PATCH /api/users/:id/role
router.patch("/:id/role", updateUserRole);

// PATCH /api/users/:id/status
router.patch("/:id/status", updateUserStatus);

module.exports = router;
