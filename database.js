import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function conectarDB() {

  const db = await open({
    filename: "./adminflow.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      email TEXT UNIQUE,
      senha TEXT,
      role TEXT
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      valor REAL,
      status TEXT
    )
  `);

  return db;
}
