const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { get, all, run } = require("../utils/db");
const { generateId } = require("../utils/helpers");

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["viewer", "analyst", "admin"], {
    errorMap: () => ({ message: "Role must be viewer, analyst, or admin" }),
  }),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

const updateRoleSchema = z.object({
  role: z.enum(["viewer", "analyst", "admin"], {
    errorMap: () => ({ message: "Role must be one of: viewer, analyst, admin" }),
  }),
});

const updateStatusSchema = z.object({
  status: z.enum(["active", "inactive"], {
    errorMap: () => ({ message: "Status must be one of: active, inactive" }),
  }),
});

async function createUser(req, res, next) {
  try {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, role, status } = result.data;

    const existing = get("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "A user with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const id = generateId();

    run(
      "INSERT INTO users (id, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?)",
      [id, name, email, hashedPassword, role, status]
    );

    const user = get(
      "SELECT id, name, email, role, status, created_at FROM users WHERE id = ?",
      [id]
    );

    return res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

function getAllUsers(req, res, next) {
  try {
    const { role, status, page = 1, limit = 20 } = req.query;

    let query = "SELECT id, name, email, role, status, created_at FROM users WHERE 1=1";
    const params = [];

    if (role) {
      query += " AND role = ?";
      params.push(role);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const users = all(query, params);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: { page: parseInt(page), limit: parseInt(limit) },
      },
    });
  } catch (err) {
    next(err);
  }
}

function getUserById(req, res, next) {
  try {
    const user = get(
      "SELECT id, name, email, role, status, created_at FROM users WHERE id = ?",
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

function updateUserRole(req, res, next) {
  try {
    const result = updateRoleSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { id } = req.params;
    const { role } = result.data;

    // Prevent admin from demoting themselves
    if (id === req.user.id && role !== "admin") {
      return res.status(400).json({
        success: false,
        error: "You cannot change your own role.",
      });
    }

    const user = get("SELECT id FROM users WHERE id = ?", [id]);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    run("UPDATE users SET role = ? WHERE id = ?", [role, id]);

    const updated = get(
      "SELECT id, name, email, role, status FROM users WHERE id = ?",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: `User role updated to '${role}'.`,
      data: { user: updated },
    });
  } catch (err) {
    next(err);
  }
}

function updateUserStatus(req, res, next) {
  try {
    const result = updateStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { id } = req.params;
    const { status } = result.data;

    // Prevent admin from deactivating themselves
    if (id === req.user.id && status === "inactive") {
      return res.status(400).json({
        success: false,
        error: "You cannot deactivate your own account.",
      });
    }

    const user = get("SELECT id FROM users WHERE id = ?", [id]);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    run("UPDATE users SET status = ? WHERE id = ?", [status, id]);

    const updated = get(
      "SELECT id, name, email, role, status FROM users WHERE id = ?",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: `User status updated to '${status}'.`,
      data: { user: updated },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createUser, getAllUsers, getUserById, updateUserRole, updateUserStatus };
