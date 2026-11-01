package com.poskasir.nativeapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.poskasir.nativeapp.data.PosDatabase
import com.poskasir.nativeapp.data.ProductEntity
import com.poskasir.nativeapp.data.TransactionEntity
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PosKasirApp() }
    }
}

private val money = NumberFormat.getCurrencyInstance(Locale("id", "ID")).apply { maximumFractionDigits = 0 }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosKasirApp() {
    var selected by remember { mutableStateOf("Kasir") }
    val menus = listOf("Kasir", "Transaksi", "Laporan", "Pengaturan")
    MaterialTheme {
        Scaffold(
            topBar = { TopAppBar(title = { Text("POS Kasir") }, actions = { Text("OFFLINE", modifier = Modifier.padding(end = 16.dp), style = MaterialTheme.typography.labelMedium) }) },
            bottomBar = {
                NavigationBar {
                    menus.forEach { item ->
                        NavigationBarItem(selected = selected == item, onClick = { selected = item },
                            icon = { Icon(when(item) {
                                "Kasir" -> Icons.Default.PointOfSale
                                "Transaksi" -> Icons.Default.ReceiptLong
                                "Laporan" -> Icons.Default.Assessment
                                else -> Icons.Default.Settings
                            }, contentDescription = item) }, label = { Text(item) })
                    }
                }
            }
        ) { padding ->
            when(selected) {
                "Kasir" -> KasirHome(Modifier.padding(padding))
                "Transaksi" -> TransactionPage(Modifier.padding(padding))
                "Laporan" -> ReportPage(Modifier.padding(padding))
                else -> SettingsPage(Modifier.padding(padding))
            }
        }
    }
}

@Composable
private fun KasirHome(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val dao = remember { PosDatabase.get(context).posDao() }
    val scope = rememberCoroutineScope()
    val products by dao.observeProducts().collectAsStateWithLifecycle(initialValue = emptyList())
    val cart = remember { mutableStateMapOf<Long, Pair<ProductEntity, Int>>() }
    var table by remember { mutableStateOf("") }
    var cashier by remember { mutableStateOf("") }
    var shift by remember { mutableIntStateOf(1) }
    var payment by remember { mutableStateOf("Tunai") }
    var query by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    val total = cart.values.sumOf { it.first.price * it.second }

    LaunchedEffect(Unit) {
        if (dao.productCount() == 0) dao.insertProducts(listOf(
            ProductEntity(name="Kopi Susu", price=18000, category="Minuman"),
            ProductEntity(name="Americano", price=15000, category="Minuman"),
            ProductEntity(name="Es Teh", price=8000, category="Minuman"),
            ProductEntity(name="Roti Bakar", price=16000, category="Makanan"),
            ProductEntity(name="Mie Goreng", price=20000, category="Makanan")
        ))
    }

    Column(modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Kasir", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value=table, onValueChange={table=it}, label={Text("Meja *")}, modifier=Modifier.weight(1f), singleLine=true)
            OutlinedTextField(value=cashier, onValueChange={cashier=it}, label={Text("Kasir")}, modifier=Modifier.weight(1f), singleLine=true)
        }
        Row(verticalAlignment=Alignment.CenterVertically, horizontalArrangement=Arrangement.spacedBy(8.dp)) {
            Text("Shift")
            (1..3).forEach { n -> FilterChip(selected=shift==n,onClick={shift=n},label={Text("$n")}) }
            Spacer(Modifier.weight(1f))
            Text("Bayar")
            DropdownPayment(payment) { payment=it }
        }
        OutlinedTextField(value=query,onValueChange={query=it},label={Text("Cari menu")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Text("Daftar menu", style=MaterialTheme.typography.titleMedium)
        LazyColumn(Modifier.weight(1f), verticalArrangement=Arrangement.spacedBy(6.dp)) {
            items(products.filter { it.name.contains(query, true) || it.category.contains(query,true) }, key={it.id}) { product ->
                ElevatedCard(onClick={
                    val old=cart[product.id]?.second ?: 0
                    cart[product.id]=product to old+1
                }, modifier=Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(12.dp),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                        Column { Text(product.name); Text(money.format(product.price),style=MaterialTheme.typography.bodySmall) }
                        Icon(Icons.Default.Add,contentDescription="Tambah")
                    }
                }
            }
        }
        if(cart.isNotEmpty()) {
            Text("Item: "+cart.values.sumOf { it.second }+"  •  Total: "+money.format(total),style=MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick={cart.clear()},modifier=Modifier.weight(1f)){Text("Kosongkan")}
                Button(onClick={
                    if(table.isBlank()) message="Nomor meja wajib diisi."
                    else if(cashier.isBlank()) message="Nama kasir wajib diisi."
                    else scope.launch {
                        dao.insertTransaction(TransactionEntity(
                            transactionId=UUID.randomUUID().toString(),tableNumber=table.trim(),
                            cashierName=cashier.trim(),shiftNumber=shift,createdAt=System.currentTimeMillis(),
                            total=total,paymentMethod=payment
                        ))
                        cart.clear(); table=""; message="Transaksi tersimpan."
                    }
                },modifier=Modifier.weight(1f)){Text("Simpan Transaksi")}
            }
        }
        if(message.isNotBlank()) Text(message,color=MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun DropdownPayment(value: String, onChange: (String)->Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick={expanded=true}) { Text(value) }
        DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}) {
            listOf("Tunai","QRIS","Transfer","Debit").forEach { item ->
                DropdownMenuItem(text={Text(item)},onClick={onChange(item).also { expanded=false }})
            }
        }
    }
}

@Composable
private fun TransactionPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val dao = remember(context) { PosDatabase.get(context).posDao() }
    val rows by dao.observeTransactions().collectAsStateWithLifecycle(initialValue=emptyList())
    Column(modifier.fillMaxSize().padding(16.dp)) {
        Text("Riwayat Transaksi",style=MaterialTheme.typography.headlineSmall)
        if(rows.isEmpty()) Text("Belum ada transaksi.")
        LazyColumn { items(rows,key={it.transactionId}) { row ->
            ListItem(
                headlineContent={Text("${row.tableNumber} • ${money.format(row.total)}")},
                supportingContent={Text("${row.cashierName} • Shift ${row.shiftNumber} • ${row.paymentMethod}")}
            )
            HorizontalDivider()
        } }
    }
}

@Composable
private fun ReportPage(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val dao = remember(context) { PosDatabase.get(context).posDao() }
    val gross by dao.observeGrossSales().collectAsStateWithLifecycle(initialValue=0L)
    Column(modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("Laporan",style=MaterialTheme.typography.headlineSmall)
        Text("Total penjualan tersimpan",style=MaterialTheme.typography.titleMedium)
        Text(money.format(gross),style=MaterialTheme.typography.headlineMedium)
        Text("Ringkasan awal. Filter tanggal, laporan per shift, void dan ekspor Excel akan ditambahkan pada tahap berikutnya.",style=MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun SettingsPage(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text("Pengaturan",style=MaterialTheme.typography.headlineSmall)
        listOf("Kelola menu dan harga","Upload menu Excel","Informasi usaha dan alamat","Pengaturan PPN","Pengaturan QRIS","Backup data","Restore data","Hapus semua data","Bluetooth printer").forEach {
            OutlinedButton(onClick={},modifier=Modifier.fillMaxWidth()) { Text(it) }
        }
        Text("Fitur pengaturan sedang dibangun bertahap dan belum aktif.",style=MaterialTheme.typography.bodySmall)
    }
}
