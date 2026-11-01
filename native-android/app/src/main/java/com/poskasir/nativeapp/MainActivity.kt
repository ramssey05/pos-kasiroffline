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
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { PosKasirApp() }
    }
}

private val menus = listOf("Kasir", "Transaksi", "Laporan", "Pengaturan")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PosKasirApp() {
    var selected by remember { mutableStateOf("Kasir") }
    MaterialTheme {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("POS Kasir") },
                    actions = { Text("OFFLINE", modifier = Modifier.padding(end = 16.dp), style = MaterialTheme.typography.labelMedium) }
                )
            },
            bottomBar = {
                NavigationBar {
                    menus.forEach { item ->
                        NavigationBarItem(
                            selected = selected == item,
                            onClick = { selected = item },
                            icon = {
                                Icon(
                                    when(item) {
                                        "Kasir" -> Icons.Default.PointOfSale
                                        "Transaksi" -> Icons.Default.ReceiptLong
                                        "Laporan" -> Icons.Default.Assessment
                                        else -> Icons.Default.Settings
                                    }, contentDescription = item
                                )
                            },
                            label = { Text(item) }
                        )
                    }
                }
            }
        ) { padding ->
            when(selected) {
                "Kasir" -> KasirHome(Modifier.padding(padding))
                "Transaksi" -> SimplePage("Transaksi", "Riwayat transaksi akan ditampilkan di sini.")
                "Laporan" -> SimplePage("Laporan", "Laporan harian dan tutup shift.")
                else -> SimplePage("Pengaturan", "Menu, pajak, QRIS, Excel, backup dan restore.")
            }
        }
    }
}

@Composable
private fun KasirHome(modifier: Modifier = Modifier) {
    var table by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    val sample = listOf("Kopi Susu", "Americano", "Es Teh", "Roti Bakar", "Mie Goreng")
    Column(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Kasir", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(value=table, onValueChange={table=it}, label={Text("Nomor meja (wajib)")}, modifier=Modifier.fillMaxWidth())
        OutlinedTextField(value=search, onValueChange={search=it}, label={Text("Cari menu")}, modifier=Modifier.fillMaxWidth())
        Text("Daftar menu", style = MaterialTheme.typography.titleMedium)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(sample.filter { it.contains(search, ignoreCase = true) }) { name ->
                ElevatedCard(Modifier.fillMaxWidth(), onClick = {}) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement=Arrangement.SpaceBetween, verticalAlignment=Alignment.CenterVertically) {
                        Text(name)
                        Icon(Icons.Default.Add, contentDescription="Tambah")
                    }
                }
            }
        }
    }
}

@Composable
private fun SimplePage(title: String, detail: String) {
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(title, style=MaterialTheme.typography.headlineSmall)
        Text(detail, style=MaterialTheme.typography.bodyMedium)
    }
}
