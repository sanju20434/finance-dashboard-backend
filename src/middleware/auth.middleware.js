const jwt = require("jsonwebtoken");
const { get } = require("../utils/db");

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Authentication required. Provide a Bearer token.",
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token.",
      });
    }

    const user = get("SELECT id, name, email, role, status FROM users WHERE id = ?", [decoded.userId]);

    if (!user) {
      return res.status(401).json({ success: false, error: "User not found." });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        success: false,
        error: "Your account has been deactivated. Contact an admin.",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
