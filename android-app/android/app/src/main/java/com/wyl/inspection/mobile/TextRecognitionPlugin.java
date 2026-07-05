package com.wyl.inspection.mobile;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import androidx.annotation.NonNull;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

@CapacitorPlugin(name = "TextRecognition")
public class TextRecognitionPlugin extends Plugin {

    @PluginMethod
    public void recognizeText(PluginCall call) {
        String base64Data = call.getString("base64");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("Image base64 data is missing");
            return;
        }

        // Strip data:image/... prefix if present
        if (base64Data.contains(",")) {
            base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
        }

        try {
            byte[] decodedString = Base64.decode(base64Data, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);
            if (bitmap == null) {
                call.reject("Failed to decode bitmap from base64");
                return;
            }

            InputImage image = InputImage.fromBitmap(bitmap, 0);
            TextRecognizer recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());

            recognizer.process(image)
                    .addOnSuccessListener(new OnSuccessListener<Text>() {
                        @Override
                        public void onSuccess(Text visionText) {
                            JSObject result = new JSObject();
                            result.put("success", true);
                            result.put("full_text", visionText.getText());

                            JSArray detailedResults = new JSArray();
                            int textCount = 0;

                            for (Text.TextBlock block : visionText.getTextBlocks()) {
                                for (Text.Line line : block.getLines()) {
                                    JSObject lineObj = new JSObject();
                                    lineObj.put("text", line.getText());
                                    
                                    Float confidence = line.getConfidence();
                                    lineObj.put("confidence", confidence != null ? confidence : 0.95f);

                                    Rect rect = line.getBoundingBox();
                                    JSArray bbox = new JSArray();
                                    if (rect != null) {
                                        // 4 corners format: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
                                        JSArray p1 = new JSArray(); p1.put(rect.left); p1.put(rect.top);
                                        JSArray p2 = new JSArray(); p2.put(rect.right); p2.put(rect.top);
                                        JSArray p3 = new JSArray(); p3.put(rect.right); p3.put(rect.bottom);
                                        JSArray p4 = new JSArray(); p4.put(rect.left); p4.put(rect.bottom);
                                        
                                        bbox.put(p1);
                                        bbox.put(p2);
                                        bbox.put(p3);
                                        bbox.put(p4);
                                    }
                                    lineObj.put("bbox", bbox);
                                    detailedResults.put(lineObj);
                                    textCount++;
                                }
                            }

                            result.put("detailed_results", detailedResults);
                            result.put("text_count", textCount);
                            result.put("orientation_match", true); // offline default
                            
                            call.resolve(result);
                        }
                    })
                    .addOnFailureListener(new OnFailureListener() {
                        @Override
                        public void onFailure(@NonNull Exception e) {
                            JSObject result = new JSObject();
                            result.put("success", false);
                            result.put("error", e.getMessage());
                            result.put("full_text", "");
                            result.put("detailed_results", new JSArray());
                            result.put("text_count", 0);
                            
                            call.resolve(result);
                        }
                    });

        } catch (Exception e) {
            call.reject("OCR execution error", e);
        }
    }
}
