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
import java.util.Collections;
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

    @PluginMethod
    public void benchmark(PluginCall call) {
        String base64Str = call.getString("base64");
        int benchmarkFrames = call.getInt("frames", 50);
        float confThreshold = call.getFloat("confidenceThreshold", 0.5f);
        float nmsThreshold = call.getFloat("nmsThreshold", 0.45f);

        if (!detector.isLoaded()) {
            call.reject("Model is not initialized. Please call initModel first.");
            return;
        }

        new Thread(() -> {
            try {
                Bitmap bitmap;
                if (base64Str != null && !base64Str.isEmpty()) {
                    String cleanBase64 = base64Str;
                    if (cleanBase64.contains(",")) {
                        cleanBase64 = cleanBase64.substring(cleanBase64.indexOf(",") + 1);
                    }
                    byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                    bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
                } else {
                    // Create dummy 320x320 bitmap
                    bitmap = Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888);
                }

                if (bitmap == null) {
                    call.reject("Failed to decode benchmark image");
                    return;
                }

                // Warm up
                detector.detect(bitmap, confThreshold, nmsThreshold);

                List<Long> times = new ArrayList<>();
                for (int i = 0; i < benchmarkFrames; i++) {
                    long start = System.nanoTime();
                    detector.detect(bitmap, confThreshold, nmsThreshold);
                    long duration = (System.nanoTime() - start) / 1000000; // ms
                    times.add(duration);
                }

                bitmap.recycle();

                // Sort to compute percentiles
                Collections.sort(times);
                long p50 = times.get(Math.round(benchmarkFrames * 0.50f) - 1);
                long p95 = times.get(Math.round(benchmarkFrames * 0.95f) - 1);
                long min = times.get(0);
                long max = times.get(times.size() - 1);
                
                long sum = 0;
                for (long t : times) sum += t;
                double avg = (double) sum / times.size();

                JSObject ret = new JSObject();
                ret.put("p50", p50);
                ret.put("p95", p95);
                ret.put("min", min);
                ret.put("max", max);
                ret.put("avg", avg);
                
                JSArray allTimes = new JSArray();
                for (long t : times) {
                    allTimes.put(t);
                }
                ret.put("all", allTimes);

                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Benchmark failed", e);
                call.reject("Benchmark failed: " + e.getMessage());
            }
        }).start();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (detector != null) {
            detector.close();
        }
    }
}
