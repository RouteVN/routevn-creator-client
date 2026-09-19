// Test-only native driver boundary. All SQL, migrations, encoding and replay
// still run in the selected client's production modules and Insieme dependency.
import { DatabaseSync } from "node:sqlite";

export default {
  async load(uri) {
    const db = new DatabaseSync(uri.replace(/^sqlite:/, ""));
    const statement = (sql, args) => {
      args = args.map((value) =>
        value?.__routevn_sql_type === "bytes"
          ? Uint8Array.from(value.data)
          : value,
      );
      const query = db.prepare(sql);
      const bindings = /\$\d+/.test(sql)
        ? [
            Object.fromEntries(
              args.map((value, index) => [`$${index + 1}`, value]),
            ),
          ]
        : args;
      return { query, bindings };
    };
    return {
      async select(sql, args = []) {
        const { query, bindings } = statement(sql, args);
        return query.all(...bindings);
      },
      async execute(sql, args = []) {
        const { query, bindings } = statement(sql, args);
        const result = query.run(...bindings);
        return {
          rowsAffected: Number(result.changes),
          lastInsertId: Number(result.lastInsertRowid),
        };
      },
      async close() {
        db.close();
      },
    };
  },
};
