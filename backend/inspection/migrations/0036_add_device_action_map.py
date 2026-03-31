"""Add device_action_map and required_device_types to StageRecipeTemplate"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inspection', '0035_add_recipe_detection_params'),
    ]

    operations = [
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='device_action_map',
            field=models.JSONField(blank=True, default=dict, help_text='检测结果→设备指令映射'),
        ),
        migrations.AddField(
            model_name='stagerecipetemplate',
            name='required_device_types',
            field=models.JSONField(blank=True, default=list, help_text='必需设备类型'),
        ),
    ]
