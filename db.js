import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";

// Hosted databases (Aiven, etc.) only accept encrypted connections and sign
// their certificate with their own authority. Set:
//   DB_SSL=true
//   DB_SSL_CA_FILE=certs/aiven-ca.pem   (the CA certificate you download)
// The CA certificate is public information, so it is safe to commit.
function sslConfig() {
  if (process.env.DB_SSL !== "true") return undefined;
  const ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  if (process.env.DB_SSL_CA_FILE) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA_FILE, "utf8");
  } else if (process.env.DB_SSL_CA) {
    ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, "\n"); // PEM text pasted as one line
  }
  return ssl;
}

export const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4",
  ssl: sslConfig(),
};

// One shared pool of database connections for the whole app.
export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 5, // free databases allow few connections
});
