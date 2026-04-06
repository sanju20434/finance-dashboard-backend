const { z } = require("zod");
const { get, all, run } = require("../utils/db");
const { generateId } = require("../utils/helpers");

const createRecordSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Amount must be positive"),
  type: z.enum(["income", "expense"], {
    errorMap: () => ({ message: "Type must be 'income' or 'expense'" }),
  }),
  category: z.string().min(1, "Category is required"),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), {
    message: "Invalid date format. Use ISO 8601 (e.g. 2024-01-15)",
  }),
  description: z.string().optional(),
});

const updateRecordSchema = createRecordSchema.partial();

function getRecords(req, res, next) {
  try {
    const {
      type,
      category,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort = "date",
      order = "desc",
    } = req.query;

    let query = `
      SELECT r.*, u.name as created_by_name, u.email as created_by_email
      FROM records r
      JOIN users u ON r.created_by = u.id
      WHERE r.is_deleted = 0
    `;
    const params = [];

    if (type) {
      query += " AND r.type = ?";
      params.push(type);
    }
    if (category) {
      query += " AND LOWER(r.category) = LOWER(?)";
      params.push(category);
    }
    if (start_date) {
      query += " AND r.date >= ?";
      params.push(start_date);
    }
    if (end_date) {
      query += " AND r.date <= ?";
      params.push(end_date + "T23:59:59");
    }

    // Whitelist sort columns to prevent SQL injection
    const allowedSort = ["date", "amount", "created_at", "category"];
    const sortCol = allowedSort.includes(sort) ? `r.${sort}` : "r.date";
    const sortOrder = order === "asc" ? "ASC" : "DESC";
    query += ` ORDER BY ${sortCol} ${sortOrder}`;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const records = all(query, params);

    // Get total count for pagination info
    let countQuery = "SELECT COUNT(*) as total FROM records r WHERE r.is_deleted = 0";
    const countParams = [];
    if (type) { countQuery += " AND r.type = ?"; countParams.push(type); }
    if (category) { countQuery += " AND LOWER(r.category) = LOWER(?)"; countParams.push(category); }
    if (start_date) { countQuery += " AND r.date >= ?"; countParams.push(start_date); }
    if (end_date) { countQuery += " AND r.date <= ?"; countParams.push(end_date + "T23:59:59"); }

    const countResult = get(countQuery, countParams);
    const total = countResult ? countResult.total : 0;

    return res.status(200).json({
      success: true,
      data: {
        records,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

function getRecordById(req, res, next) {
  try {
    const record = get(
      `SELECT r.*, u.name as created_by_name FROM records r
       JOIN users u ON r.created_by = u.id
       WHERE r.id = ? AND r.is_deleted = 0`,
      [req.params.id]
    );

    if (!record) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    return res.status(200).json({ success: true, data: { record } });
  } catch (err) {
    next(err);
  }
}

function createRecord(req, res, next) {
  try {
    const result = createRecordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { amount, type, category, date, description } = result.data;
    const id = generateId();

    run(
      `INSERT INTO records (id, amount, type, category, date, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, amount, type, category, new Date(date).toISOString(), description || null, req.user.id]
    );

    const record = get("SELECT * FROM records WHERE id = ?", [id]);

    return res.status(201).json({
      success: true,
      message: "Record created successfully.",
      data: { record },
    });
  } catch (err) {
    next(err);
  }
}

function updateRecord(req, res, next) {
  try {
    const result = updateRecordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
    }

    const { id } = req.params;
    const existing = get("SELECT * FROM records WHERE id = ? AND is_deleted = 0", [id]);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    const updates = result.data;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No fields provided to update." });
    }

    const fields = [];
    const params = [];

    if (updates.amount !== undefined) { fields.push("amount = ?"); params.push(updates.amount); }
    if (updates.type !== undefined) { fields.push("type = ?"); params.push(updates.type); }
    if (updates.category !== undefined) { fields.push("category = ?"); params.push(updates.category); }
    if (updates.date !== undefined) { fields.push("date = ?"); params.push(new Date(updates.date).toISOString()); }
    if (updates.description !== undefined) { fields.push("description = ?"); params.push(updates.description); }

    fields.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(id);

    run(`UPDATE records SET ${fields.join(", ")} WHERE id = ?`, params);

    const updated = get("SELECT * FROM records WHERE id = ?", [id]);

    return res.status(200).json({
      success: true,
      message: "Record updated successfully.",
      data: { record: updated },
    });
  } catch (err) {
    next(err);
  }
}

function deleteRecord(req, res, next) {
  try {
    const { id } = req.params;
    const record = get("SELECT id FROM records WHERE id = ? AND is_deleted = 0", [id]);

    if (!record) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    // Soft delete — preserve data integrity
    run(
      "UPDATE records SET is_deleted = 1, updated_at = ? WHERE id = ?",
      [new Date().toISOString(), id]
    );

    return res.status(200).json({
      success: true,
      message: "Record deleted successfully.",
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getRecords, getRecordById, createRecord, updateRecord, deleteRecord };
