package com.wyl.inspection.mobile;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "YoloNative")
public class YoloNativePlugin extends Plugin {
    private static final String TAG = "YoloNativePlugin";
    private YoloNativeDetector detector = new YoloNativeDetector();

    @PluginMethod
    public void initModel(PluginCall call) {
        String modelPath = call.getString("modelPath", "public/models/ppe.onnx");
        int numThreads = call.getInt("numThreads", 4);
        boolean useNnapi = call.getBoolean("useNnapi", false);
        
        JSArray classesArray = call.getArray("classNames");
        List<String> classNames = new ArrayList<>();
        if (classesArray != null) {
            try {
                for (int i = 0; i < classesArray.length(); i++) {
                    classNames.add(classesArray.getString(i));
                }
            } catch (Exception e) {
                Log.e(TAG, "Error parsing classNames array: " + e.getMessage());
            }
        }

        // Run loading in a background thread to prevent blocking WebView UI thread
        new Thread(() -> {
            try {
                detector.init(getContext(), modelPath, numThreads, useNnapi, classNames);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize YOLO model: " + e.getMessage(), e);
                call.reject("Failed to initialize model: " + e.getMessage(), e);
            }
        }).start();
    }

    @PluginMethod
    public void detectFrame(PluginCall call) {
        String base64Str = call.getString("base64");
        if (base64Str == null || base64Str.isEmpty()) {
            call.reject("Missing 'base64' image parameter");
            return;
        }

        // Clean up base64 prefix if present (e.g. data:image/jpeg;base64,...)
        if (base64Str.contains(",")) {
            base64Str = base64Str.substring(base64Str.indexOf(",") + 1);
        }

        float confThreshold = call.getFloat("confidenceThreshold", 0.5f);
        float nmsThreshold = call.getFloat("nmsThreshold", 0.45f);

        try {
            // Decode base64 to Bitmap
            byte[] decodedBytes = Base64.decode(base64Str, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
            
            if (bitmap == null) {
                call.reject("Failed to decode base64 image data");
                return;
            }

            // Run detection
            JSONArray boxes = detector.detect(bitmap, confThreshold, nmsThreshold);
            
            // Clean up bitmap to avoid memory leaks
            bitmap.recycle();

            JSObject ret = new JSObject();
            ret.put("boxes", JSArray.from(boxes));
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error during frame detection: " + e.getMessage(), e);
            call.reject("Error during detection: " + e.getMessage(), e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (detector != null) {
            detector.close();
        }
    }
}
