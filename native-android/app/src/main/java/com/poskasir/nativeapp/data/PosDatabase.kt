package com.poskasir.nativeapp.data

import android.content.Context
import androidx.room.Database
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Insert
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val price: Long,
    val category: String = "",
    val active: Boolean = true
)

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey val transactionId: String,
    val tableNumber: String,
    val cashierName: String,
    val shiftNumber: Int,
    val createdAt: Long,
    val total: Long,
    val paymentMethod: String,
    val status: String = "COMPLETED"
)

@Dao
interface PosDao {
    @Query("SELECT * FROM products WHERE active = 1 ORDER BY name")
    fun observeProducts(): Flow<List<ProductEntity>>

    @Insert
    suspend fun insertProducts(items: List<ProductEntity>)

    @Query("SELECT * FROM transactions ORDER BY createdAt DESC")
    fun observeTransactions(): Flow<List<TransactionEntity>>

    @Insert
    suspend fun insertTransaction(item: TransactionEntity)
}

@Database(entities = [ProductEntity::class, TransactionEntity::class], version = 1, exportSchema = false)
abstract class PosDatabase : RoomDatabase() {
    abstract fun posDao(): PosDao
    companion object {
        @Volatile private var INSTANCE: PosDatabase? = null
        fun get(context: Context): PosDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(context.applicationContext, PosDatabase::class.java, "pos-kasir.db").build().also { INSTANCE = it }
        }
    }
}
