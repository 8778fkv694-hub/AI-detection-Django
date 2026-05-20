import os
from PIL import Image

def generate_ico():
    master_path = '/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/scratch/icon_master.png'
    out_dir = '/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/electron-app'
    
    if not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)
        
    out_path = os.path.join(out_dir, 'icon.ico')
    
    print(f"Loading master icon from: {master_path}")
    if not os.path.exists(master_path):
        print("Error: master icon not found!")
        return
        
    img = Image.open(master_path)
    
    # Standard sizes for Windows ICO files
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    
    print(f"Saving multi-resolution ICO icon to: {out_path}")
    img.save(out_path, format="ICO", sizes=sizes)
    print("ICO icon generated successfully!")

if __name__ == '__main__':
    generate_ico()
