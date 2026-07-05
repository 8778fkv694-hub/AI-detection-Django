package com.wyl.inspection.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.util.Log;

import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class YoloNativeDetector {
    private static final String TAG = "YoloNativeDetector";

    private OrtEnvironment env;
    private OrtSession session;
    private int inputSize = 320;
    private boolean isLoaded = false;
    private List<String> classNames = new ArrayList<>();

    public static class Detection {
        public String label;
        public float confidence;
        public float x1;
        public float y1;
        public float x2;
        public float y2;

        public Detection(String label, float confidence, float x1, float y1, float x2, float y2) {
            this.label = label;
            this.confidence = confidence;
            this.x1 = x1;
            this.y1 = y1;
            this.x2 = x2;
            this.y2 = y2;
        }

        public JSONObject toJSONObject() {
            try {
                JSONObject obj = new JSONObject();
                obj.put("label", label);
                obj.put("confidence", confidence);
                
                JSONObject bbox = new JSONObject();
                bbox.put("x1", Math.round(x1));
                bbox.put("y1", Math.round(y1));
                bbox.put("x2", Math.round(x2));
                bbox.put("y2", Math.round(y2));
                obj.put("bbox", bbox);
                
                return obj;
            } catch (Exception e) {
                return null;
            }
        }
    }

    public YoloNativeDetector() {
        this.env = OrtEnvironment.getEnvironment();
    }

    public synchronized void init(Context context, String modelPath, int numThreads, boolean useNnapi, List<String> defaultClassNames) throws Exception {
        if (isLoaded) {
            close();
        }

        Log.i(TAG, "Initializing model: " + modelPath + " with threads: " + numThreads + ", useNnapi: " + useNnapi);
        
        byte[] modelBytes = readAsset(context, modelPath);
        OrtSession.SessionOptions options = new OrtSession.SessionOptions();
        
        if (numThreads > 0) {
            options.setIntraOpNumThreads(numThreads);
        }
        
        if (useNnapi) {
            try {
                options.addNnapi();
                Log.i(TAG, "Successfully added NNAPI Execution Provider");
            } catch (Exception e) {
                Log.w(TAG, "Failed to enable NNAPI, falling back to CPU: " + e.getMessage());
            }
        }

        this.session = env.createSession(modelBytes, options);
        this.classNames = new ArrayList<>(defaultClassNames);

        // Dynamically infer input size from model inputs if possible
        try {
            Map<String, NodeInfo> inputInfo = session.getInputInfo();
            if (!inputInfo.isEmpty()) {
                NodeInfo info = inputInfo.values().iterator().next();
                if (info.getInfo() instanceof TensorInfo) {
                    long[] shape = ((TensorInfo) info.getInfo()).getShape();
                    // Typical shape: [1, 3, 320, 320] or [1, 3, 640, 640]
                    if (shape.length == 4 && shape[2] > 0) {
                        this.inputSize = (int) shape[2];
                        Log.i(TAG, "Auto-inferred model input size: " + inputSize);
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse model input shape: " + e.getMessage() + ", defaulting to 320");
        }

        this.isLoaded = true;
        Log.i(TAG, "Model loaded successfully.");
    }

    public boolean isLoaded() {
        return isLoaded;
    }

    public synchronized JSONArray detect(Bitmap bitmap, float confThreshold, float nmsThreshold) {
        if (!isLoaded || session == null) {
            Log.e(TAG, "Detector is not loaded!");
            return new JSONArray();
        }

        int origWidth = bitmap.getWidth();
        int origHeight = bitmap.getHeight();

        try {
            // 1. Preprocess: Resize bitmap using equal-scaling Letterbox with gray borders (RGB 114,114,114)
            float scale = Math.min((float) inputSize / origWidth, (float) inputSize / origHeight);
            int newW = Math.round(origWidth * scale);
            int newH = Math.round(origHeight * scale);

            Bitmap scaledBitmap = Bitmap.createScaledBitmap(bitmap, newW, newH, true);
            Bitmap resizedBitmap = Bitmap.createBitmap(inputSize, inputSize, Bitmap.Config.ARGB_8888);
            android.graphics.Canvas canvas = new android.graphics.Canvas(resizedBitmap);
            canvas.drawColor(android.graphics.Color.rgb(114, 114, 114));

            int padX = (inputSize - newW) / 2;
            int padY = (inputSize - newH) / 2;
            canvas.drawBitmap(scaledBitmap, padX, padY, null);
            scaledBitmap.recycle();

            int[] pixels = new int[inputSize * inputSize];
            resizedBitmap.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize);
            resizedBitmap.recycle();

            // NCHW shape: [1, 3, inputSize, inputSize]
            float[] floatBuffer = new float[3 * inputSize * inputSize];
            for (int h = 0; h < inputSize; h++) {
                for (int w = 0; w < inputSize; w++) {
                    int pixel = pixels[h * inputSize + w];
                    int r = (pixel >> 16) & 0xFF;
                    int g = (pixel >> 8) & 0xFF;
                    int b = pixel & 0xFF;

                    // Normalize [0, 1] and set in CHW plane
                    floatBuffer[0 * inputSize * inputSize + h * inputSize + w] = r / 255.0f;
                    floatBuffer[1 * inputSize * inputSize + h * inputSize + w] = g / 255.0f;
                    floatBuffer[2 * inputSize * inputSize + h * inputSize + w] = b / 255.0f;
                }
            }

            // Create ONNX input tensor
            long[] shape = new long[]{1, 3, inputSize, inputSize};
            OnnxTensor inputTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(floatBuffer), shape);
            
            // Get input name dynamically
            String inputName = session.getInputNames().iterator().next();
            Map<String, OnnxTensor> inputs = new HashMap<>();
            inputs.put(inputName, inputTensor);

            // Run inference
            long startTime = System.currentTimeMillis();
            try (OrtSession.Result results = session.run(inputs)) {
                long inferenceTime = System.currentTimeMillis() - startTime;
                Log.d(TAG, "Inference completed in " + inferenceTime + "ms");

                OnnxValue outputValue = results.get(0);
                if (!(outputValue instanceof OnnxTensor)) {
                    return new JSONArray();
                }

                OnnxTensor outTensor = (OnnxTensor) outputValue;
                long[] outShape = outTensor.getInfo().getShape(); // Typical: [1, 4 + classes, boxes] (e.g. [1, 14, 2100])
                
                FloatBuffer flatOut = outTensor.getFloatBuffer();
                float[] outputData = new float[flatOut.remaining()];
                flatOut.get(outputData);

                inputTensor.close();

                // Parse YOLO output
                int numClasses = (int) outShape[1] - 4;
                int numBoxes = (int) outShape[2];

                List<Detection> rawDetections = new ArrayList<>();

                for (int i = 0; i < numBoxes; i++) {
                    float cx = outputData[0 * numBoxes + i];
                    float cy = outputData[1 * numBoxes + i];
                    float w = outputData[2 * numBoxes + i];
                    float h = outputData[3 * numBoxes + i];

                    int maxClassIndex = -1;
                    float maxConf = 0.0f;

                    for (int j = 0; j < numClasses; j++) {
                        float conf = outputData[(4 + j) * numBoxes + i];
                        if (conf > maxConf) {
                            maxConf = conf;
                            maxClassIndex = j;
                        }
                    }

                    if (maxConf > confThreshold) {
                        float x1 = (cx - w / 2.0f - padX) / scale;
                        float y1 = (cy - h / 2.0f - padY) / scale;
                        float x2 = (cx + w / 2.0f - padX) / scale;
                        float y2 = (cy + h / 2.0f - padY) / scale;

                        String label = maxClassIndex < classNames.size() ? classNames.get(maxClassIndex) : "class_" + maxClassIndex;
                        rawDetections.add(new Detection(
                            label,
                            maxConf,
                            Math.max(0, x1),
                            Math.max(0, y1),
                            Math.min(origWidth, x2),
                            Math.min(origHeight, y2)
                        ));
                    }
                }

                // Apply NMS
                List<Detection> filtered = nonMaxSuppression(rawDetections, nmsThreshold);
                
                JSONArray resultsArray = new JSONArray();
                for (Detection det : filtered) {
                    JSONObject obj = det.toJSONObject();
                    if (obj != null) {
                        resultsArray.put(obj);
                    }
                }

                return resultsArray;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error running YOLO inference: " + e.getMessage(), e);
            return new JSONArray();
        }
    }

    private List<Detection> nonMaxSuppression(List<Detection> detections, float threshold) {
        if (detections.isEmpty()) return detections;

        // Sort by confidence descending
        Collections.sort(detections, new Comparator<Detection>() {
            @Override
            public int compare(Detection o1, Detection o2) {
                return Float.compare(o2.confidence, o1.confidence);
            }
        });

        List<Detection> filtered = new ArrayList<>();
        boolean[] ignored = new boolean[detections.size()];

        for (int i = 0; i < detections.size(); i++) {
            if (ignored[i]) continue;
            
            Detection best = detections.get(i);
            filtered.add(best);

            for (int j = i + 1; j < detections.size(); j++) {
                if (ignored[j]) continue;
                
                if (calculateIoU(best, detections.get(j)) > threshold) {
                    ignored[j] = true;
                }
            }
        }

        return filtered;
    }

    private float calculateIoU(Detection a, Detection b) {
        float xLeft = Math.max(a.x1, b.x1);
        float yTop = Math.max(a.y1, b.y1);
        float xRight = Math.min(a.x2, b.x2);
        float yBottom = Math.min(a.y2, b.y2);

        if (xRight < xLeft || yBottom < yTop) return 0.0f;

        float intersectionArea = (xRight - xLeft) * (yBottom - yTop);
        float areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        float areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        float unionArea = areaA + areaB - intersectionArea;

        return unionArea > 0 ? intersectionArea / unionArea : 0.0f;
    }

    public synchronized void close() {
        if (session != null) {
            try {
                session.close();
            } catch (Exception e) {
                // Ignore
            }
            session = null;
        }
        isLoaded = false;
    }

    private static byte[] readAsset(Context context, String filename) throws IOException {
        // Strip leading slash if any
        if (filename.startsWith("/")) {
            filename = filename.substring(1);
        }
        try (InputStream is = context.getAssets().open(filename)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int len;
            while ((len = is.read(buffer)) != -1) {
                bos.write(buffer, 0, len);
            }
            return bos.toByteArray();
        }
    }
}
