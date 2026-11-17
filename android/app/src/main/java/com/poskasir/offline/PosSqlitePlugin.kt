package com.poskasir.offline

import android.database.sqlite.SQLiteDatabase
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.PluginMethod
import org.json.JSONArray
import org.json.JSONObject

/** Native SQLite persistence. The exact legacy JSON is retained as a migration/backup snapshot,
 * while frequently used business records are mirrored to indexed relational tables in a single
 * transaction. This lets older web backups remain byte-schema compatible.
 */
@CapacitorPlugin(name = "PosNativeStorage")
class PosSqlitePlugin : Plugin() {
    private fun openDb(): SQLiteDatabase {
        val file = context.getDatabasePath("pos-kasir-native.sqlite")
        file.parentFile?.mkdirs()
        return SQLiteDatabase.openOrCreateDatabase(file, null).apply {
            rawQuery("PRAGMA journal_mode=WAL", null).use { }
            rawQuery("PRAGMA synchronous=NORMAL", null).use { }
            execSQL("PRAGMA foreign_keys=ON")
            execSQL("PRAGMA busy_timeout=5000")
            execSQL("CREATE TABLE IF NOT EXISTS app_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, updated_at INTEGER NOT NULL)")
            execSQL("CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL, active INTEGER NOT NULL, payload TEXT NOT NULL)")
            execSQL("CREATE INDEX IF NOT EXISTS idx_products_name ON products(name COLLATE NOCASE)")
            execSQL("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, active)")
            execSQL("CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, business_date TEXT NOT NULL, shift TEXT, created_at INTEGER NOT NULL, total INTEGER NOT NULL, voided INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL)")
            execSQL("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(business_date, created_at DESC)")
            execSQL("CREATE INDEX IF NOT EXISTS idx_transactions_shift ON transactions(shift, business_date)")
            execSQL("CREATE TABLE IF NOT EXISTS shift_sessions (id TEXT PRIMARY KEY, business_date TEXT NOT NULL, shift TEXT NOT NULL, closed INTEGER NOT NULL, payload TEXT NOT NULL)")
            execSQL("CREATE INDEX IF NOT EXISTS idx_shift_date ON shift_sessions(business_date, shift, closed)")
            execSQL("CREATE TABLE IF NOT EXISTS pending_bills (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, payload TEXT NOT NULL)")
        }
    }

    @PluginMethod
    fun saveSnapshot(call: PluginCall) {
        val json = call.getString("json") ?: run { call.reject("Data kosong"); return }
        try {
            val root = JSONObject(json)
            val db = openDb()
            db.beginTransaction()
            try {
                db.execSQL("INSERT OR REPLACE INTO app_snapshot(id,json,updated_at) VALUES(1,?,?)", arrayOf(json, System.currentTimeMillis()))
                mirrorProducts(db, root.optJSONArray("products") ?: JSONArray())
                mirrorTransactions(db, root.optJSONArray("sales") ?: JSONArray())
                mirrorShifts(db, root.optJSONArray("shiftSessions") ?: JSONArray())
                mirrorPending(db, root.optJSONArray("pending") ?: JSONArray())
                db.setTransactionSuccessful()
            } finally { db.endTransaction(); db.close() }
            call.resolve(JSObject().put("saved", true))
        } catch (e: Exception) { call.reject("SQLite gagal menyimpan data: ${e.message}", e) }
    }

    private fun mirrorProducts(db: SQLiteDatabase, items: JSONArray) {
        db.delete("products", null, null)
        for (i in 0 until items.length()) {
            val p = items.optJSONObject(i) ?: continue
            db.execSQL("INSERT OR REPLACE INTO products(id,category,name,price,active,payload) VALUES(?,?,?,?,?,?)", arrayOf(
                p.optString("id", "p-$i"), p.optString("cat", "Lain-lain"), p.optString("name", ""),
                p.optLong("price"), if (p.optBoolean("active", true)) 1 else 0, p.toString()))
        }
    }

    private fun mirrorTransactions(db: SQLiteDatabase, items: JSONArray) {
        db.delete("transactions", null, null)
        for (i in 0 until items.length()) {
            val t = items.optJSONObject(i) ?: continue
            val date = t.optString("businessDate", t.optString("date", "")).take(10)
            val shift = t.optString("shift", "")
            val createdAt = try { java.time.Instant.parse(t.optString("date")).toEpochMilli() } catch (_: Exception) { t.optLong("date") }
            db.execSQL("INSERT OR REPLACE INTO transactions(id,business_date,shift,created_at,total,voided,payload) VALUES(?,?,?,?,?,?,?)", arrayOf(
                t.optString("id", "tx-$i"), date, shift, createdAt, t.optLong("total"), if (t.optBoolean("voided", false) || t.optString("status") == "void") 1 else 0, t.toString()))
        }
    }

    private fun mirrorShifts(db: SQLiteDatabase, items: JSONArray) {
        db.delete("shift_sessions", null, null)
        for (i in 0 until items.length()) {
            val s = items.optJSONObject(i) ?: continue
            db.execSQL("INSERT OR REPLACE INTO shift_sessions(id,business_date,shift,closed,payload) VALUES(?,?,?,?,?)", arrayOf(
                s.optString("id", "shift-$i"), s.optString("businessDate", ""), s.optString("shift", ""), if (s.optBoolean("closed", false)) 1 else 0, s.toString()))
        }
    }

    private fun mirrorPending(db: SQLiteDatabase, items: JSONArray) {
        db.delete("pending_bills", null, null)
        for (i in 0 until items.length()) {
            val p = items.optJSONObject(i) ?: continue
            db.execSQL("INSERT OR REPLACE INTO pending_bills(id,created_at,payload) VALUES(?,?,?)", arrayOf(
                p.optString("id", "pending-$i"), p.optLong("createdAt", p.optLong("date")), p.toString()))
        }
    }

    @PluginMethod
    fun loadSnapshot(call: PluginCall) {
        try {
            val db = openDb()
            val cursor = db.rawQuery("SELECT json,updated_at FROM app_snapshot WHERE id=1", null)
            val result = JSObject()
            if (cursor.moveToFirst()) result.put("json", cursor.getString(0)).put("updatedAt", cursor.getLong(1)).put("found", true)
            else result.put("found", false)
            cursor.close(); db.close()
            call.resolve(result)
        } catch (e: Exception) { call.reject("SQLite gagal membaca data: ${e.message}", e) }
    }

    @PluginMethod
    fun clearSnapshot(call: PluginCall) {
        try {
            val db = openDb()
            db.beginTransaction()
            try {
                listOf("app_snapshot", "products", "transactions", "shift_sessions", "pending_bills").forEach { db.delete(it, null, null) }
                db.setTransactionSuccessful()
            } finally { db.endTransaction(); db.close() }
            call.resolve(JSObject().put("cleared", true))
        } catch (e: Exception) { call.reject("SQLite gagal menghapus snapshot: ${e.message}", e) }
    }
}
