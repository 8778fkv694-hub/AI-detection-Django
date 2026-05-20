import os
import math
from PIL import Image, ImageDraw, ImageFilter

def draw_bezier_curve(draw, p0, p1, p2, p3, color, width, steps=100):
    """Draw a cubic bezier curve using line segments."""
    points = []
    for i in range(steps + 1):
        t = i / steps
        # Bernstein polynomials
        b0 = (1 - t) ** 3
        b1 = 3 * (1 - t) ** 2 * t
        b2 = 3 * (1 - t) * t ** 2
        b3 = t ** 3
        
        x = b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0]
        y = b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]
        points.append((x, y))
        
    for j in range(len(points) - 1):
        draw.line([points[j], points[j+1]], fill=color, width=width, joint="round")

def generate_base_icon(size=1024):
    # 1. Create dark gradient background
    img = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(img)
    
    scale = size / 24.0
    
    # Simple linear/radial gradient background
    # Let's do a diagonal linear gradient from deep indigo (#12102C) to slate-950 (#020617)
    for y in range(size):
        for x in range(size):
            # Calculate distance/ratio along diagonal
            ratio = (x + y) / (2 * size)
            r = int(18 + (2 - 18) * ratio)
            g = int(16 + (6 - 16) * ratio)
            b = int(44 + (23 - 44) * ratio)
            img.putpixel((x, y), (r, g, b, 255))
            
    # Re-obtain draw object after pixel writing
    draw = ImageDraw.Draw(img)
    
    # 2. Draw outer glowing outline (neon violet-blue: HSL 260, 100%, 75% -> #aa80ff)
    glow_color = (170, 128, 255, 40)      # Neon glow color (semi-transparent)
    main_color = (180, 140, 255, 255)     # Bright core color
    white_core = (255, 255, 255, 255)     # Inner white core for highlight
    
    # Scaled dimensions
    r_val = 3 * scale
    cx, cy = 12 * scale, 12 * scale
    
    # Define paths
    # Top curve of eye
    p0_t = (3 * scale, 12 * scale)
    p1_t = (7 * scale, 4 * scale)
    p2_t = (17 * scale, 4 * scale)
    p3_t = (21 * scale, 12 * scale)
    
    # Bottom curve of eye
    p0_b = (21 * scale, 12 * scale)
    p1_b = (17 * scale, 20 * scale)
    p2_b = (7 * scale, 20 * scale)
    p3_b = (3 * scale, 12 * scale)
    
    # Draw glow layers first
    for w in [40, 25, 12]:
        opacity = int(100 - w * 1.5)
        g_col = (170, 128, 255, max(10, opacity))
        # Top-left bracket
        draw_bracket_glow(draw, scale, g_col, w)
        # Top-right bracket
        draw_bracket_glow(draw, scale, g_col, w, flip_x=True)
        # Bottom-right bracket
        draw_bracket_glow(draw, scale, g_col, w, flip_x=True, flip_y=True)
        # Bottom-left bracket
        draw_bracket_glow(draw, scale, g_col, w, flip_y=True)
        
        # Eye top
        draw_bezier_curve(draw, p0_t, p1_t, p2_t, p3_t, g_col, w)
        # Eye bottom
        draw_bezier_curve(draw, p0_b, p1_b, p2_b, p3_b, g_col, w)
        
        # Pupil
        draw.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=g_col, width=w)
        
    # Draw main core layers
    w_core = int(10 * scale / 24)
    # Brackets
    draw_bracket_glow(draw, scale, main_color, w_core)
    draw_bracket_glow(draw, scale, main_color, w_core, flip_x=True)
    draw_bracket_glow(draw, scale, main_color, w_core, flip_x=True, flip_y=True)
    draw_bracket_glow(draw, scale, main_color, w_core, flip_y=True)
    
    # Eye top and bottom
    draw_bezier_curve(draw, p0_t, p1_t, p2_t, p3_t, main_color, w_core)
    draw_bezier_curve(draw, p0_b, p1_b, p2_b, p3_b, main_color, w_core)
    
    # Pupil
    draw.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=main_color, width=w_core)
    # Pupil center glow
    draw.ellipse([cx - r_val/2, cy - r_val/2, cx + r_val/2, cy + r_val/2], fill=main_color)
    draw.ellipse([cx - r_val/4, cy - r_val/4, cx + r_val/4, cy + r_val/4], fill=white_core)
    
    # Add a thin white inner line for the ultra premium neon glow effect
    w_inner = max(1, int(2 * scale / 24))
    draw_bracket_glow(draw, scale, white_core, w_inner)
    draw_bracket_glow(draw, scale, white_core, w_inner, flip_x=True)
    draw_bracket_glow(draw, scale, white_core, w_inner, flip_x=True, flip_y=True)
    draw_bracket_glow(draw, scale, white_core, w_inner, flip_y=True)
    draw_bezier_curve(draw, p0_t, p1_t, p2_t, p3_t, white_core, w_inner)
    draw_bezier_curve(draw, p0_b, p1_b, p2_b, p3_b, white_core, w_inner)
    draw.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=white_core, width=w_inner)

    return img

