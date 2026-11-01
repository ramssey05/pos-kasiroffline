package com.poskasir.nativeapp.data

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val price: Long,
    val category: String = "Umum",
    val imageBase64: String? = null,
    val active: Boolean = true
)

@Entity(tableName = "shift_sessions", indices = [Index(value = ["businessDate", "shiftNumber", "closed"])])
data class ShiftSessionEntity(
    @PrimaryKey val sessionId: String,
    val businessDate: String,
    val cashierName: String,
    val shiftNumber: Int,
    val startedAt: Long,
    val closedAt: Long? = null,
    val closed: Boolean = false
)

@Entity(tableName = "transactions", indices = [Index("businessDate"), Index("sessionId"), Index("status")])
data class TransactionEntity(
    @PrimaryKey val transactionId: String,
    val businessDate: String,
    val sessionId: String,
    val tableNumber: String,
    val cashierName: String,
    val shiftNumber: Int,
    val createdAt: Long,
    val itemsJson: String,
    val subtotal: Long,
    val discount: Long,
    val discountType: String,
    val taxPercent: Double,
    val taxAmount: Long,
    val total: Long,
    val paymentMethod: String,
    val cashReceived: Long = 0,
    val changeAmount: Long = 0,
    val status: String = "COMPLETED",
    val voidReason: String? = null,
    val voidedAt: Long? = null
)

@Entity(tableName = "pending_orders")
data class PendingOrderEntity(
    @PrimaryKey val pendingId: String,
    val createdAt: Long,
    val cashierName: String,
    val shiftNumber: Int,
    val tableNumber: String,
    val itemsJson: String,
    val discount: Long,
    val discountType: String
)

@Entity(tableName = "business_settings")
data class BusinessSettingsEntity(
    @PrimaryKey val id: Int = 1,
    val businessName: String = "POS Kasir",
    val address: String = "",
    val taxPercent: Double = 0.0,
    val qrisImageBase64: String? = null,
    val logoBase64: String? = null,
    val printerName: String? = null,
    val printerAddress: String? = null
)

@Dao
interface PosDao {
    @Query("SELECT * FROM products WHERE active = 1 ORDER BY category, name")
    fun observeProducts(): Flow<List<ProductEntity>>

    @Query("SELECT COUNT(*) FROM products")
    suspend fun productCount(): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(items: List<ProductEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProduct(item: ProductEntity)

    @Query("UPDATE products SET active = 0 WHERE id = :id")
    suspend fun archiveProduct(id: Long)

    @Query("SELECT * FROM shift_sessions ORDER BY startedAt DESC")
    fun observeSessions(): Flow<List<ShiftSessionEntity>>

    @Query("SELECT * FROM shift_sessions WHERE sessionId = :id LIMIT 1")
    suspend fun getSession(id: String): ShiftSessionEntity?

    @Query("SELECT * FROM shift_sessions WHERE businessDate = :date AND shiftNumber = :shift AND closed = 0 LIMIT 1")
    suspend fun getActiveSession(date: String, shift: Int): ShiftSessionEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSession(item: ShiftSessionEntity)

    @Query("UPDATE shift_sessions SET closed = 1, closedAt = :closedAt WHERE sessionId = :id AND closed = 0")
    suspend fun closeSession(id: String, closedAt: Long): Int

    @Query("SELECT * FROM transactions ORDER BY createdAt DESC")
    fun observeTransactions(): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions WHERE businessDate BETWEEN :from AND :to AND (:shift = 0 OR shiftNumber = :shift) ORDER BY createdAt DESC")
    fun observeTransactions(from: String, to: String, shift: Int): Flow<List<TransactionEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTransaction(item: TransactionEntity)

    @Query("UPDATE transactions SET status = 'VOID', voidReason = :reason, voidedAt = :at WHERE transactionId = :id AND status = 'COMPLETED'")
    suspend fun voidTransaction(id: String, reason: String, at: Long): Int

    @Query("SELECT COALESCE(SUM(total),0) FROM transactions WHERE status = 'COMPLETED'")
    fun observeGrossSales(): Flow<Long>

    @Query("SELECT * FROM pending_orders ORDER BY createdAt DESC")
    fun observePending(): Flow<List<PendingOrderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun savePending(item: PendingOrderEntity)

    @Query("DELETE FROM pending_orders WHERE pendingId = :id")
    suspend fun deletePending(id: String)

    @Query("SELECT * FROM business_settings WHERE id = 1 LIMIT 1")
    fun observeSettings(): Flow<BusinessSettingsEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSettings(item: BusinessSettingsEntity)

    @Query("DELETE FROM products")
    suspend fun deleteAllProducts()

    @Query("DELETE FROM transactions")
    suspend fun deleteAllTransactions()

    @Query("DELETE FROM shift_sessions")
    suspend fun deleteAllSessions()

    @Query("DELETE FROM pending_orders")
    suspend fun deleteAllPending()
}

@Database(
    entities = [ProductEntity::class, ShiftSessionEntity::class, TransactionEntity::class, PendingOrderEntity::class, BusinessSettingsEntity::class],
    version = 2,
    exportSchema = false
)
abstract class PosDatabase : RoomDatabase() {
    abstract fun posDao(): PosDao

    companion object {
        @Volatile private var INSTANCE: PosDatabase? = null
        fun get(context: Context): PosDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(context.applicationContext, PosDatabase::class.java, "pos-kasir.db")
                .fallbackToDestructiveMigration()
                .build().also { INSTANCE = it }
        }
    }
}
