package com.poskasir.nativeapp.bluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat

private data class FoundPrinter(val name: String, val address: String, val rssi: Int)

@Composable
fun BluetoothScanPage(onBack: () -> Unit) {
    val context = LocalContext.current
    val found = remember { mutableStateListOf<FoundPrinter>() }
    val scanning = remember { mutableStateOf(false) }
    val message = remember { mutableStateOf("Tekan Pindai untuk mencari printer BLE.") }
    val adapter = remember {
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    }
    val scanner = remember(adapter) { adapter?.bluetoothLeScanner }
    val handler = remember { Handler(Looper.getMainLooper()) }

    fun requiredPermissions(): Array<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    fun hasPermissions(): Boolean = requiredPermissions().all {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    val scanCallback = remember {
        object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                val recordName = result.scanRecord?.deviceName
                val deviceName = try { device.name } catch (_: SecurityException) { null }
                val name = recordName?.takeIf { it.isNotBlank() }
                    ?: deviceName?.takeIf { it.isNotBlank() }
                    ?: "Perangkat tanpa nama"
                val item = FoundPrinter(name, device.address ?: "-", result.rssi)
                handler.post {
                    val index = found.indexOfFirst { it.address == item.address }
                    if (index >= 0) found[index] = item else found.add(item)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                handler.post {
                    scanning.value = false
                    message.value = "Pemindaian gagal (kode $errorCode). Coba aktifkan Bluetooth dan izin perangkat."
                }
            }
        }
    }

    fun stopScan() {
        try { scanner?.stopScan(scanCallback) } catch (_: SecurityException) { }
        scanning.value = false
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.all { it }) {
            found.clear()
            if (adapter?.isEnabled == true && scanner != null) {
                scanning.value = true
                message.value = "Sedang mencari perangkat BLE di sekitar..."
                try { scanner.startScan(scanCallback) }
                catch (e: SecurityException) {
                    scanning.value = false
                    message.value = "Izin Bluetooth belum diberikan: ${e.message}"
                }
            } else {
                message.value = "Bluetooth belum aktif atau perangkat tidak mendukung BLE."
            }
        } else {
            message.value = "Izin Bluetooth ditolak. Izinkan Bluetooth Nearby Devices agar printer dapat dicari."
        }
    }

    DisposableEffect(Unit) {
        onDispose { stopScan() }
    }

    Column(
        Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Bluetooth Printer", style = MaterialTheme.typography.headlineSmall)
        Text("Pindai perangkat BLE. Printer yang tidak menyiarkan nama tetap akan ditampilkan dengan alamat Bluetooth.")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                if (adapter == null) {
                    message.value = "Tablet/HP ini tidak memiliki Bluetooth."
                } else if (!adapter.isEnabled) {
                    message.value = "Aktifkan Bluetooth dari pengaturan Android, lalu pindai kembali."
                } else if (!hasPermissions()) {
                    permissionLauncher.launch(requiredPermissions())
                } else if (scanner == null) {
                    message.value = "Bluetooth LE scanner tidak tersedia di perangkat ini."
                } else {
                    found.clear()
                    scanning.value = true
                    message.value = "Sedang mencari perangkat BLE di sekitar..."
                    try { scanner.startScan(scanCallback) }
                    catch (e: SecurityException) {
                        scanning.value = false
                        message.value = "Tidak dapat memulai pemindaian: ${e.message}"
                    }
                }
            }) { Text("Pindai") }
            OutlinedButton(onClick = { stopScan(); message.value = "Pemindaian dihentikan." }) {
                Text("Berhenti")
            }
            OutlinedButton(onClick = { stopScan(); onBack() }) { Text("Kembali") }
        }
        Text(if (scanning.value) "Status: Memindai..." else "Status: Tidak memindai",
            style = MaterialTheme.typography.labelLarge)
        Text(message.value, style = MaterialTheme.typography.bodySmall)
        Text("Perangkat ditemukan: ${found.size}", style = MaterialTheme.typography.titleMedium)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(found, key = { it.address }) { item ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(item.name, style = MaterialTheme.typography.titleMedium)
                        Text("Alamat: ${item.address}")
                        Text("Sinyal: ${item.rssi} dBm", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}
