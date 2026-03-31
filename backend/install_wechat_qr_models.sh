#!/bin/bash

# 微信二维码检测模型安装脚本
# 下载WeChatQRCode所需的模型文件

echo "🔧 开始安装微信二维码检测模型..."

# 创建模型目录
MODEL_DIR="models/wechat_qr"
mkdir -p "$MODEL_DIR"

echo "📁 模型目录: $MODEL_DIR"

# 模型文件URL配置
declare -A MODEL_FILES=(
    ["detect.prototxt"]="https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/master/wechat_qrcode/detect.prototxt"
    ["detect.caffemodel"]="https://github.com/WeChatCV/opencv_3rdparty/raw/master/wechat_qrcode/detect.caffemodel"
    ["sr.prototxt"]="https://raw.githubusercontent.com/WeChatCV/opencv_3rdparty/master/wechat_qrcode/sr.prototxt"
    ["sr.caffemodel"]="https://github.com/WeChatCV/opencv_3rdparty/raw/master/wechat_qrcode/sr.caffemodel"
)

# 下载函数
download_file() {
    local filename=$1
    local url=$2
    local filepath="$MODEL_DIR/$filename"
    
    if [ -f "$filepath" ]; then
        echo "✅ 文件已存在: $filename"
        return 0
    fi
    
    echo "📥 正在下载: $filename"
    if curl -L -o "$filepath" "$url"; then
        echo "✅ 下载完成: $filename"
        return 0
    else
        echo "❌ 下载失败: $filename"
        return 1
    fi
}

# 下载所有模型文件
success_count=0
total_count=${#MODEL_FILES[@]}

for filename in "${!MODEL_FILES[@]}"; do
    url="${MODEL_FILES[$filename]}"
    if download_file "$filename" "$url"; then
        ((success_count++))
    fi
done

echo ""
echo "📊 下载结果: $success_count/$total_count 个文件"

if [ $success_count -eq $total_count ]; then
    echo "🎉 所有微信二维码模型文件安装完成！"
    echo "现在可以使用微信二维码检测功能了。"
    echo ""
    echo "📋 安装的文件:"
    ls -la "$MODEL_DIR"
else
    echo "⚠️  有 $((total_count - success_count)) 个文件下载失败"
    echo "请检查网络连接或手动下载模型文件"
    echo "模型文件下载地址: https://github.com/WeChatCV/opencv_3rdparty"
fi

echo ""
echo "🔧 安装完成！"
