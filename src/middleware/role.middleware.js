/**
 * Role-based access control middleware.
 * Usage: allowRoles("admin") or allowRoles("admin", "analyst")
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: "Not authenticated." });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${roles.join(", ")}. Your role: ${req.user.role}.`,
      });
    }

    next();
  };
}

module.exports = { allowRoles };