def draw_bracket_glow(draw, scale, color, width, flip_x=False, flip_y=False):
    """Draw corner bracket. Default is top-left."""
    # Top-left original coordinates:
    # M3 7V5a2 2 0 0 1 2-2h2
    # Start (3, 7) -> (3, 5) -> arc radius 2 centered at (5, 5) -> (5, 3) -> (7, 3)
    
    pts = [
        (3 * scale, 7 * scale),
        (3 * scale, 5 * scale),
        (5 * scale, 3 * scale),
        (7 * scale, 3 * scale)
    ]
    
    # Transform points if flipping
    tf_pts = []
    for x, y in pts:
        if flip_x:
            x = 24 * scale - x
        if flip_y:
            y = 24 * scale - y
        tf_pts.append((x, y))
        
    # Draw as lines (we approximate the arc using a line segment from (3,5) to (5,3) or with Bezier,
    # but a simple Bezier curve is even more precise and smooth!)
    # P0 = (3, 7), P1 = (3, 5)
    # For arc from (3, 5) to (5, 3) with control points (3, 3.9) and (3.9, 3)
    p0 = tf_pts[0]
    p1 = tf_pts[1]
    p2 = tf_pts[2]
    p3 = tf_pts[3]
    
    # Let's draw it as three segments:
    # 1. Line from p0 to p1
    draw.line([p0, p1], fill=color, width=width, joint="round")
    
    # 2. Smooth bezier corner from p1 to p2
    # Determine control points for the corner arc
    c_x1, c_y1 = p1[0], p1[1]
    c_x2, c_y2 = p2[0], p2[1]
    
    if not flip_x and not flip_y:     # Top-Left
        cp1 = (3 * scale, 3.9 * scale)
        cp2 = (3.9 * scale, 3 * scale)
    elif flip_x and not flip_y:       # Top-Right
        cp1 = (21 * scale, 3.9 * scale)
        cp2 = (20.1 * scale, 3 * scale)
    elif flip_x and flip_y:           # Bottom-Right
        cp1 = (21 * scale, 20.1 * scale)
        cp2 = (20.1 * scale, 21 * scale)
    else:                             # Bottom-Left
        cp1 = (3 * scale, 20.1 * scale)
        cp2 = (3.9 * scale, 21 * scale)
        
    draw_bezier_curve(draw, p1, cp1, cp2, p2, color, width)
    
    # 3. Line from p2 to p3
    draw.line([p2, p3], fill=color, width=width, joint="round")

