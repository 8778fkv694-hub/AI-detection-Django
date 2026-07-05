#!/usr/bin/env bash
#
# WYL AI 检测系统安卓客户端 APK 构建脚本
# 用法：
#   bash scripts/build-apk.sh debug     # debug APK
#   bash scripts/build-apk.sh release   # release APK
#
set -euo pipefail

TYPE="${1:-debug}"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# macOS 默认的 OpenJDK 21 路径，或回退到系统路径
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
if [ -d "$JAVA_HOME" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ ! -d "$ANDROID_HOME" ]; then
  echo "[build-apk] ❌ ANDROID_HOME 未找到：$ANDROID_HOME"
  echo "[build-apk] 请安装 Android Studio 并正确设置 ANDROID_HOME 环境变量"
  exit 1
fi

# ── 1. 构建前端移动端版本 ─────────────────────────
echo "[build-apk] 步骤 1/8：构建前端资源..."
cd "$ROOT/.."
npm run build:mobile
cd "$ROOT"

# 检查前端产物
if [ ! -f "www/dist/index.html" ]; then
  echo "[build-apk] ❌ 前端构建产物缺失：www/dist/index.html"
  exit 1
fi
echo "[build-apk] ✅ 前端构建完成"

# ── 1b. 复制 ONNX Runtime WASM 文件到 dist ──────────
echo "[build-apk] 步骤 1b/8：复制 ONNX Runtime WASM 文件..."
WASM_SRC="$ROOT/../node_modules/onnxruntime-web/dist"
WASM_DST="www/dist"
if [ -d "$WASM_SRC" ]; then
  cp "$WASM_SRC"/*.wasm "$WASM_DST/" 2>/dev/null && \
    echo "[build-apk]   ✅ WASM 文件已复制到 dist/" || \
    echo "[build-apk]   ⚠️ 未找到 WASM 文件"
else
  echo "[build-apk]   ⚠️ onnxruntime-web 未安装，跳过 WASM 复制"
fi

# ── 2. 同步后端服务代码与默认数据到 nodejs-project ──
echo "[build-apk] 步骤 2/8：打包内置 Node 后端模块与默认数据库..."
mkdir -p "www/nodejs-project/src/server"

# 复制只读引用代码
cp "$ROOT/../src/server/database.js" "www/nodejs-project/src/server/database.js"
cp "$ROOT/../src/server/api.js" "www/nodejs-project/src/server/api.js"

# 复制默认数据库文件作为出厂种子
if [ -f "$ROOT/../data/db.json" ]; then
  cp "$ROOT/../data/db.json" "www/nodejs-project/src/server/db-seed.json"
  echo "[build-apk] ✅ 出厂默认数据库种子已打包 (db-seed.json)"
else
  echo "[build-apk] ⚠️ 未发现 $ROOT/../data/db.json，生成空种子数据库"
  echo '{"results":[],"standards":[],"modelVersions":[],"ppeModelStatus":{"isLoaded":false,"lastUpdated":null,"version":"1.0.0"}}' > "www/nodejs-project/src/server/db-seed.json"
fi

# 安装 embedded node 依赖
echo "[build-apk] 在 nodejs-project 中执行 npm install..."
(cd www/nodejs-project && npm install --no-audit --no-fund)

# 复制前端打包产物到 nodejs-project 中供后端托管以支持 Cross-Origin Isolation
echo "[build-apk] 复制 React 前端产物 dist 目录到 nodejs-project..."
rm -rf www/nodejs-project/dist
cp -R www/dist www/nodejs-project/dist

# ── 3. Capacitor Android 同步 ──────────────────────
echo "[build-apk] 步骤 3/8：npx cap sync android..."
npx cap sync android

# ── 4. 修复 NodeJS.java 路径（防止运行时找不到 main.js）──
echo "[build-apk] 步骤 4/8：修复 NodeJS.java 路径配置..."
NODEJS_JAVA="android/capacitor-cordova-android-plugins/src/main/java/com/janeasystems/cdvnodejsmobile/NodeJS.java"
if [ -f "$NODEJS_JAVA" ]; then
  sed -i '' \
    -e 's|String PROJECT_ROOT = "www/nodejs-project"|String PROJECT_ROOT = "public/nodejs-project"|' \
    -e 's|String BUILTIN_ASSETS = "nodejs-mobile-cordova-assets"|String BUILTIN_ASSETS = "builtin_modules"|' \
    "$NODEJS_JAVA"
  echo "[build-apk] ✅ NodeJS.java 路径修复成功"
else
  echo "[build-apk] ⚠️ NodeJS.java 未找到，跳过修复"
fi

# ── 5. 替换 Gradle 构建补丁（兼容 NDK 27.2.12479018）──
echo "[build-apk] 步骤 5/8：替换并保护 gradle 配置..."
CORDOVA_BUILD_GRADLE="android/capacitor-cordova-android-plugins/build.gradle"
CAPACITOR_BUILD_GRADLE="android/app/capacitor.build.gradle"
WRAPPER="../../scripts/nodejs-mobile-cordova-capacitor.gradle"
DIRECT="../../node_modules/nodejs-mobile-cordova/src/android/build.gradle"

for GRADLE_FILE in "$CORDOVA_BUILD_GRADLE" "$CAPACITOR_BUILD_GRADLE"; do
  if [ -f "$GRADLE_FILE" ] && grep -q "$DIRECT" "$GRADLE_FILE"; then
    echo "[build-apk]   修改 $GRADLE_FILE ..."
    sed -i '' "s|apply from: \"$DIRECT\"|apply from: \"$WRAPPER\"|g" "$GRADLE_FILE"
  fi
done
echo "[build-apk] ✅ Gradle 配置检查成功"

# ── 6. 解压与校验 libnode.so 并清除 .gz 防止构建重叠 ──────
echo "[build-apk] 步骤 6/8：检查 libnode.so..."
LIBS_DIR="android/capacitor-cordova-android-plugins/src/main/libs/cdvnodejsmobile"
LIBNODE_DIR="$LIBS_DIR/libnode"

if [ ! -d "$LIBNODE_DIR/bin" ] && [ -d "$LIBS_DIR/bin" ]; then
  echo "[build-apk]   重建 libnode 目录结构..."
  mkdir -p "$LIBNODE_DIR"
  mv "$LIBS_DIR/bin" "$LIBS_DIR/include" "$LIBNODE_DIR/"
fi

if [ -d "$LIBNODE_DIR/bin" ]; then
  for GZ_FILE in $(find "$LIBNODE_DIR/bin" -name "libnode.so.gz" 2>/dev/null || true); do
    SO_FILE="${GZ_FILE%.gz}"
    if [ ! -f "$SO_FILE" ]; then
      echo "[build-apk]   解压 $GZ_FILE ..."
      gzip -d -f "$GZ_FILE"
    else
      rm -f "$GZ_FILE"
    fi
  done
fi
echo "[build-apk] ✅ libnode.so 初始化就绪"

# ── 7. 同步 nodejs-project 到 assets ─────────────────
echo "[build-apk] 步骤 7/8：同步 nodejs-project → assets..."
NODE_SRC="www/nodejs-project"
NODE_DST="android/app/src/main/assets/public/nodejs-project"
if [ -d "$NODE_SRC" ]; then
  mkdir -p "$NODE_DST"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$NODE_SRC/" "$NODE_DST/"
  else
    rm -rf "$NODE_DST"
    mkdir -p "$NODE_DST"
    cp -R "$NODE_SRC/." "$NODE_DST/"
  fi
  touch "$NODE_DST/main.js" # 刷新最后修改时间以强行触发 assets 重新打包
echo "[build-apk] ✅ nodejs-project 资源同步就绪"
fi

# ── 7b. 同步模型权重到 APK assets ───────────────────
echo "[build-apk] 步骤 7b/8：优化 APK 包体大小，跳过 .pt 权重 (使用端侧 .onnx 代替)..."
MODEL_SRC_DIR="$ROOT/../models"
MODEL_DST_DIR="android/app/src/main/assets/public/nodejs-project/models"
mkdir -p "$MODEL_DST_DIR"

# ── 7c. 同步 ONNX 模型到前端 dist（供 onnxruntime-web fetch）──
echo "[build-apk] 步骤 7c/8：同步 ONNX 模型 → www/dist/models..."
ONNX_DST_DIR="www/dist/models"
rm -rf "$ONNX_DST_DIR"
rm -rf "android/app/src/main/assets/public/models"
mkdir -p "$ONNX_DST_DIR"
mkdir -p "android/app/src/main/assets/public/models"
ONNX_COUNT=0
for ONNX_FILE in "$MODEL_SRC_DIR"/*.onnx; do
  if [ -f "$ONNX_FILE" ]; then
    BASENAME="$(basename "$ONNX_FILE")"
    if [ "$BASENAME" = "ppe_large.onnx" ]; then
      echo "[build-apk]   Skip $BASENAME (redundant on mobile)"
      continue
    fi
    # 1. 复制到 www/dist/models/ (网页端开发/WebView 用)
    cp "$ONNX_FILE" "$ONNX_DST_DIR/$BASENAME"
    
    # 2. 复制到 Node.js 源码 dist 目录下 (保证源码完整)
    mkdir -p "www/nodejs-project/dist/models"
    cp "$ONNX_FILE" "www/nodejs-project/dist/models/$BASENAME"
    
    # 3. 复制到 Android 资产目录下的 Node.js dist 目录 (port 5001 Express 真实托管用)
    mkdir -p "android/app/src/main/assets/public/nodejs-project/dist/models"
    cp "$ONNX_FILE" "android/app/src/main/assets/public/nodejs-project/dist/models/$BASENAME"
    
    # 4. 复制到 Android 资产目录下的 WebView 目录
    mkdir -p "android/app/src/main/assets/public/models"
    cp "$ONNX_FILE" "android/app/src/main/assets/public/models/$BASENAME"
    
    # 5. 复制到原有的 Node 外部 models 目录 (兼容原有逻辑)
    cp "$ONNX_FILE" "$MODEL_DST_DIR/$BASENAME"
    SIZE="$(du -h "$ONNX_DST_DIR/$BASENAME" | awk '{print $1}')"
    echo "[build-apk]   ✅ $BASENAME ($SIZE) → www/dist/models + assets + public/models"
    ONNX_COUNT=$((ONNX_COUNT + 1))
  fi
done
if [ "$ONNX_COUNT" -eq 0 ]; then
  echo "[build-apk]   ⚠️ 未找到 .onnx 文件，端侧 ONNX 推理将不可用"
else
  echo "[build-apk] ✅ 已同步 $ONNX_COUNT 个 ONNX 模型"
fi

# ── 7d. 复制 capacitor.js 保证 5001 端口重定向后正常识别原生桥 ──
echo "[build-apk] 步骤 7d/8：复制 capacitor.js 到 nodejs-project 托管的前端目录..."
CAP_JS_SRC="android/app/src/main/assets/public/capacitor.js"
if [ -f "$CAP_JS_SRC" ]; then
  cp "$CAP_JS_SRC" "www/nodejs-project/dist/capacitor.js"
  mkdir -p "android/app/src/main/assets/public/nodejs-project/dist"
  cp "$CAP_JS_SRC" "android/app/src/main/assets/public/nodejs-project/dist/capacitor.js"
  echo "[build-apk]   ✅ capacitor.js 已复制到 nodejs-project/dist 托管目录"
else
  echo "[build-apk]   ⚠️ 未在 assets 中找到 capacitor.js"
fi

# ── 8. 执行编译打包 APK ──────────────────────────────
mkdir -p dist

if [ "$TYPE" = "debug" ]; then
  echo "[build-apk] 步骤 8/8：执行 Gradle 构建 debug APK..."
  (cd android && ./gradlew assembleDebug)
  SRC="android/app/build/outputs/apk/debug/app-debug.apk"
  VER="$(node -p "require('./package.json').version")"
  OUT="dist/AI检测系统-debug-v${VER}.apk"
  cp "$SRC" "$OUT"
  echo "[build-apk] 🎉 成功编译！输出包位置: $OUT"
  ls -lh "$OUT"
elif [ "$TYPE" = "release" ]; then
  echo "[build-apk] 步骤 8/8：执行 Gradle 构建 release APK..."
  (cd android && ./gradlew assembleRelease)
  SRC="android/app/build/outputs/apk/release/app-release-unsigned.apk"
  VER="$(node -p "require('./package.json').version")"
  OUT="dist/AI检测系统-release-v${VER}.apk"
  cp "$SRC" "$OUT"
  echo "[build-apk] 🎉 成功编译！输出包位置: $OUT"
  ls -lh "$OUT"
else
  echo "[build-apk] ❌ 未知构建类型: $TYPE"
  exit 1
fi
