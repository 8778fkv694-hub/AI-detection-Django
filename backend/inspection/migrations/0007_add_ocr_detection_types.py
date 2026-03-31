# Generated manually to add OCR detection types

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0006_add_detection_type_field'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inspectionresult',
            name='detection_type',
            field=models.CharField(
                choices=[
                    ('cleanroom_ppe', '洁净用品检测'),
                    ('standard_inspection', '标准检测'),
                    ('general_quality', '通用质量检测'),
                    ('ocr_inspection', 'OCR检测'),
                    ('ocr_fusion_inspection', 'OCR融合检测'),
                    ('unknown', '未知类型')
                ],
                default='unknown',
                help_text='检测类型',
                max_length=25
            ),
        ),
    ]