def main():
    print("Generating base icon...")
    img = generate_base_icon(1024)
    
    # Save the 1024x1024 master icon
    os.makedirs("/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/scratch", exist_ok=True)
    master_path = "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/scratch/icon_master.png"
    img.save(master_path, "PNG")
    print(f"Master icon saved to {master_path}")
    
    # Mipmap folders in android project
    res_dir = "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/android-app/android/app/src/main/res"
    
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }
    
    for folder, size in sizes.items():
        dest_folder = os.path.join(res_dir, folder)
        os.makedirs(dest_folder, exist_ok=True)
        
        # 1. Standard launcher icon
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(os.path.join(dest_folder, "ic_launcher.png"), "PNG")
        
        # 2. Round launcher icon
        # Create circular mask
        mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse([0, 0, size, size], fill=255)
        
        round_img = Image.new("RGBA", (size, size))
        round_img.paste(resized, (0, 0), mask=mask)
        round_img.save(os.path.join(dest_folder, "ic_launcher_round.png"), "PNG")
        
        # 3. Adaptive foreground icon
        # Foreground should have transparent background and the logo in the center (scaled down slightly to fit the safe zone)
        fg_img = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        # Generate logo only (without background gradient)
        # Create a new logo image
        logo_only = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
        draw_logo = ImageDraw.Draw(logo_only)
        
        scale = 1024 / 24.0
        r_val = 3 * scale
        cx, cy = 12 * scale, 12 * scale
        p0_t, p1_t, p2_t, p3_t = (3 * scale, 12 * scale), (7 * scale, 4 * scale), (17 * scale, 4 * scale), (21 * scale, 12 * scale)
        p0_b, p1_b, p2_b, p3_b = (21 * scale, 12 * scale), (17 * scale, 20 * scale), (7 * scale, 20 * scale), (3 * scale, 12 * scale)
        
        main_color = (180, 140, 255, 255)
        white_core = (255, 255, 255, 255)
        
        # Draw glows
        for w in [40, 25, 12]:
            opacity = int(100 - w * 1.5)
            g_col = (170, 128, 255, max(10, opacity))
            draw_bracket_glow(draw_logo, scale, g_col, w)
            draw_bracket_glow(draw_logo, scale, g_col, w, flip_x=True)
            draw_bracket_glow(draw_logo, scale, g_col, w, flip_x=True, flip_y=True)
            draw_bracket_glow(draw_logo, scale, g_col, w, flip_y=True)
            draw_bezier_curve(draw_logo, p0_t, p1_t, p2_t, p3_t, g_col, w)
            draw_bezier_curve(draw_logo, p0_b, p1_b, p2_b, p3_b, g_col, w)
            draw_logo.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=g_col, width=w)
            
        w_core = int(10 * scale / 24)
        draw_bracket_glow(draw_logo, scale, main_color, w_core)
        draw_bracket_glow(draw_logo, scale, main_color, w_core, flip_x=True)
        draw_bracket_glow(draw_logo, scale, main_color, w_core, flip_x=True, flip_y=True)
        draw_bracket_glow(draw_logo, scale, main_color, w_core, flip_y=True)
        draw_bezier_curve(draw_logo, p0_t, p1_t, p2_t, p3_t, main_color, w_core)
        draw_bezier_curve(draw_logo, p0_b, p1_b, p2_b, p3_b, main_color, w_core)
        draw_logo.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=main_color, width=w_core)
        draw_logo.ellipse([cx - r_val/2, cy - r_val/2, cx + r_val/2, cy + r_val/2], fill=main_color)
        draw_logo.ellipse([cx - r_val/4, cy - r_val/4, cx + r_val/4, cy + r_val/4], fill=white_core)
        
        w_inner = max(1, int(2 * scale / 24))
        draw_bracket_glow(draw_logo, scale, white_core, w_inner)
        draw_bracket_glow(draw_logo, scale, white_core, w_inner, flip_x=True)
        draw_bracket_glow(draw_logo, scale, white_core, w_inner, flip_x=True, flip_y=True)
        draw_bracket_glow(draw_logo, scale, white_core, w_inner, flip_y=True)
        draw_bezier_curve(draw_logo, p0_t, p1_t, p2_t, p3_t, white_core, w_inner)
        draw_bezier_curve(draw_logo, p0_b, p1_b, p2_b, p3_b, white_core, w_inner)
        draw_logo.ellipse([cx - r_val, cy - r_val, cx + r_val, cy + r_val], outline=white_core, width=w_inner)
        
        # Paste scaled logo in center of 1024x1024 foreground (safe zone is 66% size = 675x675)
        logo_resized = logo_only.resize((620, 620), Image.Resampling.LANCZOS)
        fg_img.paste(logo_resized, (202, 202), mask=logo_resized)
        
        fg_resized = fg_img.resize((size, size), Image.Resampling.LANCZOS)
        fg_resized.save(os.path.join(dest_folder, "ic_launcher_foreground.png"), "PNG")
        
        print(f"Generated icons in {folder} (size: {size}x{size})")

if __name__ == "__main__":
    main()
