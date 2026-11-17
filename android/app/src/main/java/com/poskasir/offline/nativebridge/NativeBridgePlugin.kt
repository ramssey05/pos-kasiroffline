package com.poskasir.offline.nativebridge

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.provider.Settings
import com.getcapacitor.annotation.ActivityCallback
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.util.Base64
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(
    name = "PosNative",
    permissions = [
        Permission(alias = "bluetoothScan", strings = [Manifest.permission.BLUETOOTH_SCAN]),
        Permission(alias = "bluetoothConnect", strings = [Manifest.permission.BLUETOOTH_CONNECT])
    ]
)
class NativeBridgePlugin : Plugin() {
    private val io = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private var socket: BluetoothSocket? = null
    private var printer: BluetoothDevice? = null
    private val sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var pickerCall: PluginCall? = null
    private var saveCall: PluginCall? = null
    private var requestedName = "export.bin"
    private var receiverRegistered = false
    private val btStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> {
                    val state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR)
                    if (state == BluetoothAdapter.STATE_TURNING_OFF || state == BluetoothAdapter.STATE_OFF) {
                        closeSocket()
                        notifyListeners("printerState", JSObject().put("connected", false).put("reason", "bluetooth_off"))
                    }
                }
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                    val device = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    if (device?.address == printer?.address) {
                        closeSocket()
                        notifyListeners("printerState", JSObject().put("connected", false).put("reason", "device_disconnected"))
                    }
                }
            }
        }
    }

    @PluginMethod
    fun saveFile(call: PluginCall) {
        requestedName = safeFilename(call.getString("filename") ?: "export.bin")
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = call.getString("mimeType") ?: "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, requestedName)
        }
        startActivityForResult(call, intent, "handleCreateDocument")
    }

    @PluginMethod
    fun pickText(call: PluginCall) {
        val mimeTypes = call.getArray("mimeTypes")
        val types = if (mimeTypes != null && mimeTypes.length() > 0) Array(mimeTypes.length()) { i -> mimeTypes.getString(i) } else arrayOf("*/*")
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (types.size == 1) types[0] else "*/*"
            if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types)
        }
        startActivityForResult(call, intent, "handleOpenDocument")
    }

    @ActivityCallback
    private fun handleOpenDocument(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true)); return
        }
        io.execute {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw IllegalStateException("File tidak dapat dibaca")
                val displayName = queryDisplayName(uri) ?: "imported-file"
                call.resolve(JSObject().put("cancelled", false)
                    .put("text", String(bytes, Charsets.UTF_8))
                    .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    .put("name", displayName)
                    .put("mimeType", context.contentResolver.getType(uri) ?: "application/octet-stream"))
            } catch (e: Exception) { call.reject("Gagal membaca file: ${e.message}", e) }
        }
    }

    @ActivityCallback
    private fun handleCreateDocument(call: PluginCall, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true)); return
        }
        io.execute {
            try {
                val data = call.getString("data") ?: ""
                val encoding = call.getString("encoding") ?: "base64"
                val bytes = if (encoding == "text") data.toByteArray(Charsets.UTF_8) else Base64.decode(data, Base64.DEFAULT)
                context.contentResolver.openOutputStream(uri, "wt")?.use { out -> writeChunked(out, bytes) }
                    ?: throw IllegalStateException("Tidak dapat membuka file tujuan")
                call.resolve(JSObject().put("cancelled", false).put("uri", uri.toString()).put("name", requestedName))
            } catch (e: Exception) { call.reject("Gagal menyimpan file: ${e.message}", e) }
        }
    }

    @PluginMethod
    fun connectPrinter(call: PluginCall) {
        val address = call.getString("address")?.trim()
        if (address.isNullOrBlank()) { call.reject("Alamat printer wajib diisi"); return }
        withBluetoothPermission(call) { io.execute {
            if (!busy.compareAndSet(false, true)) { call.reject("Proses Bluetooth sedang berjalan"); return@execute }
            try {
                closeSocket()
                val adapter = bluetoothAdapter() ?: throw IllegalStateException("Bluetooth tidak tersedia")
                if (!adapter.isEnabled) throw IllegalStateException("Aktifkan Bluetooth Android terlebih dahulu")
                val device = adapter.getRemoteDevice(address)
                adapter.cancelDiscovery()
                val newSocket = device.createRfcommSocketToServiceRecord(sppUuid)
                try {
                    newSocket.connect()
                } catch (first: Exception) {
                    try { newSocket.close() } catch (_: Exception) { }
                    // Some thermal printers advertise RFCOMM but do not expose the standard UUID.
                    // Fallback channel 1 is used only for a paired printer explicitly selected by the user.
                    val fallback = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                        .invoke(device, 1) as BluetoothSocket
                    fallback.connect()
                    socket = fallback
                    printer = device
                    val fallbackName = try { device.name ?: "Printer SPP" } catch (_: SecurityException) { "Printer SPP" }
                    call.resolve(JSObject().put("connected", true).put("address", address).put("name", fallbackName).put("fallbackChannel", true))
                    notifyListeners("printerState", JSObject().put("connected", true).put("address", address).put("name", fallbackName))
                    return@execute
                }
                socket = newSocket
                printer = device
                val name = try { device.name ?: "Printer SPP" } catch (_: SecurityException) { "Printer SPP" }
                call.resolve(JSObject().put("connected", true).put("address", address).put("name", name))
                notifyListeners("printerState", JSObject().put("connected", true).put("address", address).put("name", name))
            } catch (e: Exception) {
                closeSocket(); call.reject("Koneksi printer SPP gagal: ${e.message}", e)
            } finally { busy.set(false) }
        } }
    }

    @PluginMethod
    fun listPairedPrinters(call: PluginCall) {
        withBluetoothPermission(call) { io.execute {
            try {
                val adapter = bluetoothAdapter() ?: throw IllegalStateException("Bluetooth tidak tersedia")
                val result = JSArray()
                adapter.bondedDevices.orEmpty().forEach { d ->
                    val name = try { d.name ?: "Perangkat Bluetooth" } catch (_: SecurityException) { "Perangkat Bluetooth" }
                    result.put(JSObject().put("name", name).put("address", d.address).put("bonded", true))
                }
                call.resolve(JSObject().put("devices", result).put("enabled", adapter.isEnabled))
            } catch (e: Exception) { call.reject("Gagal membaca perangkat terpasang: ${e.message}", e) }
        } }
    }

    @PluginMethod
    fun disconnectPrinter(call: PluginCall) {
        io.execute { closeSocket(); call.resolve(JSObject().put("connected", false)); notifyListeners("printerState", JSObject().put("connected", false)) }
    }

    @PluginMethod
    fun printerStatus(call: PluginCall) {
        val active = socket?.isConnected == true
        val address = try { printer?.address ?: "" } catch (_: SecurityException) { "" }
        val name = try { printer?.name ?: "" } catch (_: SecurityException) { "" }
        call.resolve(JSObject().put("connected", active).put("address", address).put("name", name))
    }

    @PluginMethod
    fun printBytes(call: PluginCall) {
        val base64 = call.getString("base64")
        if (base64.isNullOrBlank()) { call.reject("Data cetak kosong"); return }
        io.execute {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val out = socket?.takeIf { it.isConnected }?.outputStream ?: throw IllegalStateException("Printer belum tersambung")
                synchronized(out) { writeChunked(out, bytes) }
                call.resolve(JSObject().put("success", true).put("bytes", bytes.size))
            } catch (e: Exception) {
                closeSocket(); notifyListeners("printerState", JSObject().put("connected", false))
                call.reject("Cetak gagal: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun openBluetoothSettings(call: PluginCall) {
        try {
            context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            call.resolve(JSObject().put("opened", true))
        } catch (e: Exception) { call.reject("Tidak dapat membuka pengaturan Bluetooth: ${e.message}", e) }
    }

    override fun load() {
        super.load()
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
        }
        if (!receiverRegistered) {
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(btStateReceiver, filter, android.content.Context.RECEIVER_NOT_EXPORTED)
            else @Suppress("DEPRECATION") context.registerReceiver(btStateReceiver, filter)
            receiverRegistered = true
        }
    }

    private fun writeChunked(out: OutputStream, bytes: ByteArray) {
        var offset = 0
        while (offset < bytes.size) {
            val count = minOf(256, bytes.size - offset)
            out.write(bytes, offset, count); out.flush(); offset += count
            if (offset < bytes.size) Thread.sleep(12)
        }
    }
    private fun closeSocket() { try { socket?.close() } catch (_: Exception) {}; socket = null; printer = null }
    private fun bluetoothAdapter() = (context.getSystemService(android.content.Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    private fun withBluetoothPermission(call: PluginCall, action: () -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT) || !hasPermission(Manifest.permission.BLUETOOTH_SCAN))) {
            requestAllPermissions(call, "bluetoothPermissionsResult")
        } else action()
    }
    @PermissionCallback
    private fun bluetoothPermissionsResult(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && (!hasPermission(Manifest.permission.BLUETOOTH_CONNECT) || !hasPermission(Manifest.permission.BLUETOOTH_SCAN))) {
            call.reject("Izin Bluetooth ditolak. Aktifkan Nearby Devices di pengaturan Android.")
        } else when (call.methodName) {
            "connectPrinter" -> connectPrinter(call)
            "listPairedPrinters" -> listPairedPrinters(call)
            else -> call.reject("Izin Bluetooth sudah diberikan; ulangi tindakan")
        }
    }
    private fun queryDisplayName(uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
    } catch (_: Exception) { null }
    private fun safeFilename(value: String) = value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120).ifBlank { "export.bin" }
    override fun handleOnDestroy() {
        closeSocket()
        if (receiverRegistered) { try { context.unregisterReceiver(btStateReceiver) } catch (_: Exception) { }; receiverRegistered = false }
        io.shutdown()
        super.handleOnDestroy()
    }
}
