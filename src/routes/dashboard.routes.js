const express = require("express");
const router = express.Router();
const {
  getSummary,
  getByCategory,
  getTrends,
  getRecentTransactions,
} = require("../controllers/dashboard.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");

router.use(authenticate);

router.get("/summary", allowRoles("viewer", "analyst", "admin"), getSummary);
router.get("/recent", allowRoles("viewer", "analyst", "admin"), getRecentTransactions);
router.get("/by-category", allowRoles("analyst", "admin"), getByCategory);
router.get("/trends", allowRoles("analyst", "admin"), getTrends);

module.exports = router;
