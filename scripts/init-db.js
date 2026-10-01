// Creates the tables in whatever database the DB_* variables point at.
// Run with:  npm run db:init
import "dotenv/config";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { dbConfig } from "../db.js";

let sql = await readFile(new URL("../schema.sql", import.meta.url), "utf8");

// A hosted database already exists and has its own name, so skip the
// CREATE DATABASE / USE lines that are only useful on your own computer.
sql = sql.replace(/CREATE DATABASE[^;]*;/i, "").replace(/^\s*USE\s+\w+\s*;/im, "");

const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true });
try {
  await conn.query(sql);
  const [rows] = await conn.query("SHOW TABLES");
  console.log("Tables ready:", rows.map((r) => Object.values(r)[0]).join(", "));
} finally {
  await conn.end();
}