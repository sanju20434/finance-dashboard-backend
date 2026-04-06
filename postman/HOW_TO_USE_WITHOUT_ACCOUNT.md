# Postman Without Account (Rasta 1)

1. Start API:
   - `npm run seed`
   - `npm run dev`
2. Open Postman Desktop.
3. Click **Skip Sign In** (or lightweight API client mode).
4. Import `postman/FinanceDashboard.postman_collection.json`.
5. Run requests in this order:
   - `Health`
   - `Auth / Login (Admin)` (saves `adminToken`)
   - Any protected request (records/dashboard/users)

## Notes

- If login fails, reseed database once:
  - delete `data/finance.db`
  - run `npm run seed` again
- Collection already has local base URL: `http://localhost:3000`.
- Demo admin credentials are included in collection variables.
