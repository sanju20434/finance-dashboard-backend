const { get, all } = require("../utils/db");

function getSummary(req, res, next) {
  try {
    const income = get(
      "SELECT COALESCE(SUM(amount), 0) as total FROM records WHERE type = 'income' AND is_deleted = 0"
    );
    const expense = get(
      "SELECT COALESCE(SUM(amount), 0) as total FROM records WHERE type = 'expense' AND is_deleted = 0"
    );
    const totalRecords = get("SELECT COUNT(*) as count FROM records WHERE is_deleted = 0");

    const totalIncome = income.total || 0;
    const totalExpense = expense.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          total_income: totalIncome,
          total_expense: totalExpense,
          net_balance: totalIncome - totalExpense,
          total_records: totalRecords.count || 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

function getByCategory(req, res, next) {
  try {
    const { type } = req.query;

    let query = `
      SELECT
        category,
        type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM records
      WHERE is_deleted = 0
    `;
    const params = [];

    if (type) {
      query += " AND type = ?";
      params.push(type);
    }

    query += " GROUP BY category, type ORDER BY total DESC";

    const rows = all(query, params);

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category]) {
        grouped[row.category] = { category: row.category, income: null, expense: null };
      }
      grouped[row.category][row.type] = { count: row.count, total: row.total };
    }

    return res.status(200).json({
      success: true,
      data: { categories: Object.values(grouped) },
    });
  } catch (err) {
    next(err);
  }
}

function getTrends(req, res, next) {
  try {
    const { period = "monthly", months = 12 } = req.query;

    const dateFormat = period === "weekly" ? "%Y-W%W" : "%Y-%m";

    const rows = all(
      `SELECT
        strftime(?, date) as period,
        type,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM records
      WHERE is_deleted = 0
        AND date >= datetime('now', ?)
      GROUP BY period, type
      ORDER BY period ASC`,
      [dateFormat, `-${parseInt(months, 10)} months`]
    );

    const trendMap = {};
    for (const row of rows) {
      if (!trendMap[row.period]) {
        trendMap[row.period] = { period: row.period, income: 0, expense: 0, net: 0 };
      }
      trendMap[row.period][row.type] = row.total;
    }

    const trends = Object.values(trendMap).map((t) => ({
      ...t,
      net: t.income - t.expense,
    }));

    return res.status(200).json({
      success: true,
      data: { period, trends },
    });
  } catch (err) {
    next(err);
  }
}

function getRecentTransactions(req, res, next) {
  try {
    const { limit = 10 } = req.query;
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));

    const records = all(
      `SELECT r.id, r.amount, r.type, r.category, r.date, r.description, r.created_at,
              u.name as created_by_name
       FROM records r
       JOIN users u ON r.created_by = u.id
       WHERE r.is_deleted = 0
       ORDER BY r.date DESC, r.created_at DESC
       LIMIT ?`,
      [safeLimit]
    );

    return res.status(200).json({
      success: true,
      data: { records },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary, getByCategory, getTrends, getRecentTransactions };
