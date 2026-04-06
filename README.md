## 👨‍💻 Author
Sandeep Kumar Saini
# Finance Dashboard — Backend API

Role-based finance management API: users (viewer / analyst / admin), financial records (income & expense), and dashboard aggregates. Built with **Express**, **SQLite (sql.js)**, **JWT**, **bcryptjs**, **Zod**.

## Roles

| Role     | Records                         | Dashboard                                      |
|----------|----------------------------------|------------------------------------------------|
| Viewer   | Read only                        | Summary + recent                               |
| Analyst  | Read only                        | + Category totals + trends                     |
| Admin    | Create / update / delete records | Full dashboard + user management               |

Public registration (`POST /api/auth/register`) always creates a **viewer**. Admins create other accounts and assign roles via `POST /api/users`.

## Setup

From the directory that contains `package.json`:

```bash
npm install
```

Create `.env` in this folder:

```env
PORT=3000
JWT_SECRET=your_long_random_secret
```

Optional: `DATABASE_URL=file:./data/finance.db` (default), `JWT_EXPIRES_IN=7d`.

```bash
npm run seed    # optional: demo users + sample records
npm run dev     # or npm start
```

Demo logins after seed (local dev only):

| User | Email | Password |
|------|-------|----------|
| Admin | admin@finance.com | `admin123` |
| Analyst | analyst@finance.com | `analyst123` |
| Viewer | viewer@finance.com | `viewer123` |

Use `SEED_ADMIN_PASSWORD`, `SEED_ANALYST_PASSWORD`, and `SEED_VIEWER_PASSWORD` in `.env` if you want custom seed passwords.

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Health check |
| POST | `/api/auth/register` | — | Register (viewer) |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/users` | Admin | Create user (any role) |
| GET | `/api/users` | Admin | List users |
| GET | `/api/users/:id` | Admin | Get user |
| PATCH | `/api/users/:id/role` | Admin | Set role |
| PATCH | `/api/users/:id/status` | Admin | active / inactive |
| GET | `/api/records` | JWT | List + filters (`type`, `category`, `start_date`, `end_date`) |
| GET | `/api/records/:id` | JWT | One record |
| POST | `/api/records` | Admin | Create |
| PUT | `/api/records/:id` | Admin | Update |
| DELETE | `/api/records/:id` | Admin | Soft delete |
| GET | `/api/dashboard/summary` | JWT | Totals + net balance |
| GET | `/api/dashboard/recent` | JWT | Recent transactions |
| GET | `/api/dashboard/by-category` | Analyst+ | Per-category totals |
| GET | `/api/dashboard/trends` | Analyst+ | `?period=monthly\|weekly&months=12` |

### Record body (JSON)

- `amount` (number, > 0)  
- `type`: `income` | `expense`  
- `category` (string)  
- `date` (ISO 8601)  
- `description` (optional)

## Tests

```bash
npm test
```

Uses a temporary SQLite file under `./data/test.db`.

## Postman without account

- Open Postman Desktop and choose **Skip Sign In**.
- Import `postman/FinanceDashboard.postman_collection.json`.
- Start backend with `npm run seed` and `npm run dev`.
- Run `Auth / Login (Admin)` first, then other requests.
- Detailed steps: `postman/HOW_TO_USE_WITHOUT_ACCOUNT.md`.
