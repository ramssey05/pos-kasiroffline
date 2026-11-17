package com.poskasir.offline

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.poskasir.offline.nativebridge.NativeBridgePlugin
import com.poskasir.offline.PosSqlitePlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NativeBridgePlugin::class.java)
        registerPlugin(PosSqlitePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
